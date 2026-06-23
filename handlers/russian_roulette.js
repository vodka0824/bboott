/**
 * 俄羅斯輪盤 (Russian Roulette - 死亡對決)
 *
 * 遊戲流程：
 * 1. 輸入「輪盤下注 [金額]」開始遊戲，系統扣除賭金並記錄狀態
 * 2. 點擊「🔥 繼續扣扳機」or 輸入「扣扳機」繼續
 * 3. 點擊「💰 拿錢走人」or 輸入「拿錢走人」結束並獲得獎金
 * 4. 中彈或安全通過第5槍後遊戲自動結束
 *
 * 左輪手槍：6個彈匣，1發子彈
 * 每槍死亡機率：1 / 剩餘彈匣數
 *
 * 倍率表 (連本帶利):
 *   通過第1槍: 1.2x
 *   通過第2槍: 1.5x
 *   通過第3槍: 2.0x
 *   通過第4槍: 3.0x
 *   通過第5槍: 6.0x (最終)
 *
 * 狀態儲存: Firestore economy_users.rouletteState: { active, bet, shotsRemaining, currentMultiplier }
 */

const { db } = require('../utils/db');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const economyHandler = require('./economy');
const atonementHandler = require('./atonement');

const COLLECTION = 'economy_users';

// 每一槍生存後的倍率 (按通過槍數索引) - 95% RTP
const MULTIPLIERS = [1.14, 1.42, 1.9, 2.85, 5.7];
const TOTAL_CHAMBERS = 6;
const BULLET_COUNT = 1;

async function getRouletteState(userId) {
    const doc = await db.collection(COLLECTION).doc(userId).get();
    if (!doc.exists) return null;
    return doc.data().rouletteState || null;
}

async function setRouletteState(userId, state) {
    await db.collection(COLLECTION).doc(userId).set({ rouletteState: state }, { merge: true });
}

async function clearRouletteState(userId) {
    await db.collection(COLLECTION).doc(userId).update({ rouletteState: db.FieldValue.delete() });
}

function buildRoulettePanel({ shotsRemaining, currentMultiplier, bet, status, finalBalance, taxMsg = "" }) {
    const shotsTaken = TOTAL_CHAMBERS - shotsRemaining;
    const nextMultiplier = MULTIPLIERS[shotsTaken] || null;
    const potentialWin = Math.floor(bet * currentMultiplier);

    // 槍膛視覺化
    const chamberDisplay = Array.from({ length: TOTAL_CHAMBERS }, (_, i) => {
        if (status === 'dead') {
            if (i < shotsTaken - 1) return '⚪'; // 已經安全通過的彈匣
            if (i === shotsTaken - 1) return '💀'; // 擊發並中彈的彈匣
            return '⚫'; // 尚未扣扳機的彈匣
        } else {
            if (i < shotsTaken) return '⚪'; // 已經安全通過的彈匣
            return '⚫'; // 尚未扣扳機的彈匣
        }
    }).join('  ');

    const contents = [
        flexUtils.createText({ text: '🔫 俄羅斯輪盤', size: 'xl', weight: 'bold', color: '#FF4444', align: 'center', margin: 'md' }),
        flexUtils.createSeparator('md'),
        flexUtils.createText({ text: chamberDisplay, size: 'md', align: 'center', margin: 'lg', color: flexUtils.COLORS.TEXT_MAIN }),
        flexUtils.createSeparator('md')
    ];

    if (status === 'start' || status === 'survive') {
        contents.push(
            flexUtils.createText({ text: status === 'start' ? '💰 下注完成，準備開槍！' : '😮 你活下來了！', size: 'md', weight: 'bold', color: flexUtils.COLORS.PRIMARY, align: 'center', margin: 'md' }),
            flexUtils.createText({ text: `本金: ${bet.toLocaleString()} 哭幣`, size: 'sm', color: flexUtils.COLORS.TEXT_SUB, align: 'center', margin: 'sm' }),
            flexUtils.createText({ text: `當前倍率: ${currentMultiplier}x`, size: 'lg', weight: 'bold', color: flexUtils.COLORS.SECONDARY, align: 'center', margin: 'sm' }),
            flexUtils.createText({ text: `現可帶走: ${potentialWin.toLocaleString()} 哭幣`, size: 'md', weight: 'bold', color: '#4CAF50', align: 'center', margin: 'sm' })
        );

        if (nextMultiplier) {
            const deathProb = Math.round((BULLET_COUNT / shotsRemaining) * 100);
            contents.push(
                flexUtils.createSeparator('sm'),
                flexUtils.createText({ text: `繼續扣扳機 → ${nextMultiplier}x  (死亡率 ${deathProb}%)`, size: 'xs', color: '#FF4444', align: 'center', margin: 'sm' })
            );
        }

        // 按鈕
        contents.push(
            flexUtils.createBox('horizontal', [
                flexUtils.createButton({
                    label: '🔥 繼續扣扳機',
                    style: 'primary',
                    color: '#D32F2F',
                    action: { type: 'message', label: '繼續扣扳機', text: '扣扳機' },
                    margin: 'sm'
                }),
                flexUtils.createButton({
                    label: '💰 拿錢走人',
                    style: 'primary',
                    color: '#2E7D32',
                    action: { type: 'message', label: '拿錢走人', text: '拿錢走人' },
                    margin: 'sm'
                })
            ], { margin: 'xl' })
        );

    } else if (status === 'dead') {
        contents.push(
            flexUtils.createText({ text: '💥 中彈了！！', size: 'xxl', weight: 'bold', color: '#FF0000', align: 'center', margin: 'md' }),
            flexUtils.createText({ text: `你用 ${bet.toLocaleString()} 哭幣`, size: 'sm', color: flexUtils.COLORS.TEXT_SUB, align: 'center', margin: 'sm' }),
            flexUtils.createText({ text: '換了一顆子彈穿頭。', size: 'sm', color: flexUtils.COLORS.TEXT_SUB, align: 'center', margin: 'xs' }),
            flexUtils.createText({ text: '哭幣已充公 ✅', size: 'md', weight: 'bold', color: '#FF4444', align: 'center', margin: 'md' }),
            flexUtils.createText({ text: `目前餘額: ${finalBalance.toLocaleString()}`, size: 'xs', color: flexUtils.COLORS.TEXT_MUTED, align: 'center', margin: 'md' })
        );

    } else if (status === 'cashout') {
        contents.push(
            flexUtils.createText({ text: '💰 明智之舉！', size: 'xl', weight: 'bold', color: flexUtils.COLORS.PRIMARY, align: 'center', margin: 'md' }),
            flexUtils.createText({ text: `獲得: ${potentialWin.toLocaleString()} 哭幣`, size: 'lg', weight: 'bold', color: '#4CAF50', align: 'center', margin: 'sm' }),
            ...(taxMsg ? [flexUtils.createText({ text: taxMsg, size: 'xs', color: '#FF5555', align: 'center', margin: 'xs', weight: 'bold' })] : []),
            flexUtils.createText({ text: `目前餘額: ${finalBalance.toLocaleString()}`, size: 'xs', color: flexUtils.COLORS.TEXT_MUTED, align: 'center', margin: 'md' })
        );

    } else if (status === 'survived_all') {
        contents.push(
            flexUtils.createText({ text: '🏆 你是個神！', size: 'xxl', weight: 'bold', color: flexUtils.COLORS.PRIMARY, align: 'center', margin: 'md' }),
            flexUtils.createText({ text: '通過全部 5 槍！', size: 'md', color: flexUtils.COLORS.TEXT_MAIN, align: 'center', margin: 'sm' }),
            flexUtils.createText({ text: `獲得: ${potentialWin.toLocaleString()} 哭幣`, size: 'lg', weight: 'bold', color: '#4CAF50', align: 'center', margin: 'sm' }),
            ...(taxMsg ? [flexUtils.createText({ text: taxMsg, size: 'xs', color: '#FF5555', align: 'center', margin: 'xs', weight: 'bold' })] : []),
            flexUtils.createText({ text: `目前餘額: ${finalBalance.toLocaleString()}`, size: 'xs', color: flexUtils.COLORS.TEXT_MUTED, align: 'center', margin: 'md' })
        );
    }

    return flexUtils.createBubble({
        size: 'kilo',
        body: flexUtils.createBox('vertical', contents, { backgroundColor: flexUtils.COLORS.BG_CARD, paddingAll: 'xl' })
    });
}

/**
 * 開始輪盤遊戲
 */
async function startRoulette(replyToken, groupId, userId, amountStr) {
    try {
        const betAmount = parseInt(amountStr, 10);
        if (isNaN(betAmount) || betAmount <= 0) {
            await lineUtils.replyText(replyToken, '❌ 輪盤下注金額無效（請輸入大於 0 的正整數金額，例如：輪盤下注 1000000）。');
            return;
        }

        // 檢查自己是否已有進行中的遊戲
        const existing = await getRouletteState(userId);
        if (existing && existing.active) {
            await lineUtils.replyText(replyToken, '⚠️ 你已有一場進行中的輪盤對決！\n請輸入「扣扳機」或「拿錢走人」。');
            return;
        }

        // 檢查群組內是否已有其他人進行中
        if (groupId && groupId !== userId) {
            const groupActiveQuery = await db.collection(COLLECTION)
                .where('rouletteState.groupId', '==', groupId)
                .where('rouletteState.active', '==', true)
                .get();
                
            if (!groupActiveQuery.empty) {
                await lineUtils.replyText(replyToken, '❌ 目前群組內有其他人正在進行輪盤對決，請等他結算完再玩！');
                return;
            }
        }

        // 扣除賭金
        const consumeResult = await economyHandler.consumeCoin(groupId, userId, betAmount, true);
        if (!consumeResult.success) {
            await lineUtils.replyText(replyToken, `❌ ${consumeResult.message}`);
            return;
        }

        // 建立初始狀態
        const state = {
            active: true,
            bet: betAmount,
            shotsRemaining: TOTAL_CHAMBERS,
            currentMultiplier: 1.0,
            groupId
        };
        await setRouletteState(userId, state);

        const bubble = buildRoulettePanel({
            shotsRemaining: TOTAL_CHAMBERS,
            currentMultiplier: 1.0,
            bet: betAmount,
            status: 'start'
        });

        await lineUtils.replyFlex(replyToken, '俄羅斯輪盤開始！', bubble);

    } catch (e) {
        console.error('[Roulette] startRoulette error:', e);
        await lineUtils.replyText(replyToken, '❌ 輪盤系統故障，子彈卡膛了。');
    }
}

/**
 * 扣扳機
 */
async function shootRoulette(replyToken, groupId, userId) {
    try {
        const state = await getRouletteState(userId);
        if (!state || !state.active) {
            await lineUtils.replyText(replyToken, '⚠️ 你目前沒有進行中的輪盤對決。\n輸入「輪盤下注 [金額]」開始。');
            return;
        }

        const { bet, shotsRemaining } = state;

        // 計算是否中彈 (1 / 剩餘彈匣數)
        const isDead = Math.random() < (BULLET_COUNT / shotsRemaining);

        if (isDead) {
            // 中彈 -> 賭金已在下注時扣除，直接清除狀態
            await clearRouletteState(userId);
            const balance = (await db.collection('economy_users').doc(userId).get()).data()?.kuCoin || 0;

            const bubble = buildRoulettePanel({
                shotsRemaining: shotsRemaining - 1,
                currentMultiplier: state.currentMultiplier,
                bet,
                status: 'dead',
                finalBalance: balance
            });

            await lineUtils.replyFlex(replyToken, '💥 中彈！', bubble);
            return;
        }

        // 生存
        const shotsTaken = TOTAL_CHAMBERS - shotsRemaining + 1; // 通過了幾槍
        const nextMultiplier = MULTIPLIERS[shotsTaken - 1]; // 0-indexed
        const newShotsRemaining = shotsRemaining - 1;

        // 如果這是最後一槍 (第5槍)，自動結算
        if (newShotsRemaining <= 1) {
            // 通過第5槍 -> 自動贏
            const totalWin = Math.floor(bet * MULTIPLIERS[4]); // 5.7x
            const netProfit = totalWin - bet;
            let finalWinAmount = netProfit;
            let taxMsg = "";

            const taxResult = await atonementHandler.processDevilTax(netProfit, userId);
            if (taxResult.hasContract && taxResult.taxAmount > 0) {
                finalWinAmount = taxResult.finalProfit;
                taxMsg = `😈 惡魔契約：強制徵收 90% 獲利 (-${taxResult.taxAmount.toLocaleString()})`;
            }

            const returnAmount = bet + finalWinAmount;
            const finalBalance = await economyHandler.addCoinQuietly(state.groupId || groupId, userId, returnAmount);
            await clearRouletteState(userId);

            const bubble = buildRoulettePanel({
                shotsRemaining: 1,
                currentMultiplier: MULTIPLIERS[4],
                bet,
                status: 'survived_all',
                finalBalance,
                taxMsg
            });

            await lineUtils.replyFlex(replyToken, '🏆 神人通關！', bubble);
            return;
        }

        // 更新狀態
        await setRouletteState(userId, {
            ...state,
            shotsRemaining: newShotsRemaining,
            currentMultiplier: nextMultiplier
        });

        const bubble = buildRoulettePanel({
            shotsRemaining: newShotsRemaining,
            currentMultiplier: nextMultiplier,
            bet,
            status: 'survive'
        });

        await lineUtils.replyFlex(replyToken, '😮 活下來了！', bubble);

    } catch (e) {
        console.error('[Roulette] shootRoulette error:', e);
        await lineUtils.replyText(replyToken, '❌ 輪盤系統故障。');
    }
}

/**
 * 拿錢走人
 */
async function cashOutRoulette(replyToken, groupId, userId) {
    try {
        const state = await getRouletteState(userId);
        if (!state || !state.active) {
            await lineUtils.replyText(replyToken, '⚠️ 你目前沒有進行中的輪盤對決。');
            return;
        }

        if (state.currentMultiplier <= 1.0) {
            await lineUtils.replyText(replyToken, '⚠️ 你必須先扣一次扳機才能離場！');
            return;
        }

        const { bet, currentMultiplier } = state;
        const totalWin = Math.floor(bet * currentMultiplier);
        const netProfit = totalWin - bet;
        let finalWinAmount = netProfit;
        let taxMsg = "";

        const taxResult = await atonementHandler.processDevilTax(netProfit, userId);
        if (taxResult.hasContract && taxResult.taxAmount > 0) {
            finalWinAmount = taxResult.finalProfit;
            taxMsg = `😈 惡魔契約：強制徵收 90% 獲利 (-${taxResult.taxAmount.toLocaleString()})`;
        }

        const returnAmount = bet + finalWinAmount;
        const finalBalance = await economyHandler.addCoinQuietly(state.groupId || groupId, userId, returnAmount);
        await clearRouletteState(userId);

        const bubble = buildRoulettePanel({
            shotsRemaining: state.shotsRemaining,
            currentMultiplier,
            bet,
            status: 'cashout',
            finalBalance,
            taxMsg
        });

        await lineUtils.replyFlex(replyToken, '💰 帶錢離場！', bubble);

    } catch (e) {
        console.error('[Roulette] cashOutRoulette error:', e);
        await lineUtils.replyText(replyToken, '❌ 結算系統故障。');
    }
}

module.exports = { startRoulette, shootRoulette, cashOutRoulette };
