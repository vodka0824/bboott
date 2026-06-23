/**
 * 多人推筒子 (Tui Tong Zi) 功能模組
 */
const flexUtils = require('../utils/flex');
const lineUtils = require('../utils/line');
const economyHandler = require('./economy');
const persistenceService = require('../services/multiplayerPersistenceService');
const atonementHandler = require('./atonement');
const authUtils = require('../utils/auth');
const { db } = require('../utils/db');

// In-Memory 儲存群組內的牌桌 (Key: groupId)
const tableManager = require('./multi_tableManager');
const activeTables = {
    _map: new Map(),
    has: function(groupId) { 
        if (this._map.has(groupId)) return true;
        return tableManager.hasActiveTable(groupId);
    },
    get: function(groupId) { return this._map.get(groupId); },
    set: function(groupId, val) { 
        tableManager.lockTable(groupId, '多人遊戲');
        return this._map.set(groupId, val); 
    },
    delete: function(groupId) { 
        tableManager.unlockTable(groupId);
        return this._map.delete(groupId); 
    }
};

// 麻將牌定義 (1-9筒, 白板)
const TILES = [
    { name: '1筒', value: 1, symbol: '🀙' },
    { name: '2筒', value: 2, symbol: '🀚' },
    { name: '3筒', value: 3, symbol: '🀛' },
    { name: '4筒', value: 4, symbol: '🀜' },
    { name: '5筒', value: 5, symbol: '🀝' },
    { name: '6筒', value: 6, symbol: '🀞' },
    { name: '7筒', value: 7, symbol: '🀟' },
    { name: '8筒', value: 8, symbol: '🀠' },
    { name: '9筒', value: 9, symbol: '🀡' },
    { name: '白板', value: 0.5, symbol: '🀆' }
];

function createDeck() {
    const deck = [];
    for (const t of TILES) {
        for (let i = 0; i < 4; i++) {
            deck.push({ ...t });
        }
    }
    return shuffle(deck);
}

function shuffle(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

/**
 * 算牌邏輯
 * 回傳: { type: '白皮對' | '8筒對' | '8.5 點', score: 大小權重, multiplier: 1 }
 */
function calculateTuiTongZi(hand) {
    const [t1, t2] = hand;
    
    // 檢查對子
    if (t1.name === t2.name) {
        let typeName = `${t1.name}對`;
        let rank = t1.value * 10; // 10 ~ 90
        if (t1.name === '白板') {
            typeName = '白皮對';
            rank = 100; // 白皮對最大
        }
        return { isPair: true, type: typeName, score: rank, multiplier: 1 };
    }
    
    // 計算點數 (相加取個位數)
    let sum = t1.value + t2.value;
    let points = sum >= 10 ? sum - 10 : sum;
    
    let typeName = `${points} 點`;
    if (points === 0) typeName = '鱉十 (0點)';
    
    // 點數的 score 為 0 ~ 9.5，對子最小為 10，因此對子一定大於任何點數
    return { isPair: false, type: typeName, score: points, multiplier: 1 };
}

function compareHands(resultA, resultB) {
    if (resultA.score > resultB.score) return 1;
    if (resultA.score < resultB.score) return -1;
    return 0; // 點數相同即平手 (走水)
}

function renderHand(hand) {
    if (hand.length === 0) return '無';
    return hand.map(c => c.symbol).join(' ');
}

// 取得目前的牌桌
function getActiveTable(groupId) {
    return activeTables.get(groupId);
}

// === 操作邏輯 ===

// 1. 開桌推筒子
async function openTable(replyToken, context) {
    const { groupId, userId } = context;
    if (!groupId) {
        await lineUtils.replyText(replyToken, '❌ 只能在群組內開桌！');
        return;
    }

    if (await atonementHandler.checkDevilContract(userId)) {
        await lineUtils.replyText(replyToken, '❌ 惡魔契約期間，您無法擔任莊家！');
        return;
    }

    if (activeTables.has(groupId)) {
        await lineUtils.replyText(replyToken, '❌ 目前群組內已經有一桌推筒子正在進行中！');
        return;
    }
    
    activeTables.set(groupId, 'pending');

    const userDoc = await db.collection('economy_users').doc(userId).get();
    const balance = userDoc.exists ? (userDoc.data().kuCoin || 0) : 0;

    if (balance < 0) {
        activeTables.delete(groupId);
        await lineUtils.replyText(replyToken, '❌ 窮鬼欠債還想開賭桌？先去賺錢還債吧！');
        return;
    }

    const userName = await lineUtils.getGroupMemberName(groupId, userId);
    const newWanted = await economyHandler.addWantedLevel(userId);
    const participantWantedLevels = new Map();
    participantWantedLevels.set(userId, newWanted);

    const table = {
        groupId,
        dealerId: userId,
        dealerName: userName,
        dealerHand: [],
        dealerResult: null,
        status: 'waiting',
        deck: createDeck(),
        players: new Map(), // key: userId
        participantWantedLevels,
        timeout: setTimeout(() => autoCloseTable(groupId), 1 * 60 * 1000)
    };

    activeTables.set(groupId, table);
    await sendTableFlex(replyToken, table, '🀄 推筒子牌桌已建立！大家快來下注！(1分鐘內請發牌)');
}

async function autoCloseTable(groupId) {
    const table = activeTables.get(groupId);
    if (!table || table.status !== 'waiting') return;

    activeTables.delete(groupId);

    const refundedPlayers = [];
    for (const [uid, p] of table.players.entries()) {
        await economyHandler.addCoinQuietly(groupId, uid, p.bet);
        refundedPlayers.push({ name: p.name, bet: p.bet });
    }

    let msg = `⏱️ ${table.dealerName} 開的推筒子超過 1 分鐘未發牌，自動解散。`;
    if (refundedPlayers.length > 0) {
        msg += `\n\n💰 已退還下注：`;
        for (const p of refundedPlayers) {
            msg += `\n• ${p.name}：+${p.bet.toLocaleString()} 哭幣`;
        }
    }

    lineUtils.addPendingMessage(groupId, [{ type: 'text', text: msg }]);
}

// 2. 解散牌桌
async function closeTable(replyToken, context) {
    const { groupId, userId } = context;
    const table = activeTables.get(groupId);

    if (!table) return;
    if (table.dealerId !== userId) {
        // await lineUtils.replyText(replyToken, '❌ 只有莊家可以解散牌桌！');
        return;
    }
    if (table.status !== 'waiting') {
        await lineUtils.replyText(replyToken, '❌ 遊戲已經結算，無法解散！');
        return;
    }

    clearTimeout(table.timeout);
    activeTables.delete(groupId);

    for (const [uid, p] of table.players.entries()) {
        await economyHandler.addCoinQuietly(groupId, uid, p.bet);
    }

    await lineUtils.replyText(replyToken, '✅ 莊家已解散推筒子，所有下注已退還。');
}

// 3. 下注
async function placeBet(replyToken, context, amountStr) {
    const { groupId, userId } = context;
    const table = activeTables.get(groupId);

    if (!table) return;
    if (table.status !== 'waiting') {
        await lineUtils.replyText(replyToken, '❌ 已經發牌結算了，無法再下注！');
        return;
    }
    if (table.dealerId === userId) {
        await lineUtils.replyText(replyToken, '❌ 莊家不能下注！');
        return;
    }
    if (table.players.has(userId)) {
        await lineUtils.replyText(replyToken, '❌ 您已經下注過了！請等莊家發牌。');
        return;
    }

    const betAmount = parseInt(amountStr, 10);
    if (isNaN(betAmount) || betAmount <= 0) {
        await lineUtils.replyText(replyToken, '❌ 推筒子下注金額無效（請輸入大於 0 的正整數金額，例如：下注 1000000）。');
        return;
    }

    const consumeResult = await economyHandler.consumeCoin(groupId, userId, betAmount, true);
    if (!consumeResult.success) {
        await lineUtils.replyText(replyToken, `❌ 下注失敗：${consumeResult.message}`);
        return;
    }

    const userName = consumeResult.name || '玩家';
    persistenceService.recordBet(groupId, '推筒子', userId, betAmount, userName).catch(e => console.error(e));
    const newWanted = await economyHandler.addWantedLevel(userId);
    table.participantWantedLevels.set(userId, newWanted);

    table.players.set(userId, {
        name: userName,
        bet: betAmount,
        hand: [],
        result: null,
        playerNet: 0,
        resultStr: '',
        color: ''
    });

    clearTimeout(table.timeout);
    table.timeout = setTimeout(() => autoCloseTable(groupId), 1 * 60 * 1000);

    await sendTableFlex(replyToken, table, `${userName} 下注了 ${betAmount.toLocaleString()} 哭幣！`);
}

// 4. 發牌
async function dealCards(replyToken, context) {
    const { groupId, userId } = context;
    const table = activeTables.get(groupId);

    if (!table || table.status !== 'waiting') return;
    if (table.dealerId !== userId) {
        // await lineUtils.replyText(replyToken, '❌ 只有莊家可以發牌！');
        return;
    }
    if (table.players.size === 0) {
        await lineUtils.replyText(replyToken, '❌ 牌桌上還沒有人下注！');
        return;
    }

    clearTimeout(table.timeout);
    table.status = 'closed';

    // 莊家發 2 張牌
    for (let i = 0; i < 2; i++) table.dealerHand.push(table.deck.pop());
    table.dealerResult = calculateTuiTongZi(table.dealerHand);

    // 閒家發 2 張牌
    for (const p of table.players.values()) {
        for (let i = 0; i < 2; i++) p.hand.push(table.deck.pop());
        p.result = calculateTuiTongZi(p.hand);
    }

    await finishGameAndSettle(replyToken, table, '🀄 發牌完畢！立刻結算！');
}

// 結算
async function finishGameAndSettle(replyToken, table, titleMsg) {
    const { groupId, dealerId, dealerResult } = table;
    let dealerNetProfit = 0;

    const extraPenalties = [];
    const payoutPromises = [];

    for (const [uid, p] of Array.from(table.players.entries())) {
        const playerResult = p.result;
        let playerPayout = 0;
        let playerNet = 0;

        const cmp = compareHands(playerResult, dealerResult);

        if (cmp > 0) { // 閒贏
            const winAmount = p.bet; // 方案 A: 賠一倍
            playerPayout = p.bet + winAmount; 
            playerNet = winAmount;
            p.resultStr = '🎉 贏 (+' + winAmount.toLocaleString() + ')';
            p.color = flexUtils.COLORS.WIN; 
        } else if (cmp < 0) { // 閒輸
            const loseAmount = p.bet;
            playerPayout = 0;
            playerNet = -loseAmount;
            p.resultStr = '💸 輸 (' + playerNet.toLocaleString() + ')';
            p.color = '#D32F2F';
        } else { // 平手
            playerPayout = p.bet;
            playerNet = 0;
            p.resultStr = '🤝 平手 (退注)';
            p.color = flexUtils.COLORS.SECONDARY;
        }

        dealerNetProfit -= playerNet;
        
        if (playerNet > 0) {
            const taxResult = await atonementHandler.processDevilTax(playerNet, uid);
            if (taxResult.hasContract && taxResult.taxAmount > 0) {
                playerNet = taxResult.finalProfit;
                playerPayout -= taxResult.taxAmount;
                p.curseStr = `詛咒: -${taxResult.taxAmount.toLocaleString()}`;
            }
        }

        if (playerPayout > 0) {
            payoutPromises.push(economyHandler.addCoinFast(uid, playerPayout));
        }
        p.playerNet = playerNet;
    }

    let taxAmount = 0;
    if (dealerNetProfit > 0) {
        if (!authUtils.isSuperAdmin(dealerId)) {
            taxAmount = Math.floor(dealerNetProfit * 0.05);
            dealerNetProfit -= taxAmount;
            table.taxAmount = taxAmount;
        }
    }

    if (dealerNetProfit !== 0) {
        payoutPromises.push(economyHandler.addCoinFast(dealerId, dealerNetProfit));
    }
    
    await Promise.all([...extraPenalties, ...payoutPromises]);
    table.dealerNetProfit = dealerNetProfit;

    try {
        const dealerDoc = await db.collection('economy_users').doc(dealerId).get();
        table.dealerFinalBalance = dealerDoc.exists ? (dealerDoc.data().kuCoin || 0) : 0;
        for (const [uid, p] of table.players.entries()) {
            const pDoc = await db.collection('economy_users').doc(uid).get();
            p.finalBalance = pDoc.exists ? (pDoc.data().kuCoin || 0) : 0;
        }
    } catch(e) {}

    const allParticipants = [table.dealerId, ...Array.from(table.players.keys())];
    const bustMsg = await economyHandler.triggerPublicGamblingEvent(groupId, allParticipants, null, true, table.dealerId);

    if (replyToken) {
        await sendTableFlex(replyToken, table, titleMsg, bustMsg ? [bustMsg] : []);
    }

    clearTimeout(table.timeout);
    activeTables.delete(groupId); 
}

// 渲染 Flex
async function sendTableFlex(replyToken, table, altText, extraMessages = []) {
    const contents = [
        flexUtils.createText({ text: '🀄 哭霸娛樂城 - 多人推筒子', size: 'lg', weight: 'bold', color: '#4CAF50', align: 'center', margin: 'md', adjustMode: 'shrink-to-fit' })
    ];

    let totalWanted = 0;
    if (table.participantWantedLevels) {
        totalWanted = Array.from(table.participantWantedLevels.values()).reduce((a, b) => a + b, 0);
    }
    contents.push(flexUtils.createText({ text: `🚨 賭桌總通緝機率: ${(totalWanted * 100).toFixed(1)}%`, size: 'xs', color: '#FF5252', align: 'center', margin: 'xs', weight: 'bold' }));
    contents.push(flexUtils.createSeparator('md'));

    let dealerCardsStr = '準備中...';
    let dealerScoreStr = '? 點';
    
    if (table.status === 'closed') {
        dealerCardsStr = renderHand(table.dealerHand);
        dealerScoreStr = `${table.dealerResult.type}`;
    }

    contents.push(
        flexUtils.createText({ text: `🏦 莊家: ${table.dealerName}`, size: 'md', weight: 'bold', color: flexUtils.COLORS.TEXT_MAIN, margin: 'md' }),
        flexUtils.createText({ text: dealerCardsStr, size: '3xl', weight: 'bold', color: flexUtils.COLORS.TEXT_MAIN, margin: 'sm' })
    );

    if (table.status === 'closed') {
        const netColor = table.dealerNetProfit >= 0 ? flexUtils.COLORS.WIN : '#D32F2F';
        contents.push(
            flexUtils.createText({ text: dealerScoreStr, size: 'sm', color: flexUtils.COLORS.PRIMARY, margin: 'xs', weight: 'bold' }),
            flexUtils.createText({ text: `結算: ${table.dealerNetProfit > 0 ? '+' : ''}${table.dealerNetProfit.toLocaleString()}`, size: 'md', weight: 'bold', color: netColor, margin: 'xs', wrap: true })
        );
        if (table.dealerFinalBalance !== undefined) {
            contents.push(flexUtils.createText({ text: `餘額: ${table.dealerFinalBalance.toLocaleString()}`, size: 'xs', color: netColor, margin: 'xs' }));
        }
        if (table.taxAmount > 0) {
            contents.push(flexUtils.createText({ text: `(抽水 5%: -${table.taxAmount.toLocaleString()})`, size: 'xs', color: flexUtils.COLORS.TEXT_SUB, margin: 'xs' }));
        }
    }

    contents.push(flexUtils.createSeparator('lg'));

    let totalBets = 0;
    if (table.players.size === 0) {
        contents.push(flexUtils.createText({ text: '尚無閒家加入', size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, align: 'center', margin: 'lg' }));
    } else {
        for (const p of table.players.values()) {
            totalBets += p.bet;
            let pStatus = `下注: ${p.bet.toLocaleString()}`;
            let pScoreStr = '';
            
            if (table.status === 'closed') {
                pStatus = renderHand(p.hand);
                pScoreStr = `${p.result.type}`;
            }

            contents.push(flexUtils.createBox('horizontal', [
                flexUtils.createText({ text: `👤 ${p.name}`, wrap: true, size: 'sm', weight: 'bold', color: flexUtils.COLORS.TEXT_MAIN, flex: 2 }),
                flexUtils.createText({ text: `押 ${p.bet.toLocaleString()}`, size: 'xs', color: flexUtils.COLORS.SECONDARY, flex: 1, align: 'end', adjustMode: 'shrink-to-fit' })
            ], { margin: 'md', alignItems: 'center' }));

            if (table.status === 'closed') {
                contents.push(flexUtils.createText({ text: pStatus, size: 'xxl', color: flexUtils.COLORS.TEXT_MAIN, margin: 'xs' }));
                contents.push(flexUtils.createText({ text: pScoreStr, size: 'xs', color: flexUtils.COLORS.PRIMARY, margin: 'xs', weight: 'bold' }));
                
                contents.push(flexUtils.createText({ text: `${p.resultStr}`, size: 'sm', weight: 'bold', color: p.color, margin: 'xs' }));
                if (p.curseStr) contents.push(flexUtils.createText({ text: p.curseStr, size: 'xs', weight: 'bold', color: '#FF1744', margin: 'xs' }));
                if (p.finalBalance !== undefined) {
                    contents.push(flexUtils.createText({ text: `餘額: ${p.finalBalance.toLocaleString()}`, size: 'xs', color: flexUtils.COLORS.TEXT_MUTED, margin: 'xs' }));
                }
            }
            
            contents.push(flexUtils.createSeparator('sm'));
        }
    }

    let statusMsg = '';
    let shortcutMsg = '';
    if (table.status === 'waiting') {
        statusMsg = `等待下注中... (目前總注: ${totalBets})`;
        shortcutMsg = '💡 捷徑：下注輸入「+金額」或「歐印」、發牌輸入「+」';
    } else {
        statusMsg = '遊戲已結束';
    }

    contents.push(flexUtils.createText({ text: statusMsg, size: 'sm', weight: 'bold', color: flexUtils.COLORS.PRIMARY, align: 'center', margin: 'xl' }));
    if (shortcutMsg) {
        contents.push(flexUtils.createText({ text: shortcutMsg, size: 'xs', color: flexUtils.COLORS.TEXT_SUB, align: 'center', margin: 'sm' }));
    }

    const bubble = flexUtils.createBubble({
        size: 'mega',
        body: flexUtils.createBox('vertical', contents, { backgroundColor: flexUtils.COLORS.BG_MAIN, paddingAll: 'xl' })
    });

    const messages = [{ type: 'flex', altText: altText, contents: bubble }, ...extraMessages];

    
    const quickReply = require('../utils/multi_quickReply').getQuickReply(table, '推筒子');
    if (quickReply) {
        messages[messages.length - 1].quickReply = quickReply;
    }

    if (messages.length <= 5) {
        await lineUtils.replyToLine(replyToken, messages).catch(console.error);
    } else {
        await lineUtils.replyToLine(replyToken, messages.slice(0, 5)).catch(console.error);
        lineUtils.addPendingMessage(table.groupId, messages.slice(5));
    }
}

module.exports = {
    getActiveTable,
    openTable,
    closeTable,
    placeBet,
    dealCards
};
