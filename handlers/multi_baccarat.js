/**
 * 多人百家樂 (Baccarat) 功能模組
 */
const flexUtils = require('../utils/flex');
const lineUtils = require('../utils/line');
const economyHandler = require('./economy');
const persistenceService = require('../services/multiplayerPersistenceService');
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

const SUITS = ['♠️', '♥️', '♣️', '♦️'];
const VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function getCardValue(valStr) {
    if (['10', 'J', 'Q', 'K'].includes(valStr)) return 0;
    if (valStr === 'A') return 1;
    return parseInt(valStr, 10);
}

function getHandValue(cards) {
    let sum = cards.reduce((acc, c) => acc + c.value, 0);
    return sum % 10;
}

function createDeck() {
    const deck = [];
    for (let d = 0; d < 8; d++) { // 8副牌
        for (const suit of SUITS) {
            for (const valStr of VALUES) {
                deck.push({ suit, valStr, value: getCardValue(valStr) });
            }
        }
    }
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function formatCards(cards) {
    return cards.map(c => `${c.suit}${c.valStr}`).join(' ');
}



async function openTable(replyToken, ctx) {
    const { groupId, userId } = ctx;
    
    if (!authUtils.isSuperAdmin(userId)) {
        await lineUtils.replyText(replyToken, '❌ 權限不足：百家樂僅允許賭場老闆（神明）親自開局！');
        return;
    }

    if (activeTables.has(groupId)) {
        await lineUtils.replyText(replyToken, '❌ 目前群組已經有一桌百家樂正在進行中！');
        return;
    }

    activeTables.set(groupId, 'pending');

    const tableState = {
        groupId,
        status: 'waiting',
        dealerId: userId,
        players: new Map(), // { userId: { name, bets: { '莊': 0, '閒': 0, '和': 0 }, totalBet: 0, payouts: 0, netProfit: 0, curseStr: '' } }
        deck: createDeck(),
        playerHand: [],
        bankerHand: [],
        playerScore: 0,
        bankerScore: 0,
        participantWantedLevels: new Map(),
        resultType: null, // '莊', '閒', '和'
        timer: null
    };

    activeTables.set(groupId, tableState);

    tableState.timer = setTimeout(async () => {
        if (activeTables.has(groupId)) {
            const t = activeTables.get(groupId);
            if (t.status === 'waiting') {
                if (t.players.size > 0) {
                    for (const [uid, p] of t.players.entries()) {
                        await economyHandler.addCoinQuietly(groupId, uid, p.totalBet);
                    }
                }
                activeTables.delete(groupId);
                lineUtils.addPendingMessage(groupId, [{ type: 'text', text: '⏳ 百家樂牌桌因逾時未發牌，已自動取消，所有閒家注碼已全數退還。' }]);
            }
        }
    }, 60000);

    await sendTableFlex(replyToken, tableState, '百家樂開桌！', [{ type: 'text', text: `🎰 賭場老闆親自開局了！\n請輸入「押莊 [金額]」、「押閒 [金額]」或「押和 [金額]」來下注！` }]);
}

async function placeBet(replyToken, ctx, betType, betAmount) {
    const { groupId, userId } = ctx;
    const table = activeTables.get(groupId);

    if (!table || table.status !== 'waiting') {
        await lineUtils.replyText(replyToken, '❌ 目前沒有等待中的百家樂牌桌。');
        return;
    }

    if (table.dealerId === userId) {
        await lineUtils.replyText(replyToken, '❌ 老闆，這桌是你開的，你不能當閒家下注啦！');
        return;
    }

    const betAmt = parseInt(betAmount, 10);
    if (isNaN(betAmt) || betAmt <= 0) {
        await lineUtils.replyText(replyToken, '❌ 百家樂下注金額無效（請輸入大於 0 的正整數金額，例如：押莊 1000000）。');
        return;
    }

    const consumeResult = await economyHandler.consumeCoin(groupId, userId, betAmt, true);
    if (!consumeResult.success) {
        await lineUtils.replyText(replyToken, `❌ 下注失敗：${consumeResult.message}`);
        return;
    }

    persistenceService.recordBet(groupId, '百家樂', userId, betAmt, userName).catch(e => console.error(e));

    const newWanted = await economyHandler.addWantedLevel(userId);
    table.participantWantedLevels.set(userId, newWanted);

    const playerName = consumeResult.name || '玩家';
    
    if (!table.players.has(userId)) {
        table.players.set(userId, { name: playerName, bets: { '莊': 0, '閒': 0, '和': 0 }, totalBet: 0, payout: 0, resultStr: '', netProfit: 0, curseStr: '' });
    }
    
    const p = table.players.get(userId);
    p.bets[betType] += betAmt;
    p.totalBet += betAmt;

    if (table.timer) {
        clearTimeout(table.timer);
        table.timer = setTimeout(async () => {
            if (activeTables.has(groupId)) {
                const t = activeTables.get(groupId);
                if (t.status === 'waiting') {
                    for (const [uid, pl] of t.players.entries()) {
                        await economyHandler.addCoinQuietly(groupId, uid, pl.totalBet);
                    }
                    activeTables.delete(groupId);
                    lineUtils.addPendingMessage(groupId, [{ type: 'text', text: '⏳ 百家樂牌桌因逾時未發牌，已自動取消，閒家押注已全數退還。' }]);
                }
            }
        }, 60000);
    }

    await sendTableFlex(replyToken, table, `百家樂下注更新：${playerName} 押了 ${betType}`);
}

async function dealCards(replyToken, ctx) {
    const { groupId, userId } = ctx;
    const table = activeTables.get(groupId);

    if (!table || table.status !== 'waiting') {
        await lineUtils.replyText(replyToken, '❌ 目前沒有等待中的百家樂牌桌。');
        return;
    }

    if (table.dealerId !== userId) {
        // await lineUtils.replyText(replyToken, '❌ 只有開局的賭場老闆可以決定收注開牌！');
        return;
    }

    if (table.players.size === 0) {
        await lineUtils.replyText(replyToken, '❌ 還沒有任何人下注！');
        return;
    }

    if (table.timer) clearTimeout(table.timer);
    table.status = 'closed';

    // 初始發牌 (交替發牌)
    table.playerHand.push(table.deck.pop());
    table.bankerHand.push(table.deck.pop());
    table.playerHand.push(table.deck.pop());
    table.bankerHand.push(table.deck.pop());

    let pScore = getHandValue(table.playerHand);
    let bScore = getHandValue(table.bankerHand);

    // 百家樂補牌規則 (Tableau)
    // 1. Natural: If either has 8 or 9, both stand.
    if (pScore < 8 && bScore < 8) {
        let playerDrew = false;
        let player3rdCardValue = -1;

        // Player's turn
        if (pScore <= 5) {
            const p3 = table.deck.pop();
            table.playerHand.push(p3);
            playerDrew = true;
            player3rdCardValue = p3.value;
            pScore = getHandValue(table.playerHand);
        }

        // Banker's turn
        let bankerDraws = false;
        if (!playerDrew) {
            if (bScore <= 5) bankerDraws = true;
        } else {
            if (bScore <= 2) bankerDraws = true;
            else if (bScore === 3 && player3rdCardValue !== 8) bankerDraws = true;
            else if (bScore === 4 && player3rdCardValue >= 2 && player3rdCardValue <= 7) bankerDraws = true;
            else if (bScore === 5 && player3rdCardValue >= 4 && player3rdCardValue <= 7) bankerDraws = true;
            else if (bScore === 6 && player3rdCardValue >= 6 && player3rdCardValue <= 7) bankerDraws = true;
        }

        if (bankerDraws) {
            table.bankerHand.push(table.deck.pop());
            bScore = getHandValue(table.bankerHand);
        }
    }

    table.playerScore = pScore;
    table.bankerScore = bScore;

    if (pScore > bScore) table.resultType = '閒';
    else if (bScore > pScore) table.resultType = '莊';
    else table.resultType = '和';

    await finishGameAndSettle(replyToken, table, `🎰 買定離手！開牌結果是「${table.resultType}贏」！`);
}

async function finishGameAndSettle(replyToken, table, titleMsg) {
    const { groupId, dealerId, resultType } = table;
    
    let dealerNetProfit = 0; // 老闆（莊家）的淨盈虧

    for (const [uid, p] of Array.from(table.players.entries())) {
        let playerWinTotal = 0; // 贏得的獎金總額（不含本金，用來抽水）
        let playerPayout = 0;   // 最終應該發給玩家的金額 (本金+獎金)

        // 計算莊注
        if (p.bets['莊'] > 0) {
            if (resultType === '莊') {
                const winAmt = Math.floor(p.bets['莊'] * 0.95);
                playerWinTotal += winAmt;
                playerPayout += (p.bets['莊'] + winAmt);
                dealerNetProfit -= winAmt;
            } else if (resultType === '和') {
                playerPayout += p.bets['莊'];
            } else {
                dealerNetProfit += p.bets['莊'];
            }
        }
        
        // 計算閒注
        if (p.bets['閒'] > 0) {
            if (resultType === '閒') {
                const winAmt = p.bets['閒'];
                playerWinTotal += winAmt;
                playerPayout += (p.bets['閒'] + winAmt);
                dealerNetProfit -= winAmt;
            } else if (resultType === '和') {
                playerPayout += p.bets['閒'];
            } else {
                dealerNetProfit += p.bets['閒'];
            }
        }

        // 計算和注
        if (p.bets['和'] > 0) {
            if (resultType === '和') {
                const winAmt = p.bets['和'] * 8;
                playerWinTotal += winAmt;
                playerPayout += (p.bets['和'] + winAmt);
                dealerNetProfit -= winAmt;
            } else {
                dealerNetProfit += p.bets['和'];
            }
        }

        p.netProfit = playerPayout - p.totalBet; // 用於顯示

        if (playerWinTotal > 0) {
            const taxResult = await atonementHandler.processDevilTax(playerWinTotal, uid);
            if (taxResult.hasContract && taxResult.taxAmount > 0) {
                playerPayout -= taxResult.taxAmount;
                p.netProfit -= taxResult.taxAmount;
                p.curseStr = `詛咒: -${taxResult.taxAmount.toLocaleString()}`;
            }
        }

        p.payout = playerPayout;
        
        if (p.netProfit > 0) p.resultStr = `🎉 贏 (+${p.netProfit.toLocaleString()})`;
        else if (p.netProfit < 0) p.resultStr = `💸 輸 (${p.netProfit.toLocaleString()})`;
        else p.resultStr = `🤝 打平`;
    }

    const payoutPromises = [];
    for (const [uid, p] of table.players.entries()) {
        if (p.payout > 0) payoutPromises.push(economyHandler.addCoinQuietly(groupId, uid, p.payout));
    }

    // 老闆的收支
    if (dealerNetProfit !== 0) {
        payoutPromises.push(
            economyHandler.addCoinQuietly(groupId, dealerId, dealerNetProfit).then(bal => {
                table.dealerFinalBalance = bal;
                table.dealerNetProfit = dealerNetProfit;
            })
        );
    }
    
    await Promise.all(payoutPromises);
    activeTables.delete(groupId);

    const allParticipants = [dealerId, ...Array.from(table.players.keys())];
    const bustMsg = await economyHandler.triggerPublicGamblingEvent(groupId, allParticipants, null, true, table.dealerId);

    const extraMessages = [{ type: 'text', text: titleMsg }];
    if (bustMsg) extraMessages.push(bustMsg);

    await sendTableFlex(replyToken, table, '百家樂結算', extraMessages);
}

async function sendTableFlex(replyToken, table, altText, extraMessages = []) {
    const contents = [
        flexUtils.createText({ text: '🎰 哭霸娛樂城 - 尊爵百家樂', size: 'lg', weight: 'bold', color: flexUtils.COLORS.PRIMARY, align: 'center', margin: 'md', adjustMode: 'shrink-to-fit' })
    ];

    let totalWanted = 0;
    if (table.participantWantedLevels) {
        totalWanted = Array.from(table.participantWantedLevels.values()).reduce((a, b) => a + b, 0);
    }
    contents.push(flexUtils.createText({ text: `🚨 賭桌總通緝機率: ${(totalWanted * 100).toFixed(1)}%`, size: 'xs', color: '#FF5252', align: 'center', margin: 'xs', weight: 'bold' }));
    contents.push(flexUtils.createSeparator('md'));

    let resultMsg = '等待老闆開牌...';
    if (table.status === 'closed') {
        resultMsg = `結果: 【${table.resultType}贏】`;
    }

    contents.push(
        flexUtils.createText({ text: `莊家：${table.resultType === '莊' ? '👑 ' : ''}${table.bankerScore} 點`, size: 'lg', color: '#FF4500', weight: 'bold', margin: 'md' }),
        flexUtils.createText({ text: formatCards(table.bankerHand) || '?', size: 'sm', color: flexUtils.COLORS.TEXT_SUB }),
        flexUtils.createText({ text: `閒家：${table.resultType === '閒' ? '👑 ' : ''}${table.playerScore} 點`, size: 'lg', color: '#1E90FF', weight: 'bold', margin: 'md' }),
        flexUtils.createText({ text: formatCards(table.playerHand) || '?', size: 'sm', color: flexUtils.COLORS.TEXT_SUB }),
        flexUtils.createSeparator('md'),
        flexUtils.createText({ text: resultMsg, size: 'xl', weight: 'bold', color: flexUtils.COLORS.PRIMARY, align: 'center', margin: 'lg' })
    );

    if (table.status === 'closed' && table.dealerNetProfit !== undefined) {
        const netColor = table.dealerNetProfit >= 0 ? flexUtils.COLORS.WIN : '#D32F2F';
        contents.push(flexUtils.createText({ text: `結算: ${table.dealerNetProfit > 0 ? '+' : ''}${table.dealerNetProfit.toLocaleString()}`, size: 'md', weight: 'bold', color: netColor, align: 'center', margin: 'xs', wrap: true }));
        contents.push(flexUtils.createText({ text: `目前餘額: ${table.dealerFinalBalance.toLocaleString()}`, size: 'xs', color: flexUtils.COLORS.TEXT_MUTED, align: 'center', margin: 'xs' }));
    }

    contents.push(flexUtils.createSeparator('lg'));

    if (table.players.size > 0) {
        for (const p of table.players.values()) {
            let betStrs = [];
            if (p.bets['莊'] > 0) betStrs.push(`莊:${p.bets['莊']}`);
            if (p.bets['閒'] > 0) betStrs.push(`閒:${p.bets['閒']}`);
            if (p.bets['和'] > 0) betStrs.push(`和:${p.bets['和']}`);

            contents.push(flexUtils.createBox('horizontal', [
                flexUtils.createText({ text: `👤 ${p.name}`, wrap: true, size: 'sm', weight: 'bold', color: flexUtils.COLORS.TEXT_MAIN, flex: 2 }),
                flexUtils.createText({ text: `押 ${betStrs.join(', ')}`, size: 'xs', color: flexUtils.COLORS.SECONDARY, flex: 2, align: 'end', adjustMode: 'shrink-to-fit' })
            ], { margin: 'md', alignItems: 'center' }));

            if (table.status === 'closed') {
                const color = p.netProfit > 0 ? flexUtils.COLORS.WIN : (p.netProfit < 0 ? '#D32F2F' : flexUtils.COLORS.SECONDARY);
                contents.push(flexUtils.createText({ text: p.resultStr, size: 'sm', weight: 'bold', color: color, margin: 'xs' }));
                
                if (p.curseStr) {
                    contents.push(flexUtils.createText({ text: p.curseStr, size: 'xs', color: '#D32F2F', margin: 'xs' }));
                }
                contents.push(flexUtils.createSeparator('sm'));
            }
        }
    } else {
        contents.push(flexUtils.createText({ text: '尚無人下注', size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, margin: 'xl', align: 'center' }));
    }

    if (table.status === 'waiting') {
        contents.push(flexUtils.createText({ text: '老闆隨時可輸入「開牌」或「+」進行結算', size: 'xs', color: '#444444', margin: 'xl', align: 'center' }));
    }

    const bubble = flexUtils.createBubble({
        size: 'kilo',
        body: flexUtils.createBox('vertical', contents, { backgroundColor: flexUtils.COLORS.BG_CARD, paddingAll: 'xl' })
    });

    const messages = [{ type: 'flex', altText: altText, contents: bubble }, ...extraMessages];

    
    const quickReply = require('../utils/multi_quickReply').getQuickReply(table, '百家樂');
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

async function closeTable(replyToken, ctx) {
    const { groupId, userId } = ctx;
    const table = activeTables.get(groupId);

    if (!table) {
        await lineUtils.replyText(replyToken, '❌ 目前沒有進行中的百家樂牌桌。');
        return;
    }

    if (table.dealerId !== userId && !authUtils.isSuperAdmin(userId)) {
        // await lineUtils.replyText(replyToken, '❌ 只有老闆可以收掉百家樂牌桌！');
        return;
    }

    if (table.status === 'waiting' && table.players.size > 0) {
        for (const [uid, p] of table.players.entries()) {
            await economyHandler.addCoinQuietly(groupId, uid, p.totalBet);
        }
    }

    if (table.timer) clearTimeout(table.timer);
    activeTables.delete(groupId);

    await lineUtils.replyText(replyToken, '✅ 百家樂牌桌已收起，閒家押注已全數退還。');
}

function getActiveTable(groupId) { return activeTables.get(groupId); }

module.exports = {
    openTable,
    placeBet,
    dealCards,
    closeTable,
    getActiveTable
};
