/**
 * 多人十八啦 (香腸攤擲骰子) 功能模組
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

// === 擲骰邏輯 ===

function rollShibala() {
    while (true) {
        let dice = [
            Math.floor(Math.random() * 6) + 1,
            Math.floor(Math.random() * 6) + 1,
            Math.floor(Math.random() * 6) + 1,
            Math.floor(Math.random() * 6) + 1
        ];
        
        // 由大到小排序，方便判斷
        dice.sort((a, b) => b - a); 
        
        // 1. 一色 (豹子): 4 顆相同
        if (dice[0] === dice[3]) {
            return {
                dice,
                type: '一色 (豹子)',
                points: dice[0],
                score: 1000 + dice[0], // 1001 ~ 1006
                multiplier: 3
            };
        }
        
        // 2. 三顆相同: 無點，重擲
        if ((dice[0] === dice[2]) || (dice[1] === dice[3])) {
            continue; 
        }
        
        // 3. 兩對 (兩對相同): 取較大的那對作為點數
        if (dice[0] === dice[1] && dice[2] === dice[3]) {
            let pts = dice[0] + dice[1];
            let is18 = pts === 12;
            return {
                dice,
                type: is18 ? '🔥 十八啦' : `${pts} 點`,
                points: pts,
                score: pts, // 4 ~ 12
                multiplier: is18 ? 2 : 1
            };
        }
        
        // 4. 一對 (兩顆相同，另兩顆不同): 取不同的兩顆相加
        let pts = -1;
        if (dice[0] === dice[1]) pts = dice[2] + dice[3];
        else if (dice[1] === dice[2]) pts = dice[0] + dice[3];
        else if (dice[2] === dice[3]) pts = dice[0] + dice[1];
        
        if (pts !== -1) {
            let isBG = pts === 3;
            let type = isBG ? '💩 逼機' : `${pts} 點`;
            return {
                dice,
                type,
                points: pts,
                score: pts, // 3 ~ 11
                multiplier: 1 
            };
        }
        
        // 5. 四顆皆不同: 無點，重擲
        continue;
    }
}

function getDiceEmoji(num) {
    const emojis = ['🎲', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    return emojis[num] || '🎲';
}

function renderDice(dice) {
    return dice.map(d => getDiceEmoji(d)).join(' ');
}

// 取得目前的牌桌
function getActiveTable(groupId) {
    return activeTables.get(groupId);
}

// === 操作邏輯 ===

// 1. 開桌十八啦
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
        await lineUtils.replyText(replyToken, '❌ 目前群組內已經有一桌十八啦正在進行中！');
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
    const dealerWanted = await economyHandler.addWantedLevel(userId);
    const participantWantedLevels = new Map();
    participantWantedLevels.set(userId, dealerWanted);

    const table = {
        groupId,
        dealerId: userId,
        dealerName: userName,
        dealerResult: null,
        dealerStatus: 'waiting', // waiting, rolled
        status: 'waiting', // waiting, closed
        players: new Map(), // key: userId, value: { name, bet, result, status: 'playing'|'rolled', score, isWinner }
        participantWantedLevels,
        timeout: setTimeout(() => autoCloseTable(groupId), 1 * 60 * 1000)
    };

    activeTables.set(groupId, table);
    await sendTableFlex(replyToken, table, '🎲 十八啦牌桌已建立！大家快來下注！(1分鐘內請擲骰)');
}

async function autoCloseTable(groupId) {
    const table = activeTables.get(groupId);
    if (!table || table.status !== 'waiting') return;

    activeTables.delete(groupId);

    const refundedPlayers = [];
    const refundPromises = [];
    for (const [uid, p] of table.players.entries()) {
        refundPromises.push(economyHandler.addCoinFast(uid, p.bet));
        refundedPlayers.push({ name: p.name, bet: p.bet });
    }
    await Promise.all(refundPromises);

    let msg = `⏱️ ${table.dealerName} 開的十八啦超過 1 分鐘未擲骰，自動解散。`;
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

    if (!table) return;
    if (table.status !== 'waiting') {
        await lineUtils.replyText(replyToken, '❌ 已經擲骰結算了，無法再下注！');
        return;
    }
    if (table.dealerId === userId) {
        await lineUtils.replyText(replyToken, '❌ 莊家不能下注！');
        return;
    }
    if (table.players.has(userId)) {
        await lineUtils.replyText(replyToken, '❌ 您已經下注過了！請等莊家擲骰。');
        return;
    }

    const betAmount = parseInt(amountStr, 10);
    if (isNaN(betAmount) || betAmount <= 0) {
        await lineUtils.replyText(replyToken, '❌ 十八啦下注金額無效（請輸入大於 0 的正整數金額，例如：下注 1000000）。');
        return;
    }

    const consumeResult = await economyHandler.consumeCoin(groupId, userId, betAmount, true);
    if (!consumeResult.success) {
        await lineUtils.replyText(replyToken, `❌ 下注失敗：${consumeResult.message}`);
        return;
    }

    const userName = consumeResult.name || '玩家';
    persistenceService.recordBet(groupId, '十八仔', userId, betAmount, userName).catch(e => console.error(e));
    const newWanted = await economyHandler.addWantedLevel(userId);
    table.participantWantedLevels.set(userId, newWanted);

    table.players.set(userId, {
        name: userName,
        bet: betAmount,
        result: null,
        playerNet: 0,
        resultStr: '',
        color: ''
    });

    clearTimeout(table.timeout);
    table.timeout = setTimeout(() => autoCloseTable(groupId), 1 * 60 * 1000);

    await sendTableFlex(replyToken, table, `${userName} 下注了 ${betAmount.toLocaleString()} 哭幣！`);
}

// 4. 一鍵擲骰結算
async function dealCards(replyToken, context) {
    const { groupId, userId } = context;
    const table = activeTables.get(groupId);

    if (!table || table.status !== 'waiting') return;
    if (table.dealerId !== userId) {
        // await lineUtils.replyText(replyToken, '❌ 只有莊家可以擲骰開獎！');
        return;
    }
    if (table.players.size === 0) {
        await lineUtils.replyText(replyToken, '❌ 牌桌上還沒有人下注！');
        return;
    }

    clearTimeout(table.timeout);
    table.status = 'closed';

    // 莊閒全部瞬間自動擲骰
    table.dealerResult = rollShibala();
    
    // 莊家作弊防呆機制：如果是老闆當莊，且抽到逼機，有 15% 機率暗中重擲
    const isDealerAdmin = await authUtils.isAdmin(table.dealerId);
    if (isDealerAdmin && table.dealerResult.score === 3 && Math.random() < 0.15) {
        table.dealerResult = rollShibala(); // 偷偷再丟一次
    }

    for (const p of table.players.values()) {
        p.result = rollShibala();
    }

    await finishGameAndSettle(replyToken, table, '🎲 擲骰完畢！立刻結算！');
}

// 結算
async function finishGameAndSettle(replyToken, table, titleMsg) {
    const { groupId, dealerId, dealerResult } = table;
    let dealerNetProfit = 0;

    const payoutPromises = [];

    for (const [uid, p] of Array.from(table.players.entries())) {
        const playerResult = p.result;
        let playerPayout = 0;
        let playerNet = 0;

        // 莊吃平手：如果莊家 >= 閒家，莊家贏
        if (dealerResult.score >= playerResult.score) {
            playerPayout = 0;
            playerNet = -p.bet;
            if (dealerResult.score === playerResult.score) {
                p.resultStr = '💸 莊家通吃平手';
            } else {
                p.resultStr = '💸 點數小輸';
            }
            p.color = '#D32F2F';
        } else {
            // 閒家贏
            let multiplier = playerResult.multiplier;
            const winAmount = p.bet * multiplier;
            playerPayout = p.bet + winAmount; 
            playerNet = winAmount;
            
            if (multiplier === 3) p.resultStr = '🎉 一色通殺 (x3)';
            else if (multiplier === 2) p.resultStr = '🎉 十八啦 (x2)';
            else p.resultStr = '🎉 點數大贏 (x1)';
            
            p.color = flexUtils.COLORS.WIN; 
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
        await sendTableFlex(replyToken, table, titleMsg, bustMsg ? [bustMsg] : []);
    }

    clearTimeout(table.timeout);
    activeTables.delete(groupId); 
}

// 渲染 Flex
async function sendTableFlex(replyToken, table, altText, extraMessages = []) {
    const contents = [
        flexUtils.createText({ text: '🎲 哭霸娛樂城 - 多人十八啦', size: 'lg', weight: 'bold', color: flexUtils.COLORS.PRIMARY, align: 'center', margin: 'md', adjustMode: 'shrink-to-fit' })
    ];

    let totalWanted = 0;
    if (table.participantWantedLevels) {
        totalWanted = Array.from(table.participantWantedLevels.values()).reduce((a, b) => a + b, 0);
    }
    contents.push(flexUtils.createText({ text: `🚨 賭桌總通緝機率: ${(totalWanted * 100).toFixed(1)}%`, size: 'xs', color: '#FF5252', align: 'center', margin: 'xs', weight: 'bold' }));
    contents.push(flexUtils.createSeparator('md'));

    let dealerDiceStr = '準備中...';
    let dealerScoreStr = '? 點';
    
    if (table.status === 'closed') {
        dealerDiceStr = renderDice(table.dealerResult.dice);
        dealerScoreStr = `${table.dealerResult.type}`;
    }

    contents.push(
        flexUtils.createText({ text: `🏦 莊家: ${table.dealerName}`, size: 'md', weight: 'bold', color: flexUtils.COLORS.TEXT_MAIN, margin: 'md' }),
        flexUtils.createText({ text: dealerDiceStr, size: '3xl', weight: 'bold', color: flexUtils.COLORS.TEXT_MAIN, margin: 'sm' })
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
                pStatus = renderDice(p.result.dice);
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

    
    const quickReply = require('../utils/multi_quickReply').getQuickReply(table, '十八仔');
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
