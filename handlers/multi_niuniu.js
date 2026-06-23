/**
 * 多人妞妞 (Niu Niu) 功能模組
 */
const flexUtils = require('../utils/flex');
const { replyFlex, replyText, getGroupMemberName } = require('../utils/line');
const lineUtils = require('../utils/line');
const economyHandler = require('./economy');
const persistenceService = require('../services/multiplayerPersistenceService');
const atonementHandler = require('./atonement');
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
const SUITS = ['♠️', '♥️', '♣️', '♦️']; // ♠️ > ♥️ > ♣️ > ♦️
const VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// 取得花色大小 (0~3, 越小越大)
function getSuitRank(suit) {
    return SUITS.indexOf(suit);
}

// 取得牌面大小 (為了比點數, K最大 A最小)
function getCardRank(value) {
    if (value === 'A') return 1;
    if (value === 'J') return 11;
    if (value === 'Q') return 12;
    if (value === 'K') return 13;
    return parseInt(value, 10);
}

// 取得牌面數值 (算牛用)
function getCardValue(value) {
    if (['J', 'Q', 'K'].includes(value)) return 10;
    if (value === 'A') return 1;
    return parseInt(value, 10);
}

function createDeck() {
    const deck = [];
    for (const suit of SUITS) {
        for (const value of VALUES) {
            deck.push({ suit, value });
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

// 找出最大的一張牌
function getHighestCard(hand) {
    let highest = hand[0];
    for (let i = 1; i < hand.length; i++) {
        const c = hand[i];
        if (getCardRank(c.value) > getCardRank(highest.value)) {
            highest = c;
        } else if (getCardRank(c.value) === getCardRank(highest.value)) {
            if (getSuitRank(c.suit) < getSuitRank(highest.suit)) { // index 越小越大
                highest = c;
            }
        }
    }
    return highest;
}

/**
 * 算牛邏輯
 * 回傳: {
 *   type: '五公' | '牛牛' | '牛X' | '烏龍',
 *   score: 10 (牛牛), 1-9 (牛X), 0 (烏龍), 11 (五公),
 *   multiplier: 5, 3, 2, 1,
 *   highestCard: { suit, value }
 * }
 */
function calculateNiuNiu(hand) {
    const highestCard = getHighestCard(hand);

    // 檢查五公
    const isFiveDukes = hand.every(c => ['J', 'Q', 'K'].includes(c.value));
    if (isFiveDukes) {
        return { type: '五公', score: 11, multiplier: 5, highestCard };
    }

    let hasNiu = false;
    let niuScore = 0;

    // 從 5 張牌選 3 張，共有 10 種組合
    for (let i = 0; i < 3; i++) {
        for (let j = i + 1; j < 4; j++) {
            for (let k = j + 1; k < 5; k++) {
                const sum3 = getCardValue(hand[i].value) + getCardValue(hand[j].value) + getCardValue(hand[k].value);
                if (sum3 % 10 === 0) {
                    hasNiu = true;
                    // 找出剩下的兩張牌
                    let sum2 = 0;
                    for (let m = 0; m < 5; m++) {
                        if (m !== i && m !== j && m !== k) {
                            sum2 += getCardValue(hand[m].value);
                        }
                    }
                    niuScore = sum2 % 10;
                    if (niuScore === 0) niuScore = 10; // 牛牛
                    break;
                }
            }
            if (hasNiu) break;
        }
        if (hasNiu) break;
    }

    if (!hasNiu) {
        return { type: '烏龍', score: 0, multiplier: 1, highestCard };
    }

    if (niuScore === 10) {
        return { type: '妞妞', score: 10, multiplier: 3, highestCard };
    } else if (niuScore >= 7 && niuScore <= 9) {
        return { type: `妞${niuScore}`, score: niuScore, multiplier: 2, highestCard };
    } else {
        return { type: `妞${niuScore}`, score: niuScore, multiplier: 1, highestCard };
    }
}

/**
 * 比較兩手牌
 * @returns 1 if handA wins, -1 if handB wins, 0 if tie (should not happen with strict rules)
 */
function compareHands(resultA, resultB) {
    if (resultA.score > resultB.score) return 1;
    if (resultA.score < resultB.score) return -1;

    // 點數相同，比最大張牌的牌面
    const rankA = getCardRank(resultA.highestCard.value);
    const rankB = getCardRank(resultB.highestCard.value);
    if (rankA > rankB) return 1;
    if (rankA < rankB) return -1;

    // 牌面相同，比花色
    const suitA = getSuitRank(resultA.highestCard.suit);
    const suitB = getSuitRank(resultB.highestCard.suit);
    if (suitA < suitB) return 1; // suitRank越小越大
    if (suitA > suitB) return -1;

    return 0; // 完全相同 (機率極低)
}

function renderHand(hand) {
    if (hand.length === 0) return '無';
    return hand.map(c => `${c.suit}${c.value}`).join(' ');
}

// 取得目前的牌桌
function getActiveTable(groupId) {
    return activeTables.get(groupId);
}

// === 操作邏輯 ===

// 1. 開桌妞妞
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
        await replyText(replyToken, '❌ 目前群組內已經有一桌妞妞正在進行中！');
        return;
    }
    
    // 加上 pending 狀態鎖，防止重複開桌
    activeTables.set(groupId, 'pending');

    // 檢查玩家是否欠債（莊家開桌必須確認本金，有急難救助金也不能開桌）
    const userDoc = await db.collection('economy_users').doc(userId).get();
    const balance = userDoc.exists ? (userDoc.data().kuCoin || 0) : 0;

    if (balance < 0) {
        activeTables.delete(groupId);
        await replyText(replyToken, '❌ 窮鬼欠債還想開賭桌？先去賺錢還債吧！');
        return;
    }

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
        dealerResult: null,
        status: 'waiting', // waiting, closed
        deck: createDeck(),
        players: new Map(),
        participantWantedLevels,
        timeout: setTimeout(() => autoCloseTable(groupId), 1 * 60 * 1000)
    };

    activeTables.set(groupId, table);

    await sendTableFlex(replyToken, table, '🎲 妞妞牌桌已建立！大家快來下注！(1分鐘內請發牌，否則自動取消)');
}

// 自動解散（靜默：只記錄待通知，等有人說話才回報）
async function autoCloseTable(groupId) {
    const table = activeTables.get(groupId);
    if (!table) return;

    // 只在 waiting 狀態（尚未發牌）才自動靜默取消
    if (table.status !== 'waiting') return;

    activeTables.delete(groupId);
    console.log(`[MultiNiuNiu] Table in ${groupId} timed out silently.`);

    // 退還所有玩家下注
    const refundedPlayers = [];
    for (const [uid, p] of table.players.entries()) {
        await economyHandler.addCoinQuietly(groupId, uid, p.bet);
        refundedPlayers.push({ name: p.name, bet: p.bet });
    }

    const lineUtils = require('../utils/line');
    let msg = `⏱️ ${table.dealerName} 開的妞妞牌桌已超過 1 分鐘未發牌，自動解散。`;

    if (refundedPlayers.length > 0) {
        msg += `\n\n💰 已退還下注：`;
        for (const p of refundedPlayers) {
            msg += `\n• ${p.name}：+${p.bet.toLocaleString()} 哭幣`;
        }
    } else {
        msg += `\n（沒有玩家下注，無需退款）`;
    }

    lineUtils.addPendingMessage(groupId, [{ type: 'text', text: msg }]);
}

// 2. 解散牌桌
async function closeTable(replyToken, context) {
    const { groupId, userId } = context;
    const table = activeTables.get(groupId);

    if (!table) return;

    if (table.dealerId !== userId) {
        // await replyText(replyToken, '❌ 只有莊家可以解散牌桌！');
        return;
    }

    if (table.status !== 'waiting') {
        await replyText(replyToken, '❌ 遊戲已經結算，無法解散！');
        return;
    }

    clearTimeout(table.timeout);
    activeTables.delete(groupId);

    for (const [uid, p] of table.players.entries()) {
        await economyHandler.addCoinQuietly(groupId, uid, p.bet);
    }

    await replyText(replyToken, '✅ 莊家已解散牌桌，所有下注已退還。');
}

// 3. 下注 [金額]
async function placeBet(replyToken, context, amountStr) {
    const { groupId, userId } = context;
    const table = activeTables.get(groupId);

    if (!table) return;

    if (table.status !== 'waiting') {
        await replyText(replyToken, '❌ 已經發牌結算了，無法再下注！');
        return;
    }

    if (table.dealerId === userId) {
        await replyText(replyToken, '❌ 莊家不能下注！');
        return;
    }

    const { parseBetAmountExtended } = require('../utils/betParser');
    const parsedBet = await parseBetAmountExtended(amountStr, userId);

    if (parsedBet.amount <= 0) {
        await replyText(replyToken, '❌ 妞妞下注金額無效（請輸入大於 0 的正整數金額）。');
        return;
    }

    const isExistingPlayer = table.players.has(userId);
    let finalDelta = parsedBet.amount * parsedBet.relativeSign;
    let newTotalBet = finalDelta;

    if (isExistingPlayer) {
        const p = table.players.get(userId);
        if (!parsedBet.isRelative) {
            await replyText(replyToken, '❌ 您已經下注過了！若要修改請輸入「+金額」或「-金額」。');
            return;
        }
        newTotalBet = p.bet + finalDelta;
        if (newTotalBet <= 0) {
            await replyText(replyToken, '❌ 下注總額不能小於等於 0！');
            return;
        }
    } else {
        if (parsedBet.isRelative && parsedBet.relativeSign < 0) {
            await replyText(replyToken, '❌ 您還沒下注，無法減注！');
            return;
        }
    }

    let consumeResult;
    if (finalDelta > 0) {
        consumeResult = await economyHandler.consumeCoin(groupId, userId, finalDelta, true);
        if (!consumeResult.success) {
            await replyText(replyToken, `❌ 下注失敗：${consumeResult.message}`);
            return;
        }
    } else {
        await economyHandler.addCoinFast(userId, Math.abs(finalDelta));
        consumeResult = { success: true, name: await getGroupMemberName(groupId, userId) };
    }

    const userName = consumeResult.name || '玩家';
    if (finalDelta > 0) {
        persistenceService.recordBet(groupId, '牛牛', userId, finalDelta, userName).catch(e => console.error(e));
    }

    // 增加通緝值
    const newWanted = await economyHandler.addWantedLevel(userId);
    table.participantWantedLevels.set(userId, newWanted);

    if (!isExistingPlayer) {
        table.players.set(userId, {
            name: userName,
            bet: newTotalBet,
            hand: [],
            result: null,
            playerNet: 0,
            resultStr: '',
            color: ''
        });
    } else {
        table.players.get(userId).bet = newTotalBet;
    }

    clearTimeout(table.timeout);
    table.timeout = setTimeout(() => autoCloseTable(groupId), 1 * 60 * 1000);

    const actionText = finalDelta > 0 ? (isExistingPlayer ? `加碼了 ${finalDelta.toLocaleString()}` : `下注了 ${finalDelta.toLocaleString()}`) : `減少了 ${Math.abs(finalDelta).toLocaleString()}`;
    await sendTableFlex(replyToken, table, `${userName} ${actionText} 哭幣！目前總注：${newTotalBet.toLocaleString()}`);
}

// 4. 發牌 (一翻兩瞪眼)
async function dealCards(replyToken, context) {
    const { groupId, userId } = context;
    const table = activeTables.get(groupId);

    if (!table || table.status !== 'waiting') return;

    if (table.dealerId !== userId) {
        // await replyText(replyToken, '❌ 只有莊家可以發牌！');
        return;
    }

    if (table.players.size === 0) {
        await replyText(replyToken, '❌ 牌桌上還沒有人下注！');
        return;
    }

    clearTimeout(table.timeout);
    table.status = 'closed';

    // 莊家發 5 張牌
    for (let i = 0; i < 5; i++) table.dealerHand.push(table.deck.pop());
    table.dealerResult = calculateNiuNiu(table.dealerHand);

    // 閒家發 5 張牌
    for (const p of table.players.values()) {
        for (let i = 0; i < 5; i++) p.hand.push(table.deck.pop());
        p.result = calculateNiuNiu(p.hand);
    }

    await finishGameAndSettle(replyToken, table, '🎲 發牌完畢！立刻結算！');
}

// 結算與賠付
async function finishGameAndSettle(replyToken, table, titleMsg) {
    const { groupId, dealerId, dealerResult } = table;
    
    let dealerNetProfit = 0;

    // 結算作業改為併發處理，大幅提升效率
    const extraPenalties = [];
    const payoutPromises = [];

    for (const [uid, p] of Array.from(table.players.entries())) {
        const playerResult = p.result;
        let playerPayout = 0;
        let playerNet = 0; // 紀錄實際盈虧 (顯示用)

        // 比較閒家與莊家大小
        const cmp = compareHands(playerResult, dealerResult);

        if (cmp > 0) {
            const winAmount = p.bet * p.result.multiplier;
            playerPayout = p.bet + winAmount; 
            playerNet = winAmount;
            p.resultStr = '🎉 贏 (+' + winAmount.toLocaleString() + ')';
            p.color = flexUtils.COLORS.WIN; 
        } else if (cmp < 0) {
            // 莊家贏，閒家輸掉 莊家牌型倍數 * 本金
            // 下注時已經扣了 1倍 本金，所以還要再額外扣 (multiplier - 1) 倍
            const loseAmount = p.bet * dealerResult.multiplier;
            const extraPenalty = loseAmount - p.bet;
            
            if (extraPenalty > 0) {
                // 強制扣款 (允許負債)
                extraPenalties.push(economyHandler.consumeCoin(groupId, uid, extraPenalty, true));
            }
            
            playerPayout = 0;
            playerNet = -loseAmount;
            p.resultStr = '💸 輸 (' + playerNet.toLocaleString() + ')';
            p.color = '#D32F2F';
        } else {
            // 平手 (極小機率)
            playerPayout = p.bet;
            playerNet = 0;
            p.resultStr = '🤝 平手';
            p.color = flexUtils.COLORS.SECONDARY;
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
    
    // 同時等待所有扣款與發放完成
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

    // 發送最終結算 Flex
    if (replyToken) {
        await sendTableFlex(replyToken, table, titleMsg, bustMsg ? [bustMsg] : []);
    }

    clearTimeout(table.timeout);
    activeTables.delete(groupId); 
}
// 渲染 Flex
async function sendTableFlex(replyToken, table, altText, extraMessages = []) {
    const contents = [
        flexUtils.createText({ text: '🐮 哭霸娛樂城 - 多人妞妞', size: 'lg', weight: 'bold', color: '#8D6E63', align: 'center', margin: 'md', adjustMode: 'shrink-to-fit' })
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
    
    if (table.status === 'closed') {
        dealerCardsStr = renderHand(table.dealerHand);
        dealerScoreStr = `${table.dealerResult.type} (x${table.dealerResult.multiplier})`;
        
        const netStr = table.dealerNetProfit >= 0 ? `+${table.dealerNetProfit.toLocaleString()}` : `${table.dealerNetProfit.toLocaleString()}`;
        
    }

    contents.push(
        flexUtils.createText({ text: `🏦 莊家: ${table.dealerName}`, size: 'md', weight: 'bold', color: flexUtils.COLORS.TEXT_MAIN, margin: 'md' }),
        flexUtils.createText({ text: dealerCardsStr, size: 'lg', weight: 'bold', color: flexUtils.COLORS.PRIMARY, margin: 'sm' })
    );

    if (table.status === 'closed') {
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

    // 閒家區
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
                pScoreStr = `${p.result.type} (x${p.result.multiplier})`;
            }

            contents.push(flexUtils.createBox('horizontal', [
                flexUtils.createText({ text: `👤 ${p.name}`, wrap: true, size: 'sm', weight: 'bold', color: flexUtils.COLORS.TEXT_MAIN, flex: 2 }),
                flexUtils.createText({ text: `押 ${p.bet.toLocaleString()}`, size: 'xs', color: flexUtils.COLORS.SECONDARY, flex: 1, align: 'end', adjustMode: 'shrink-to-fit' })
            ], { margin: 'md', alignItems: 'center' }));

            if (table.status === 'closed') {
                contents.push(flexUtils.createText({ text: pStatus, size: 'md', color: flexUtils.COLORS.TEXT_MAIN, margin: 'xs' }));
                contents.push(flexUtils.createText({ text: pScoreStr, size: 'xs', color: flexUtils.COLORS.TEXT_SUB, margin: 'xs' }));
                
                contents.push(flexUtils.createText({ text: `${p.resultStr}`, size: 'sm', weight: 'bold', color: p.color, margin: 'xs' }));
                if (p.curseStr) contents.push(flexUtils.createText({ text: p.curseStr, size: 'xs', weight: 'bold', color: '#FF1744', margin: 'xs' }));
                if (p.finalBalance !== undefined) {
                    contents.push(flexUtils.createText({ text: `餘額: ${p.finalBalance.toLocaleString()}`, size: 'xs', color: flexUtils.COLORS.TEXT_MUTED, margin: 'xs' }));
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

    
    const quickReply = require('../utils/multi_quickReply').getQuickReply(table, '牛牛');
    if (quickReply) {
        messages[messages.length - 1].quickReply = quickReply;
    }

    if (messages.length <= 5) {
        await lineUtils.replyToLine(replyToken, messages).catch(console.error);
    } else {
        await lineUtils.replyToLine(replyToken, messages.slice(0, 5)).catch(console.error);
        const lineUtilsMod = require('../utils/line');
        lineUtilsMod.addPendingMessage(table.groupId, messages.slice(5));
    }
}

module.exports = {
    getActiveTable,
    openTable,
    closeTable,
    placeBet,
    dealCards
};
