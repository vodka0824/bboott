/**
 * 多人 21 點 (玩家作莊) 功能模組
 */
const flexUtils = require('../utils/flex');
const { replyFlex, replyText, getGroupMemberName } = require('../utils/line');
const economyHandler = require('./economy');
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
    // 實體賭場通常使用 4-8 副牌，這裡我們用 4 副牌避免太容易算牌且防止發光
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
    let aces = 0;

    for (const card of hand) {
        if (card.value === 'A') {
            score += 11;
            aces += 1;
        } else if (['J', 'Q', 'K'].includes(card.value)) {
            score += 10;
        } else {
            score += parseInt(card.value, 10);
        }
    }

    while (score > 21 && aces > 0) {
        score -= 10;
        aces -= 1;
    }

    return score;
}

function renderHand(hand, hideFirstCard = false) {
    if (hand.length === 0) return '無';
    if (hideFirstCard) {
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

// 1. 開桌21點
async function openTable(replyToken, context) {
    const atonementHandler = require('./atonement');
    const { userId: uidForCheck } = arguments.length === 2 ? arguments[1] : { userId: arguments[2] };
    if (await atonementHandler.checkDevilContract(uidForCheck)) {
        const lineUtils = require('../utils/line');
        await lineUtils.replyText(replyToken, '❌ 惡魔契約期間，您無法擔任莊家！');
        return;
    }
    const { groupId, userId } = context;
    if (!groupId) {
        await replyText(replyToken, '❌ 只能在群組內開桌！');
        return;
    }

    if (activeTables.has(groupId)) {
        await replyText(replyToken, '❌ 目前群組內已經有一桌 21 點正在進行中！');
        return;
    }

    activeTables.set(groupId, 'pending');

    // 檢查玩家是否欠債（莊家開桌必須確認本金，有急難救助金也不能開桌）
    const userDoc = await db.collection('economy_users').doc(userId).get();
    const balance = userDoc.exists ? (userDoc.data().kuCoin || 0) : 0;

    if (balance < 0) {
        activeTables.delete(groupId);
        await replyText(replyToken, '❌ 窮鬼欠債還想當莊家？先去賺錢還債吧！');
        return;
    }

    // 取玩家名稱
    const userName = await getGroupMemberName(groupId, userId);

    // 增加通緝值
    const newWanted = await economyHandler.addWantedLevel(userId);
    const participantWantedLevels = new Map();
    participantWantedLevels.set(userId, newWanted);

    const table = {
        groupId,
        dealerId: userId,
        dealerName: userName,
        dealerHand: [],
        dealerScore: 0,
        status: 'waiting', // waiting, playing, closed
        deck: createDeck(),
        players: new Map(), // key: userId, value: { name, bet, hand, status: 'playing'|'stand'|'bust'|'blackjack' }
        participantWantedLevels,
        timeout: setTimeout(() => autoCloseTable(groupId), 1 * 60 * 1000) // 1 分鐘無發牌就靜默自動解散
    };

    activeTables.set(groupId, table);

    await sendTableFlex(replyToken, table, '🎲 牌桌已建立！大家快來下注！(1分鐘內請發牌，否則自動取消)');
}

// 自動解散（靜默：只記錄待通知，等有人說話才回報）
async function autoCloseTable(groupId) {
    const table = activeTables.get(groupId);
    if (!table || table === 'pending') return;

    // 只在 waiting 狀態（尚未發牌）才自動靜默取消
    if (table.status !== 'waiting') return;

    activeTables.delete(groupId);
    console.log(`[MultiBlackjack] Table in ${groupId} timed out silently.`);

    // 退還所有玩家下注
    const refundedPlayers = [];
    const refundPromises = [];
    for (const [uid, p] of table.players.entries()) {
        refundPromises.push(economyHandler.addCoinFast(uid, p.bet));
        refundedPlayers.push({ name: p.name, bet: p.bet });
    }
    await Promise.all(refundPromises);

    let msg = `⏰ 【牌桌自動取消】\n${table.dealerName} 開的牌桌已超過 1 分鐘未發牌，自動解散。`;

    if (refundedPlayers.length > 0) {
        msg += `\n\n💰 已退還下注：`;
        for (const p of refundedPlayers) {
            msg += `\n• ${p.name}：+${p.bet.toLocaleString()} 哭幣`;
        }
    } else {
        msg += `\n（沒有玩家下注，無需退款）`;
    }

    const lineUtils = require('../utils/line');
    lineUtils.addPendingMessage(groupId, [{ type: 'text', text: msg }]);
}

// 2. 解散牌桌
async function closeTable(replyToken, context) {
    const { groupId, userId } = context;
    const table = activeTables.get(groupId);

    if (!table || table === 'pending') {
        await replyText(replyToken, '❌ 目前沒有進行中的牌桌。');
        return;
    }

    if (table.dealerId !== userId) {
        await replyText(replyToken, '❌ 只有莊家可以解散牌桌！');
        return;
    }

    if (table.status !== 'waiting') {
        await replyText(replyToken, '❌ 遊戲已經開始，無法解散！請跑完流程。');
        return;
    }

    clearTimeout(table.timeout);
    activeTables.delete(groupId);

    // 退還下注金額
    const refundPromises = [];
    for (const [uid, p] of table.players.entries()) {
        refundPromises.push(economyHandler.addCoinFast(uid, p.bet));
    }
    await Promise.all(refundPromises);

    await replyText(replyToken, '✅ 莊家已解散牌桌，所有下注已退還。');
}

// 3. 下注 [金額]
async function placeBet(replyToken, context, amountStr) {
    const { groupId, userId } = context;
    const table = activeTables.get(groupId);

    if (!table || table === 'pending') {
        await replyText(replyToken, '❌ 目前沒有進行中的牌桌。請輸入「開桌21點」來建立。');
        return;
    }

    if (table.status !== 'waiting') {
        await replyText(replyToken, '❌ 發牌階段已結束，無法再下注！');
        return;
    }

    if (table.dealerId === userId) {
        await replyText(replyToken, '❌ 莊家不能下注！');
        return;
    }

    if (table.players.has(userId)) {
        await replyText(replyToken, '❌ 您已經下注過了！請等莊家發牌。');
        return;
    }

    const betAmount = parseInt(amountStr, 10);
    if (isNaN(betAmount) || betAmount <= 0) {
        await replyText(replyToken, '❌ 21點下注金額無效（請輸入大於 0 的正整數金額，例如：下注 1000000）。');
        return;
    }

    // 扣款
    const consumeResult = await economyHandler.consumeCoin(groupId, userId, betAmount, true);
    if (!consumeResult.success) {
        await replyText(replyToken, `❌ 下注失敗：${consumeResult.message}`);
        return;
    }

    const userName = consumeResult.name || '玩家';

    // 增加通緝值
    const newWanted = await economyHandler.addWantedLevel(userId);
    table.participantWantedLevels.set(userId, newWanted);

    // 加入牌桌
    table.players.set(userId, {
        name: userName,
        bet: betAmount,
        hand: [],
        score: 0,
        status: 'playing', // playing, stand, bust, blackjack
        resultStr: ''
    });

    // 重置 timeout
    clearTimeout(table.timeout);
    table.timeout = setTimeout(() => autoCloseTable(groupId), 3 * 60 * 1000);

    await sendTableFlex(replyToken, table, `${userName} 下注了 ${betAmount.toLocaleString()} 哭幣！`);
}

// 4. 發牌
async function dealCards(replyToken, context) {
    const { groupId, userId } = context;
    const table = activeTables.get(groupId);

    if (!table || table === 'pending' || table.status !== 'waiting') {
        return; // 忽略或回傳錯誤
    }

    if (table.dealerId !== userId) {
        await replyText(replyToken, '❌ 只有莊家可以發牌！');
        return;
    }

    if (table.players.size === 0) {
        await replyText(replyToken, '❌ 牌桌上還沒有人下注！');
        return;
    }

    clearTimeout(table.timeout);
    table.status = 'playing';

    // 莊家發兩張牌
    table.dealerHand.push(table.deck.pop(), table.deck.pop());
    table.dealerScore = calculateScore(table.dealerHand);
    const dealerBlackjack = table.dealerScore === 21;

    // 每個閒家發兩張牌
    for (const [uid, p] of table.players.entries()) {
        p.hand.push(table.deck.pop(), table.deck.pop());
        p.score = calculateScore(p.hand);
        if (p.score === 21) {
            p.status = 'blackjack';
        }
    }

    if (dealerBlackjack) {
        // 如果莊家首發 Blackjack，直接結算
        await finishGameAndSettle(replyToken, table, '😱 莊家首發 Blackjack！遊戲直接結束！');
        return;
    }

    // 檢查是否有閒家全 Blackjack，若皆是則可提早結束
    let allDone = true;
    for (const p of table.players.values()) {
        if (p.status === 'playing') allDone = false;
    }

    if (allDone) {
        await finishGameAndSettle(replyToken, table, '🎉 所有玩家皆為 Blackjack！直接結算！');
        return;
    }

    // 正常開始
    table.timeout = setTimeout(() => forceCloseTableByTimeout(groupId), 3 * 60 * 1000); // 3分鐘沒動作強制沒收
    await sendTableFlex(replyToken, table, '🃏 發牌完畢！請閒家們輸入「補牌」或「停牌」');
}

async function forceCloseTableByTimeout(groupId) {
    const table = activeTables.get(groupId);
    if (table && table !== 'pending') {
        activeTables.delete(groupId);
        console.log(`[MultiBlackjack] Table in ${groupId} timed out during playing.`);
        // 逾時就直接退款所有人
        const refundPromises = [];
        for (const [uid, p] of table.players.entries()) {
            refundPromises.push(economyHandler.addCoinFast(uid, p.bet));
        }
        await Promise.all(refundPromises);
        
        const lineUtils = require('../utils/line');
        lineUtils.addPendingMessage(groupId, [{ type: 'text', text: `⏰ 【牌桌自動取消】\n超過 3 分鐘無人動作，牌桌自動解散，所有下注已退還。` }]);
    }
}

// 5. 補牌
async function playerHit(replyToken, context) {
    const { groupId, userId } = context;
    const table = activeTables.get(groupId);
    if (!table || table === 'pending' || table.status !== 'playing') return;

    if (table.dealerId === userId) {
        await replyText(replyToken, '❌ 現在是閒家回合，莊家請稍後！');
        return;
    }

    const p = table.players.get(userId);
    if (!p) {
        await replyText(replyToken, '❌ 您沒有參與這局遊戲。');
        return;
    }

    if (p.status !== 'playing') {
        await replyText(replyToken, '❌ 您的回合已結束！');
        return;
    }

    // 給牌
    p.hand.push(table.deck.pop());
    p.score = calculateScore(p.hand);

    let msg = `${p.name} 補牌！目前 ${p.score} 點。`;

    if (p.score > 21) {
        p.status = 'bust';
        msg = `💥 爆牌了！${p.name} (${p.score} 點) 出局！`;
    } else if (p.score === 21) {
        p.status = 'stand';
        msg = `✨ 21點！${p.name} 自動停牌。`;
    }

    // 檢查是否所有人都結束了
    checkAllPlayersDone(replyToken, table, msg);
}

// 6. 停牌
async function playerStand(replyToken, context) {
    const { groupId, userId } = context;
    const table = activeTables.get(groupId);
    if (!table || table === 'pending' || table.status !== 'playing') return;

    if (table.dealerId === userId) {
        await replyText(replyToken, '❌ 現在是閒家回合，莊家請稍後！');
        return;
    }

    const p = table.players.get(userId);
    if (!p) return;

    if (p.status !== 'playing') {
        await replyText(replyToken, '❌ 您的回合已結束！');
        return;
    }

    p.status = 'stand';
    checkAllPlayersDone(replyToken, table, `${p.name} 選擇停牌 (${p.score} 點)。`);
}

// 6.1 雙倍下注 (Double Down)
async function playerDoubleDown(replyToken, context) {
    const { groupId, userId } = context;
    const table = activeTables.get(groupId);
    if (!table || table === 'pending' || table.status !== 'playing') return;

    if (table.dealerId === userId) return;

    const p = table.players.get(userId);
    if (!p || p.status !== 'playing') return;

    if (p.hand.length !== 2) {
        await replyText(replyToken, '❌ 只有首發兩張牌時才能雙倍下注！');
        return;
    }

    // 扣除等額賭金
    const consumeResult = await economyHandler.consumeCoin(groupId, userId, p.bet, true);
    if (!consumeResult.success) {
        await replyText(replyToken, `❌ 餘額不足無法雙倍下注，還差 ${p.bet.toLocaleString()} 哭幣。`);
        return;
    }

    p.bet *= 2;
    p.hand.push(table.deck.pop());
    p.score = calculateScore(p.hand);

    let msg = `🔥 ${p.name} 選擇雙倍下注！加碼至 ${p.bet.toLocaleString()}。\n補了一張牌，目前 ${p.score} 點。`;

    if (p.score > 21) {
        p.status = 'bust';
        msg += `\n💥 爆牌了！${p.name} 出局！`;
    } else {
        p.status = 'stand'; // 強制停牌
        msg += `\n✨ 自動停牌。`;
    }

    checkAllPlayersDone(replyToken, table, msg);
}

// 6.2 投降 (Surrender)
async function playerSurrender(replyToken, context) {
    const { groupId, userId } = context;
    const table = activeTables.get(groupId);
    if (!table || table === 'pending' || table.status !== 'playing') return;

    if (table.dealerId === userId) return;

    const p = table.players.get(userId);
    if (!p || p.status !== 'playing') return;

    if (p.hand.length !== 2) {
        await replyText(replyToken, '❌ 已經補過牌，無法投降！');
        return;
    }

    p.status = 'surrendered';
    checkAllPlayersDone(replyToken, table, `🏳️ ${p.name} 選擇投降，輸掉一半賭金。`);
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
        // 直接執行莊家回合並結算
        table.status = 'closed';
        // 不發送中間訊息，直接開獎，確保 replyToken 可用
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
        await replyText(replyToken, '❌ 只有莊家可以執行開牌！');
        return;
    }

    let allDone = true;
    for (const p of table.players.values()) {
        if (p.status === 'playing') allDone = false;
    }

    if (!allDone) {
        await replyText(replyToken, '❌ 還有閒家正在考慮中，請等他們補牌或停牌！');
        return;
    }

    // 手動觸發
    await executeDealerTurn(replyToken, groupId);
}

// 執行莊家自動補牌邏輯 (包含 15% 防爆作弊機制)
async function executeDealerTurn(replyToken, groupId, prefixMsg = '') {
    const table = activeTables.get(groupId);
    if (!table || table === 'pending') return;
    
    table.status = 'closed'; // 鎖定牌桌

    const authUtils = require('../utils/auth');
    const isDealerAdmin = await authUtils.isAdmin(table.dealerId);

    // 莊家未滿 17 點必須補牌 (專業賭場規則)
    while (table.dealerScore < 17) {
        // 預判下一張牌是否會爆牌
        const nextCard = table.deck[table.deck.length - 1];
        const tempHand = [...table.dealerHand, nextCard];
        const tempScore = calculateScore(tempHand);

        // 只有老闆自己當莊家時，才享有作弊機制
        if (isDealerAdmin && tempScore > 21 && Math.random() < 0.15) {
            // 15% 機率觸發防爆作弊，尋找安全牌
            let safeCardIndex = -1;
            for (let i = table.deck.length - 1; i >= 0; i--) {
                const c = table.deck[i];
                const s = calculateScore([...table.dealerHand, c]);
                if (s <= 21) {
                    safeCardIndex = i;
                    break;
                }
            }

            if (safeCardIndex !== -1) {
                // 偷天換日
                const safeCard = table.deck.splice(safeCardIndex, 1)[0];
                table.dealerHand.push(safeCard);
                table.dealerScore = calculateScore(table.dealerHand);
                continue;
            }
        }

        // 正常抽牌
        table.dealerHand.push(table.deck.pop());
        table.dealerScore = calculateScore(table.dealerHand);
    }

    await finishGameAndSettle(replyToken, table, prefixMsg ? `${prefixMsg}\n\n👉 莊家開牌並結算！` : '🎲 莊家開牌並結算！');
}

// 結算與賠付
async function finishGameAndSettle(replyToken, table, titleMsg) {
    table.status = 'closed';
    const { groupId, dealerId, dealerScore } = table;
    const dealerBlackjack = dealerScore === 21 && table.dealerHand.length === 2;
    const dealerBust = dealerScore > 21;

    let dealerNetProfit = 0;
    const payoutPromises = [];

    // 處理每個閒家
    for (const [uid, p] of Array.from(table.players.entries())) {
        const playerBlackjack = p.status === 'blackjack';
        const playerBust = p.status === 'bust';
        const playerSurrendered = p.status === 'surrendered';

        let playerPayout = 0; 
        let playerNet = 0;    

        if (playerSurrendered) {
            playerPayout = Math.floor(p.bet / 2); // 拿回一半本金
            playerNet = -(p.bet - playerPayout);  // 輸掉另一半
            p.resultStr = '🏳️ 投降 (輸半)';
            p.color = '#FF9800'; // 橘色
        } else if (playerBust) {
            playerPayout = 0;
            playerNet = -p.bet;
            p.resultStr = '💥 爆牌 (輸)';
            p.color = '#D32F2F'; // 輸紅色
        } else if (dealerBlackjack) {
            if (playerBlackjack) {
                playerPayout = p.bet;
                playerNet = 0;
                p.resultStr = '🤝 平手 (BJ)';
                p.color = '#FF9800'; // 平手橘色
            } else {
                playerPayout = 0;
                playerNet = -p.bet;
                p.resultStr = '💸 輸給莊BJ';
                p.color = '#D32F2F';
            }
        } else if (playerBlackjack) {
            playerPayout = p.bet + Math.floor(p.bet * 1.5); 
            playerNet = Math.floor(p.bet * 1.5);
            p.resultStr = '🎉 黑傑克';
            p.color = flexUtils.COLORS.WIN; // 贏綠色
        } else if (dealerBust) {
            playerPayout = p.bet * 2;
            playerNet = p.bet;
            p.resultStr = '🎉 莊爆牌贏';
            p.color = flexUtils.COLORS.WIN;
        } else {
            if (p.score > dealerScore) {
                playerPayout = p.bet * 2;
                playerNet = p.bet;
                p.resultStr = '🎉 點數大贏';
                p.color = flexUtils.COLORS.WIN;
            } else if (p.score < dealerScore) {
                playerPayout = 0;
                playerNet = -p.bet;
                p.resultStr = '💸 點數小輸';
                p.color = '#D32F2F';
            } else {
                playerPayout = p.bet;
                playerNet = 0;
                p.resultStr = '🤝 平手';
                p.color = '#FF9800';
            }
        }

        dealerNetProfit -= playerNet;
        
        if (playerNet > 0) {
            const atonementHandler = require('./atonement');
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
        const authUtils = require('../utils/auth');
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
    
    // 發送最終結算 Flex (將警察查水表的訊息合併發送)
    if (replyToken) {
        await sendTableFlex(replyToken, table, titleMsg, true, bustMsg ? [bustMsg] : []);
    }

    clearTimeout(table.timeout);
    activeTables.delete(groupId); 
}

// 渲染 Flex
async function sendTableFlex(replyToken, table, altText, isFinal = false, extraMessages = []) {
    const contents = [
        flexUtils.createText({ text: '🃏 哭霸娛樂城 - 多人 21 點', size: 'lg', weight: 'bold', color: '#FFD700', align: 'center', margin: 'md', adjustMode: 'shrink-to-fit' })
    ];

    let totalWanted = 0;
    if (table.participantWantedLevels) {
        totalWanted = Array.from(table.participantWantedLevels.values()).reduce((a, b) => a + b, 0);
    }
    contents.push(flexUtils.createText({ text: `🚨 賭桌總通緝機率: ${(totalWanted * 100).toFixed(1)}%`, size: 'xs', color: '#FF5252', align: 'center', margin: 'xs', weight: 'bold' }));
    contents.push(flexUtils.createSeparator('md'));

    // 莊家區
    let dealerCardsStr = '準備中...';
    let dealerScoreStr = '? 點';
    let dealerResultStr = '';
    
    if (table.status === 'playing') {
        dealerCardsStr = renderHand(table.dealerHand, true); // 隱藏第一張
    } else if (table.status === 'closed' || isFinal) {
        dealerCardsStr = renderHand(table.dealerHand, false);
        dealerScoreStr = `${table.dealerScore} 點`;
        if (table.dealerScore > 21) dealerScoreStr += ' (💥爆牌)';
        else if (table.dealerScore === 21 && table.dealerHand.length === 2) dealerScoreStr += ' (🌟BJ)';
        
        const netStr = table.dealerNetProfit >= 0 ? `+${table.dealerNetProfit.toLocaleString()}` : `${table.dealerNetProfit.toLocaleString()}`;
        
    }

    contents.push(
        flexUtils.createText({ text: `🏦 莊家: ${table.dealerName}`, size: 'md', weight: 'bold', color: '#FFFFFF', margin: 'md' }),
        flexUtils.createText({ text: dealerCardsStr, size: 'xl', weight: 'bold', color: '#FFD700', margin: 'sm' })
    );

    if (table.status === 'closed' || isFinal) {
        const netColor = table.dealerNetProfit >= 0 ? flexUtils.COLORS.WIN : '#D32F2F';
        contents.push(
            flexUtils.createText({ text: dealerScoreStr, size: 'sm', color: '#AAAAAA', margin: 'xs' }),
            flexUtils.createText({ text: `結算: ${table.dealerNetProfit > 0 ? '+' : ''}${table.dealerNetProfit.toLocaleString()}`, size: 'md', weight: 'bold', color: netColor, margin: 'xs', wrap: true })
        );
        if (table.dealerFinalBalance !== undefined) {
            contents.push(flexUtils.createText({ text: `餘額: ${table.dealerFinalBalance.toLocaleString()}`, size: 'xs', color: netColor, margin: 'xs' }));
        }
        if (table.taxAmount > 0) {
            contents.push(flexUtils.createText({ text: `(抽水 5%: -${table.taxAmount.toLocaleString()})`, size: 'xs', color: '#AAAAAA', margin: 'xs' }));
        }
    }

    contents.push(flexUtils.createSeparator('lg'));

    // 閒家區
    let totalBets = 0;
    if (table.players.size === 0) {
        contents.push(flexUtils.createText({ text: '尚無閒家加入', size: 'sm', color: '#888888', align: 'center', margin: 'lg' }));
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
                else if (p.status === 'blackjack') pScoreStr += ' (🌟BJ)';
                else if (p.status === 'surrendered') pScoreStr += ' (投降)';
                else pScoreStr += ' (思考中...)';
            }

            contents.push(flexUtils.createBox('horizontal', [
                flexUtils.createText({ text: `👤 ${p.name}`, wrap: true, size: 'sm', weight: 'bold', color: '#E0E0E0', flex: 2 }),
                flexUtils.createText({ text: `押 ${p.bet.toLocaleString()}`, size: 'xs', color: '#FF9800', flex: 1, align: 'end', adjustMode: 'shrink-to-fit' })
            ], { margin: 'md', alignItems: 'center' }));

            if (table.status !== 'waiting') {
                contents.push(flexUtils.createText({ text: pStatus, size: 'lg', color: '#FFFFFF', margin: 'xs' }));
                contents.push(flexUtils.createText({ text: pScoreStr, size: 'xs', color: '#AAAAAA', margin: 'xs' }));
            }

            if (isFinal) {
                
                contents.push(flexUtils.createText({ text: `${p.resultStr}`, size: 'sm', weight: 'bold', color: p.color, margin: 'xs' }));
                if (p.curseStr) contents.push(flexUtils.createText({ text: p.curseStr, size: 'xs', weight: 'bold', color: '#FF1744', margin: 'xs' }));
                if (p.finalBalance !== undefined) {
                    contents.push(flexUtils.createText({ text: `餘額: ${p.finalBalance.toLocaleString()}`, size: 'xs', color: '#888888', margin: 'xs' }));
                }
            }
            
            contents.push(flexUtils.createSeparator('sm'));
        }
    }

    // 狀態提示
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

    contents.push(flexUtils.createText({ text: statusMsg, size: 'sm', weight: 'bold', color: '#00BCD4', align: 'center', margin: 'xl' }));
    if (shortcutMsg) {
        contents.push(flexUtils.createText({ text: shortcutMsg, size: 'xs', color: '#AAAAAA', align: 'center', margin: 'sm' }));
    }

    const bubble = flexUtils.createBubble({
        size: 'mega',
        body: flexUtils.createBox('vertical', contents, { backgroundColor: '#121212', paddingAll: 'xl' })
    });

    await replyFlex(replyToken, altText, bubble, extraMessages);
}

module.exports = {
    getActiveTable,
    openTable,
    closeTable,
    placeBet,
    dealCards,
    playerHit,
    playerStand,
    playerDoubleDown,
    playerSurrender,
    dealerPlay,
    finishGameAndSettle,
    _test: {
        createDeck,
        shuffle,
        calculateScore,
        renderHand
    }
};
