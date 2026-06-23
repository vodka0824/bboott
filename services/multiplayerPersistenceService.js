const { db, Firestore } = require('../utils/db');
const logger = require('../utils/logger');
const lineUtils = require('../utils/line');
const economyHandler = require('../handlers/economy');

const MULTI_TABLE_COLLECTION = 'multiplayer_active_tables';

/**
 * 記錄一筆下注
 * 當玩家在多人賭桌成功扣款後，立刻將下注額寫入資料庫
 * @param {string} groupId 群組 ID
 * @param {string} gameType 遊戲類型名稱 (如 '21點', '百家樂')
 * @param {string} userId 玩家 ID
 * @param {number} amount 下注金額
 * @param {string} userName 玩家名稱
 */
async function recordBet(groupId, gameType, userId, amount, userName = '玩家') {
    try {
        const docRef = db.collection(MULTI_TABLE_COLLECTION).doc(groupId);
        
        await db.runTransaction(async (t) => {
            const doc = await t.get(docRef);
            if (!doc.exists) {
                // 新建賭桌紀錄
                t.set(docRef, {
                    gameType,
                    groupId,
                    createdAt: Firestore.FieldValue.serverTimestamp(),
                    bets: {
                        [userId]: {
                            amount,
                            name: userName
                        }
                    }
                });
            } else {
                // 更新賭桌紀錄，累加下注額
                const data = doc.data();
                const existingBet = data.bets && data.bets[userId] ? data.bets[userId].amount : 0;
                
                t.set(docRef, {
                    bets: {
                        [userId]: {
                            amount: existingBet + amount,
                            name: userName
                        }
                    }
                }, { merge: true });
            }
        });
        
    } catch (error) {
        logger.error(`[MultiplayerPersistence] Error recording bet for ${userId} in ${groupId}:`, error);
    }
}

/**
 * 清除賭桌紀錄
 * 當遊戲正常結算、或因為逾時等原因主動解散且已處理退款後，清除資料庫紀錄
 * @param {string} groupId 群組 ID
 */
async function clearTable(groupId) {
    try {
        await db.collection(MULTI_TABLE_COLLECTION).doc(groupId).delete();
    } catch (error) {
        logger.error(`[MultiplayerPersistence] Error clearing table for ${groupId}:`, error);
    }
}

/**
 * 啟動時退款所有未結算的賭桌
 * 當伺服器因為崩潰或重啟導致記憶體中的賭桌遺失時，透過此方法將先前的下注全額退還給玩家。
 */
async function refundAndNotifyOnStartup() {
    try {
        const snapshot = await db.collection(MULTI_TABLE_COLLECTION).get();
        if (snapshot.empty) {
            logger.info('[MultiplayerPersistence] No pending multiplayer tables found on startup.');
            return;
        }

        let totalTablesRecovered = 0;
        let totalCoinsRefunded = 0;

        for (const doc of snapshot.docs) {
            const data = doc.data();
            const groupId = doc.id;
            const gameType = data.gameType || '多人遊戲';
            const bets = data.bets || {};

            const refundPromises = [];
            const refundDetails = [];

            for (const [userId, betInfo] of Object.entries(bets)) {
                if (betInfo.amount > 0) {
                    refundPromises.push(economyHandler.addCoinFast(userId, betInfo.amount));
                    refundDetails.push(`• ${betInfo.name}: +${betInfo.amount.toLocaleString()}`);
                    totalCoinsRefunded += betInfo.amount;
                }
            }

            if (refundPromises.length > 0) {
                await Promise.all(refundPromises);
                
                // 構建被動退款通知
                const msgText = `⚠️ 【系統通知】\n偵測到伺服器重啟前，您所在的「${gameType}」賭局未能正常結算。系統已將被扣除的下注金全額退還！\n\n💰 退款明細：\n${refundDetails.join('\n')}`;
                
                // 存入 pending 佇列，等待該群組有人發言時附帶送出
                lineUtils.addPendingMessage(groupId, [{ type: 'text', text: msgText }]);
                totalTablesRecovered++;
            }

            // 處理完畢後刪除紀錄
            await clearTable(groupId);
        }

        logger.info(`[MultiplayerPersistence] Startup recovery complete: ${totalTablesRecovered} tables recovered, ${totalCoinsRefunded} coins refunded.`);

    } catch (error) {
        logger.error('[MultiplayerPersistence] Error during startup refund process:', error);
    }
}

module.exports = {
    recordBet,
    clearTable,
    refundAndNotifyOnStartup
};
