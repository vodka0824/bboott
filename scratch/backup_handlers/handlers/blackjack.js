/**
 * 21點 (Blackjack) 功能模組
 */
const flexUtils = require('../utils/flex');
const atonementHandler = require('./atonement');
const { replyFlex, replyText } = require('../utils/line');
const economyHandler = require('./economy');

// In-Memory 儲存進行中的遊戲 (Key: groupId_userId)
const activeGames = new Map();

// 記錄玩家最後遊玩的時間 (Key: userId, Value: timestamp)
const lastPlayTimes = new Map();
const COOLDOWN_MS = 30000; // 30秒冷卻時間

// === 撲克牌邏輯 ===
const SUITS = ['♠️', '♥️', '♦️', '♣️'];
const VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

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

    // 處理 A 的邏輯：如果大於 21 點且有 A，則把 A 當成 1 點 (-10)
    while (score > 21 && aces > 0) {
        score -= 10;
        aces -= 1;
    }

    return score;
}

// 產生牌面文字
function renderHand(hand, hideFirstCard = false) {
    if (hand.length === 0) return '無';
    if (hideFirstCard) {
        const rest = hand.slice(1).map(c => `${c.suit}${c.value}`).join(' ');
        return `🎴 ${rest}`;
    }
    return hand.map(c => `${c.suit}${c.value}`).join(' ');
}

// 清除超時的遊戲
function setGameTimeout(gameKey, groupId, userId, betAmount) {
    return setTimeout(async () => {
        const game = activeGames.get(gameKey);
        if (game) {
            activeGames.delete(gameKey);
            try {
                // 超時沒收賭金，視同玩家棄權
                // 賭金在下注時已扣除，此處無須額外扣款
                console.log(`[Blackjack] Game ${gameKey} timed out. Bet forfeited.`);
            } catch (e) {
                console.error(`[Blackjack] Timeout forfeit failed for ${gameKey}:`, e);
            }
        }
    }, 3 * 60 * 1000); // 3 minutes
}

// === 遊戲操作 ===

async function startGame(replyToken, context, betAmountStr) {
    const userId = context.userId;
    const groupId = context.groupId;
    const gameKey = `${groupId}_${userId}`;

    // 檢查自己是否已經在玩
    for (const key of activeGames.keys()) {
        if (key === gameKey) {
            await replyText(replyToken, '❌ 您還有一局 21 點正在進行中！請先「補牌」或「停牌」。');
            return;
        }
    }

    const betAmount = parseInt(betAmountStr, 10) || 10;
    if (betAmount <= 0) {
        await replyText(replyToken, '❌ 下注金額必須大於 0');
        return;
    }

    // 扣除賭金
    const consumeResult = await economyHandler.consumeCoin(groupId, userId, betAmount, true);
    if (!consumeResult.success) {
        // 扣款失敗，還原冷卻時間
        lastPlayTimes.delete(userId);
        
        const bal = consumeResult.currentBalance || 0;
        const name = consumeResult.name || '玩家';
        const msgs = economyHandler.MOCKING_MESSAGES;
        const mock = msgs[Math.floor(Math.random() * msgs.length)];
        
        const text = `［${mock}］\n您的餘額不足，需要 ${betAmount} ${economyHandler.COIN_NAME}，你身上僅剩 ${bal}\n${name}`;
        await replyText(replyToken, text);
        return;
    }

    const userName = consumeResult.name || '玩家';

    const deck = createDeck();
    const playerHand = [deck.pop(), deck.pop()];
    const dealerHand = [deck.pop(), deck.pop()];

    const playerScore = calculateScore(playerHand);
    const dealerScore = calculateScore(dealerHand);

    // 檢查首發 Blackjack
    const isPlayerBlackjack = playerScore === 21;
    const isDealerBlackjack = dealerScore === 21;

    if (isPlayerBlackjack || isDealerBlackjack) {
        if (isPlayerBlackjack && isDealerBlackjack) {
            // 平手退款
            await economyHandler.addCoinQuietly(groupId, userId, betAmount);
            const finalBalance = consumeResult.newBalance + betAmount;
            await sendEndGameFlex(replyToken, `🤝 雙方皆為 Blackjack，平手！(退回賭金 ${betAmount.toLocaleString()})`, betAmount, 0, playerHand, dealerHand, userName, true, finalBalance);
        } else if (isPlayerBlackjack) {
            // 玩家贏 1.5 倍 (實收 2.5 倍本金)
            let winAmount = Math.floor(betAmount * 1.5);
            let resultMsg = `🎉 黑傑克！您贏得了 ${winAmount.toLocaleString()} 哭幣！`;
            const taxResult = await atonementHandler.processDevilTax(winAmount, userId);
            if (taxResult.hasContract && taxResult.taxAmount > 0) {
                winAmount = taxResult.finalProfit;
                resultMsg += `\n😈 惡魔契約發動：強制徵收 90% 獲利 (-${taxResult.taxAmount})`;
            }
            await economyHandler.addCoinQuietly(groupId, userId, betAmount + winAmount);
            const finalBalance = consumeResult.newBalance + betAmount + winAmount;
            await sendEndGameFlex(replyToken, resultMsg, betAmount, winAmount, playerHand, dealerHand, userName, true, finalBalance);
        } else {
            // 莊家 Blackjack
            const finalBalance = consumeResult.newBalance;
            await sendEndGameFlex(replyToken, `😢 莊家 Blackjack！您損失了 ${betAmount.toLocaleString()} 哭幣。`, betAmount, -betAmount, playerHand, dealerHand, userName, true, finalBalance);
        }
        return;
    }

    // 儲存狀態（顯式儲存 groupId/userId，避免拆解 gameKey 出現 userId 含底線的問題）
    const timeout = setGameTimeout(gameKey, groupId, userId, betAmount);
    activeGames.set(gameKey, {
        deck,
        playerHand,
        dealerHand,
        betAmount,
        timeout,
        userName,
        groupId,
        userId,
        newBalanceAfterBet: consumeResult.newBalance
    });

    await sendPlayingFlex(replyToken, betAmount, playerHand, dealerHand, userName);
}

async function hit(replyToken, context) {
    const userId = context.userId;
    const groupId = context.groupId;
    const gameKey = `${groupId}_${userId}`;

    const game = activeGames.get(gameKey);
    if (!game) {
        await replyText(replyToken, '❌ 您目前沒有進行中的 21 點遊戲。請輸入「21點 [金額]」開始。');
        return;
    }

    // 重設計時器
    clearTimeout(game.timeout);
    game.timeout = setGameTimeout(gameKey, groupId, userId, game.betAmount);

    const { deck, playerHand, dealerHand, betAmount, userName, newBalanceAfterBet } = game;
    playerHand.push(deck.pop());

    const playerScore = calculateScore(playerHand);

    if (playerScore > 21) {
        // 爆牌
        activeGames.delete(gameKey);
        clearTimeout(game.timeout);
        const finalBalance = newBalanceAfterBet;
        await sendEndGameFlex(replyToken, `💥 爆牌了！(您損失了 ${betAmount.toLocaleString()} 哭幣)`, betAmount, -betAmount, playerHand, dealerHand, userName, true, finalBalance);
    } else if (playerScore === 21) {
        // 滿 21 點自動停牌
        await handleStandLogic(replyToken, gameKey, game);
    } else {
        // 繼續
        await sendPlayingFlex(replyToken, betAmount, playerHand, dealerHand, userName);
    }
}

async function stand(replyToken, context) {
    const userId = context.userId;
    const groupId = context.groupId;
    const gameKey = `${groupId}_${userId}`;

    const game = activeGames.get(gameKey);
    if (!game) {
        await replyText(replyToken, '❌ 您目前沒有進行中的 21 點遊戲。');
        return;
    }

    await handleStandLogic(replyToken, gameKey, game);
}

async function handleStandLogic(replyToken, gameKey, game) {
    activeGames.delete(gameKey);
    clearTimeout(game.timeout);

    // 直接從 game 物件取出 groupId/userId，不依賴 gameKey.split('_')
    // (userId 本身含底線，split 會拆錯)
    const { deck, playerHand, dealerHand, betAmount, userName, groupId, userId, newBalanceAfterBet } = game;
    const playerScore = calculateScore(playerHand);
    
    // 莊家勝率控制機率（期望值 RTP 調整至約 95%）
    // 當莊家會爆牌時，有 11% 的機率作弊換一張安全牌
    const CHEAT_PROBABILITY = 0.11;

    let dealerScore = calculateScore(dealerHand);

    // 莊家未滿 17 點必補
    while (dealerScore < 17) {
        let nextCard = deck[deck.length - 1];
        let tempHand = [...dealerHand, nextCard];
        let tempScore = calculateScore(tempHand);

        // 作弊邏輯：如果補這張牌會爆牌，且觸發作弊機率
        if (tempScore > 21 && Math.random() < CHEAT_PROBABILITY) {
            // 從牌堆找一張不會讓莊家爆牌的牌
            const safeCardIndex = deck.findIndex(card => {
                return calculateScore([...dealerHand, card]) <= 21;
            });
            
            // 如果有找到安全牌，就替換給莊家
            if (safeCardIndex !== -1) {
                const [safeCard] = deck.splice(safeCardIndex, 1);
                dealerHand.push(safeCard);
                dealerScore = calculateScore(dealerHand);
                continue; // 繼續下一張牌判斷
            }
        }

        dealerHand.push(deck.pop());
        dealerScore = calculateScore(dealerHand);
    }

    let resultText = '';
    let winAmount = 0;

    if (dealerScore > 21) {
        winAmount = betAmount;
        resultText = `🎉 莊家爆牌！您贏建立了 ${winAmount.toLocaleString()} 哭幣！`;
        const taxResult = await atonementHandler.processDevilTax(winAmount, userId);
        if (taxResult.hasContract && taxResult.taxAmount > 0) {
            winAmount = taxResult.finalProfit;
            resultText += `\n😈 惡魔契約發動：強制徵收 90% 獲利 (-${taxResult.taxAmount})`;
        }
        await economyHandler.addCoinQuietly(groupId, userId, betAmount + winAmount);
    } else if (playerScore > dealerScore) {
        winAmount = betAmount;
        resultText = `🎉 您贏了！贏得 ${winAmount.toLocaleString()} 哭幣！`;
        const taxResult = await atonementHandler.processDevilTax(winAmount, userId);
        if (taxResult.hasContract && taxResult.taxAmount > 0) {
            winAmount = taxResult.finalProfit;
            resultText += `\n😈 惡魔契約發動：強制徵收 90% 獲利 (-${taxResult.taxAmount})`;
        }
        await economyHandler.addCoinQuietly(groupId, userId, betAmount + winAmount);
    } else if (playerScore < dealerScore) {
        winAmount = -betAmount;
        resultText = `😢 莊家點數較高，您輸了 ${betAmount.toLocaleString()} 哭幣。`;
    } else {
        winAmount = 0;
        resultText = `🤝 雙方平手！(退回賭金 ${betAmount.toLocaleString()} 哭幣)`;
        await economyHandler.addCoinQuietly(groupId, userId, betAmount);
    }

    let finalBalance = newBalanceAfterBet;
    if (dealerScore > 21 || playerScore > dealerScore) {
        finalBalance = newBalanceAfterBet + betAmount + winAmount;
    } else if (playerScore === dealerScore) {
        finalBalance = newBalanceAfterBet + betAmount;
    } else {
        finalBalance = newBalanceAfterBet;
    }

    await sendEndGameFlex(replyToken, resultText, betAmount, winAmount, playerHand, dealerHand, userName, true, finalBalance);
}


// === Flex Message 介面 ===

async function sendPlayingFlex(replyToken, betAmount, playerHand, dealerHand, userName) {
    const playerScore = calculateScore(playerHand);
    
    // 進行中：莊家第一張牌蓋住
    const flex = buildBlackjackFlex('🎰 21點 - 進行中', betAmount, playerHand, dealerHand, playerScore, '?', true, false, '遊戲進行中，請選擇：', '#1E90FF', userName);
    await replyFlex(replyToken, `21點進行中 (您的點數: ${playerScore})`, flex);
}

async function sendEndGameFlex(replyToken, resultText, betAmount, winAmount, playerHand, dealerHand, userName, showAll = true, finalBalance = null) {
    const playerScore = calculateScore(playerHand);
    const dealerScore = calculateScore(dealerHand);

    let headerColor = '#FFD700'; // 平手
    if (winAmount > 0) headerColor = flexUtils.COLORS.WIN; // 贏
    if (winAmount < 0) headerColor = flexUtils.COLORS.LOSE; // 輸

    const flex = buildBlackjackFlex('🎰 21點 - 結算', betAmount, playerHand, dealerHand, playerScore, dealerScore, false, true, resultText, headerColor, userName, finalBalance);
    await replyFlex(replyToken, `21點結算: ${resultText}`, flex);
}

function buildBlackjackFlex(title, betAmount, playerHand, dealerHand, playerScore, dealerScore, hideDealerFirst, isEnd, resultText, headerColor = '#1E90FF', userName = '玩家', finalBalance = null) {
    const contents = [
        flexUtils.createText({ text: '👤 莊家', size: 'sm', color: '#888888', weight: 'bold' }),
        flexUtils.createText({ text: renderHand(dealerHand, hideDealerFirst), size: 'xl', weight: 'bold', margin: 'md', color: '#333333' }),
        flexUtils.createText({ text: `點數: ${dealerScore}`, size: 'xs', color: '#AAAAAA', margin: 'sm' }),
        
        flexUtils.createSeparator('lg'),
        
        flexUtils.createText({ text: `🧑 ${userName}`, size: 'sm', color: '#888888', weight: 'bold', margin: 'lg', wrap: true }),
        flexUtils.createText({ text: renderHand(playerHand, false), size: 'xl', weight: 'bold', margin: 'md', color: '#1E90FF' }),
        flexUtils.createText({ text: `點數: ${playerScore}`, size: 'sm', color: '#333333', weight: 'bold', margin: 'sm' }),
        
        flexUtils.createSeparator('lg'),
        
        flexUtils.createText({ text: `💰 下注金額: ${betAmount.toLocaleString()}`, size: 'sm', color: '#FF8C00', margin: 'md', weight: 'bold' }),
        flexUtils.createText({ text: resultText, size: 'md', color: isEnd ? (headerColor === flexUtils.COLORS.LOSE ? flexUtils.COLORS.LOSE : flexUtils.COLORS.WIN) : '#666666', weight: 'bold', margin: 'md', wrap: true })
    ];

    if (isEnd && finalBalance !== null) {
        contents.push(flexUtils.createSeparator('md'));
        contents.push(flexUtils.createText({ text: `💰 結算總資產: ${finalBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#1A1A1A', margin: 'md' }));
    }

    if (!isEnd) {
        contents.push(flexUtils.createText({ text: '💡 捷徑：補牌輸入「+」、停牌輸入「-」或「過」', size: 'xs', color: '#AAAAAA', align: 'center', margin: 'sm' }));
    }

    const footerContents = [];

    if (!isEnd) {
        footerContents.push(
            flexUtils.createBox('horizontal', [
                flexUtils.createButton({
                    action: { type: 'message', label: '👆 補牌 (Hit)', text: '補牌' },
                    style: 'primary', height: 'sm', color: '#4CAF50', margin: 'sm'
                }),
                flexUtils.createButton({
                    action: { type: 'message', label: '✋ 停牌 (Stand)', text: '停牌' },
                    style: 'primary', height: 'sm', color: '#F44336', margin: 'sm'
                })
            ])
        );
    } else {
        footerContents.push(
            flexUtils.createButton({
                action: { type: 'message', label: `🎰 再玩一次 (${betAmount.toLocaleString()})`, text: `21點 ${betAmount}` },
                style: 'secondary', height: 'sm', color: '#E0E0E0'
            })
        );
    }

    return flexUtils.createBubble({
        size: 'mega',
        header: flexUtils.createHeader(title, '', headerColor, '#FFFFFF'),
        body: flexUtils.createBox('vertical', contents, { paddingAll: '15px', backgroundColor: '#F8F9FA' }),
        footer: flexUtils.createBox('vertical', footerContents, { paddingAll: '10px' })
    });
}

module.exports = {
    startGame,
    hit,
    stand
};
