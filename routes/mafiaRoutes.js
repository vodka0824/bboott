/**
 * 黑社會系統路由
 */
module.exports = function(router, handlers) {
    const { mafiaHandler } = handlers;

    router.register(/^(加入黑幫|拜大哥)$/, async (context) => {
        await mafiaHandler.handleJoinMafia(context.replyToken, context);
    }, { feature: 'economy', isGroupOnly: true, needAuth: true });

    router.register(/^(退出黑幫|金盆洗手|斷手指|斷指)$/, async (context) => {
        await mafiaHandler.handleCutFinger(context.replyToken, context);
    }, { feature: 'economy', isGroupOnly: true, needAuth: true });

    router.register(/^(收保護費)$/, async (context) => {
        await mafiaHandler.handleProtectionFee(context.replyToken, context);
    }, { feature: 'economy', isGroupOnly: true, needAuth: true });

    router.register(/^(勒索政客|勒索)$/, async (context) => {
        await mafiaHandler.handleExtortCouncilors(context.replyToken, context);
    }, { feature: 'economy', isGroupOnly: true, needAuth: true });

    router.register(/^(圍事)$/, async (context) => {
        await mafiaHandler.handleTurfWar(context.replyToken, context);
    }, { feature: 'economy', isGroupOnly: true, needAuth: true });

    router.register(/^(篡位暗殺|暗殺|篡位|暗殺老大)$/, async (context) => {
        await mafiaHandler.handleUsurp(context.replyToken, context);
    }, { feature: 'economy', isGroupOnly: true, needAuth: true });
};
