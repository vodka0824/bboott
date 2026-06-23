/**
 * 監獄系統相關路由
 */
const lineUtils = require('../utils/line');

module.exports = function(router, handlers) {
    const { jailHandler } = handlers;

    router.register(/^(交保|保釋)(.*)$/, async (context, match) => {
        const mentionObj = context.messageObject && context.messageObject.mention;
        if (mentionObj && mentionObj.mentionees && mentionObj.mentionees.length > 0) {
            await jailHandler.handleBailOther(context.replyToken, context, context.messageObject);
        } else {
            await jailHandler.handleBail(context.replyToken, context);
        }
    }, { feature: 'economy', isGroupOnly: true, needAuth: true });

    router.register(/^(越獄)$/, async (context) => {
        await jailHandler.handleJailbreak(context.replyToken, context);
    }, { feature: 'economy', isGroupOnly: true, needAuth: true });

    router.register(/^(撿肥皂)$/, async (context) => {
        await jailHandler.handleDropSoap(context.replyToken, context);
    }, { feature: 'economy', isGroupOnly: true, needAuth: true });

    router.register(/^(吹喇叭|幫典獄長吹喇叭)$/, async (context) => {
        await jailHandler.handleBlowWarden(context.replyToken, context);
    }, { feature: 'economy', isGroupOnly: true, needAuth: true });

    router.register(/^(勞動|勞動改造)$/, async (context) => {
        await jailHandler.handleLabor(context.replyToken, context);
    }, { feature: 'economy', isGroupOnly: true, needAuth: true });

    router.register(/^(施壓|施壓出獄)$/, async (context) => {
        await jailHandler.handlePressure(context.replyToken, context);
    }, { feature: 'economy', isGroupOnly: true, needAuth: true });

    router.register(/^(探監)(.*)$/, async (context, match) => {
        await jailHandler.handleVisit(context.replyToken, context, context.messageObject);
    }, { feature: 'economy', isGroupOnly: true, needAuth: true });

    router.register(/^(暴動|發起暴動)$/, async (context) => {
        await jailHandler.handleRiot(context.replyToken, context);
    }, { feature: 'economy', isGroupOnly: true, needAuth: true });

    router.register(/^(監獄名單|探監名單|查監獄)$/, async (context) => {
        await jailHandler.handleJailList(context.replyToken);
    }, { feature: 'economy', isGroupOnly: false, allowDM: true, needAuth: false });

    router.register(/^\s*(監獄榜|前科榜|監獄排行榜|前科排行榜)\s*$/, async (context) => {
        const economyHandler = require('../handlers/economy');
        await economyHandler.showCombinedWantedAndJailRank(context.replyToken, context.groupId);
    }, { feature: 'economy', isGroupOnly: true, needAuth: true });

    // 二次確認與賄賂路由
    router.register(/^(確認交保)$/, async (context) => {
        await jailHandler.confirmBail(context.replyToken, context);
    }, { feature: 'economy', isGroupOnly: true, needAuth: true });

    router.register(/^(確認保釋)(.*)$/, async (context, match) => {
        await jailHandler.confirmBailOther(context.replyToken, context, match[2]);
    }, { feature: 'economy', isGroupOnly: true, needAuth: true });

    router.register(/^(賄賂|賄賂局長)$/, async (context) => {
        await jailHandler.handleBribePrompt(context.replyToken, context);
    }, { feature: 'economy', isGroupOnly: true, needAuth: true });

    router.register(/^(賄賂|賄賂局長)\s+(\d+)$/, async (context, match) => {
        await jailHandler.handleBribe(context.replyToken, context, parseInt(match[2], 10));
    }, { feature: 'economy', isGroupOnly: true, needAuth: true });

    router.register(/^(確認賄賂)\s+(\d+)$/, async (context, match) => {
        await jailHandler.confirmBribe(context.replyToken, context, parseInt(match[2], 10));
    }, { feature: 'economy', isGroupOnly: true, needAuth: true });

    // --- 外層洗白贖罪機制 ---
    router.register(/^(抄寫佛經)$/, async (context) => {
        await jailHandler.handleSutra(context.replyToken, context);
    }, { feature: 'economy', isGroupOnly: true, needAuth: true });

    router.register(/^(精神鑑定)$/, async (context) => {
        await jailHandler.handlePsychiatric(context.replyToken, context);
    }, { feature: 'economy', isGroupOnly: true, needAuth: true });

    router.register(/^(參選議員)$/, async (context) => {
        await jailHandler.handleElection(context.replyToken, context);
    }, { feature: 'economy', isGroupOnly: true, needAuth: true });

    router.register(/^(找替死鬼)(.*)$/, async (context, match) => {
        await jailHandler.handleScapegoat(context.replyToken, context, context.messageObject);
    }, { feature: 'economy', isGroupOnly: true, needAuth: true });

    router.register(/^(公益捐款|政治獻金)\s+(\d+)$/, async (context, match) => {
        await jailHandler.handleDonation(context.replyToken, context, parseInt(match[2], 10));
    }, { feature: 'economy', isGroupOnly: true, needAuth: true });

    // --- 免費洗白機制 ---
    router.register(/^(開直播)$/, async (context) => {
        await jailHandler.handleLiveStream(context.replyToken, context);
    }, { feature: 'economy', isGroupOnly: true, needAuth: true });

    router.register(/^(污點證人)(.*)$/, async (context, match) => {
        await jailHandler.handleSnitch(context.replyToken, context, context.messageObject);
    }, { feature: 'economy', isGroupOnly: true, needAuth: true });

    router.register(/^(簽下去)$/, async (context) => {
        await jailHandler.handleEnlist(context.replyToken, context);
    }, { feature: 'economy', isGroupOnly: true, needAuth: true });

    router.register(/^(退伍)$/, async (context) => {
        await jailHandler.handleDischarge(context.replyToken, context);
    }, { feature: 'economy', isGroupOnly: true, needAuth: true });

    router.register(/^(驗退)$/, async (context) => {
        await jailHandler.handleMedicalDischarge(context.replyToken, context);
    }, { feature: 'economy', isGroupOnly: true, needAuth: true });

    router.register(/^\s*(絕食|開始絕食)\s*$/, async (context) => {
        await jailHandler.handleHungerStrike(context.replyToken, context);
    }, { feature: 'economy', isGroupOnly: true, needAuth: true });

        // === 軍中惡搞小遊戲 ===
    router.register(/^\s*(出公差|拔草|掃地|站夜哨|裝病逃操|裝病|打靶測驗|打靶|高裝檢|漢光演習)\s*$/, async (context, match) => {
        await jailHandler.handleMilitaryGame(context.replyToken, context, match[1]);
    }, { isGroupOnly: true, needAuth: true, feature: 'bank' });

    router.register(/^\s*(一鍵幹活|一鍵出操|全部執行)\s*$/, async (context) => {
        await jailHandler.handleBatchMilitaryGames(context.replyToken, context);
    }, { isGroupOnly: true, needAuth: true, feature: 'bank' });

    router.register(/^\s*(領終身俸)\s*$/, async (context) => {
        await jailHandler.handlePension(context.replyToken, context);
    }, { isGroupOnly: true, needAuth: true, feature: 'bank' });

    router.register(/^\s*(發動戰爭)\s*$/, async (context) => {
        await jailHandler.handleDeclareWar(context.replyToken, context);
    }, { feature: 'economy', isGroupOnly: true, needAuth: true });

    router.register(/^\s*研發軍火\s*$/, async (context) => {
        await jailHandler.handleArmsDealerMenu(context.replyToken, context);
    }, { feature: 'economy', isGroupOnly: true, needAuth: true });

    router.register(/^\s*研發軍火\s+(零件|輕武器|輕兵器|重武器|特殊武器)\s*$/, async (context, match) => {
        await jailHandler.handleArmsDealer(context.replyToken, context, match[1]);
    }, { feature: 'economy', isGroupOnly: true, needAuth: true });

    router.register(/^(拖下水)(.*)$/, async (context, match) => {
        await jailHandler.handleDragDown(context.replyToken, context, context.messageObject);
    }, { feature: 'economy', isGroupOnly: true, needAuth: true });

    // 攔截 Postback 確認按鈕
    router.registerPostback(
        (data) => {
            try {
                const action = new URLSearchParams(data).get('action');
                return ['confirmBailOther', 'confirmBail', 'confirmBribe', 'jailAction', 'confirmJailbreak', 'batchMilitaryGames'].includes(action);
            } catch (e) { return false; }
        },
        async (ctx) => {
            const params = new URLSearchParams(ctx.postbackData);
            const action = params.get('action');
            const targetId = params.get('targetId');
            
            // 驗證發起人
            if (action === 'confirmBailOther') {
                const initiatorId = params.get('initiatorId');
                if (initiatorId && ctx.userId !== initiatorId) {
                    if (!ctx.isButton) await lineUtils.replyText(ctx.replyToken, '❌ 只有發起人可以點擊確認保釋！');
                    return;
                }
                if (targetId) {
                    const bailAmount = params.has('bailAmount') ? parseInt(params.get('bailAmount'), 10) : null;
                    await jailHandler.confirmBailOther(ctx.replyToken, ctx, targetId, bailAmount);
                }
            } 
            else if (action === 'confirmBail') {
                if (targetId && ctx.userId !== targetId) {
                    if (!ctx.isButton) await lineUtils.replyText(ctx.replyToken, '❌ 這不是你的交保單！');
                    return;
                }
                const bailAmount = params.has('bailAmount') ? parseInt(params.get('bailAmount'), 10) : null;
                await jailHandler.confirmBail(ctx.replyToken, ctx, bailAmount);
            }
            else if (action === 'confirmBribe') {
                if (targetId && ctx.userId !== targetId) {
                    if (!ctx.isButton) await lineUtils.replyText(ctx.replyToken, '❌ 這不是你的賄賂單！');
                    return;
                }
                const amount = parseInt(params.get('amount'), 10);
                if (!isNaN(amount)) await jailHandler.confirmBribe(ctx.replyToken, ctx, amount);
            }
            else if (action === 'confirmJailbreak') {
                if (targetId && ctx.userId !== targetId) {
                    if (!ctx.isButton) await lineUtils.replyText(ctx.replyToken, '❌ 這不是你的越獄單！');
                    return;
                }
                await jailHandler.confirmJailbreak(ctx.replyToken, ctx);
            }
            else if (action === 'jailAction') {
                if (targetId && ctx.userId !== targetId) {
                    // 其它人點擊無回應
                    return;
                }
                const cmd = params.get('cmd');
                if (cmd) {
                    ctx.message = cmd;
                    const router = require('../utils/router');
                    await router.execute(cmd, ctx);
                }
            }
            else if (action === 'batchMilitaryGames') {
                if (targetId && ctx.userId !== targetId) return;
                await jailHandler.handleBatchMilitaryGames(ctx.replyToken, ctx);
            }
        }
    );
};
