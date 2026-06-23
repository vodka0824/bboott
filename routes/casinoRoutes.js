module.exports = function (router, handlers) {
    const { 
        lotteryHandler, slotHandler, lineUtils 
    } = handlers;
    
    // Lazy loaded handlers to prevent circular dependencies
    const casino = require('../handlers/casino');
    const vipWheel = require('../handlers/vip_wheel');
    const horseRacing = require('../handlers/horse_racing');
    const baccarat = require('../handlers/baccarat');
    const roulette = require('../handlers/russian_roulette');
    const diceHandler = require('../handlers/dice');
    const blackjackHandler = require('../handlers/blackjack');
    const multiBlackjackHandler = require('../handlers/multi_blackjack');
    const multiNiuNiuHandler = require('../handlers/multi_niuniu');
    const multiRedDogHandler = require('../handlers/multi_reddog');
    const multiGoldenFlowerHandler = require('../handlers/multi_goldenflower');
    const multiBaccaratHandler = require('../handlers/multi_baccarat');
    const multiTuiTongZiHandler = require('../handlers/multi_tuitongzi');
    const multiTenHalfHandler = require('../handlers/multi_tenhalf');
    const multiShibalaHandler = require('../handlers/multi_shibala');
    const { db } = require('../utils/db');

    function getCasinoTableCreator(groupId) {
        let t = null;
        t = multiBlackjackHandler.getActiveTable(groupId); if (t) return t.dealerId;
        t = multiNiuNiuHandler.getActiveTable(groupId); if (t) return t.dealerId;
        t = multiTuiTongZiHandler.getActiveTable(groupId); if (t) return t.dealerId;
        t = multiTenHalfHandler.getActiveTable(groupId); if (t) return t.dealerId;
        t = multiShibalaHandler.getActiveTable(groupId); if (t) return t.dealerId;
        t = multiGoldenFlowerHandler.getActiveTable(groupId); if (t) return t.dealerId;
        t = multiBaccaratHandler.getActiveTable(groupId); if (t) return t.dealerId;
        t = multiRedDogHandler.getActiveTable(groupId); if (t) return t.dealer.userId;
        return null;
    }

    async function checkMilitaryTableAccess(ctx) {
        if (!ctx.groupId) return { allowed: true };
        const creatorId = getCasinoTableCreator(ctx.groupId);
        if (!creatorId) return { allowed: true };
        if (creatorId === ctx.userId) return { allowed: true };

        const userDoc = await db.collection('economy_users').doc(creatorId).get();
        if (!userDoc.exists) return { allowed: true };
        const creatorData = userDoc.data();
        const isCreatorMilitary = creatorData.militaryUntil && Date.now() < creatorData.militaryUntil;

        if (isCreatorMilitary) {
            const playerDoc = await db.collection('economy_users').doc(ctx.userId).get();
            const playerData = playerDoc.exists ? playerDoc.data() : {};
            const isPlayerMilitary = playerData.militaryUntil && Date.now() < playerData.militaryUntil;
            if (!isPlayerMilitary) {
                return {
                    allowed: false,
                    message: '❌ 這是軍中同袍限定牌桌，只有軍中同袍能參與，營區外人員無法參加！'
                };
            }
        }
        return { allowed: true };
    }

    function checkAnyActiveTable(groupId) {
        if (multiBlackjackHandler.getActiveTable(groupId)) return '21點';
        if (multiNiuNiuHandler.getActiveTable(groupId)) return '妞妞';
        if (multiRedDogHandler.getActiveTable(groupId)) return '射龍門';
        if (multiGoldenFlowerHandler.getActiveTable(groupId)) return '炸金花';
        if (multiBaccaratHandler.getActiveTable(groupId)) return '百家樂';
        if (multiTuiTongZiHandler.getActiveTable(groupId)) return '推筒子';
        if (multiTenHalfHandler.getActiveTable(groupId)) return '十點半';
        if (multiShibalaHandler.getActiveTable(groupId)) return '十八啦';
        return null;
    }

    const noTableSpamTracker = new Map();
    async function handleNoTableSpam(ctx, defaultMsg) {
        const now = new Date();
        const todayStr = now.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
        
        let tracker = noTableSpamTracker.get(ctx.userId);
        if (!tracker || tracker.date !== todayStr) {
            tracker = { date: todayStr, count: 0 };
        }
        
        tracker.count += 1;
        noTableSpamTracker.set(ctx.userId, tracker);
        
        if (noTableSpamTracker.size > 1000) {
            for (const [key, val] of noTableSpamTracker.entries()) {
                if (val.date !== todayStr) noTableSpamTracker.delete(key);
            }
        }
        
        if (tracker.count === 1) {
            await lineUtils.replyText(ctx.replyToken, defaultMsg);
        } else if (tracker.count === 2) {
            const sarcasticReplies = [
                "你是瞎了嗎？就跟你說目前沒牌桌了，還在一直按？",
                "沒有牌桌！沒有牌桌！沒有牌桌！很重要所以說三次，聽得懂人話嗎？",
                "一直按一直按，你是中猴還是手指抽筋？自己開一桌很難嗎？",
                "沒牌桌你下個空氣注啊？我看你是想把錢捐給系統是不是？",
                "笑死，對著空氣發牌下注，你是不是產生幻覺了？",
                "警告一次還不聽，你是故意來挑戰我的耐性，還是純粹智商不在線？",
                "空氣牌桌是能贏錢喔？再按啊，我看你能按出什麼花樣來！"
            ];
            const randomReply = sarcasticReplies[Math.floor(Math.random() * sarcasticReplies.length)];
            await lineUtils.replyText(ctx.replyToken, `😒 ${randomReply}`);
        } else {
            console.log(`[Casino] User ${ctx.userId} called no-table command ${tracker.count} times. Ignored.`);
        }
    }

    async function resolveBetAmount(amtStr, userId) {
        const { resolveBetAmount: resolveBet } = require('../utils/formatUtils');
        return await resolveBet(amtStr, userId);
    }

    // === 賭場核心控制 (Casino Control) ===
    router.register(/^\s*綁定賭場\s*$/, async (ctx) => {
        await casino.bindCasino(ctx.replyToken, ctx.groupId, ctx.userId);
    }, { isGroupOnly: true, needAdmin: true, keywords: ['綁定賭場'] });

    router.register(/^\s*開啟賭場\s*$/, async (ctx) => {
        await casino.openCasino(ctx.replyToken, ctx.userId);
    }, { isGroupOnly: true, needAdmin: true, keywords: ['開啟賭場'] });

    router.register(/^\s*關閉賭場\s*$/, async (ctx) => {
        await casino.closeCasino(ctx.replyToken, ctx.userId);
    }, { isGroupOnly: true, needAdmin: true, keywords: ['關閉賭場'] });

    // === 群組抽獎 (Group Lottery) ===
    const LOTTERY_ARG_COUNT = 4;
    router.register(/^抽獎\s+(.+)$/, async (ctx, match) => {
        const args = match[1].trim().split(/\s+/);
        if (args.length !== LOTTERY_ARG_COUNT) {
            await lineUtils.replyText(ctx.replyToken, '❌ 指令格式錯誤\n正確格式:抽獎 [獎品] [人數] [時間(分)] [關鍵字]\n範例:抽獎 機械鍵盤 1 60 抽鍵盤');
            return;
        }
        await lotteryHandler.handleStartLottery(ctx.replyToken, ctx.groupId, ctx.userId, args[0], args[1], args[2], args[3]);
    }, { isGroupOnly: true, needAuth: true, keywords: ['抽獎'] });

    router.register(/^開獎\s+(\S+)$/, async (ctx, match) => {
        await lotteryHandler.handleManualDraw(ctx.replyToken, ctx.groupId, ctx.userId, match[1]);
    }, { isGroupOnly: true, needAuth: true, keywords: ['開獎'] });

    router.register(/^取消抽獎\s+(\S+)$/, async (ctx, match) => {
        await lotteryHandler.handleCancelLottery(ctx.replyToken, ctx.groupId, ctx.userId, match[1]);
    }, { isGroupOnly: true, needAuth: true, keywords: ['取消抽獎'] });

    router.register(/^(抽獎狀態|抽獎列表)$/, async (ctx) => {
        await lotteryHandler.handleStatusQuery(ctx.replyToken, ctx.groupId);
    }, { isGroupOnly: true, needAuth: true, keywords: ['抽獎狀態', '抽獎列表'] });



    // === 21點與妞妞 ===
    router.register(/^(?:開桌|開局|開台|開)(?:21點|二十一點|21)$/i, async (ctx) => {
        const activeGame = checkAnyActiveTable(ctx.groupId);
        if (activeGame) {
            await lineUtils.replyText(ctx.replyToken, `❌ 群組內已經有正在進行的【${activeGame}】牌桌了，同時間只能開啟一個多人賭桌！請先將其解散或完成。`);
            return;
        }
        await multiBlackjackHandler.openTable(ctx.replyToken, ctx);
    }, { feature: 'multiplayer', isGroupOnly: true, needAuth: true, isMultiplayer: true, keywords: ['開桌', '開局', '開台', '21點', '開'] });

    router.register(/^(?:開桌|開局|開台|開)(?:妞妞|牛牛)$/i, async (ctx) => {
        const activeGame = checkAnyActiveTable(ctx.groupId);
        if (activeGame) {
            await lineUtils.replyText(ctx.replyToken, `❌ 群組內已經有正在進行的【${activeGame}】牌桌了，同時間只能開啟一個多人賭桌！請先將其解散或完成。`);
            return;
        }
        await multiNiuNiuHandler.openTable(ctx.replyToken, ctx);
    }, { feature: 'multiplayer', isGroupOnly: true, needAuth: true, isMultiplayer: true, keywords: ['開桌', '開局', '開台', '妞妞', '牛牛', '開'] });

    router.register(/^(?:開桌|開局|開台|開)推筒子$/i, async (ctx) => {
        const activeGame = checkAnyActiveTable(ctx.groupId);
        if (activeGame) {
            await lineUtils.replyText(ctx.replyToken, `❌ 群組內已經有正在進行的【${activeGame}】牌桌了，同時間只能開啟一個多人賭桌！請先將其解散或完成。`);
            return;
        }
        await multiTuiTongZiHandler.openTable(ctx.replyToken, ctx);
    }, { feature: 'multiplayer', isGroupOnly: true, needAuth: true, isMultiplayer: true, keywords: ['開桌', '開局', '開台', '推筒子', '開'] });

    router.register(/^(?:開桌|開局|開台|開)十點半$/i, async (ctx) => {
        const activeGame = checkAnyActiveTable(ctx.groupId);
        if (activeGame) {
            await lineUtils.replyText(ctx.replyToken, `❌ 群組內已經有正在進行的【${activeGame}】牌桌了，同時間只能開啟一個多人賭桌！請先將其解散或完成。`);
            return;
        }
        await multiTenHalfHandler.openTable(ctx.replyToken, ctx);
    }, { feature: 'multiplayer', isGroupOnly: true, needAuth: true, isMultiplayer: true, keywords: ['開桌', '開局', '開台', '十點半', '開'] });

    router.register(/^(?:開桌|開局|開台|開)(?:十八啦|18啦)$/i, async (ctx) => {
        const activeGame = checkAnyActiveTable(ctx.groupId);
        if (activeGame) {
            await lineUtils.replyText(ctx.replyToken, `❌ 群組內已經有正在進行的【${activeGame}】牌桌了，同時間只能開啟一個多人賭桌！請先將其解散或完成。`);
            return;
        }
        await multiShibalaHandler.openTable(ctx.replyToken, ctx);
    }, { feature: 'multiplayer', isGroupOnly: true, needAuth: true, isMultiplayer: true, keywords: ['開桌', '十八啦', '18啦', '開'] });

    router.register(/^(?:開桌|開局|開台|開)射龍門(?:\s*([0-9０-９.,kKwW萬千百億兆]+|歐印|all\s*in))?$/i, async (ctx, match) => {
        const activeGame = checkAnyActiveTable(ctx.groupId);
        if (activeGame) {
            await lineUtils.replyText(ctx.replyToken, `❌ 群組內已經有正在進行的【${activeGame}】牌桌了，同時間只能開啟一個多人賭桌！請先將其解散或完成。`);
            return;
        }
        if (!match[1]) {
            const lineUtils = require('../utils/line');
            await lineUtils.replyText(ctx.replyToken, '❌ 開桌射龍門必須設定底注！\n範例：開桌射龍門 100\n（底注會從您的帳戶扣除並放進獎池）');
            return;
        }
        const amt = await resolveBetAmount(match[1], ctx.userId);
        await multiRedDogHandler.openTable(ctx.replyToken, ctx.groupId, ctx.userId, amt);
    }, { feature: 'multiplayer', isGroupOnly: true, needAuth: true, isMultiplayer: true, keywords: ['開桌', '開局', '開台', '射龍門', '開'] });

    router.register(/^(?:開桌|開局|開台|開)炸金花$/i, async (ctx) => {
        const activeGame = checkAnyActiveTable(ctx.groupId);
        if (activeGame) {
            await lineUtils.replyText(ctx.replyToken, `❌ 群組內已經有正在進行的【${activeGame}】牌桌了，同時間只能開啟一個多人賭桌！請先將其解散或完成。`);
            return;
        }
        await multiGoldenFlowerHandler.openTable(ctx.replyToken, ctx);
    }, { feature: 'multiplayer', isGroupOnly: true, needAuth: true, isMultiplayer: true, keywords: ['開桌', '開局', '開台', '炸金花', '開'] });

    router.register(/^(?:開桌|開局|開台|開)百家樂$/i, async (ctx) => {
        const activeGame = checkAnyActiveTable(ctx.groupId);
        if (activeGame) {
            await lineUtils.replyText(ctx.replyToken, `❌ 群組內已經有正在進行的【${activeGame}】牌桌了，同時間只能開啟一個多人賭桌！請先將其解散或完成。`);
            return;
        }
        await multiBaccaratHandler.openTable(ctx.replyToken, ctx);
    }, { feature: 'multiplayer', isGroupOnly: true, needAuth: true, isMultiplayer: true, keywords: ['開桌', '開局', '開台', '百家樂', '開'] });

    router.register(/^(?:押|買)?(莊|莊家|閒|閒家|和|和局)\s*([0-9０-９.,kKwW萬千百億兆]+|歐印|all\s*in)$/i, async (ctx, match) => {
        const access = await checkMilitaryTableAccess(ctx);
        if (!access.allowed) {
            await lineUtils.replyText(ctx.replyToken, access.message);
            return;
        }
        let betTypeRaw = match[1];
        let betType = '和';
        if (betTypeRaw.startsWith('莊')) betType = '莊';
        else if (betTypeRaw.startsWith('閒')) betType = '閒';
        
        const amt = await resolveBetAmount(match[2], ctx.userId);
        if (multiBaccaratHandler.getActiveTable(ctx.groupId)) {
            await multiBaccaratHandler.placeBet(ctx.replyToken, ctx, betType, amt);
        } else {
            const isPlusCommand = ctx.message && ctx.message.trim().startsWith('+');
            if (!isPlusCommand) await handleNoTableSpam(ctx, '❌ 目前沒有等待中的百家樂牌桌。');
        }
    }, { feature: 'multiplayer', isGroupOnly: true, needAuth: true, isMultiplayer: true, keywords: ['押莊', '押閒', '押和', '莊', '閒'] });

    router.register(/^(?:(下注|押注|押|買|跟|加|\+|-)\s*([0-9０-９.,kKwW萬千百億兆]+|歐印|all\s*in|一半|1\/2|half)|([0-9０-９.,kKwW萬千百億兆]+|歐印|all\s*in|一半|1\/2|half))\s*$/i, async (ctx, match) => {
        const access = await checkMilitaryTableAccess(ctx);
        if (!access.allowed) {
            await lineUtils.replyText(ctx.replyToken, access.message);
            return;
        }
        const rawAmt = match[2] || match[3];
        const operator = match[1] ? match[1].toLowerCase() : '';
        const amt = await resolveBetAmount(rawAmt, ctx.userId);
        
        let betStrForGames = rawAmt;
        if (operator === '+' || operator === '加') betStrForGames = '+' + rawAmt;
        if (operator === '-') betStrForGames = '-' + rawAmt;
        
        const reddogTable = multiRedDogHandler.getActiveTable(ctx.groupId);
        if (reddogTable && reddogTable.status === 'playing') {
            let action = '射';
            if (operator === '-') {
                action = '猜小';
            } else if (operator === '+' || operator === '加' || operator === '買' || operator === '押' || operator === '下注' || operator === '跟' || operator === '押注') {
                if (reddogTable.currentCards[0].value === reddogTable.currentCards[1].value) {
                    action = '猜大';
                }
            }
            const handled = await multiRedDogHandler.handlePlayerAction(ctx.replyToken, ctx.groupId, ctx.userId, action, amt);
            if (handled) return;
        }

        if (multiNiuNiuHandler.getActiveTable(ctx.groupId)) await multiNiuNiuHandler.placeBet(ctx.replyToken, ctx, betStrForGames);
        else if (multiGoldenFlowerHandler.getActiveTable(ctx.groupId)) await multiGoldenFlowerHandler.placeBet(ctx.replyToken, ctx, betStrForGames);
        else if (multiBlackjackHandler.getActiveTable(ctx.groupId)) await multiBlackjackHandler.placeBet(ctx.replyToken, ctx, betStrForGames);
        else if (multiTuiTongZiHandler.getActiveTable(ctx.groupId)) await multiTuiTongZiHandler.placeBet(ctx.replyToken, ctx, betStrForGames);
        else if (multiTenHalfHandler.getActiveTable(ctx.groupId)) await multiTenHalfHandler.placeBet(ctx.replyToken, ctx, betStrForGames);
        else if (multiShibalaHandler.getActiveTable(ctx.groupId)) await multiShibalaHandler.placeBet(ctx.replyToken, ctx, betStrForGames);
        else {
            // 如果只有簡寫且以 + 開頭，不進行錯誤回覆以避免洗頻
            const isPlusCommand = ctx.message && (ctx.message.trim().startsWith('+') || match[3] !== undefined);
            if (!isPlusCommand && match[1]) await handleNoTableSpam(ctx, '❌ 目前沒有進行中的多人牌桌。');
            else return false; // 讓純數字可以繼續往下匹配
        }
    }, { feature: 'multiplayer', isGroupOnly: true, needAuth: true, isMultiplayer: true });

    // 統一處理發牌與補牌（包含指令 +）
    router.register(/^(發牌?|補牌?|要牌?|加牌?|再一張|擲骰?|\+|hit|h|補一張|繼續|抽牌?|抽)\s*$/i, async (ctx) => {
        const access = await checkMilitaryTableAccess(ctx);
        if (!access.allowed) {
            await lineUtils.replyText(ctx.replyToken, access.message);
            return;
        }
        let cmd = ctx.message ? ctx.message.trim().toLowerCase() : '';
        if (['hit', 'h', '補一張', '繼續', '抽', '抽牌', '要牌', '要', '加牌', '再一張'].includes(cmd)) cmd = '+';
        
        if (ctx.isGroup) {
            // 優先檢查多人射龍門
            const reddogTable = multiRedDogHandler.getActiveTable(ctx.groupId);
            if (reddogTable) {
                if (reddogTable.status === 'waiting') {
                    if (reddogTable.dealer.userId === ctx.userId) {
                        await multiRedDogHandler.startTable(ctx.replyToken, ctx.groupId, ctx.userId);
                    } else {
                        await multiRedDogHandler.joinTable(ctx.replyToken, ctx.groupId, ctx.userId);
                    }
                    return;
                } else if (reddogTable.status === 'playing') {
                    let action = '射';
                    if (cmd === '-') {
                        action = '猜小';
                    } else if (cmd === '+') {
                        if (reddogTable.currentCards[0].value === reddogTable.currentCards[1].value) {
                            action = '猜大';
                        }
                    }
                    const handled = await multiRedDogHandler.handlePlayerAction(ctx.replyToken, ctx.groupId, ctx.userId, action, '10');
                    if (handled) return;
                }
            }

            // 檢查多人百家樂
            const baccaratTable = multiBaccaratHandler.getActiveTable(ctx.groupId);
            if (baccaratTable) {
                if (cmd === '開牌' || cmd === '發牌' || cmd === '發' || cmd === '+') {
                    if (baccaratTable.status === 'waiting') {
                        await multiBaccaratHandler.dealCards(ctx.replyToken, ctx);
                        return;
                    }
                }
            }

            // 檢查多人炸金花
            const gfTable = multiGoldenFlowerHandler.getActiveTable(ctx.groupId);
            if (gfTable) {
                if (cmd === '發牌' || cmd === '發' || cmd === '+') {
                    if (gfTable.status === 'waiting') {
                        await multiGoldenFlowerHandler.dealCards(ctx.replyToken, ctx);
                        return;
                    }
                }
            }

            // 檢查多人妞妞
            const niuniuTable = multiNiuNiuHandler.getActiveTable(ctx.groupId);
            if (niuniuTable) {
                if (cmd === '發牌' || cmd === '發' || cmd === '+') {
                    if (niuniuTable.status === 'waiting') {
                        await multiNiuNiuHandler.dealCards(ctx.replyToken, ctx);
                        return;
                    }
                }
            }
            
            // 檢查多人推筒子
            const ttzTable = multiTuiTongZiHandler.getActiveTable(ctx.groupId);
            if (ttzTable) {
                if (cmd === '發牌' || cmd === '發' || cmd === '+') {
                    if (ttzTable.status === 'waiting') {
                        await multiTuiTongZiHandler.dealCards(ctx.replyToken, ctx);
                        return;
                    }
                }
            }
            
            // 檢查多人 21 點
            const blackjackTable = multiBlackjackHandler.getActiveTable(ctx.groupId);
            if (blackjackTable) {
                if (blackjackTable.status === 'waiting') {
                    if (cmd === '發牌' || cmd === '發' || cmd === '+') {
                        await multiBlackjackHandler.dealCards(ctx.replyToken, ctx);
                        return;
                    }
                } else if (blackjackTable.status === 'playing') {
                    if (cmd === '補牌' || cmd === '補' || cmd === '+') {
                        await multiBlackjackHandler.playerHit(ctx.replyToken, ctx);
                        return;
                    }
                }
            }
            
            // 檢查多人十點半
            const tenHalfTable = multiTenHalfHandler.getActiveTable(ctx.groupId);
            if (tenHalfTable) {
                if (tenHalfTable.status === 'waiting') {
                    if (cmd === '發牌' || cmd === '發' || cmd === '+') {
                        await multiTenHalfHandler.dealCards(ctx.replyToken, ctx);
                        return;
                    }
                } else if (tenHalfTable.status === 'playing') {
                    if (cmd === '補牌' || cmd === '補' || cmd === '+') {
                        await multiTenHalfHandler.playerHit(ctx.replyToken, ctx);
                        return;
                    }
                }
            }
            
            // 檢查多人十八啦
            const shibalaTable = multiShibalaHandler.getActiveTable(ctx.groupId);
            if (shibalaTable) {
                if (cmd === '發牌' || cmd === '發' || cmd === '擲骰' || cmd === '擲' || cmd === '+') {
                    if (shibalaTable.status === 'waiting') {
                        await multiShibalaHandler.dealCards(ctx.replyToken, ctx);
                        return;
                    }
                }
            }
        }
        
        // 單機版 21 點補牌（限私訊或群組無多人桌時）
        if (cmd === '補牌' || cmd === '補' || cmd === '+') {
            await blackjackHandler.hit(ctx.replyToken, ctx);
            return;
        }
        
        if (cmd === '發牌' || cmd === '發' || cmd === '開牌' || cmd === '擲骰' || cmd === '擲') {
            await handleNoTableSpam(ctx, '❌ 目前沒有進行中或等待發牌的多人牌桌。');
        }
    }, { feature: 'multiplayer', allowDM: true, isMultiplayer: true, keywords: ['發牌', '發', '補牌', '補', '擲骰', '擲', '+', '-', '開牌', '要牌', '要', '加牌', '再一張', 'hit', 'h', '補一張', '繼續', '抽牌', '抽'] });

    router.register(/^(?:加入射龍門|加入|加|\+1|join|j|報名|算我一個)$/i, async (ctx) => {
        const access = await checkMilitaryTableAccess(ctx);
        if (!access.allowed) {
            await lineUtils.replyText(ctx.replyToken, access.message);
            return;
        }
        if (multiRedDogHandler.getActiveTable(ctx.groupId)) await multiRedDogHandler.joinTable(ctx.replyToken, ctx.groupId, ctx.userId);
        else {
            if (['加入射龍門', '加入'].includes(ctx.message.trim())) await handleNoTableSpam(ctx, '❌ 目前沒有等待中的射龍門牌桌。');
        }
    }, { feature: 'multiplayer', isGroupOnly: true, needAuth: true, isMultiplayer: true, keywords: ['加入', '加', '+1', 'join'] });

    router.register(/^(?:開始射龍門|開始|開|start|go|s)$/i, async (ctx) => {
        const access = await checkMilitaryTableAccess(ctx);
        if (!access.allowed) {
            await lineUtils.replyText(ctx.replyToken, access.message);
            return;
        }
        if (multiRedDogHandler.getActiveTable(ctx.groupId)) await multiRedDogHandler.startTable(ctx.replyToken, ctx.groupId, ctx.userId);
        else {
            if (['開始射龍門', '開始'].includes(ctx.message.trim())) await handleNoTableSpam(ctx, '❌ 目前沒有等待中的射龍門牌桌。');
        }
    }, { feature: 'multiplayer', isGroupOnly: true, needAuth: true, isMultiplayer: true, keywords: ['開始', '開', 'start'] });

    router.register(/^(?:不射|pass|過|跳過)$/i, async (ctx) => {
        const access = await checkMilitaryTableAccess(ctx);
        if (!access.allowed) {
            await lineUtils.replyText(ctx.replyToken, access.message);
            return;
        }
        const handled = await multiRedDogHandler.handlePlayerAction(ctx.replyToken, ctx.groupId, ctx.userId, '不射', null);
        if (!handled) return false;
    }, { feature: 'multiplayer', isGroupOnly: true, needAuth: true, isMultiplayer: true });

    router.register(/^(?:射|猜大|猜小|大|小)(?:\s*([0-9０-９.,kKwW萬千百億兆]+|歐印|all\s*in))?\s*$/i, async (ctx, match) => {
        const access = await checkMilitaryTableAccess(ctx);
        if (!access.allowed) {
            await lineUtils.replyText(ctx.replyToken, access.message);
            return;
        }
        if (!match[1]) {
            const actionPrefix = ctx.message.match(/^(射|猜大|猜小|大|小)/i)[1];
            await lineUtils.replyText(ctx.replyToken, `❌ 請輸入金額，例如：${actionPrefix} 100 或 ${actionPrefix} [0-9０-９.,kKwW萬千百億兆]+\|歐印`);
            return;
        }
        const amt = await resolveBetAmount(match[1], ctx.userId);
        let actionMatch = ctx.message.match(/^(射|猜大|猜小|大|小)/i);
        let action = actionMatch ? actionMatch[1] : '射';
        if (action === '大') action = '猜大';
        if (action === '小') action = '猜小';
        const handled = await multiRedDogHandler.handlePlayerAction(ctx.replyToken, ctx.groupId, ctx.userId, action, amt);
        if (!handled) return false;
    }, { feature: 'multiplayer', isGroupOnly: true, needAuth: true, isMultiplayer: true, keywords: ['射', '猜大', '猜小', '大', '小'] });

    router.register(/^(?:解散牌桌|解散|收桌|關桌|散|關|結束|取消|不玩了)$/i, async (ctx) => {
        if (multiNiuNiuHandler.getActiveTable(ctx.groupId)) await multiNiuNiuHandler.closeTable(ctx.replyToken, ctx);
        else if (multiBlackjackHandler.getActiveTable(ctx.groupId)) await multiBlackjackHandler.closeTable(ctx.replyToken, ctx);
        else if (multiGoldenFlowerHandler.getActiveTable(ctx.groupId)) await multiGoldenFlowerHandler.closeTable(ctx.replyToken, ctx);
        else if (multiBaccaratHandler.getActiveTable(ctx.groupId)) await multiBaccaratHandler.closeTable(ctx.replyToken, ctx);
        else if (multiTuiTongZiHandler.getActiveTable(ctx.groupId)) await multiTuiTongZiHandler.closeTable(ctx.replyToken, ctx);
        else if (multiTenHalfHandler.getActiveTable(ctx.groupId)) await multiTenHalfHandler.closeTable(ctx.replyToken, ctx);
        else if (multiShibalaHandler.getActiveTable(ctx.groupId)) await multiShibalaHandler.closeTable(ctx.replyToken, ctx);
        else await handleNoTableSpam(ctx, '❌ 目前沒有進行中的牌桌。');
    }, { feature: 'multiplayer', isGroupOnly: true, needAuth: true, isMultiplayer: true, keywords: ['解散', '收桌', '關桌', '散', '關'] });

    router.register(/^(?:莊家開牌|開牌|攤牌|結算)$/i, async (ctx) => {
        if (multiBlackjackHandler.getActiveTable(ctx.groupId)) {
            await multiBlackjackHandler.dealerPlay(ctx.replyToken, ctx);
        } else if (multiTenHalfHandler.getActiveTable(ctx.groupId)) {
            await multiTenHalfHandler.dealerPlay(ctx.replyToken, ctx);
        } else {
            await handleNoTableSpam(ctx, '❌ 目前沒有可開牌的牌桌。');
        }
    }, { feature: 'multiplayer', isGroupOnly: true, needAuth: true, isMultiplayer: true, keywords: ['開牌', '攤牌'] });

    router.register(/^(?:21點|二十一點)(?:\s*([0-9０-９.,kKwW萬千百億兆]+|歐印|all\s*in))?\s*$/i, async (ctx, match) => {
        const amt = await resolveBetAmount(match[1] || '10', ctx.userId);
        await blackjackHandler.startGame(ctx.replyToken, ctx, amt);
    }, { isDMOnly: true, feature: 'multiplayer', allowDM: true, gameKey: 'blackjack', keywords: ['21點', '二十一點'] });



    router.register(/^(停牌?|過|pass?|不加牌?|不要了?|不要牌?|不拿牌?|不要加牌?|不補牌?|不抽牌?|-|stand|不|不要|夠了|p|放棄|投降|surrender|ff)$/i, async (ctx) => {
        const access = await checkMilitaryTableAccess(ctx);
        if (!access.allowed) {
            await lineUtils.replyText(ctx.replyToken, access.message);
            return;
        }
        if (ctx.isGroup) {
            const reddogTable = multiRedDogHandler.getActiveTable(ctx.groupId);
            if (reddogTable && reddogTable.status === 'playing') {
                const cmd = ctx.message.trim().toLowerCase();
                let action = '不射';
                if (cmd === '-') action = '猜小';
                await multiRedDogHandler.handlePlayerAction(ctx.replyToken, ctx.groupId, ctx.userId, action, '10');
                return;
            }
            const table = multiBlackjackHandler.getActiveTable(ctx.groupId);
            if (table && table.status === 'playing') {
                if (['投降', 'surrender', 'ff'].includes(ctx.message.trim().toLowerCase())) {
                    await multiBlackjackHandler.playerSurrender(ctx.replyToken, ctx);
                } else {
                    await multiBlackjackHandler.playerStand(ctx.replyToken, ctx);
                }
                return;
            }
            const tenHalfTable = multiTenHalfHandler.getActiveTable(ctx.groupId);
            if (tenHalfTable && tenHalfTable.status === 'playing') {
                await multiTenHalfHandler.playerStand(ctx.replyToken, ctx);
                return;
            }
        }
        await blackjackHandler.stand(ctx.replyToken, ctx);
    }, { feature: 'multiplayer', allowDM: true, isMultiplayer: true, keywords: ['停牌', '停', 'stand', '過', 'pass', '不加牌', '不要了', '不要牌', '不拿牌', '不要加牌', '不補牌', '不抽牌', '-', '不', '不要', '夠了', 'p', '放棄', '投降', 'surrender', 'ff'] });

    router.register(/^(?:雙倍下注|雙倍|double|加倍|x2)$/i, async (ctx) => {
        const access = await checkMilitaryTableAccess(ctx);
        if (!access.allowed) {
            await lineUtils.replyText(ctx.replyToken, access.message);
            return;
        }
        const table = multiBlackjackHandler.getActiveTable(ctx.groupId);
        if (table && table.status === 'playing') await multiBlackjackHandler.playerDoubleDown(ctx.replyToken, ctx);
        else await handleNoTableSpam(ctx, '❌ 單機模式尚未開放此功能，請在「開桌21點」使用！');
    }, { feature: 'multiplayer', isGroupOnly: true, needAuth: true, isMultiplayer: true, keywords: ['雙倍', 'double', '加倍'] });

    router.register(/^(?:投降|認輸|surrender|放棄|ff)$/i, async (ctx) => {
        const access = await checkMilitaryTableAccess(ctx);
        if (!access.allowed) {
            await lineUtils.replyText(ctx.replyToken, access.message);
            return;
        }
        const table = multiBlackjackHandler.getActiveTable(ctx.groupId);
        if (table && table.status === 'playing') await multiBlackjackHandler.playerSurrender(ctx.replyToken, ctx);
        else await handleNoTableSpam(ctx, '❌ 單機模式尚未開放此功能，請在「開桌21點」使用！');
    }, { feature: 'multiplayer', isGroupOnly: true, needAuth: true, isMultiplayer: true, keywords: ['投降', '認輸', 'surrender', '放棄'] });

    // === 其他賭場遊戲 ===
    router.register(/^\s*(尊爵輪盤|VIP輪盤)\s*$/, async (ctx) => {
        await vipWheel.playVIPWheel(ctx.replyToken, ctx.groupId, ctx.userId);
    }, { isDMOnly: true, allowDM: true, feature: 'roulette', gameKey: 'vipwheel', keywords: ['尊爵輪盤', 'VIP輪盤'] });

    router.register(/^\s*(尊爵獎池|VIP獎池)\s*$/, async (ctx) => {
        await vipWheel.showVIPPool(ctx.replyToken);
    }, { isDMOnly: true, allowDM: true, feature: 'roulette', keywords: ['尊爵獎池', 'VIP獎池'] });

    router.register(/^\s*(賽馬場)\s*$/, async (ctx) => {
        await horseRacing.showRaceTrack(ctx.replyToken);
    }, { isDMOnly: true, allowDM: true, feature: 'horse', keywords: ['賽馬場'] });

    router.register(/^\s*(?:賽馬|跑馬)\s+([1-4]|🐎|🦄|🦖|🐢|小紅馬|獨角星|獨角獸|霸王龍|暴龍|忍者龜|烏龜)\s+([0-9０-９.,kKwW萬千百億兆]+|歐印|all\s*in)\s*$/i, async (ctx, match) => {
        const amt = await resolveBetAmount(match[2], ctx.userId);
        await horseRacing.betHorse(ctx.replyToken, ctx.groupId, ctx.userId, match[1], amt);
    }, { isDMOnly: true, allowDM: true, feature: 'horse', gameKey: 'horse', keywords: ['賽馬', '跑馬'] });

    router.register(/^\s*(?:百家樂|baccarat)\s*(莊|莊家|閒|閒家|和|和局|對子|對)\s*([0-9０-９.,kKwW萬千百億兆]+|歐印|all\s*in)\s*$/i, async (ctx, match) => {
        const amt = await resolveBetAmount(match[2], ctx.userId);
        await baccarat.playBaccarat(ctx.replyToken, ctx.groupId, ctx.userId, match[1], amt);
    }, { isDMOnly: true, allowDM: true, feature: 'multiplayer', keywords: ['百家樂', 'baccarat'] });

    router.register(/^\s*輪盤下注\s*(\d+|[0-9０-９.,kKwW萬千百億兆]+\|歐印|all in)\s*$/i, async (ctx, match) => {
        const amt = await resolveBetAmount(match[1], ctx.userId);
        await roulette.startRoulette(ctx.replyToken, ctx.groupId, ctx.userId, amt);
    }, { isDMOnly: true, allowDM: true, feature: 'roulette', keywords: ['輪盤下注'] });

    router.register(/^\s*(?:扣扳機|繼續扣扳機|開槍|打)\s*$/i, async (ctx) => {
        await roulette.shootRoulette(ctx.replyToken, ctx.groupId, ctx.userId);
    }, { isDMOnly: true, allowDM: true, feature: 'roulette', keywords: ['扣扳機', '繼續扣扳機'] });

    router.register(/^\s*(?:拿錢走人|逃跑|走人|退出)\s*$/i, async (ctx) => {
        await roulette.cashOutRoulette(ctx.replyToken, ctx.groupId, ctx.userId);
    }, { isDMOnly: true, allowDM: true, feature: 'roulette', keywords: ['拿錢走人', '逃跑', '走人', '退出'] });

    // === 全新裝備與衝裝系統 (Equipment System) ===
    const equipmentHandler = require('../handlers/equipment');

    router.register(/^\s*(裝備店|看商店|買裝備|裝備商店)\s*$/, async (ctx) => {
        await equipmentHandler.showEquipmentShop(ctx.replyToken);
    }, { isDMOnly: true, allowDM: true, feature: 'rpg', keywords: ['裝備店', '看商店', '買裝備'] });

    router.registerPostback(
        (data) => data.startsWith('action=multi_game_action'),
        async (ctx) => {
            const params = new URLSearchParams(ctx.postbackData);
            const game = params.get('game');
            const cmd = params.get('cmd');
            const amount = params.get('amount');
            ctx.isButton = true;
            
            if (game === 'blackjack') {
                if (cmd === 'hit') await multiBlackjackHandler.playerHit(ctx.replyToken, ctx);
                else if (cmd === 'stand') await multiBlackjackHandler.playerStand(ctx.replyToken, ctx);
                else if (cmd === 'double') await multiBlackjackHandler.playerDoubleDown(ctx.replyToken, ctx);
                else if (cmd === 'surrender') await multiBlackjackHandler.playerSurrender(ctx.replyToken, ctx);
                else if (cmd === 'deal') await multiBlackjackHandler.dealCards(ctx.replyToken, ctx);
            } else if (game === 'reddog') {
                if (cmd === 'start') await multiRedDogHandler.startTable(ctx.replyToken, ctx.groupId, ctx.userId);
                else if (cmd === 'join') await multiRedDogHandler.joinTable(ctx.replyToken, ctx.groupId, ctx.userId);
                else await multiRedDogHandler.handlePlayerAction(ctx.replyToken, ctx.groupId, ctx.userId, cmd, amount || '10');
            } else if (game === 'tenhalf') {
                if (cmd === 'hit') await multiTenHalfHandler.playerHit(ctx.replyToken, ctx);
                else if (cmd === 'stand') await multiTenHalfHandler.playerStand(ctx.replyToken, ctx);
                else if (cmd === 'deal') await multiTenHalfHandler.dealCards(ctx.replyToken, ctx);
            } else if (game === 'niuniu') {
                if (cmd === 'deal') await multiNiuNiuHandler.dealCards(ctx.replyToken, ctx);
            } else if (game === 'tuitongzi') {
                if (cmd === 'deal') await multiTuiTongZiHandler.dealCards(ctx.replyToken, ctx);
            } else if (game === 'shibala') {
                if (cmd === 'deal') await multiShibalaHandler.dealCards(ctx.replyToken, ctx);
            } else if (game === 'goldenflower') {
                if (cmd === 'deal') await multiGoldenFlowerHandler.dealCards(ctx.replyToken, ctx);
            } else if (game === 'baccarat') {
                if (cmd === 'deal') await multiBaccaratHandler.dealCards(ctx.replyToken, ctx);
            }
        }
    );

    router.registerPostback(
        (data) => data.startsWith('action=buy_equip'),
        async (ctx) => {
            const params = new URLSearchParams(ctx.postbackData);
            const type = params.get('type');
            const grade = parseInt(params.get('grade'), 10);
            await equipmentHandler.buyEquipmentPostback(ctx.replyToken, type, grade, ctx.userId, ctx.groupId);
        }
    );

    router.registerPostback(
        (data) => data.startsWith('action=buy_scroll'),
        async (ctx) => {
            const params = new URLSearchParams(ctx.postbackData);
            const type = params.get('type');
            const amount = parseInt(params.get('amount'), 10);
            await equipmentHandler.buyScrollsPostback(ctx.replyToken, type, amount, ctx.userId, ctx.groupId);
        }
    );

    router.registerPostback(
        (data) => data.startsWith('action=enchant_equip'),
        async (ctx) => {
            const params = new URLSearchParams(ctx.postbackData);
            const type = params.get('type');
            const slot = params.get('slot') || 'main'; // 預設 main
            const times = parseInt(params.get('times') || '1', 10);
            const reqId = params.get('reqId') || '';
            await equipmentHandler.enchantEquipmentPostback(ctx.replyToken, type, slot, times, ctx.userId, reqId, ctx.groupId);
        }
    );

    router.registerPostback(
        (data) => data.startsWith('action=buy_and_safe_enchant'),
        async (ctx) => {
            const params = new URLSearchParams(ctx.postbackData);
            const type = params.get('type');
            const slot = params.get('slot') || 'main';
            const grade = parseInt(params.get('grade'), 10);
            const reqId = params.get('reqId') || '';
            await equipmentHandler.buyAndSafeEnchantPostback(ctx.replyToken, type, slot, grade, ctx.userId, ctx.groupId, reqId);
        }
    );

    router.registerPostback(
        (data) => data.startsWith('action=swap_equip'),
        async (ctx) => {
            const params = new URLSearchParams(ctx.postbackData);
            const type = params.get('type');
            await equipmentHandler.swapEquipmentPostback(ctx.replyToken, type, ctx.userId);
        }
    );

    // buy_and_safe_enchant 已在上個區塊實作

    router.register(/^\s*(?:買|購買|買裝備|購買裝備)\s*(武器|盾牌|翅膀|手套)\s*([1-5])\s*$/i, async (ctx) => {
        await equipmentHandler.buyEquipment(ctx.replyToken, ctx.message, ctx.userId, ctx.groupId);
    }, { isDMOnly: true, allowDM: true, feature: 'rpg', keywords: ['買', '購買'] });

    router.register(/^\s*(?:買|購買|買卷軸|買卷)\s*(武卷|防卷|飾品卷|武|防|飾品)(?:卷軸|卷)?\s*(\d+)(?:張|個)?\s*$/i, async (ctx) => {
        await equipmentHandler.buyScrolls(ctx.replyToken, ctx.message, ctx.userId, ctx.groupId);
    }, { isDMOnly: true, allowDM: true, feature: 'rpg', keywords: ['買卷', '買', '購買'] });

    router.register(/^\s*(我的裝備|裝備|看裝備|身上裝備|背包|我的背包)\s*$/, async (ctx) => {
        await equipmentHandler.showMyEquipments(ctx.replyToken, ctx.userId);
    }, { isDMOnly: true, allowDM: true, feature: 'rpg', keywords: ['我的裝備', '裝備', '背包'] });

    router.register(/^\s*(?:強化|衝|點|衝裝|升級)\s*(?:裝備)?\s*(武器|盾牌|翅膀|手套|項鍊|戒指)\s*$/i, async (ctx) => {
        await equipmentHandler.enchantEquipment(ctx.replyToken, ctx.message, ctx.userId);
    }, { isDMOnly: true, allowDM: true, feature: 'rpg', keywords: ['強化', '衝', '點', '升級'] });

    router.register(/^\s*(?:擲骰|骰子|十八啦|洗芭樂)\s*(大|小|豹子)\s*([0-9０-９.,kKwW萬千百億兆]+|歐印|all\s*in)\s*$/i, async (ctx, match) => {
        const amt = await resolveBetAmount(match[2], ctx.userId);
        await diceHandler.rollDice(ctx.replyToken, ctx.groupId, ctx.userId, match[1], amt);
    }, { isDMOnly: true, allowDM: true, feature: 'dice', gameKey: 'dice', keywords: ['擲骰', '骰子', '十八啦', '洗芭樂'] });

    router.register(/^(?:🎰|拉霸|老虎機|slot)(?:\s*([0-9０-９.,kKwW萬千百億兆]+|歐印|all\s*in))?\s*$/i, async (ctx, match) => {
        const amt = await resolveBetAmount(match[1] || '10', ctx.userId);
        await slotHandler.handleSlot(ctx.replyToken, ctx, amt);
    }, { isDMOnly: true, feature: 'slot', allowDM: true, gameKey: 'slot', keywords: ['🎰', '拉霸', '老虎機', 'slot'] });

    // Catch-All for Group Lottery
    router.register((msg) => true, async (ctx, match) => {
        const isLottery = await lotteryHandler.checkLotteryKeyword(ctx.groupId, match[0]);
        if (isLottery) {
            const result = await lotteryHandler.joinLottery(ctx.groupId, ctx.userId, match[0]);
            if (result) await lineUtils.replyText(ctx.replyToken, result.message);
            return true;
        }
        return false;
    }, { isGroupOnly: true, needAuth: true, feature: 'lottery' });
};
