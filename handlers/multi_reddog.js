const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const economyHandler = require('./economy');
const atonementHandler = require('./atonement');
const persistenceService = require('../services/multiplayerPersistenceService');
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

// 撲克牌花色與點數
const SUITS = ['♠️', '♥️', '♦️', '♣️'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// 取得牌的點數大小 (1-13)
function getRankValue(rank) {
    if (rank === 'A') return 1;
    if (rank === 'K') return 13;
    if (rank === 'Q') return 12;
    if (rank === 'J') return 11;
    return parseInt(rank, 10);
}

// 建立一副新牌並洗牌
function createDeck() {
    let deck = [];
    for (let suit of SUITS) {
        for (let rank of RANKS) {
            deck.push({ suit, rank, value: getRankValue(rank) });
        }
    }
    // 洗牌 (Fisher-Yates)
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}



/**
 * 1. 莊家開桌
 */
async function openTable(replyToken, groupId, userId, amountStr) {
    const uidForCheck = userId;
    if (await atonementHandler.checkDevilContract(uidForCheck)) {
        const lineUtils = require('../utils/line');
        await lineUtils.replyText(replyToken, '❌ 惡魔契約期間，您無法擔任莊家！');
        return;
    }
    if (activeTables.has(groupId)) {
        await lineUtils.replyText(replyToken, '❌ 目前群組已經有一桌正在進行中，請等這局結束！');
        return;
    }
    
    activeTables.set(groupId, 'pending');

    const potAmount = parseInt(amountStr, 10);
    if (isNaN(potAmount) || potAmount <= 0) {
        activeTables.delete(groupId);
        await lineUtils.replyText(replyToken, '❌ 射龍門底池金額無效（請輸入大於 0 的正整數金額，例如：開桌射龍門 10000000）。');
        return;
    }

    // 檢查欠債 (莊家必須確認本金)
    const userDoc = await db.collection('economy_users').doc(userId).get();
    const balance = userDoc.exists ? (userDoc.data().kuCoin || 0) : 0;
    if (balance < 0) {
        activeTables.delete(groupId);
        await lineUtils.replyText(replyToken, '❌ 窮鬼欠債還想開賭桌？先去賺錢還債吧！');
        return;
    }

    // 扣除莊家底池
    const consumeResult = await economyHandler.consumeCoin(groupId, userId, potAmount, true);
    if (!consumeResult.success) {
        activeTables.delete(groupId);
        await lineUtils.replyText(replyToken, `❌ 開局失敗：${consumeResult.message}`);
        return;
    }

    const userName = consumeResult.name || '莊家';
    persistenceService.recordBet(groupId, '射龍門', userId, potAmount, userName).catch(e => console.error(e));

    const dealerName = consumeResult.name || '莊家';

    // 增加通緝值
    const dealerWanted = await economyHandler.addWantedLevel(userId);
    const participantWantedLevels = new Map();
    participantWantedLevels.set(userId, dealerWanted);

    // 建立牌局狀態
    const tableState = {
        status: 'waiting', // waiting, playing
        dealer: { userId, name: dealerName },
        potAmount: potAmount,
        initialPot: potAmount,
        players: [],
        deck: [],
        currentPlayerIndex: -1,
        currentCards: [],
        participantWantedLevels,
        timer: null
    };

    activeTables.set(groupId, tableState);

    // 設定 1 分鐘後自動靜默取消
    tableState.timer = setTimeout(async () => {
        if (activeTables.has(groupId)) {
            const table = activeTables.get(groupId);
            if (table.status === 'waiting') {
                // 退還底池
                await economyHandler.addCoinQuietly(groupId, table.dealer.userId, table.potAmount);
                activeTables.delete(groupId);
                const notice = `⏳ 射龍門賭桌因逾時未開始，已自動取消。\n💰 已退還底池 ${table.potAmount.toLocaleString()} 哭幣給莊家 ${table.dealer.name}。`;
                lineUtils.addPendingMessage(groupId, [{ type: 'text', text: notice }]);
            }
        }
    }, 60000);

    const bubble = flexUtils.createBubble({
        size: 'kilo',
        body: flexUtils.createBox('vertical', [
            flexUtils.createText({ text: '🐉 哭霸娛樂城 - 多人射龍門', size: 'lg', weight: 'bold', color: '#FF4500', align: 'center', margin: 'md', adjustMode: 'shrink-to-fit' }),
            flexUtils.createText({ text: `🚨 賭桌總通緝機率: ${(dealerWanted * 100).toFixed(1)}%`, size: 'xs', color: '#FF5252', align: 'center', margin: 'xs', weight: 'bold' }),
            flexUtils.createSeparator('md'),
            flexUtils.createText({ text: `莊家：${dealerName}`, size: 'md', color: flexUtils.COLORS.TEXT_MAIN, margin: 'md' }),
            flexUtils.createText({ text: `目前底池：${potAmount.toLocaleString()} 💰`, size: 'lg', weight: 'bold', color: flexUtils.COLORS.PRIMARY, margin: 'md' }),
            flexUtils.createText({ text: '輸入「加」或「+1」一起來撞柱！\n閒家最少需 2 人。莊家請輸入「開始」或「開」。', size: 'sm', color: flexUtils.COLORS.TEXT_SUB, wrap: true, margin: 'lg' })
        ], { backgroundColor: flexUtils.COLORS.BG_CARD, paddingAll: 'xl' })
    });

    const quickReply = require('../utils/multi_quickReply').getQuickReply(tableState, '射龍門');
    await lineUtils.replyFlex(replyToken, '射龍門開桌', bubble, [], quickReply);
}

/**
 * 2. 閒家加入
 */
async function joinTable(replyToken, groupId, userId) {
    const table = activeTables.get(groupId);
    if (!table || table.status !== 'waiting') {
        await lineUtils.replyText(replyToken, '⚠️ 目前沒有開放加入的射龍門賭桌。');
        return;
    }

    if (table.dealer.userId === userId) {
        await lineUtils.replyText(replyToken, '⚠️ 你是莊家，不能加入自己開的局。');
        return;
    }

    if (table.players.find(p => p.userId === userId)) {
        await lineUtils.replyText(replyToken, '⚠️ 你已經在牌桌上了！');
        return;
    }

    // 檢查玩家餘額是否 > 0 (避免無本瞎玩)
    const userDoc = await db.collection('economy_users').doc(userId).get();
    const balance = userDoc.exists ? (userDoc.data().kuCoin || 0) : 0;
    const aidBalance = userDoc.exists ? (userDoc.data().emergencyAid || 0) : 0;
    if (balance <= 0 && aidBalance <= 0) {
        await lineUtils.replyText(replyToken, '❌ 你的餘額不足，無法加入牌桌。（提示：可輸入「急難救助」）');
        return;
    }

    const memberName = await lineUtils.getGroupMemberName(groupId, userId) || '閒家';
    table.players.push({ userId, name: memberName });

    // 增加通緝值
    const newWanted = await economyHandler.addWantedLevel(userId);
    table.participantWantedLevels.set(userId, newWanted);

    await lineUtils.replyText(replyToken, `✅ ${memberName} 加入了射龍門！目前人數：${table.players.length} 人`);
}

/**
 * 3. 開始遊戲
 */
async function startTable(replyToken, groupId, userId) {
    const table = activeTables.get(groupId);
    if (!table) return;

    if (table.dealer.userId !== userId) {
        await lineUtils.replyText(replyToken, '⚠️ 只有莊家才能開始遊戲！');
        return;
    }

    if (table.status !== 'waiting') {
        await lineUtils.replyText(replyToken, '⚠️ 遊戲已經開始了！');
        return;
    }

    if (table.players.length < 2) {
        await lineUtils.replyText(replyToken, '⚠️ 至少需要 2 名閒家才能開始遊戲！');
        return;
    }

    // 清除開局超時 Timer
    if (table.timer) clearTimeout(table.timer);

    table.status = 'playing';
    table.deck = createDeck();
    
    // 隨機打亂玩家順序
    for (let i = table.players.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [table.players[i], table.players[j]] = [table.players[j], table.players[i]];
    }

    table.currentPlayerIndex = 0;
    table.isProcessing = false;

    const orderText = table.players.map((p, i) => `${i + 1}. ${p.name}`).join('\n');
    const startMsg = { type: 'text', text: `🎲 遊戲開始！玩家順序：\n${orderText}\n\n馬上進入第一回合！` };

    const { events, endMessages } = await advanceTurn(groupId, []);
    const turnMsgs = buildTurnMessages(events, table);
    
    const finalMessages = [startMsg, ...turnMsgs, ...endMessages];
    await sendCombinedReply(replyToken, groupId, finalMessages);
}

async function sendCombinedReply(replyToken, groupId, messages) {
    if (!messages || messages.length === 0) return;
    
    const table = activeTables.get(groupId);
    const quickReply = require('../utils/multi_quickReply').getQuickReply(table, '射龍門');
    if (quickReply) messages[messages.length - 1].quickReply = quickReply;

    if (messages.length <= 5) {
        await lineUtils.replyToLine(replyToken, messages).catch(console.error);
    } else {
        await lineUtils.replyToLine(replyToken, messages.slice(0, 5)).catch(console.error);
        lineUtils.addPendingMessage(groupId, messages.slice(5));
    }
}

function resetTimeout(groupId) {
    const table = activeTables.get(groupId);
    if (!table) return;
    if (table.timer) clearTimeout(table.timer);
    const expectedIndex = table.currentPlayerIndex;
    table.timer = setTimeout(async () => {
        const t = activeTables.get(groupId);
        if (t && t.currentPlayerIndex === expectedIndex && !t.isProcessing) {
            t.isProcessing = true;
            try {
                const cpName = t.players[t.currentPlayerIndex].name;
                t.currentPlayerIndex++;
                const { events, endMessages } = await advanceTurn(groupId, []);
                const nextMsgs = buildTurnMessages(events, t);
                const toSend = [{ type: 'text', text: `⏳ ${cpName} 逾時未發言，自動放棄本回合。` }, ...nextMsgs, ...endMessages];
                lineUtils.addPendingMessage(groupId, toSend);
            } finally {
                t.isProcessing = false;
            }
        }
    }, 60000);
}

/**
 * 推進狀態機，處理所有的連號跳過，直到找到下一個真正需要動作的玩家或遊戲結束。
 */
async function advanceTurn(groupId, events = []) {
    const table = activeTables.get(groupId);
    if (!table || table.status !== 'playing') {
        return { events, endMessages: [] };
    }

    if (table.currentPlayerIndex >= table.players.length) {
        // 所有人輪完了
        const endMsgs = await endGame(groupId, 'complete');
        return { events, endMessages: endMsgs };
    }

    const currentPlayer = table.players[table.currentPlayerIndex];

    // 發兩張牌
    if (table.deck.length < 3) table.deck = createDeck();
    const card1 = table.deck.pop();
    const card2 = table.deck.pop();
    table.currentCards = [card1, card2].sort((a, b) => a.value - b.value);

    const gap = table.currentCards[1].value - table.currentCards[0].value;
    
    if (gap === 1) {
        // 連號，自動略過
        events.push({
            type: 'skip_gap1',
            player: currentPlayer,
            cards: table.currentCards
        });
        table.currentPlayerIndex++;
        return await advanceTurn(groupId, events);
    } else {
        events.push({
            type: 'turn_start',
            player: currentPlayer,
            cards: table.currentCards,
            gap: gap
        });
        resetTimeout(groupId);
        return { events, endMessages: [] };
    }
}

/**
 * 根據事件清單產生最精簡的 LINE Messages
 */
function buildTurnMessages(events, table) {
    let messages = [];
    let skipTexts = [];

    for (const event of events) {
        if (event.type === 'skip_gap1') {
            const c1 = `${event.cards[0].suit}${event.cards[0].rank}`;
            const c2 = `${event.cards[1].suit}${event.cards[1].rank}`;
            skipTexts.push(`⏩ ${event.player.name} (${c1}-${c2}) 連號自動略過`);
        } else if (event.type === 'turn_start') {
            if (skipTexts.length > 0) {
                messages.push({ type: 'text', text: skipTexts.join('\n') });
                skipTexts = [];
            }
            
            let instructionText = '';
            if (event.gap === 0) {
                instructionText = '【牌型：同點】\n請輸入「猜大 [金額]」或「猜小 [金額]」或「不射」。\n💡 捷徑：輸入「+金額/歐印」猜大、「-金額」猜小、「過/停/-」不射';
            } else {
                instructionText = `【牌型：可射】\n目前底池：${table.potAmount.toLocaleString()} 💰\n請輸入「射 [金額]」或「不射」。\n💡 捷徑：輸入「+金額/歐印」射門、「過/停/-」不射`;
            }

            let totalWanted = 0;
            if (table.participantWantedLevels) {
                totalWanted = Array.from(table.participantWantedLevels.values()).reduce((a, b) => a + b, 0);
            }

            const contents = [
                flexUtils.createText({ text: '🃏 你的回合', size: 'xl', weight: 'bold', color: flexUtils.COLORS.PRIMARY, align: 'center', margin: 'md' }),
                flexUtils.createText({ text: `🚨 賭桌總通緝機率: ${(totalWanted * 100).toFixed(1)}%`, size: 'xs', color: '#FF5252', align: 'center', margin: 'xs', weight: 'bold' }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `玩家：${event.player.name}`, size: 'lg', color: flexUtils.COLORS.TEXT_MAIN, align: 'center', margin: 'md' }),
                flexUtils.createText({ text: `${event.cards[0].suit}${event.cards[0].rank}   -   ${event.cards[1].suit}${event.cards[1].rank}`, size: '3xl', weight: 'bold', color: flexUtils.COLORS.PRIMARY, align: 'center', margin: 'lg' }),
                flexUtils.createText({ text: instructionText, size: 'sm', color: flexUtils.COLORS.TEXT_SUB, wrap: true, align: 'center', margin: 'md' })
            ];

            const bubble = flexUtils.createBubble({
                size: 'mega',
                body: flexUtils.createBox('vertical', contents, { backgroundColor: flexUtils.COLORS.BG_CARD, paddingAll: 'xl' })
            });

            messages.push({ type: 'text', text: `輪到 ${event.player.name} 了！你有 1 分鐘的時間決定。` });
            messages.push({ type: 'flex', altText: '射龍門回合', contents: bubble });
        }
    }

    if (skipTexts.length > 0) {
        messages.push({ type: 'text', text: skipTexts.join('\n') });
    }

    return messages;
}

/**
 * 玩家動作處理 (射、不射、猜大、猜小)
 */
async function handlePlayerAction(replyToken, groupId, userId, actionStr, amountStr) {
    const table = activeTables.get(groupId);
    if (!table || table.status !== 'playing') return false; // not handled

    const currentPlayer = table.players[table.currentPlayerIndex];
    if (currentPlayer.userId !== userId) {
        const isPlayer = table.players.some(p => p.userId === userId);
        if (isPlayer) {
            await lineUtils.replyText(replyToken, `❌ 還沒輪到你啦！現在是 ${currentPlayer.name} 的回合。`);
            return true;
        }
        return false;
    }

    if (table.isProcessing) {
        return true; // 忽略連點
    }
    table.isProcessing = true;

    try {
        // 清除超時
        if (table.timer) clearTimeout(table.timer);

        if (actionStr === '不射' || actionStr === 'pass') {
            table.currentPlayerIndex++;
            const { events, endMessages } = await advanceTurn(groupId, []);
            const nextMsgs = buildTurnMessages(events, table);
            const finalMessages = [{ type: 'text', text: `🙅 ${currentPlayer.name} 選擇了不射 (Pass)。` }, ...nextMsgs, ...endMessages];
            await sendCombinedReply(replyToken, groupId, finalMessages);
            return true;
        }

        const betAmount = parseInt(amountStr, 10);
        if (isNaN(betAmount) || betAmount <= 0) {
            resetTimeout(groupId);
            await lineUtils.replyText(replyToken, `❌ 射門金額無效（請輸入大於 0 的正整數金額，例如：射 1000000）。`);
            return true;
        }

        const maxBet = table.potAmount;
        if (betAmount > maxBet) {
            resetTimeout(groupId);
            await lineUtils.replyText(replyToken, `❌ 下注金額不能超過目前底池（${maxBet.toLocaleString()}）。`);
            return true;
        }

        // 扣款
        const consumeResult = await economyHandler.consumeCoin(groupId, userId, betAmount, true);
        if (!consumeResult.success) {
            resetTimeout(groupId);
            await lineUtils.replyText(replyToken, `❌ 下注失敗：${consumeResult.message}`);
            return true;
        }
        
        persistenceService.recordBet(groupId, '射龍門', userId, betAmount, consumeResult.name || '玩家').catch(e => console.error(e));

        // 發第三張牌
        if (table.deck.length < 1) table.deck = createDeck();
        const card3 = table.deck.pop();
        const c1 = table.currentCards[0].value;
        const c2 = table.currentCards[1].value;
        const c3 = card3.value;

        let isWin = false;
        let hitPost = false;
        let resultMsg = '';
        let lostAmount = betAmount;

        // 判斷勝負
        if (c1 === c2) {
            if (c3 === c1) {
                hitPost = true;
                isWin = false;
                lostAmount = betAmount * 2;
                resultMsg = `💥 慘遭撞柱 (出三條)！必須賠償雙倍：${lostAmount.toLocaleString()} 💰`;
            } else {
                if (actionStr === '猜大' && c3 > c1) isWin = true;
                else if (actionStr === '猜小' && c3 < c1) isWin = true;
                
                resultMsg = isWin ? `🎉 恭喜猜中！` : `💸 猜錯了...`;
            }
        } else {
            if (c3 === c1 || c3 === c2) {
                hitPost = true;
                isWin = false;
                lostAmount = betAmount * 2;
                resultMsg = `💥 慘遭撞柱！必須賠償雙倍：${lostAmount.toLocaleString()} 💰`;
            } else if (c3 > c1 && c3 < c2) {
                isWin = true;
                resultMsg = `⚽ 漂亮進球！獲得底池獎金 ${betAmount.toLocaleString()} 💰`;
            } else {
                isWin = false;
                resultMsg = `❌ 射偏了...`;
            }
        }

        // 處理底池與玩家餘額
        let finalBalance = consumeResult.newBalance;
        
        if (isWin) {
            table.potAmount -= betAmount;
            
            let finalProfit = betAmount;
            const taxResult = await atonementHandler.processDevilTax(betAmount, userId);
            if (taxResult.hasContract && taxResult.taxAmount > 0) {
                finalProfit = taxResult.finalProfit;
                resultMsg += `\n😈 惡魔契約發動：強制徵收 90% 獲利 (-${taxResult.taxAmount.toLocaleString()})`;
            }
            
            finalBalance = await economyHandler.addCoinQuietly(groupId, userId, betAmount + finalProfit);
        } else {
            table.potAmount += lostAmount;
            if (hitPost) {
                // 已經扣了一次 betAmount，撞柱要再扣一次
                const extraDeduct = await economyHandler.consumeCoin(groupId, userId, betAmount, true);
                if (!extraDeduct.success) {
                    await economyHandler.addCoinQuietly(groupId, userId, -betAmount);
                } else {
                    persistenceService.recordBet(groupId, '射龍門', userId, betAmount, currentPlayer.name).catch(e => console.error(e));
                }
                const userDoc = await db.collection('economy_users').doc(userId).get();
                finalBalance = userDoc.exists ? (userDoc.data().kuCoin || 0) : 0;
            }
        }

        const contents = [
            flexUtils.createText({ text: '🃏 開牌結果', size: 'xl', weight: 'bold', color: flexUtils.COLORS.PRIMARY, align: 'center', margin: 'md' }),
            flexUtils.createSeparator('md'),
            flexUtils.createText({ text: `第三張牌是：`, size: 'sm', color: flexUtils.COLORS.TEXT_SUB, align: 'center', margin: 'md' }),
            flexUtils.createText({ text: `${card3.suit}${card3.rank}`, size: '4xl', weight: 'bold', color: '#FF4500', align: 'center', margin: 'sm' }),
            flexUtils.createText({ text: resultMsg, size: 'lg', weight: 'bold', color: isWin ? flexUtils.COLORS.WIN : '#D32F2F', align: 'center', margin: 'lg', wrap: true }),
            flexUtils.createText({ text: `目前底池：${table.potAmount.toLocaleString()} 💰`, size: 'md', weight: 'bold', color: flexUtils.COLORS.PRIMARY, align: 'center', margin: 'md' }),
            flexUtils.createText({ text: `目前餘額: ${finalBalance.toLocaleString()}`, size: 'xs', color: flexUtils.COLORS.TEXT_MUTED, align: 'center', margin: 'sm' })
        ];

        const bubble = flexUtils.createBubble({
            size: 'mega',
            body: flexUtils.createBox('vertical', contents, { backgroundColor: flexUtils.COLORS.BG_CARD, paddingAll: 'xl' })
        });

        const resultMsgObj = { type: 'flex', altText: `射龍門開牌：${card3.suit}${card3.rank}`, contents: bubble };
        
        let nextMsgs = [];
        let endMsgs = [];
        if (table.potAmount <= 0) {
            endMsgs = await endGame(groupId, 'bankrupt');
        } else {
            table.currentPlayerIndex++;
            const turnResult = await advanceTurn(groupId, []);
            nextMsgs = buildTurnMessages(turnResult.events, table);
            endMsgs = turnResult.endMessages;
        }

        const finalMessages = [resultMsgObj, ...nextMsgs, ...endMsgs];
        await sendCombinedReply(replyToken, groupId, finalMessages);
    } finally {
        if (table) table.isProcessing = false;
    }
    return true; // handled
}

/**
 * 遊戲結束結算 (返回訊息陣列)
 */
async function endGame(groupId, reason) {
    const table = activeTables.get(groupId);
    if (!table) return [];

    if (table.timer) clearTimeout(table.timer);
    activeTables.delete(groupId);

    if (reason === 'bankrupt') {
        const contents = [
            flexUtils.createText({ text: '💥 慘絕人寰', size: '2xl', weight: 'bold', color: '#FF4500', align: 'center', margin: 'md' }),
            flexUtils.createSeparator('md'),
            flexUtils.createText({ text: '底池已經被閒家徹底清空！', size: 'md', color: flexUtils.COLORS.TEXT_MAIN, align: 'center', margin: 'md' }),
            flexUtils.createText({ text: `莊家 ${table.dealer.name} 只能躲在角落哭泣。😭`, size: 'sm', color: flexUtils.COLORS.TEXT_SUB, align: 'center', margin: 'sm', wrap: true }),
            flexUtils.createText({ text: `結算: -${table.initialPot.toLocaleString()}`, size: 'md', weight: 'bold', color: '#D32F2F', align: 'center', margin: 'md' }),
            flexUtils.createText({ text: '遊戲結束！', size: 'lg', weight: 'bold', color: flexUtils.COLORS.PRIMARY, align: 'center', margin: 'lg' })
        ];
        const bubble = flexUtils.createBubble({
            size: 'mega',
            body: flexUtils.createBox('vertical', contents, { backgroundColor: flexUtils.COLORS.BG_CARD, paddingAll: 'xl' })
        });
        const flexMsg = { type: 'flex', altText: '射龍門結算：莊家破產', contents: bubble };

        // 觸發公然聚賭事件
        const allParticipants = [table.dealer.userId, ...table.players.map(p => p.userId)];
        const bustMsg = await economyHandler.triggerPublicGamblingEvent(groupId, allParticipants, null, true, table.dealer.userId);

        const msgs = [flexMsg];
        if (bustMsg) msgs.push(bustMsg);
        return msgs;
    } else {
        // 所有人輪完，莊家收走剩餘底池
        const finalPot = table.potAmount;
        const initialPot = table.initialPot || finalPot;
        let dealerNetProfit = finalPot - initialPot;
        let taxAmount = 0;

        if (dealerNetProfit > 0) {
            const authUtils = require('../utils/auth');
            if (!authUtils.isSuperAdmin(table.dealer.userId)) {
                taxAmount = Math.floor(dealerNetProfit * 0.05);
                dealerNetProfit -= taxAmount;
            }
        }

        const payout = initialPot + dealerNetProfit;
        const finalBalance = await economyHandler.addCoinQuietly(groupId, table.dealer.userId, payout);
        
        const isWin = dealerNetProfit >= 0;
        const profitColor = isWin ? flexUtils.COLORS.WIN : '#D32F2F';

        const contents = [
            flexUtils.createText({ text: '🏁 遊戲結束', size: '2xl', weight: 'bold', color: flexUtils.COLORS.PRIMARY, align: 'center', margin: 'md' }),
            flexUtils.createSeparator('md'),
            flexUtils.createText({ text: `所有閒家皆已完成回合`, size: 'xs', color: flexUtils.COLORS.TEXT_SUB, align: 'center', margin: 'sm' }),
            flexUtils.createText({ text: `莊家：${table.dealer.name}`, size: 'lg', color: flexUtils.COLORS.TEXT_MAIN, align: 'center', margin: 'md' }),
            flexUtils.createText({ text: `收回底池：${payout.toLocaleString()} 💰`, size: 'xl', weight: 'bold', color: flexUtils.COLORS.PRIMARY, align: 'center', margin: 'md' })
        ];

        let detailText = `淨結算: ${dealerNetProfit >= 0 ? '+' : ''}${dealerNetProfit.toLocaleString()}`;
        if (taxAmount > 0) {
            detailText = `總獲利: +${(dealerNetProfit + taxAmount).toLocaleString()}\n(系統抽水 5%: -${taxAmount.toLocaleString()})\n\n淨結算: +${dealerNetProfit.toLocaleString()}`;
        }
        contents.push(flexUtils.createText({ text: detailText, size: 'md', color: profitColor, align: 'center', margin: 'md', wrap: true }));
        contents.push(flexUtils.createText({ text: `目前餘額: ${finalBalance.toLocaleString()}`, size: 'xs', color: flexUtils.COLORS.TEXT_MUTED, align: 'center', margin: 'sm' }));

        const bubble = flexUtils.createBubble({
            size: 'mega',
            body: flexUtils.createBox('vertical', contents, { backgroundColor: flexUtils.COLORS.BG_CARD, paddingAll: 'xl' })
        });
        const flexMsg = { type: 'flex', altText: `射龍門結算：莊家收回 ${payout.toLocaleString()} 哭幣`, contents: bubble };

        // 觸發公然聚賭事件
        const allParticipants = [table.dealer.userId, ...table.players.map(p => p.userId)];
        const bustMsg = await economyHandler.triggerPublicGamblingEvent(groupId, allParticipants, null, true, table.dealer.userId);

        const msgs = [flexMsg];
        if (bustMsg) msgs.push(bustMsg);
        return msgs;
    }
}

function getActiveTable(groupId) {
    return activeTables.get(groupId);
}

module.exports = {
    openTable,
    joinTable,
    startTable,
    handlePlayerAction,
    getActiveTable
};
