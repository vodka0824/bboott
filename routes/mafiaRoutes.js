/**
 * 黑社會系統路由
 */
module.exports = function(router, handlers) {
    const { mafiaHandler } = handlers;

    router.register(/^(加入黑幫|拜大哥)$/, async (context) => {
        await mafiaHandler.handleJoinMafia(context.replyToken, context);
    }, { isGroupOnly: true, needAuth: true });

    router.register(/^(退出黑幫|金盆洗手)$/, async (context) => {
        await mafiaHandler.handleLeaveMafia(context.replyToken, context);
    }, { isGroupOnly: true, needAuth: true });

    router.register(/^(收保護費)$/, async (context) => {
        await mafiaHandler.handleProtectionFee(context.replyToken, context);
    }, { isGroupOnly: true, needAuth: true });

    router.register(/^(勒索政客)$/, async (context) => {
        await mafiaHandler.handleExtortCouncilors(context.replyToken, context);
    }, { isGroupOnly: true, needAuth: true });
};
