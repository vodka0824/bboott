/**
 * 多人炸金花 (Golden Flower) 功能模組
 */
const flexUtils = require('../utils/flex');
const lineUtils = require('../utils/line');
const economyHandler = require('./economy');
const atonementHandler = require('./atonement');
const authUtils = require('../utils/auth');

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

const SUITS = ['♠️', '♥️', '♣️', '♦️']; // ♠️ > ♥️ > ♣️ > ♦️
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function getSuitRank(suit) { return SUITS.indexOf(suit); }
function getCardRank(value) {
    if (value === 'A') return 14;
    if (value === 'K') return 13;
    if (value === 'Q') return 12;
    if (value === 'J') return 11;
    return parseInt(value, 10);
}

function createDeck() {
    const deck = [];
    for (const suit of SUITS) {
        for (const value of VALUES) {
            deck.push({ suit, value, rank: getCardRank(value), suitRank: getSuitRank(suit) });
        }
    }
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function evaluateHand(hand) {
    hand.sort((a, b) => {
        if (a.rank !== b.rank) return b.rank - a.rank;
        return a.suitRank - b.suitRank;
    });

    const isFlush = hand[0].suit === hand[1].suit && hand[1].suit === hand[2].suit;
    let isStraight = false;
    let v1 = hand[0].rank, v2 = hand[1].rank, v3 = hand[2].rank;
    
    if (v1 === v2 + 1 && v2 === v3 + 1) {
        isStraight = true;
    } else if (v1 === 14 && v2 === 3 && v3 === 2) {
        isStraight = true;
        hand = [hand[1], hand[2], hand[0]];
        v1 = 3; v2 = 2; v3 = 1;
    }

    const isThree = v1 === v2 && v2 === v3;
    let isPair = false, pairRank = 0, kickerRank = 0;
    
    if (!isThree) {
        if (v1 === v2) { isPair = true; pairRank = v1; kickerRank = v3; }
        else if (v2 === v3) { isPair = true; pairRank = v2; kickerRank = v1; }
    }

    let type = 0, typeName = '散牌', multiplier = 1;
    if (isPair) { type = 1; typeName = '對子'; multiplier = 1; }
    if (isStraight) { type = 2; typeName = '順子'; multiplier = 2; }
    if (isFlush) { type = 3; typeName = '金花'; multiplier = 3; }
    if (isStraight && isFlush) { type = 4; typeName = '同花順'; multiplier = 4; }
    if (isThree) { type = 5; typeName = '豹子'; multiplier = 5; }

    let score = 0;
    if (type === 1) {
        score = type * 1000000 + pairRank * 10000 + kickerRank * 100;
    } else {
        score = type * 1000000 + v1 * 10000 + v2 * 100 + v3;
    }

    return { type, typeName, multiplier, score, sortedHand: hand };
}

function compareHands(a, b) {
    if (a.score !== b.score) return a.score - b.score;
    for (let i = 0; i < 3; i++) {
        if (a.sortedHand[i].rank !== b.sortedHand[i].rank) return a.sortedHand[i].rank - b.sortedHand[i].rank;
    }
    return b.sortedHand[0].suitRank - a.sortedHand[0].suitRank;
}

function formatHandStr(handInfo) {
    const cardsStr = handInfo.sortedHand.map(c => c.suit + c.value).join('');
    return `[${handInfo.typeName}] ${cardsStr}`;
}



async function openTable(replyToken, ctx) {
    const { groupId, userId } = ctx;
    
    if (await atonementHandler.checkDevilContract(userId)) {
        await lineUtils.replyText(replyToken, '❌ 惡魔契約期間，您無法擔任莊家！');
        return;
    }

    if (activeTables.has(groupId)) {
        await lineUtils.replyText(replyToken, '❌ 目前群組已經有一桌正在進行中，請等這局結束！');
        return;
    }

    const newWanted = await economyHandler.addWantedLevel(userId);
    const participantWantedLevels = new Map();
    participantWantedLevels.set(userId, newWanted);

    const dealerName = await lineUtils.getGroupMemberName(groupId, userId) || '莊家';
    
    const tableState = {
        groupId,
        status: 'waiting',
        dealerId: userId,
        dealerName,
        players: new Map(),
        deck: createDeck(),
        dealerHand: [],
        dealerResult: null,
        participantWantedLevels,
        timer: null
    };

    activeTables.set(groupId, tableState);

    tableState.timer = setTimeout(async () => {
        if (activeTables.has(groupId)) {
            const t = activeTables.get(groupId);
            if (t.status === 'waiting') {
                if (t.players.size > 0) {
                    for (const [uid, p] of t.players.entries()) {
                        await economyHandler.addCoinQuietly(groupId, uid, p.bet);
                    }
                }
                activeTables.delete(groupId);
                lineUtils.addPendingMessage(groupId, [{ type: 'text', text: '⏳ 炸金花牌桌因逾時未發牌，已自動取消，閒家押注已全數退還。' }]);
            }
        }
    }, 60000);

    await sendTableFlex(replyToken, tableState, '炸金花開桌！', [{ type: 'text', text: `🎲 ${dealerName} 開啟了炸金花賭桌！\n請輸入「下注 [金額]」來跟莊家拚運氣！` }]);
}

async function placeBet(replyToken, ctx, betAmount) {
    const { groupId, userId } = ctx;
    const table = activeTables.get(groupId);

    if (!table || table.status !== 'waiting') {
        await lineUtils.replyText(replyToken, '❌ 目前沒有等待中的炸金花牌桌。');
        return;
    }

    if (table.dealerId === userId) {
        await lineUtils.replyText(replyToken, '❌ 莊家不能自己下注啦！');
        return;
    }

    const betAmt = parseInt(betAmount, 10);
    if (isNaN(betAmt) || betAmt <= 0) {
        await lineUtils.replyText(replyToken, '❌ 炸金花下注金額無效（請輸入大於 0 的正整數金額，例如：下注 1000000）。');
        return;
    }

    const consumeResult = await economyHandler.consumeCoin(groupId, userId, betAmt, true);
    if (!consumeResult.success) {
        await lineUtils.replyText(replyToken, `❌ 下注失敗：${consumeResult.message}`);
        return;
    }

    const newWanted = await economyHandler.addWantedLevel(userId);
    table.participantWantedLevels.set(userId, newWanted);

    const playerName = consumeResult.name || '玩家';
    
    if (table.players.has(userId)) {
        const p = table.players.get(userId);
        p.bet += betAmt;
    } else {
        table.players.set(userId, { name: playerName, bet: betAmt, hand: [], result: null });
    }

    if (table.timer) {
        clearTimeout(table.timer);
        table.timer = setTimeout(async () => {
            if (activeTables.has(groupId)) {
                const t = activeTables.get(groupId);
                if (t.status === 'waiting') {
                    for (const [uid, p] of t.players.entries()) {
                        await economyHandler.addCoinQuietly(groupId, uid, p.bet);
                    }
                    activeTables.delete(groupId);
                    lineUtils.addPendingMessage(groupId, [{ type: 'text', text: '⏳ 炸金花牌桌因逾時未發牌，已自動取消，閒家押注已全數退還。' }]);
                }
            }
        }, 60000);
    }

    await sendTableFlex(replyToken, table, '炸金花下注更新');
}

async function dealCards(replyToken, ctx) {
    const { groupId, userId } = ctx;
    const table = activeTables.get(groupId);

    if (!table || table.status !== 'waiting') {
        await lineUtils.replyText(replyToken, '❌ 目前沒有等待中的炸金花牌桌。');
        return;
    }

    if (table.dealerId !== userId) {
        await lineUtils.replyText(replyToken, '❌ 只有莊家可以發牌！');
        return;
    }

    if (table.players.size === 0) {
        await lineUtils.replyText(replyToken, '❌ 還沒有人下注，無法發牌！');
        return;
    }

    if (table.timer) clearTimeout(table.timer);
    table.status = 'closed';

    for (let i = 0; i < 3; i++) table.dealerHand.push(table.deck.pop());
    table.dealerResult = evaluateHand(table.dealerHand);

    for (const p of table.players.values()) {
        for (let i = 0; i < 3; i++) p.hand.push(table.deck.pop());
        p.result = evaluateHand(p.hand);
    }

    await finishGameAndSettle(replyToken, table, '🌸 發牌完畢！立刻結算！');
}

async function finishGameAndSettle(replyToken, table, titleMsg) {
    const { groupId, dealerId, dealerResult } = table;
    let dealerNetProfit = 0;
    const extraPenalties = [];

    for (const [uid, p] of Array.from(table.players.entries())) {
        const playerResult = p.result;
        let playerPayout = 0;
        let playerNet = 0;

        const cmp = compareHands(playerResult, dealerResult);

        if (cmp > 0) {
            const winAmount = p.bet * p.result.multiplier;
            playerPayout = p.bet + winAmount; 
            playerNet = winAmount;
            p.resultStr = '🎉 贏 (+' + winAmount.toLocaleString() + ')';
            p.color = flexUtils.COLORS.WIN; 
        } else if (cmp < 0) {
            const loseAmount = p.bet * dealerResult.multiplier;
            const extraPenalty = loseAmount - p.bet;
            if (extraPenalty > 0) extraPenalties.push(economyHandler.consumeCoin(groupId, uid, extraPenalty, true));
            playerPayout = 0;
            playerNet = -loseAmount;
            p.resultStr = '💸 輸 (' + playerNet.toLocaleString() + ')';
            p.color = '#D32F2F';
        } else {
            playerPayout = p.bet;
            playerNet = 0;
            p.resultStr = '🤝 平手';
            p.color = '#FF9800';
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
        p.payout = playerPayout;
    }

    if (extraPenalties.length > 0) await Promise.all(extraPenalties);

    let taxAmount = 0;
    if (dealerNetProfit > 0 && !authUtils.isSuperAdmin(dealerId)) {
        taxAmount = Math.floor(dealerNetProfit * 0.05);
        dealerNetProfit -= taxAmount;
    }

    table.dealerNetProfit = dealerNetProfit;
    table.taxAmount = taxAmount;

    const payoutPromises = [];
    for (const [uid, p] of table.players.entries()) {
        if (p.payout > 0) payoutPromises.push(economyHandler.addCoinQuietly(groupId, uid, p.payout));
    }

    if (dealerNetProfit !== 0 || taxAmount > 0) {
        const totalDealerIncome = dealerNetProfit + taxAmount; 
        payoutPromises.push(
            economyHandler.addCoinQuietly(groupId, dealerId, totalDealerIncome).then(bal => {
                table.dealerFinalBalance = bal;
                if (taxAmount > 0) return economyHandler.consumeCoin(groupId, dealerId, taxAmount, true);
            })
        );
    }
    
    await Promise.all(payoutPromises);
    activeTables.delete(groupId);

    const allParticipants = [dealerId, ...Array.from(table.players.keys())];
    const bustMsg = await economyHandler.triggerPublicGamblingEvent(groupId, allParticipants, null, true, dealerId);

    const extraMessages = [{ type: 'text', text: titleMsg }];
    if (bustMsg) extraMessages.push(bustMsg);

    await sendTableFlex(replyToken, table, '炸金花結算', extraMessages);
}

async function sendTableFlex(replyToken, table, altText, extraMessages = []) {
    const contents = [
        flexUtils.createText({ text: '🌸 哭霸娛樂城 - 多人炸金花', size: 'lg', weight: 'bold', color: '#FF4500', align: 'center', margin: 'md', adjustMode: 'shrink-to-fit' })
    ];

    let totalWanted = 0;
    if (table.participantWantedLevels) {
        totalWanted = Array.from(table.participantWantedLevels.values()).reduce((a, b) => a + b, 0);
    }
    contents.push(flexUtils.createText({ text: `🚨 賭桌總通緝機率: ${(totalWanted * 100).toFixed(1)}%`, size: 'xs', color: '#FF5252', align: 'center', margin: 'xs', weight: 'bold' }));
    contents.push(flexUtils.createSeparator('md'));

    let dealerScoreStr = '等待發牌...';
    if (table.status === 'closed') {
        const dRes = table.dealerResult;
        dealerScoreStr = `${formatHandStr(dRes)} (賠率 ${dRes.multiplier}x)`;
    }

    contents.push(
        flexUtils.createText({ text: `莊家：${table.dealerName}`, size: 'lg', color: '#FFFFFF', weight: 'bold', margin: 'md', align: 'center' })
    );

    if (table.status === 'closed') {
        const netColor = table.dealerNetProfit >= 0 ? flexUtils.COLORS.WIN : '#D32F2F';
        contents.push(
            flexUtils.createText({ text: dealerScoreStr, size: 'sm', color: '#AAAAAA', margin: 'xs', align: 'center' }),
            flexUtils.createText({ text: `結算: ${table.dealerNetProfit > 0 ? '+' : ''}${table.dealerNetProfit.toLocaleString()}`, size: 'md', weight: 'bold', color: netColor, margin: 'xs', wrap: true, align: 'center' })
        );
        if (table.dealerFinalBalance !== undefined) {
            contents.push(flexUtils.createText({ text: `餘額: ${table.dealerFinalBalance.toLocaleString()}`, size: 'xs', color: netColor, margin: 'xs', align: 'center' }));
        }
        if (table.taxAmount > 0) {
            contents.push(flexUtils.createText({ text: `(抽水 5%: -${table.taxAmount.toLocaleString()})`, size: 'xs', color: '#AAAAAA', margin: 'xs', align: 'center' }));
        }
    } else {
        contents.push(flexUtils.createText({ text: '發牌後揭曉底牌', size: 'sm', color: '#AAAAAA', align: 'center' }));
    }

    contents.push(flexUtils.createSeparator('lg'));

    if (table.players.size > 0) {
        for (const p of table.players.values()) {
            contents.push(flexUtils.createBox('horizontal', [
                flexUtils.createText({ text: `👤 ${p.name}`, wrap: true, size: 'sm', weight: 'bold', color: '#E0E0E0', flex: 2 }),
                flexUtils.createText({ text: `押 ${p.bet.toLocaleString()}`, size: 'xs', color: '#FF9800', flex: 1, align: 'end', adjustMode: 'shrink-to-fit' })
            ], { margin: 'md', alignItems: 'center' }));

            if (table.status === 'closed') {
                const pRes = p.result;
                const pScoreStr = `${formatHandStr(pRes)} (賠率 ${pRes.multiplier}x)`;
                contents.push(flexUtils.createText({ text: pScoreStr, size: 'xs', color: '#AAAAAA', margin: 'xs' }));
                contents.push(flexUtils.createText({ text: p.resultStr, size: 'sm', weight: 'bold', color: p.color, margin: 'xs' }));
                
                if (p.curseStr) {
                    contents.push(flexUtils.createText({ text: p.curseStr, size: 'xs', color: '#D32F2F', margin: 'xs' }));
                }
                contents.push(flexUtils.createSeparator('sm'));
            }
        }
    } else {
        contents.push(flexUtils.createText({ text: '尚無人下注', size: 'sm', color: '#666666', margin: 'xl', align: 'center' }));
    }

    if (table.status === 'waiting') {
        contents.push(flexUtils.createText({ text: '莊家隨時可輸入「發牌」或「+」進行結算', size: 'xs', color: '#444444', margin: 'xl', align: 'center' }));
        contents.push(flexUtils.createText({ text: '💡 捷徑：下注輸入「+金額」或「歐印」、發牌輸入「+」', size: 'xs', color: '#AAAAAA', align: 'center', margin: 'sm' }));
    }

    const bubble = flexUtils.createBubble({
        size: 'kilo',
        body: flexUtils.createBox('vertical', contents, { backgroundColor: '#1A1A1A', paddingAll: 'xl' })
    });

    const messages = [{ type: 'flex', altText: altText, contents: bubble }, ...extraMessages];

    if (messages.length <= 5) {
        await lineUtils.replyToLine(replyToken, messages).catch(console.error);
    } else {
        await lineUtils.replyToLine(replyToken, messages.slice(0, 5)).catch(console.error);
        lineUtils.addPendingMessage(table.groupId, messages.slice(5));
    }
}

async function closeTable(replyToken, ctx) {
    const { groupId, userId } = ctx;
    const table = activeTables.get(groupId);

    if (!table) {
        await lineUtils.replyText(replyToken, '❌ 目前沒有進行中的炸金花牌桌。');
        return;
    }

    if (table.dealerId !== userId && !authUtils.isSuperAdmin(userId)) {
        await lineUtils.replyText(replyToken, '❌ 只有莊家或管理員可以解散牌桌！');
        return;
    }

    if (table.status === 'waiting' && table.players.size > 0) {
        for (const [uid, p] of table.players.entries()) {
            await economyHandler.addCoinQuietly(groupId, uid, p.bet);
        }
    }

    if (table.timer) clearTimeout(table.timer);
    activeTables.delete(groupId);

    await lineUtils.replyText(replyToken, '✅ 炸金花牌桌已解散，閒家押注已全數退還。');
}

function getActiveTable(groupId) { return activeTables.get(groupId); }

module.exports = {
    openTable,
    placeBet,
    dealCards,
    closeTable,
    getActiveTable
};
