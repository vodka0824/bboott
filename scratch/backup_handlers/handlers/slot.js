const flexUtils = require('../utils/flex');
const { replyFlex, replyText } = require('../utils/line');
const economyHandler = require('./economy');
const atonementHandler = require('./atonement');
const { ADMIN_USER_ID } = require('../config/constants');

// 符號清單
const SYMBOLS = ['0', '1', '2', '3', '4', '7'];
const SYMBOL_NAMES = {
    '0': '🎰 BAR',
    '1': '💧 藍色果凍',
    '2': '🔔 鈴鐺',
    '3': '🍉 西瓜',
    '4': '🍒 櫻桃',
    '7': 'Lucky 7'
};

const SYMBOL_EMOJIS = {
    '0': '🎰',
    '1': '💧',
    '2': '🔔',
    '3': '🍉',
    '4': '🍒',
    '7': '💎'
};

const PAYOUT_MULTIPLIER = {
    '7': 180, // Lucky 7 (調整以達到 95% RTP)
    '0': 15,  // BAR
    '3': 10,  // 西瓜
    '2': 5,   // 鈴鐺
    '4': 3,   // 櫻桃
    '1': 2    // 藍色果凍
};

// 專業賭場滾輪設計 (Reels)
const REEL1 = ['1','4','2','1','3','4','1','0','2','1','4','3','1','2','4','1','7','4','1','2'];
const REEL2 = ['1','2','4','1','3','2','3','4','0','1','2','4','1','3','2','1','7','4','0','2'];
const REEL3 = ['1','4','2','1','3','4','1','2','0','1','4','2','1','3','3','1','7','2','1','4'];

// 中獎線路定義 (真實賭場 5條線)
const WIN_LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // 水平
    [0, 4, 8], [2, 4, 6]             // 斜對角
];

async function handleSlot(replyToken, context, betAmountStr = '10') {
    const betAmount = parseInt(betAmountStr) || 10;
    
    // === 檢查是否為超級管理員 ===
    const userId = context.userId;
    const groupId = context.groupId;
    const isSuperAdmin = userId === ADMIN_USER_ID;

    // === 扣除哭幣 (管理員不需扣款) ===
    let consumeResult;
    if (!isSuperAdmin) {
        consumeResult = await economyHandler.consumeCoin(groupId, userId, betAmount, true);
        if (!consumeResult.success) {
            const bal = consumeResult.currentBalance || 0;
            const name = consumeResult.name || '玩家';
            const mocking = consumeResult.mockingText || '窮鬼退散！';
            
            const failMsg = `「${mocking}」\n您的餘額不足，需要 ${betAmount.toLocaleString()} 哭幣，你身上僅剩 ${bal}，${name}`;
            await replyText(replyToken, failMsg);
            return;
        }
    }

    let layout;

    if (isSuperAdmin) {
        const winSymbol = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
        const winLine = WIN_LINES[Math.floor(Math.random() * WIN_LINES.length)];

        layout = [];
        for (let i = 0; i < 9; i++) {
            layout[i] = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
        }

        winLine.forEach(pos => {
            layout[pos] = winSymbol;
        });
    } else {
        const r1 = Math.floor(Math.random() * REEL1.length);
        const r2 = Math.floor(Math.random() * REEL2.length);
        const r3 = Math.floor(Math.random() * REEL3.length);

        layout = [
            REEL1[r1], REEL2[r2], REEL3[r3],
            REEL1[(r1 + 1) % REEL1.length], REEL2[(r2 + 1) % REEL2.length], REEL3[(r3 + 1) % REEL3.length],
            REEL1[(r1 + 2) % REEL1.length], REEL2[(r2 + 2) % REEL2.length], REEL3[(r3 + 2) % REEL3.length]
        ];
    }

    // 檢查中獎
    let totalWinAmount = 0;
    const winners = [];
    WIN_LINES.forEach(line => {
        const [a, b, c] = line;
        if (layout[a] === layout[b] && layout[b] === layout[c]) {
            const sym = layout[a];
            winners.push({
                line,
                symbol: sym
            });
            totalWinAmount += betAmount * (PAYOUT_MULTIPLIER[sym] || 0);
        }
    });

    let finalBalance = (consumeResult && consumeResult.newBalance) ? consumeResult.newBalance : 0;
    let taxMsg = "";
    if (totalWinAmount > 0 && !isSuperAdmin) {
        let finalWinAmount = totalWinAmount;
        const taxResult = await atonementHandler.processDevilTax(totalWinAmount, userId);
        if (taxResult.hasContract && taxResult.taxAmount > 0) {
            finalWinAmount = taxResult.finalProfit;
            taxMsg = `\n😈 惡魔契約發動：強制徵收 90% 獲利 (-${taxResult.taxAmount.toLocaleString()})`;
        }
        finalBalance = await economyHandler.addCoinQuietly(groupId, userId, finalWinAmount);
    } else if (isSuperAdmin && totalWinAmount > 0) {
        finalBalance = 999999999;
    }

    const flex = buildSlotFlex(layout, winners, totalWinAmount, betAmount, finalBalance, taxMsg);
    const altText = winners.length > 0
        ? `🎰 拉霸結果 - 恭喜！贏得 ${totalWinAmount.toLocaleString()} 哭幣`
        : '🎰 拉霸結果 - 未中獎';
    await replyFlex(replyToken, altText, flex);
}



function buildSlotFlex(layout, winners, totalWinAmount, betAmount, finalBalance, taxMsg = "") {
    const { COLORS } = flexUtils;
    const contents = [];

    // --- Header ---
    contents.push(flexUtils.createBox('vertical', [
        flexUtils.createText({
            text: '🎰 LAS VEGAS CASINO 🎰',
            weight: 'bold',
            color: '#FFD700', // Gold
            size: 'md',
            align: 'center'
        })
    ], {
        backgroundColor: '#000000',
        paddingAll: 'md'
    }));

    // --- Emoji Slot UI ---
    const slotRows = [];
    for (let i = 0; i < 3; i++) {
        // 每列加上分隔線背景，減少 padding
        slotRows.push(flexUtils.createBox('horizontal', [
            {
                type: 'text',
                text: SYMBOL_EMOJIS[layout[i * 3]],
                size: '4xl',
                align: 'center',
                weight: 'bold',
                adjustMode: 'shrink-to-fit'
            },
            {
                type: 'text',
                text: SYMBOL_EMOJIS[layout[i * 3 + 1]],
                size: '4xl',
                align: 'center',
                weight: 'bold',
                adjustMode: 'shrink-to-fit'
            },
            {
                type: 'text',
                text: SYMBOL_EMOJIS[layout[i * 3 + 2]],
                size: '4xl',
                align: 'center',
                weight: 'bold',
                adjustMode: 'shrink-to-fit'
            }
        ], { 
            margin: 'md',
            backgroundColor: '#00000088',
            cornerRadius: 'sm',
            paddingAll: 'sm'
        }));
    }

    const slotBox = flexUtils.createBox('vertical', slotRows, {
        background: {
            type: 'linearGradient',
            angle: '45deg',
            startColor: '#1A0B2E',
            endColor: '#3B185F' // 奢華紫色漸變
        },
        paddingAll: 'md', // 減少 padding
        borderColor: '#FFD700', // 金色邊框
        borderWidth: '2px',
        cornerRadius: 'md'
    });

    // 加入一個分隔區域，減少 padding
    contents.push(flexUtils.createBox('vertical', [slotBox], {
        paddingAll: 'md',
        backgroundColor: '#111111'
    }));

    // 3. 底部結果文字盒
    let footerText;
    let footerBg;
    let footerBorder;

    if (winners.length > 0) {
        const winningSyms = [...new Set(winners.map(w => SYMBOL_NAMES[w.symbol] || w.symbol))];
        footerText = `🎊 恭喜達成 ${winners.length} 條連線！\n(${winningSyms.join(', ')})\n💰 贏得 ${totalWinAmount.toLocaleString()} 哭幣！${taxMsg}`;
        footerBg = '#2A0800'; // 暗金色/紅金色背景
        footerBorder = '#FFD700'; // 金色邊框
    } else {
        const loseMessages = [
            "你的運氣可以申請金氏世界紀錄了（最衰） 📖",
            "建議改行當掃把星，專業對口 🌠",
            "這運氣拿去當肥料，連草都長不出來 🌱",
            "系統提示：您的幸運值已透支 💸",
            "連 AI 都為你的運氣感到絕望 🤖",
            "財神爺看到你都繞路走 🏃",
            "恭喜解鎖隱藏成就：【廢到極致】 🏅",
            "這輩子註定當孤兒（獎金的） 👶",
            "你就是傳說中的『行走的黑洞』 🕳️",
            "你的幸運值已低於海平面以下9999米 🌊",
            "建議改名叫『沒中過』，這樣比較符合現實 😏",
            "窮鬼預定 🦗",
            "笑死，又沒中 🤣🤣🤣",
            "我就知道你不行 😎"
        ];
        const randomIndex = Math.floor(Math.random() * loseMessages.length);
        footerText = loseMessages[randomIndex];
        footerBg = '#1A1A1A'; // 深灰背景
        footerBorder = '#333333'; // 暗色邊框
    }

    contents.push(flexUtils.createBox('vertical', [
        flexUtils.createText({
            text: footerText,
            align: 'center',
            color: winners.length > 0 ? '#FFD700' : '#CCCCCC',
            weight: 'bold',
            size: 'sm',
            wrap: true,
            margin: 'sm'
        }),
        flexUtils.createText({
            text: `目前餘額: ${finalBalance.toLocaleString()} 💰`,
            align: 'center',
            color: '#AAAAAA',
            weight: 'bold',
            size: 'xs',
            margin: 'sm'
        }),
        flexUtils.createText({
            text: '💡 捷徑：輸入「slot +金額」或「slot 歐印」再次挑戰',
            align: 'center',
            color: '#888888',
            size: 'xxs',
            margin: 'md'
        })
    ], {
        backgroundColor: footerBg,
        paddingAll: 'md',
        cornerRadius: 'md',
        borderColor: footerBorder,
        borderWidth: '2px',
        margin: 'md'
    }));

    // 4. 重玩按鈕
    contents.push(flexUtils.createBox('horizontal', [
        flexUtils.createButton({
            action: { type: 'message', label: `再來一局 (${betAmount.toLocaleString()} 哭幣)`, text: `拉霸 ${betAmount.toLocaleString()}` },
            style: 'primary', height: 'sm', color: '#D4AF37' // 霧金色按鈕
        })
    ], {
        margin: 'md',
        paddingStart: 'md',
        paddingEnd: 'md',
        paddingBottom: 'md'
    }));

    return flexUtils.createBubble({
        size: 'kilo',
        body: flexUtils.createBox('vertical', contents, { paddingAll: '0px', backgroundColor: '#000000' })
    });
}

module.exports = {
    handleSlot
};
