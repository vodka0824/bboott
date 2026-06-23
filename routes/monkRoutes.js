const monkHandler = require('../handlers/monk');
const lineUtils = require('../utils/line');

module.exports = function(router, handlers) {
    router.register(/^(?:出家|剃度)$/i, async (ctx) => {
        await monkHandler.becomeMonk(ctx.replyToken, ctx.groupId, ctx.userId);
    }, { feature: 'economy', keywords: ['出家', '剃度'] });

    router.register(/^(?:還俗)$/i, async (ctx) => {
        await monkHandler.leaveMonk(ctx.replyToken, ctx.groupId, ctx.userId);
    }, { feature: 'economy', keywords: ['還俗'] });

    router.register(/^(?:算命)$/i, async (ctx) => {
        await monkHandler.fortuneTelling(ctx.replyToken, ctx.groupId, ctx.userId);
    }, { feature: 'economy', keywords: ['算命'] });

    router.register(/^(?:誦經)$/i, async (ctx) => {
        await monkHandler.chanting(ctx.replyToken, ctx.groupId, ctx.userId);
    }, { feature: 'economy', keywords: ['誦經'] });

    router.register(/^(?:放生)$/i, async (ctx) => {
        await monkHandler.releaseAnimal(ctx.replyToken, ctx.groupId, ctx.userId);
    }, { feature: 'economy', keywords: ['放生'] });

    router.register(/^(?:化緣)$/i, async (ctx) => {
        await monkHandler.begging(ctx.replyToken, ctx.groupId, ctx.userId);
    }, { feature: 'economy', keywords: ['化緣'] });

    router.register(/^(?:弘法)$/i, async (ctx) => {
        await monkHandler.preach(ctx.replyToken, ctx.groupId, ctx.userId);
    }, { feature: 'economy', keywords: ['弘法'] });

    router.register(/^(?:辦法會|法會)$/i, async (ctx) => {
        await monkHandler.ceremony(ctx.replyToken, ctx.groupId, ctx.userId);
    }, { feature: 'economy', keywords: ['辦法會', '法會'] });

    router.register(/^(?:賣塔位)\s+(?:@([^\s]+))$/i, async (ctx, match) => {
        const targetId = lineUtils.extractUserIdFromAt(ctx.message);
        if (!targetId) {
            await lineUtils.replyText(ctx.replyToken, '❌ 請正確標註對象，例如：賣塔位 @玩家');
            return;
        }
        await monkHandler.sellNiche(ctx.replyToken, ctx.groupId, ctx.userId, targetId);
    }, { feature: 'economy', isGroupOnly: true, keywords: ['賣塔位'] });

    router.register(/^(?:雙修)\s+(?:@([^\s]+))$/i, async (ctx, match) => {
        const targetId = lineUtils.extractUserIdFromAt(ctx.message);
        if (!targetId) {
            await lineUtils.replyText(ctx.replyToken, '❌ 請正確標註對象，例如：雙修 @玩家');
            return;
        }
        await monkHandler.dualCultivation(ctx.replyToken, ctx.groupId, ctx.userId, targetId);
    }, { feature: 'economy', isGroupOnly: true, keywords: ['雙修'] });

    router.register(/^(?:蓋廟)\s+([0-9０-９.,kKwW萬千百億兆]+|歐印|all\s*in)$/i, async (ctx, match) => {
        const { resolveBetAmount } = require('../utils/formatUtils');
        const resolvedAmt = await resolveBetAmount(match[1], ctx.userId);
        const amount = parseInt(resolvedAmt, 10);
        if (isNaN(amount) || amount <= 0) {
            await lineUtils.replyText(ctx.replyToken, '❌ 請輸入正確金額，例如：蓋廟 200萬');
            return;
        }
        await monkHandler.buildTemple(ctx.replyToken, ctx.groupId, ctx.userId, amount);
    }, { feature: 'economy', keywords: ['蓋廟'] });

    router.register(/^(?:蓋廟)$/i, async (ctx, match) => {
        await monkHandler.buildTempleInfo(ctx.replyToken, ctx.groupId, ctx.userId);
    }, { feature: 'economy', keywords: ['蓋廟'] });

    router.registerPostback('buildTempleConfirm', async (ctx) => {
        const params = new URLSearchParams(ctx.postbackData);
        const amount = parseInt(params.get('amount'), 10);
        if (isNaN(amount) || amount <= 0) return;
        // Optionally pass a flag to tell buildTemple it's from a postback
        await monkHandler.buildTemple(ctx.replyToken, ctx.groupId, ctx.userId, amount, true);
    });

    router.registerPostback('batchMonkGames', async (ctx) => {
        await monkHandler.handleBatchMonkGames(ctx.replyToken, ctx);
    });
};
