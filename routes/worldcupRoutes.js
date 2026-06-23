module.exports = function(router, handlers) {
    const { worldcupHandler, lineUtils } = handlers;
    
    // 管理員指令
    router.register(/^(?:\/)?手動開盤(?:\s+(.+))?$/, async (ctx, match) => {
        const args = match[1] ? match[1].split(/\s+/) : [];
        await worldcupHandler.openManualMatch(ctx.replyToken, ctx.userId, args);
    }, { adminOnly: true, allowDM: true });

    router.register(/^(?:\/)?設定讓分(?:\s+(.+))?$/, async (ctx, match) => {
        const args = match[1] ? match[1].split(/\s+/) : [];
        await worldcupHandler.setHandicapMatch(ctx.replyToken, ctx.userId, args);
    }, { adminOnly: true, allowDM: true });

    router.register(/^(?:\/)?設定鎖盤(?:\s+(.+))?$/, async (ctx, match) => {
        const args = match[1] ? match[1].split(/\s+/) : [];
        await worldcupHandler.setMatchLockTime(ctx.replyToken, ctx.userId, args);
    }, { adminOnly: true, allowDM: true });

    router.register(/^(?:\/)?結算運彩(?:\s+(.+))?$/, async (ctx, match) => {
        const args = match[1] ? match[1].split(/\s+/) : [];
        await worldcupHandler.settleMatch(ctx.replyToken, ctx.userId, args);
    }, { adminOnly: true, allowDM: true });

    router.register(/^(?:\/)?鎖盤運彩(?:\s+(.+))?$/, async (ctx, match) => {
        const args = match[1] ? match[1].split(/\s+/) : [];
        await worldcupHandler.lockMatch(ctx.replyToken, ctx.userId, args);
    }, { adminOnly: true, allowDM: true });

    router.register(/^(?:\/)?運彩管理$/, async (ctx) => {
        await worldcupHandler.manageMatches(ctx.replyToken, ctx.userId);
    }, { adminOnly: true, allowDM: true });

    // 玩家指令
    router.register(/^(?:\/)?運彩$/, async (ctx) => {
        await worldcupHandler.showMatches(ctx.replyToken, ctx.userId);
    }, { allowDM: true, feature: 'worldcup', keywords: ['運彩'] });

    router.register(/^(?:\/)?我的運彩$/, async (ctx) => {
        await worldcupHandler.myBets(ctx.replyToken, ctx.userId);
    }, { allowDM: true, feature: 'worldcup', keywords: ['我的運彩'] });

    router.register(/^(?:\/)?運彩詳情(?:\s+(.+))?$/, async (ctx, match) => {
        const args = match[1] ? match[1].split(/\s+/) : [];
        await worldcupHandler.matchDetails(ctx.replyToken, ctx.userId, args);
    }, { allowDM: true, feature: 'worldcup', keywords: ['運彩詳情'] });

    // Postback
    router.registerPostback('bet_wc', async (ctx) => {
        const params = new URLSearchParams(ctx.postbackData);
        const dataObj = Object.fromEntries(params);
        await worldcupHandler.handleBetPostback(ctx.replyToken, ctx.userId, dataObj);
    });

    router.registerPostback('admin_wc_action', async (ctx) => {
        const { isSuperAdmin } = require('../utils/auth');
        if (!isSuperAdmin(ctx.userId)) {
            return; // 根據需求，非管理員點擊不做任何反應
        }
        const params = new URLSearchParams(ctx.postbackData);
        const dataObj = Object.fromEntries(params);
        // Auth check happens inside handler or we can check here
        await worldcupHandler.handleAdminPostback(ctx.replyToken, ctx.userId, dataObj);
    });

    router.registerPostback('bet_wc_amount', async (ctx) => {
        const params = new URLSearchParams(ctx.postbackData);
        const amountStr = params.get('amount');
        const userState = require('../utils/userState');
        const state = await userState.getUserState(ctx.userId);
        if (state && state.action === 'waiting_wc_bet_amount') {
            await worldcupHandler.processBetAmount(ctx.replyToken, ctx.groupId, ctx.userId, amountStr, state);
        } else {
            const lineUtils = require('../utils/line');
            await lineUtils.replyText(ctx.replyToken, "❌ 操作已逾時，或該筆押注已送出，請至「我的運彩」確認。");
        }
    });

    router.registerPostback('bet_wc_confirm', async (ctx) => {
        const params = new URLSearchParams(ctx.postbackData);
        const confirmStr = params.get('confirm');
        const userState = require('../utils/userState');
        const state = await userState.getUserState(ctx.userId);
        if (state && state.action === 'waiting_wc_bet_confirm') {
            await worldcupHandler.processBetConfirm(ctx.replyToken, ctx.groupId, ctx.userId, confirmStr, state);
        } else {
            const lineUtils = require('../utils/line');
            await lineUtils.replyText(ctx.replyToken, "❌ 操作已逾時，或該筆押注已成功送出，請至「我的運彩」確認。");
        }
    });

    // Pagination Postbacks
    router.registerPostback('show_wc_page', async (ctx) => {
        const params = new URLSearchParams(ctx.postbackData);
        const page = parseInt(params.get('page'), 10) || 1;
        await worldcupHandler.showMatches(ctx.replyToken, ctx.userId, page);
    });

    router.registerPostback('my_bets_page', async (ctx) => {
        const params = new URLSearchParams(ctx.postbackData);
        const page = parseInt(params.get('page'), 10) || 1;
        await worldcupHandler.myBets(ctx.replyToken, ctx.userId, page);
    });
};
