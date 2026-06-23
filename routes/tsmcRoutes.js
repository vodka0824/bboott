const tsmcHandler = require('../handlers/tsmc');
const lineUtils = require('../utils/line');

module.exports = function(router, handlers) {
    router.register(/^(?:入職台積)$/i, async (ctx) => {
        await tsmcHandler.joinTsmc(ctx.replyToken, ctx.groupId, ctx.userId);
    }, { feature: 'tsmc', keywords: ['入職台積'] });

    router.register(/^(?:離職)$/i, async (ctx) => {
        await tsmcHandler.leaveTsmc(ctx.replyToken, ctx.groupId, ctx.userId);
    }, { feature: 'tsmc', keywords: ['離職'] });

    router.register(/^(?:放乖乖)$/i, async (ctx) => {
        await tsmcHandler.placeKuaiKuai(ctx.replyToken, ctx.groupId, ctx.userId);
    }, { feature: 'tsmc', keywords: ['放乖乖'] });

    router.register(/^(?:加班)$/i, async (ctx) => {
        await tsmcHandler.overtime(ctx.replyToken, ctx.groupId, ctx.userId);
    }, { feature: 'tsmc', keywords: ['加班'] });

    router.register(/^(?:甩鍋)\s+(?:@([^\s]+))$/i, async (ctx, match) => {
        const targetId = lineUtils.extractUserIdFromAt(ctx.message);
        if (!targetId) {
            await lineUtils.replyText(ctx.replyToken, '❌ 請正確標註對象，例如：甩鍋 @玩家');
            return;
        }
        await tsmcHandler.scapegoat(ctx.replyToken, ctx.groupId, ctx.userId, targetId);
    }, { feature: 'tsmc', isGroupOnly: true, keywords: ['甩鍋'] });

    // 管理員測試指令
    router.register(/^(?:台積測試|tsmc_test)$/i, async (ctx) => {
        const { ADMIN_USER_ID } = require('../config/constants');
        if (ctx.userId !== ADMIN_USER_ID) {
            await lineUtils.replyText(ctx.replyToken, '❌ 權限不足：此為管理員專用測試指令。');
            return;
        }
        const tsmcService = require('../services/tsmcService');
        await tsmcService.triggerAlarmTest(ctx.replyToken, ctx.groupId);
    }, { feature: 'tsmc', isGroupOnly: true, keywords: ['台積測試'] });
};
