/**
 * 警察與黑道老大路由
 */
module.exports = function(router, handlers) {
    const { policeHandler } = handlers;

    // 報考警察
    router.register(/^(報考警察|考警察)$/, async (context) => {
        await policeHandler.handleJoinPolice(context.replyToken, context);
    }, { feature: 'economy', isGroupOnly: true, needAuth: true });

    // 辭職
    router.register(/^(辭職|辭退警察)$/, async (context) => {
        await policeHandler.handleResignPolice(context.replyToken, context);
    }, { feature: 'economy', isGroupOnly: true, needAuth: true });

    // 逮捕
    router.register(/^(逮捕|合法逮捕)(.*)$/, async (context, match) => {
        await policeHandler.handleArrest(context.replyToken, context, context.messageObject);
    }, { feature: 'economy', isGroupOnly: true, needAuth: true });


    // 暗殺警察 (黑道老大專屬)
    router.register(/^暗殺警察(?:\s+|@)(.+?)\s*$/, async (context, match) => {
        const policeCorruptionService = require('../services/policeCorruptionService');
        await policeCorruptionService.handleAssassinatePolice(context.replyToken, context, context.messageObject);
    }, { feature: 'economy', isGroupOnly: true, needAuth: true });

    // 貪污起訴 (限議員)
    router.register(/^(貪污起訴)(.*)$/, async (context, match) => {
        await policeHandler.handleIndict(context.replyToken, context, context.messageObject);
    }, { feature: 'economy', isGroupOnly: true, needAuth: true });

    // 臨檢 (限平民)
    router.register(/^(臨檢)(.*)$/, async (context, match) => {
        await policeHandler.handleFrisk(context.replyToken, context, context.messageObject);
    }, { feature: 'economy', isGroupOnly: true, needAuth: true });

    // 吃案 (限黑道)
    router.register(/^(吃案)(.*)$/, async (context, match) => {
        await policeHandler.handleCoverUp(context.replyToken, context, context.messageObject);
    }, { feature: 'economy', isGroupOnly: true, needAuth: true });

    // 霹靂攻堅 (局長專屬)
    router.register(/^(霹靂攻堅|攻堅)$/, async (context) => {
        await policeHandler.handleRaid(context.replyToken, context);
    }, { feature: 'economy', isGroupOnly: true, needAuth: true });

    // === Postback ===
    router.registerPostback('offerBribe', async (context) => {
        await policeHandler.handleOfferBribe(context.replyToken, context);
    });

    router.registerPostback('quickArrest', async (context) => {
        await policeHandler.handleQuickArrest(context.replyToken, context);
    });
};
