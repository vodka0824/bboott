const flexUtils = require('../utils/flex');
const lineUtils = require('../utils/line');
const economyHandler = require('./economy');
const atonementHandler = require('./atonement');

const CHEAT_PROBABILITY = 0.023; // 2.3% 機率讓玩家輸 (RTP 調整至 95%)

// 骰子點數對應 Emoji
const DICE_EMOJIS = {
    1: '⚀', 2: '⚁', 3: '⚂', 4: '⚃', 5: '⚄', 6: '⚅'
};

async function rollDice(replyToken, groupId, userId, betType, amountStr) {
    const betAmount = parseInt(amountStr, 10);
    if (isNaN(betAmount) || betAmount <= 0) {
        await lineUtils.replyText(replyToken, '❌ 骰寶下注金額無效（請輸入大於 0 的正整數金額，例如：骰子 大 1000000）。');
        return;
    }

    // 扣除賭金
    const consumeResult = await economyHandler.consumeCoin(groupId, userId, betAmount, true);
    if (!consumeResult.success) {
        await lineUtils.replyText(replyToken, `❌ 下注失敗：${consumeResult.message}`);
        return;
    }

    const userName = consumeResult.name || '玩家';

    // 擲三顆骰子
    let dice = [
        Math.floor(Math.random() * 6) + 1,
        Math.floor(Math.random() * 6) + 1,
        Math.floor(Math.random() * 6) + 1
    ];

    let sum = dice.reduce((a, b) => a + b, 0);
    let isTriple = (dice[0] === dice[1] && dice[1] === dice[2]);
    let resultType = isTriple ? '豹子' : (sum >= 11 ? '大' : '小');

    // 作弊機制：如果玩家本來會贏，有 10% 機率搞鬼
    if (resultType === betType && Math.random() < CHEAT_PROBABILITY) {
        // 試圖改變結果直到玩家輸
        let safe = false;
        for (let i = 0; i < 10; i++) {
            dice = [
                Math.floor(Math.random() * 6) + 1,
                Math.floor(Math.random() * 6) + 1,
                Math.floor(Math.random() * 6) + 1
            ];
            sum = dice.reduce((a, b) => a + b, 0);
            isTriple = (dice[0] === dice[1] && dice[1] === dice[2]);
            resultType = isTriple ? '豹子' : (sum >= 11 ? '大' : '小');
            if (resultType !== betType) {
                safe = true;
                break;
            }
        }
    }

    const isWin = (resultType === betType);
    let winAmount = 0;
    let finalBalance = consumeResult.newBalance || 0;
    
    // 計算賠率
    if (isWin) {
        if (betType === '豹子') {
            winAmount = betAmount * 34; // 豹子賠 34 倍 (加上本金發放 35 倍，RTP 約 95%)
        } else {
            winAmount = betAmount; // 大小賠 1 倍 (拿回本金再賺 1 倍)
        }
        // 發放本金 + 獎金
        const taxResult = await atonementHandler.processDevilTax(winAmount, userId);
        if (taxResult.hasContract && taxResult.taxAmount > 0) {
            winAmount = taxResult.finalProfit;
            // 由於 dice.js 透過 flexContents 傳送結果，不依賴 resultText/msg，在此暫不處理 text
        }
      await economyHandler.addCoinQuietly(groupId, userId, betAmount + winAmount);
        finalBalance += (betAmount + winAmount);
    }

    // 取得毒舌嘲諷語錄
    const MOCKING_MESSAGES = economyHandler.MOCKING_MESSAGES || ["笑死，輸光光囉！", "可憐哪！"];
    const mockingText = MOCKING_MESSAGES[Math.floor(Math.random() * MOCKING_MESSAGES.length)];

    const diceStr = dice.map(d => DICE_EMOJIS[d]).join(' ');
    
    // 建立 Flex Message
    const flexContents = {
        type: "bubble",
        size: "kilo", // 改用 kilo 避免金額過大被截斷
        body: {
            type: "box",
            layout: "vertical",
            backgroundColor: flexUtils.COLORS.BG_CARD, // 質感深色背景
            paddingAll: "xl",
            contents: [
                {
                    type: "text",
                    text: "🎲 骰寶結算",
                    weight: "bold",
                    color: "#F39C12", // 金黃色
                    size: "md",
                    align: "center"
                },
                {
                    type: "text",
                    text: `${userName} 押注【${betType}】`,
                    size: "xs",
                    color: "#A0A0A0",
                    align: "center",
                    margin: "sm"
                },
                {
                    type: "text",
                    text: diceStr,
                    size: "4xl",
                    weight: "bold",
                    align: "center",
                    color: flexUtils.COLORS.TEXT_MAIN,
                    margin: "lg"
                },
                {
                    type: "text",
                    text: `點數：${sum} (${resultType})`,
                    size: "sm",
                    weight: "bold",
                    align: "center",
                    color: flexUtils.COLORS.TEXT_MUTED,
                    margin: "sm"
                },
                {
                    type: "box",
                    layout: "vertical",
                    margin: "lg",
                    backgroundColor: isWin ? "#2ECC7120" : "#E74C3C20", // 半透明底色
                    cornerRadius: "md",
                    paddingAll: "md",
                    contents: [
                        {
                            type: "text",
                            text: isWin ? `🎉 贏得 ${winAmount.toLocaleString()} 哭幣` : `💸 輸掉 ${betAmount.toLocaleString()} 哭幣`,
                            weight: "bold",
                            size: "md",
                            align: "center",
                            color: isWin ? "#2ECC71" : "#E74C3C",
                            wrap: true // 確保過大金額可以換行
                        },
                        {
                            type: "text",
                            text: `目前餘額：${finalBalance.toLocaleString()} 💰`,
                            size: "xs",
                            weight: "bold",
                            align: "center",
                            color: flexUtils.COLORS.TEXT_MUTED,
                            margin: "sm"
                        }
                    ]
                }
            ]
        }
    };

    // 如果輸了，直接加上嘲諷，不寫小寶嘲諷
    if (!isWin) {
        flexContents.body.contents.push(
            {
                type: "separator",
                margin: "xl",
                color: "#333333"
            },
            {
                type: "text",
                text: `「${mockingText}」`,
                size: "sm",
                color: "#FF5555",
                wrap: true,
                margin: "lg",
                align: "center",
                weight: "bold",
                style: "italic"
            }
        );
    }

    await lineUtils.replyFlex(replyToken, `骰寶開獎結果：${diceStr}`, flexContents);
}

module.exports = {
    rollDice
};
