/**
 * 警察與黑道老大路由
 */
module.exports = function(router, handlers) {
    const { policeHandler } = handlers;

    // 報考警察
    router.register(/^(報考警察|考警察)$/, async (context) => {
        await policeHandler.handleJoinPolice(context.replyToken, context);
    }, { isGroupOnly: true, needAuth: true });

    // 辭職
    router.register(/^(辭職|辭退警察)$/, async (context) => {
        await policeHandler.handleResignPolice(context.replyToken, context);
    }, { isGroupOnly: true, needAuth: true });

    // 逮捕
    router.register(/^(逮捕|合法逮捕)(.*)$/, async (context, match) => {
        await policeHandler.handleArrest(context.replyToken, context, context.messageObject);
    }, { isGroupOnly: true, needAuth: true });


    // 暗殺警察 (黑道老大專屬)
    router.register(/^(暗殺警察|暗殺)(.*)$/, async (context, match) => {
        await policeHandler.handleAssassinatePolice(context.replyToken, context, context.messageObject);
    }, { isGroupOnly: true, needAuth: true });

    // === Postback ===
    router.registerPostback('offerBribe', async (context) => {
        await policeHandler.handleOfferBribe(context.replyToken, context);
    });

    router.registerPostback('quickArrest', async (context) => {
        await policeHandler.handleQuickArrest(context.replyToken, context);
    });
};
