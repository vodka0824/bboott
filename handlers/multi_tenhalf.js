/**
 * 多人十點半 (Ten and a Half) 功能模組
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

// === 撲克牌邏輯 ===
const SUITS = ['♠️', '♥️', '♦️', '♣️'];
const VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function createDeck() {
    const deck = [];
    // 使用 4 副牌避免太容易算牌且防止發光
    for (let i = 0; i < 4; i++) {
        for (const suit of SUITS) {
            for (const value of VALUES) {
                deck.push({ suit, value });
            }
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

function calculateScore(hand) {
    let score = 0;
    for (const card of hand) {
        if (card.value === 'A') {
            score += 1;
        } else if (['J', 'Q', 'K'].includes(card.value)) {
            score += 0.5;
        } else {
            score += parseInt(card.value, 10);
        }
    }
    return score;
}

function renderHand(hand, hideFirstCard = false) {
    if (hand.length === 0) return '無';
    if (hideFirstCard) {
        if (hand.length === 1) return '🎴';
        const rest = hand.slice(1).map(c => `${c.suit}${c.value}`).join(' ');
        return `🎴 ${rest}`;
    }
    return hand.map(c => `${c.suit}${c.value}`).join(' ');
}

// 取得目前的牌桌
function getActiveTable(groupId) {
    return activeTables.get(groupId);
}

// === 操作邏輯 ===

// 1. 開桌十點半
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
        await lineUtils.replyText(replyToken, '❌ 目前群組內已經有一桌十點半正在進行中！');
        return;
    }

    activeTables.set(groupId, 'pending');

    const userDoc = await db.collection('economy_users').doc(userId).get();
    const balance = userDoc.exists ? (userDoc.data().kuCoin || 0) : 0;

    if (balance < 0) {
        activeTables.delete(groupId);
        await lineUtils.replyText(replyToken, '❌ 窮鬼欠債還想當莊家？先去賺錢還債吧！');
        return;
    }

    const userName = await lineUtils.getGroupMemberName(groupId, userId);
    await economyHandler.addWantedLevel(userId);

    const table = {
        groupId,
        dealerId: userId,
        dealerName: userName,
        dealerHand: [],
        dealerScore: 0,
        status: 'waiting', // waiting, playing, closed
        deck: createDeck(),
        players: new Map(), // key: userId, value: { name, bet, hand, status: 'playing'|'stand'|'bust'|'pass'|'five-dragon', score, isDragon }
        participantWantedLevels: new Map(),
        timeout: setTimeout(() => autoCloseTable(groupId), 1 * 60 * 1000)
    };

    activeTables.set(groupId, table);
    await sendTableFlex(replyToken, table, '🎲 十點半牌桌已建立！大家快來下注！(1分鐘內請發牌)');
}

async function autoCloseTable(groupId) {
    const table = activeTables.get(groupId);
    if (!table || table === 'pending') return;
    if (table.status !== 'waiting') return;

    activeTables.delete(groupId);

    const refundedPlayers = [];
    const refundPromises = [];
    for (const [uid, p] of table.players.entries()) {
        refundPromises.push(economyHandler.addCoinFast(uid, p.bet));
        refundedPlayers.push({ name: p.name, bet: p.bet });
    }
    await Promise.all(refundPromises);

    let msg = `⏰ 【牌桌自動取消】\n${table.dealerName} 開的牌桌超過 1 分鐘未發牌，自動解散。`;
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

    if (!table || table === 'pending') {
        await lineUtils.replyText(replyToken, '❌ 目前沒有進行中的牌桌。');
        return;
    }
    if (table.dealerId !== userId) {
        // await lineUtils.replyText(replyToken, '❌ 只有莊家可以解散牌桌！');
        return;
    }
    if (table.status !== 'waiting') {
        await lineUtils.replyText(replyToken, '❌ 遊戲已經開始，無法解散！請跑完流程。');
        return;
    }

    clearTimeout(table.timeout);
    activeTables.delete(groupId);

    const refundPromises = [];
    for (const [uid, p] of table.players.entries()) {
        refundPromises.push(economyHandler.addCoinFast(uid, p.bet));
    }
    await Promise.all(refundPromises);

    await lineUtils.replyText(replyToken, '✅ 莊家已解散牌桌，所有下注已退還。');
}

// 3. 下注
async function placeBet(replyToken, context, amountStr) {
    const { groupId, userId } = context;
    const table = activeTables.get(groupId);

    if (!table || table === 'pending') return;
    if (table.status !== 'waiting') {
        await lineUtils.replyText(replyToken, '❌ 發牌階段已結束，無法再下注！');
        return;
    }
    if (table.dealerId === userId) {
        await lineUtils.replyText(replyToken, '❌ 莊家不能下注！');
        return;
    }
    const { parseBetAmountExtended } = require('../utils/betParser');
    const parsedBet = await parseBetAmountExtended(amountStr, userId);

    if (parsedBet.amount <= 0) {
        await lineUtils.replyText(replyToken, '❌ 十點半下注金額無效（請輸入大於 0 的正整數金額）。');
        return;
    }

    const isExistingPlayer = table.players.has(userId);
    let finalDelta = parsedBet.amount * parsedBet.relativeSign;
    let newTotalBet = finalDelta;

    if (isExistingPlayer) {
        const p = table.players.get(userId);
        if (!parsedBet.isRelative) {
            await lineUtils.replyText(replyToken, '❌ 您已經下注過了！若要修改請輸入「+金額」或「-金額」。');
            return;
        }
        newTotalBet = p.bet + finalDelta;
        if (newTotalBet <= 0) {
            await lineUtils.replyText(replyToken, '❌ 下注總額不能小於等於 0！');
            return;
        }
    } else {
        if (parsedBet.isRelative && parsedBet.relativeSign < 0) {
            await lineUtils.replyText(replyToken, '❌ 您還沒下注，無法減注！');
            return;
        }
    }

    let consumeResult;
    if (finalDelta > 0) {
        consumeResult = await economyHandler.consumeCoin(groupId, userId, finalDelta, true);
        if (!consumeResult.success) {
            await lineUtils.replyText(replyToken, `❌ 下注失敗：${consumeResult.message}`);
            return;
        }
    } else {
        await economyHandler.addCoinFast(userId, Math.abs(finalDelta));
        consumeResult = { success: true, name: await lineUtils.getGroupMemberName(groupId, userId) };
    }

    const userName = consumeResult.name || '玩家';
    if (finalDelta > 0) {
        persistenceService.recordBet(groupId, '十點半', userId, finalDelta, userName).catch(e => console.error(e));
    }


    const newWanted = await economyHandler.addWantedLevel(userId);
    table.participantWantedLevels.set(userId, newWanted);

    if (!isExistingPlayer) {
        table.players.set(userId, {
            name: userName,
            bet: newTotalBet,
            hand: [],
            score: 0,
            status: 'playing',
            resultStr: ''
        });
    } else {
        table.players.get(userId).bet = newTotalBet;
    }

    clearTimeout(table.timeout);
    table.timeout = setTimeout(() => autoCloseTable(groupId), 3 * 60 * 1000);

    const actionText = finalDelta > 0 ? (isExistingPlayer ? `加碼了 ${finalDelta.toLocaleString()}` : `下注了 ${finalDelta.toLocaleString()}`) : `減少了 ${Math.abs(finalDelta).toLocaleString()}`;
    await sendTableFlex(replyToken, table, `${userName} ${actionText} 哭幣！目前總注：${newTotalBet.toLocaleString()}`);
}

// 4. 發牌
async function dealCards(replyToken, context) {
    const { groupId, userId } = context;
    const table = activeTables.get(groupId);

    if (!table || table === 'pending' || table.status !== 'waiting') return;
    if (table.dealerId !== userId) {
        // await lineUtils.replyText(replyToken, '❌ 只有莊家可以發牌！');
        return;
    }
    if (table.players.size === 0) {
        await lineUtils.replyText(replyToken, '❌ 牌桌上還沒有人下注！');
        return;
    }

    clearTimeout(table.timeout);
    table.status = 'playing';

    // 莊家發 1 張牌 (暗牌)
    table.dealerHand.push(table.deck.pop());
    table.dealerScore = calculateScore(table.dealerHand);

    // 每個閒家發 1 張牌
    for (const [uid, p] of table.players.entries()) {
        p.hand.push(table.deck.pop());
        p.score = calculateScore(p.hand);
    }

    table.timeout = setTimeout(() => forceCloseTableByTimeout(groupId), 3 * 60 * 1000);
    await sendTableFlex(replyToken, table, '🃏 首發 1 張牌完畢！請閒家們輸入「補牌」或「停牌」');
}

async function forceCloseTableByTimeout(groupId) {
    const table = activeTables.get(groupId);
    if (table && table !== 'pending') {
        activeTables.delete(groupId);
        const refundPromises = [];
        for (const [uid, p] of table.players.entries()) {
            refundPromises.push(economyHandler.addCoinFast(uid, p.bet));
        }
        await Promise.all(refundPromises);
        lineUtils.addPendingMessage(groupId, [{ type: 'text', text: `⏰ 【牌桌自動取消】\n超過 3 分鐘無人動作，自動解散，下注已退還。` }]);
    }
}

// 5. 補牌
async function playerHit(replyToken, context) {
    const { groupId, userId } = context;
    const table = activeTables.get(groupId);
    if (!table || table === 'pending' || table.status !== 'playing') return;
    if (table.dealerId === userId) return;

    const p = table.players.get(userId);
    if (!p || p.status !== 'playing') return;

    p.hand.push(table.deck.pop());
    p.score = calculateScore(p.hand);

    let msg = `${p.name} 補牌！目前 ${p.score} 點。`;

    if (p.score > 10.5) {
        p.status = 'bust';
        msg = `💥 爆牌了！${p.name} (${p.score} 點) 出局！`;
    } else if (p.hand.length === 5) {
        p.status = 'stand';
        msg = `✨ 過五關！${p.name} 抽滿五張自動停牌。`;
    } else if (p.score === 10.5) {
        p.status = 'stand';
        msg = `✨ 十點半！${p.name} 自動停牌。`;
    }

    checkAllPlayersDone(replyToken, table, msg);
}

// 6. 停牌
async function playerStand(replyToken, context) {
    const { groupId, userId } = context;
    const table = activeTables.get(groupId);
    if (!table || table === 'pending' || table.status !== 'playing') return;
    if (table.dealerId === userId) return;

    const p = table.players.get(userId);
    if (!p || p.status !== 'playing') return;

    p.status = 'stand';
    checkAllPlayersDone(replyToken, table, `${p.name} 選擇停牌 (${p.score} 點)。`);
}

async function checkAllPlayersDone(replyToken, table, prefixMsg) {
    let allDone = true;
    for (const p of table.players.values()) {
        if (p.status === 'playing') {
            allDone = false;
            break;
        }
    }

    clearTimeout(table.timeout);

    if (allDone) {
        table.status = 'closed';
        await executeDealerTurn(replyToken, table.groupId, prefixMsg);
    } else {
        table.timeout = setTimeout(() => forceCloseTableByTimeout(table.groupId), 3 * 60 * 1000);
        await sendTableFlex(replyToken, table, prefixMsg);
    }
}

// 7. 莊家開牌 (或系統自動執行)
async function dealerPlay(replyToken, context) {
    const { groupId, userId } = context;
    const table = activeTables.get(groupId);
    if (!table || table === 'pending') return;

    if (table.dealerId !== userId) {
        // await lineUtils.replyText(replyToken, '❌ 只有莊家可以執行開牌！');
        return;
    }

    let allDone = true;
    for (const p of table.players.values()) {
        if (p.status === 'playing') allDone = false;
    }

    if (!allDone) {
        await lineUtils.replyText(replyToken, '❌ 還有閒家正在考慮中，請等他們補牌或停牌！');
        return;
    }

    await executeDealerTurn(replyToken, groupId);
}

async function executeDealerTurn(replyToken, groupId, prefixMsg = '') {
    const table = activeTables.get(groupId);
    if (!table || table === 'pending') return;
    
    table.status = 'closed';

    const authUtils = require('../utils/auth');
    const isDealerAdmin = await authUtils.isAdmin(table.dealerId);

    // 莊家未滿 7.5 點必須補牌，且最多只補到 5 張
    while (table.dealerScore < 7.5 && table.dealerHand.length < 5) {
        const nextCard = table.deck[table.deck.length - 1];
        const tempHand = [...table.dealerHand, nextCard];
        const tempScore = calculateScore(tempHand);

        // 莊家防爆作弊機制 (同21點，老闆限定)
        if (isDealerAdmin && tempScore > 10.5 && Math.random() < 0.15) {
            let safeCardIndex = -1;
            for (let i = table.deck.length - 1; i >= 0; i--) {
                const c = table.deck[i];
                const s = calculateScore([...table.dealerHand, c]);
                if (s <= 10.5) {
                    safeCardIndex = i;
                    break;
                }
            }

            if (safeCardIndex !== -1) {
                const safeCard = table.deck.splice(safeCardIndex, 1)[0];
                table.dealerHand.push(safeCard);
                table.dealerScore = calculateScore(table.dealerHand);
                continue;
            }
        }

        table.dealerHand.push(table.deck.pop());
        table.dealerScore = calculateScore(table.dealerHand);
    }

    await finishGameAndSettle(replyToken, table, prefixMsg ? `${prefixMsg}\n\n👉 莊家開牌並結算！` : '🎲 莊家開牌並結算！');
}

// 結算與賠付
async function finishGameAndSettle(replyToken, table, titleMsg) {
    table.status = 'closed';
    const { groupId, dealerId, dealerScore } = table;
    const dealerBust = dealerScore > 10.5;
    const dealerFive = table.dealerHand.length === 5 && !dealerBust;

    let dealerNetProfit = 0;
    const payoutPromises = [];

    for (const [uid, p] of Array.from(table.players.entries())) {
        const playerBust = p.status === 'bust';
        const playerFive = p.hand.length === 5 && !playerBust;
        
        let playerPayout = 0; 
        let playerNet = 0;    

        if (playerBust) {
            playerPayout = 0;
            playerNet = -p.bet;
            p.resultStr = '💥 爆牌 (輸)';
            p.color = '#D32F2F';
        } else if (dealerBust) {
            // 莊家爆牌，閒家沒爆，閒家贏
            let multiplier = 1;
            if (playerFive) { multiplier = 3; p.resultStr = '🎉 過五關贏 (x3)'; }
            else if (p.score === 10.5) { multiplier = 2; p.resultStr = '🎉 十點半贏 (x2)'; }
            else { p.resultStr = '🎉 莊爆牌贏'; }
            
            playerNet = p.bet * multiplier;
            playerPayout = p.bet + playerNet;
            p.color = flexUtils.COLORS.WIN;
        } else {
            // 都沒爆牌，比較牌型
            if (dealerFive && playerFive) {
                // 莊吃平手
                playerNet = -p.bet;
                playerPayout = 0;
                p.resultStr = '💸 莊吃平手';
                p.color = '#D32F2F';
            } else if (dealerFive) {
                playerNet = -p.bet;
                playerPayout = 0;
                p.resultStr = '💸 輸給莊家五龍';
                p.color = '#D32F2F';
            } else if (playerFive) {
                playerNet = p.bet * 3;
                playerPayout = p.bet + playerNet;
                p.resultStr = '🎉 過五關贏 (x3)';
                p.color = flexUtils.COLORS.WIN;
            } else if (table.dealerScore >= p.score) {
                // 莊吃平手
                playerNet = -p.bet;
                playerPayout = 0;
                p.resultStr = '💸 莊家通吃平手';
                p.color = '#D32F2F';
            } else {
                // 閒家點數大
                let multiplier = p.score === 10.5 ? 2 : 1;
                playerNet = p.bet * multiplier;
                playerPayout = p.bet + playerNet;
                p.resultStr = p.score === 10.5 ? '🎉 十點半贏 (x2)' : '🎉 點數大贏';
                p.color = flexUtils.COLORS.WIN;
            }
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
    
    await Promise.all(payoutPromises);
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
        await sendTableFlex(replyToken, table, titleMsg, true, bustMsg ? [bustMsg] : []);
    }

    clearTimeout(table.timeout);
    activeTables.delete(groupId); 
}

// 渲染 Flex
async function sendTableFlex(replyToken, table, altText, isFinal = false, extraMessages = []) {
    const contents = [
        flexUtils.createText({ text: '🃏 哭霸娛樂城 - 多人十點半', size: 'lg', weight: 'bold', color: flexUtils.COLORS.PRIMARY, align: 'center', margin: 'md', adjustMode: 'shrink-to-fit' })
    ];

    let totalWanted = 0;
    if (table.participantWantedLevels) {
        totalWanted = Array.from(table.participantWantedLevels.values()).reduce((a, b) => a + b, 0);
    }
    contents.push(flexUtils.createText({ text: `🚨 賭桌總通緝機率: ${(totalWanted * 100).toFixed(1)}%`, size: 'xs', color: '#FF5252', align: 'center', margin: 'xs', weight: 'bold' }));
    contents.push(flexUtils.createSeparator('md'));

    let dealerCardsStr = '準備中...';
    let dealerScoreStr = '? 點';
    
    if (table.status === 'playing') {
        dealerCardsStr = renderHand(table.dealerHand, true); // 隱藏第一張
    } else if (table.status === 'closed' || isFinal) {
        dealerCardsStr = renderHand(table.dealerHand, false);
        dealerScoreStr = `${table.dealerScore} 點`;
        if (table.dealerScore > 10.5) dealerScoreStr += ' (💥爆牌)';
        else if (table.dealerHand.length === 5) dealerScoreStr += ' (🌟過五關)';
        else if (table.dealerScore === 10.5) dealerScoreStr += ' (🌟十點半)';
    }

    contents.push(
        flexUtils.createText({ text: `🏦 莊家: ${table.dealerName}`, size: 'md', weight: 'bold', color: flexUtils.COLORS.TEXT_MAIN, margin: 'md' }),
        flexUtils.createText({ text: dealerCardsStr, size: 'xl', weight: 'bold', color: flexUtils.COLORS.PRIMARY, margin: 'sm' })
    );

    if (table.status === 'closed' || isFinal) {
        const netColor = table.dealerNetProfit >= 0 ? flexUtils.COLORS.WIN : '#D32F2F';
        contents.push(
            flexUtils.createText({ text: dealerScoreStr, size: 'sm', color: flexUtils.COLORS.TEXT_SUB, margin: 'xs' }),
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
            
            if (table.status === 'playing' || isFinal) {
                pStatus = renderHand(p.hand, false);
                pScoreStr = `${p.score} 點`;
                if (p.status === 'bust') pScoreStr += ' (💥爆牌)';
                else if (p.status === 'stand') pScoreStr += ' (停牌)';
                else pScoreStr += ' (思考中...)';
            }

            contents.push(flexUtils.createBox('horizontal', [
                flexUtils.createText({ text: `👤 ${p.name}`, wrap: true, size: 'sm', weight: 'bold', color: flexUtils.COLORS.TEXT_MAIN, flex: 2 }),
                flexUtils.createText({ text: `押 ${p.bet.toLocaleString()}`, size: 'xs', color: flexUtils.COLORS.SECONDARY, flex: 1, align: 'end', adjustMode: 'shrink-to-fit' })
            ], { margin: 'md', alignItems: 'center' }));

            if (table.status !== 'waiting') {
                contents.push(flexUtils.createText({ text: pStatus, size: 'lg', color: flexUtils.COLORS.TEXT_MAIN, margin: 'xs' }));
                contents.push(flexUtils.createText({ text: pScoreStr, size: 'xs', color: flexUtils.COLORS.TEXT_SUB, margin: 'xs' }));
            }

            if (isFinal) {
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
        shortcutMsg = '💡 捷徑：下注輸入「+金額」或「歐印」';
    } else if (table.status === 'playing') {
        statusMsg = '換閒家回合：請輸入「補牌」或「停牌」';
        shortcutMsg = '💡 捷徑：補牌輸入「+」、停牌輸入「-」或「過」';
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

    const quickReply = require('../utils/multi_quickReply').getQuickReply(table, '十點半');

    if (!replyToken) {
        const lineUtilsMod = require('../utils/line');
        const msgs = [{ type: 'flex', altText: altText, contents: bubble }, ...extraMessages];
        if (quickReply) msgs[msgs.length - 1].quickReply = quickReply;
        lineUtilsMod.addPendingMessage(table.groupId, msgs);
    } else {
        const lineUtilsMod = require('../utils/line');
        await lineUtilsMod.replyFlex(replyToken, altText, bubble, extraMessages, quickReply);
    }
}

module.exports = {
    getActiveTable,
    openTable,
    closeTable,
    placeBet,
    dealCards,
    playerHit,
    playerStand,
    dealerPlay,
    finishGameAndSettle
};
