module.exports = function registerAtonementRoutes(router, handlers) {
    const { atonementHandler } = handlers;

    if (!atonementHandler) {
        console.error('[Router] atonementHandler is not provided!');
        return;
    }

    router.register(/^(向神明懺悔|贖罪|懺悔)$/, async (ctx) => {
        await atonementHandler.handleConfession(ctx.replyToken, ctx);
    }, { isDMOnly: true, allowDM: true, feature: 'atonement', keywords: ['向神明懺悔', '贖罪', '懺悔'] });

    router.register(/^出賣靈魂$/, async (ctx) => {
        await atonementHandler.handleSellSoul(ctx.replyToken, ctx);
    }, { isDMOnly: true, allowDM: true, feature: 'atonement', keywords: ['出賣靈魂'] });

    router.register(/^贖罪說明$/, async (ctx) => {
        await atonementHandler.handleAtonementInfo(ctx.replyToken);
    }, { allowDM: true, feature: 'atonement', keywords: ['贖罪說明'] });
};
