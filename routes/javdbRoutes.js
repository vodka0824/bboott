module.exports = function (router, handlers) {
    const { javdbHandler } = handlers;

    // === 車牌查詢 ===
    router.register(/^\s*(車牌|番號)\s+([A-Za-z0-9-]+)\s*$/, async (ctx, match) => {
        await javdbHandler.handleJavdbQuery(ctx.replyToken, match[2]);
    }, { allowDM: true, feature: 'javdb', keywords: ['車牌', '番號'] });
};
