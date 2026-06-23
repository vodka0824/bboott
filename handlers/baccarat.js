/**
 * 皇家百家樂 (Royal Baccarat)
 * 指令: 百家樂 [莊|閒|和] [金額]
 *
 * 機率設定 (真實賭場數據):
 *   莊家贏: 45.86% -> 賠率 0.95:1 (抽水 5%)
 *   閒家贏: 44.62% -> 賠率 1:1
 *   和局:    9.52% -> 賠率 8:1
 *
 * RTP (期望值):
 *   莊: 0.4586 * 0.95 - 0.5414 = -0.1060 → 莊家優勢 ~1.06%
 *   閒: 0.4462 * 1.00 - 0.5538 = -0.1076 → 莊家優勢 ~1.24%
 *   和: 0.0952 * 8.00 - 0.9048 = -0.1432 → 莊家優勢 ~14.4%
 */

const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const atonementHandler = require('./atonement');
const economyHandler = require('./economy');

// 總權重 10000
const OUTCOMES = [
    { key: 'banker', label: '莊家', weight: 4586 },
    { key: 'player', label: '閒家', weight: 4462 },
    { key: 'tie',    label: '和局',  weight: 952 }
];

const BET_ALIASES = {
    '莊': 'banker', '莊家': 'banker',
    '閒': 'player', '閒家': 'player',
    '和': 'tie',    '和局': 'tie'
};

const MULTIPLIERS = {
    banker: 0.95, // 贏了拿回 1 + 0.95 倍
    player: 1.0,
    tie:    8.0
};

// 根據結果生成虛擬合理的牌面點數
function generatePoints(outcome) {
    const bankerWins  = () => ({ banker: Math.floor(Math.random() * 4) + 6, player: Math.floor(Math.random() * 6) }); // 6~9 vs 0~5
    const playerWins  = () => ({ banker: Math.floor(Math.random() * 6), player: Math.floor(Math.random() * 4) + 6 }); // 0~5 vs 6~9
    const tieResult   = () => { const p = Math.floor(Math.random() * 10); return { banker: p, player: p }; };

    if (outcome === 'banker') return bankerWins();
    if (outcome === 'player') return playerWins();
    return tieResult();
}

function rollOutcome() {
    const roll = Math.floor(Math.random() * 10000);
    let cumulative = 0;
    for (const o of OUTCOMES) {
        cumulative += o.weight;
        if (roll < cumulative) return o;
    }
    return OUTCOMES[0];
}

async function playBaccarat(replyToken, groupId, userId, betTargetStr, amountStr) {
    try {
        const betAmount = parseInt(amountStr, 10);
        if (isNaN(betAmount) || betAmount <= 0) {
            await lineUtils.replyText(replyToken, '❌ 百家樂下注金額無效（請輸入大於 0 的正整數金額，例如：百家樂 莊 1000000）。');
            return;
        }

        const betKey = BET_ALIASES[betTargetStr];
        if (!betKey) {
            await lineUtils.replyText(replyToken, '❌ 下注選項無效，請輸入「莊」、「閒」或「和」。');
            return;
        }

        // 扣除賭金
        const consumeResult = await economyHandler.consumeCoin(groupId, userId, betAmount, true);
        if (!consumeResult.success) {
            await lineUtils.replyText(replyToken, `❌ 下注失敗：${consumeResult.message}`);
            return;
        }

        const userName = consumeResult.name || '賭客';

        // 開牌
        const outcome = rollOutcome();
        const points = generatePoints(outcome.key);
        const isWin = (outcome.key === betKey);
        const isTie = outcome.key === 'tie';
        const isPush = isTie && (betKey === 'banker' || betKey === 'player');

        let winAmount = 0;
        let finalBalance = consumeResult.newBalance || 0;

        let taxMsg = "";
        if (isWin) {
            winAmount = Math.floor(betAmount * MULTIPLIERS[betKey]);
            const taxResult = await atonementHandler.processDevilTax(winAmount, userId);
            if (taxResult.hasContract && taxResult.taxAmount > 0) {
                winAmount = taxResult.finalProfit;
                taxMsg = `\n😈 惡魔契約發動：強制徵收 90% 獲利 (-${taxResult.taxAmount.toLocaleString()})`;
            }
            const returnAmount = betAmount + winAmount; // 本金 + 獲利
            finalBalance = await economyHandler.addCoinQuietly(groupId, userId, returnAmount);
        } else if (isPush) {
            // 專業賭場規則：開和局時，莊閒退回本金
            finalBalance = await economyHandler.addCoinQuietly(groupId, userId, betAmount);
        }

        // 生成牌面展示字串 (模擬撲克牌)
        const suits = ['♠️', '♥️', '♦️', '♣️'];
        const randSuit = () => suits[Math.floor(Math.random() * 4)];

        // 建立 Flex Message
        let resultColor = '#D32F2F';
        let resultText = '💸 輸了！';

        if (isWin) {
            resultColor = flexUtils.COLORS.WIN;
            resultText = (isTie ? '🤝 押中和局！' : '🎉 贏了！') + taxMsg;
        } else if (isPush) {
            resultColor = flexUtils.COLORS.SECONDARY;
            resultText = '🤝 和局退款';
        }

        const betLabels = { banker: '莊家', player: '閒家', tie: '和局' };

        const contents = [
            flexUtils.createText({ text: '🃏 皇家百家樂', size: 'xl', weight: 'bold', color: flexUtils.COLORS.PRIMARY, align: 'center', margin: 'md' }),
            flexUtils.createSeparator('md'),

            // 莊家區
            flexUtils.createText({ text: '🏦 莊家', size: 'sm', weight: 'bold', color: flexUtils.COLORS.TEXT_SUB, margin: 'lg' }),
            flexUtils.createText({
                text: `${randSuit()} ${randSuit()}  →  ${points.banker} 點`,
                size: 'xl', weight: 'bold',
                color: outcome.key === 'banker' ? flexUtils.COLORS.PRIMARY : flexUtils.COLORS.TEXT_MAIN,
                align: 'center', margin: 'sm'
            }),

            flexUtils.createSeparator('md'),

            // 閒家區
            flexUtils.createText({ text: '🧑 閒家', size: 'sm', weight: 'bold', color: flexUtils.COLORS.TEXT_SUB, margin: 'md' }),
            flexUtils.createText({
                text: `${randSuit()} ${randSuit()}  →  ${points.player} 點`,
                size: 'xl', weight: 'bold',
                color: outcome.key === 'player' ? flexUtils.COLORS.PRIMARY : flexUtils.COLORS.TEXT_MAIN,
                align: 'center', margin: 'sm'
            }),

            flexUtils.createSeparator('md'),

            // 結果區
            flexUtils.createText({
                text: `勝利方：${outcome.label}`,
                size: 'lg', weight: 'bold', color: flexUtils.COLORS.TEXT_MAIN, align: 'center', margin: 'md'
            }),
            flexUtils.createText({
                text: `你押注：${betLabels[betKey]}`,
                size: 'sm', color: flexUtils.COLORS.TEXT_SUB, align: 'center', margin: 'sm'
            }),
            flexUtils.createText({
                text: resultText,
                size: 'xl', weight: 'bold', color: resultColor, align: 'center', margin: 'md'
            })
        ];

        if (isWin) {
            contents.push(flexUtils.createText({
                text: `獲得: +${winAmount.toLocaleString()} 哭幣`,
                size: 'md', weight: 'bold', color: flexUtils.COLORS.PRIMARY, align: 'center', margin: 'sm'
            }));
        }

        contents.push(flexUtils.createText({
            text: `目前餘額: ${finalBalance.toLocaleString()}`,
            size: 'xs', color: flexUtils.COLORS.TEXT_MUTED, align: 'center', margin: 'lg'
        }));

        const bubble = flexUtils.createBubble({
            size: 'kilo',
            body: flexUtils.createBox('vertical', contents, { backgroundColor: flexUtils.COLORS.BG_CARD, paddingAll: 'xl' })
        });

        await lineUtils.replyFlex(replyToken, `百家樂：${outcome.label}獲勝`, bubble);

    } catch (e) {
        console.error('[Baccarat] playBaccarat error:', e);
        await lineUtils.replyText(replyToken, '❌ 百家樂系統發生故障，荷官跑路了。');
    }
}

module.exports = { playBaccarat };
