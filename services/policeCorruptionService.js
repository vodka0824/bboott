const { Firestore } = require('@google-cloud/firestore');
const { db } = require('../utils/db');
const COLLECTION_NAME = 'economy_users';
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const authUtils = require('../utils/auth');
const economyHandler = require('../handlers/economy');
const professionHandler = require('../handlers/profession');
const rpgHandler = require('../handlers/rpg');

const { checkInternalAffairs, createInternalAffairsBubble } = require('./policeActionService');
/**
 * 吃案 (收賄，無冷卻，限黑道)
 */
async function handleCoverUp(replyToken, context, messageObject) {
    const { userId, groupId } = context;
    const mentionObj = messageObject && messageObject.mention;

    if (!mentionObj || !mentionObj.mentionees || mentionObj.mentionees.length === 0) {
        await lineUtils.replyText(replyToken, '❌ 請 @標記 你要吃案的黑幫對象！\n用法：吃案 @玩家');
        return;
    }

    const targetUserId = mentionObj.mentionees[0].userId;
    if (targetUserId === userId) return lineUtils.replyText(replyToken, '❌ 不能吃案自己！');

    try {
        const policeName = await lineUtils.getGroupMemberName(groupId, userId);
        const targetName = await lineUtils.getGroupMemberName(groupId, targetUserId);

        const result = await db.runTransaction(async (t) => {
            const policeRef = db.collection(COLLECTION_NAME).doc(userId);
            const targetRef = db.collection(COLLECTION_NAME).doc(targetUserId);
            const [policeDoc, targetDoc] = await Promise.all([t.get(policeRef), t.get(targetRef)]);

            if (!policeDoc.exists || !policeDoc.data().isPolice) return { success: false, message: '你不是警察！' };
            if (!targetDoc.exists) return { success: false, message: '找不到目標的資料。' };

            const policeData = policeDoc.data();
            const targetData = targetDoc.data();
            const now = Date.now();

            if (!targetData.isMafia) {
                return { success: false, message: `❌ 吃案只能針對【黑幫成員】發動！` };
            }
            if ((targetData.wantedLevel || 0) < 0.2) {
                return { success: false, message: `${targetName} 嫌疑太低，不夠格讓你吃案收錢！(通緝值需 >= 20%)` };
            }
            if (targetData.jailedUntil && now < targetData.jailedUntil) {
                return { success: false, message: `${targetName} 已經在監獄裡了，你要怎麼吃案？` };
            }

            const targetKuCoin = targetData.kuCoin || 0;
            if (targetKuCoin < 5000000) {
                return { success: false, message: `❌ ${targetName} 身上連 500 萬都沒有！\n「這點錢就想打發我？滾！」` };
            }

            // 政風室查辦
            const iaResult = await checkInternalAffairs(t, policeRef, policeData, now);
            if (iaResult.caught) {
                return { success: true, caught: true, policeName, confiscated: iaResult.confiscated };
            }

            // 吃案成功：強收目標 20% 財產，通緝值歸零
            let bribe = 0;
            if (targetKuCoin > 0) bribe = Math.floor(targetKuCoin * 0.2);

            t.update(targetRef, {
                kuCoin: Math.max(0, targetKuCoin - bribe),
                wantedLevel: 0
            });

            const corruptionGain = 20 + Math.floor(Math.random() * 11); // 20~30
            t.update(policeRef, {
                kuCoin: db.FieldValue.increment(bribe),
                policeCorruption: db.FieldValue.increment(corruptionGain)
            });

            const newBalance = (policeData.kuCoin || 0) + bribe;
            return { success: true, caught: false, policeName, targetName, bribe, corruptionGain, newBalance };
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        if (result.caught) {
            const bubble = createInternalAffairsBubble(result.policeName, result.confiscated);
            
        await lineUtils.replyFlex(replyToken, '政風室查獲', bubble);
            professionHandler.clearProfessionCache(userId);
            return;
        }

        const bubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader('💰 黑警吃案', '暗中交易', flexUtils.COLORS.BG_MAIN, '#333333'),
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: `👮 ${result.policeName} 把 ${result.targetName} 拉到無人的暗巷...`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, wrap: true }),
                flexUtils.createText({ text: `「兄弟，花錢消災吧，這案子我幫你壓下來。」`, size: 'sm', weight: 'bold', color: flexUtils.COLORS.PRIMARY, margin: 'md', wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `💸 ${result.targetName} 被強迫交出 ${result.bribe.toLocaleString()} 哭幣的封口費！`, size: 'sm', color: '#333333', margin: 'md', wrap: true }),
                flexUtils.createText({ text: `🔓 ${result.targetName} 的通緝值已被徹底清除！`, size: 'sm', color: '#333333', margin: 'sm', wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `⚠️ 警察貪污值暴增 +${result.corruptionGain}！`, size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'md' }),
                flexUtils.createText({ text: `🏦 結算總資產：${result.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#1976D2', margin: 'sm' })
            ], { paddingAll: 'xl', backgroundColor: '#FAFAFA' })
        });
        
        await lineUtils.replyFlex(replyToken, '吃案成功', bubble);
        professionHandler.clearWantedListCache();

    } catch (e) {
        console.error('[Police] handleCoverUp Error:', e);
        await lineUtils.replyText(replyToken, '❌ 吃案過程發生錯誤。');
    }
}

/**
 * 暗殺警察 (限黑道老大，1億哭幣，30%成功率)
 */
async function handleAssassinatePolice(replyToken, context, messageObject) {
    const { userId, groupId } = context;
    const mentionObj = messageObject && messageObject.mention;

    if (!mentionObj || !mentionObj.mentionees || mentionObj.mentionees.length === 0) {
        await lineUtils.replyText(replyToken, '❌ 請 @標記 你要暗殺的警察對象！\n用法：暗殺警察 @警察');
        return;
    }

    const targetUserId = mentionObj.mentionees[0].userId;
    if (targetUserId === userId) return lineUtils.replyText(replyToken, '❌ 不能暗殺自己！');

    try {
        const bossName = await lineUtils.getGroupMemberName(groupId, userId);
        const targetName = await lineUtils.getGroupMemberName(groupId, targetUserId);

        const result = await db.runTransaction(async (t) => {
            const bossRef = db.collection(COLLECTION_NAME).doc(userId);
            const targetRef = db.collection(COLLECTION_NAME).doc(targetUserId);
            const [bossDoc, targetDoc] = await Promise.all([t.get(bossRef), t.get(targetRef)]);

            if (!bossDoc.exists) return { success: false, message: '找不到您的資料。' };
            if (!targetDoc.exists) return { success: false, message: '找不到目標的資料。' };

            const bossData = bossDoc.data();
            const targetData = targetDoc.data();
            const now = Date.now();

            const isBoss = bossData.isMafia && (await professionHandler.getMafiaBoss())?.userId === userId;
            if (!isBoss) {
                return { success: false, message: '❌ 只有【黑道老大】能下達暗殺警察的命令！' };
            }

            if (!targetData.isPolice) {
                return { success: false, message: '❌ 對方不是警察，請使用搶劫或下黑手！' };
            }

            if (bossData.jailedUntil && now < bossData.jailedUntil) {
                return { success: false, message: '你還在坐牢，無法聯絡殺手！' };
            }

            const assassinateCost = 100000000; // 1億
            if ((bossData.kuCoin || 0) < assassinateCost) {
                return { success: false, message: `❌ 殺手買兇費高達 ${assassinateCost.toLocaleString()} 哭幣，你的資金不足！` };
            }

            const isTargetChief = (await professionHandler.getPoliceChief())?.userId === targetUserId;
            // 基礎成功率 30%，若是局長降為 15%
            const successRate = isTargetChief ? 0.15 : 0.30;

            if (Math.random() < successRate) {
                // 成功
                t.update(bossRef, {
                    kuCoin: db.FieldValue.increment(-assassinateCost),
                    wantedLevel: db.FieldValue.increment(0.5) // 暗殺警察罪名極重
                });

                t.update(targetRef, {
                    isPolice: db.FieldValue.delete(),
                    kuCoin: Math.floor((targetData.kuCoin || 0) * 0.4), // 警察醫療費扣 60%
                    policeMerit: db.FieldValue.delete(),
                    policeCorruption: db.FieldValue.delete(),
                    jailedUntil: now + 24 * 60 * 60 * 1000 // 住院 24小時
                });

                return { success: true, won: true, cost: assassinateCost, targetName };
            } else {
                // 失敗：買兇失敗，殺手供出老大，老大遭通緝並沒收 1 億
                t.update(bossRef, {
                    kuCoin: db.FieldValue.increment(-assassinateCost),
                    wantedLevel: db.FieldValue.increment(1.0),
                    jailedUntil: now + 12 * 60 * 60 * 1000,
                    crimeRecord: db.FieldValue.increment(1)
                });
                return { success: true, won: false, cost: assassinateCost, targetName };
            }
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, result.message);
            return;
        }

        if (result.won) {
            const bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('💀 暗殺行動成功', '黑道狙殺', flexUtils.COLORS.BG_MAIN, '#B71C1C'),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `黑道老大 ${bossName} 砸下重金聘請了職業殺手！`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, wrap: true }),
                    flexUtils.createText({ text: `「砰！」一聲槍響，警察 ${result.targetName} 在巡邏時遭到狙擊身受重傷！`, size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'md', wrap: true }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: `💸 買兇費用：-${result.cost.toLocaleString()} 哭幣`, size: 'sm', color: '#D32F2F', weight: 'bold', margin: 'md' }),
                    flexUtils.createText({ text: `⚠️ 驚動黑白兩道，通緝值大幅上升 (+50%)！`, size: 'sm', color: '#E91E63', weight: 'bold', margin: 'sm' }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: `💥 ${result.targetName} 被強制革職，並送往加護病房 (休養 24 小時)！`, size: 'sm', color: '#333333', margin: 'md', wrap: true }),
                    flexUtils.createText({ text: `🏥 醫療費用耗盡了該警察 60% 的財產！`, size: 'sm', color: '#B71C1C', weight: 'bold' })
                ], { paddingAll: 'xl', backgroundColor: '#FFEBEE' })
            });
            await lineUtils.replyFlex(replyToken, '暗殺成功', bubble);
            professionHandler.clearProfessionCache(targetUserId);
        } else {
            const bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('❌ 暗殺行動失敗', '東窗事發', flexUtils.COLORS.BG_MAIN, '#D32F2F'),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `黑道老大 ${bossName} 試圖暗殺警察 ${result.targetName}...`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, wrap: true }),
                    flexUtils.createText({ text: `但殺手被特勤部隊提前攔截，並且供出了幕後主使是老大！`, size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'md', wrap: true }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: `💸 殺手訂金打水漂：-${result.cost.toLocaleString()} 哭幣`, size: 'sm', color: '#D32F2F', weight: 'bold', margin: 'md' }),
                    flexUtils.createText({ text: `🚨 老大遭全國通緝 (+100%)，立刻收押入獄 12 小時！`, size: 'sm', color: '#B71C1C', weight: 'bold' })
                ], { paddingAll: 'xl', backgroundColor: '#FFEBEE' })
            });
            await lineUtils.replyFlex(replyToken, '暗殺失敗', bubble);
        }
    } catch (e) {
        console.error('[Police] handleAssassinatePolice Error:', e);
        await lineUtils.replyText(replyToken, '❌ 暗殺過程發生錯誤。');
    }
}


module.exports = {
    handleCoverUp,
    handleAssassinatePolice
};
