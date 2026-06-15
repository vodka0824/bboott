module.exports = function (router, handlers) {
    const { auctionHandler } = handlers;

    // === 拍賣系統 ===
    router.register(/^\s*發起(?:拍賣|競標)\s+(.+?)\s+(\d+)\s+(\d+)(?:\s+(.+))?\s*$/, async (ctx, match) => {
        const keyword = match[4] || match[1];
        await auctionHandler.startAuction(ctx.replyToken, ctx.groupId, ctx.userId, match[1], match[2], match[3], keyword);
    }, { isGroupOnly: true, needAdmin: true, feature: 'auction', keywords: ['發起拍賣', '發起競標'] });

    router.register(/^\s*(?:拍賣|競標)狀態\s*$/, async (ctx) => {
        await auctionHandler.checkAuctionStatus(ctx.replyToken, ctx.groupId);
    }, { isGroupOnly: true, feature: 'auction', keywords: ['拍賣狀態', '競標狀態'] });

    router.register(/^\s*出價\s+([\+\-]?\d+)\s*$/, async (ctx, match) => {
        await auctionHandler.placeBidExplicit(ctx.replyToken, ctx.groupId, ctx.userId, match[1]);
    }, { isGroupOnly: true, feature: 'auction', keywords: ['出價'] });

    router.register(/^\s*結束(?:拍賣|競標)(?:\s+(.+))?\s*$/, async (ctx, match) => {
        await auctionHandler.endAuction(ctx.replyToken, ctx.groupId, ctx.userId, match[1]);
    }, { isGroupOnly: true, needAdmin: true, feature: 'auction', keywords: ['結束拍賣', '結束競標'] });

    // 攔截所有文字訊息檢查是否為拍賣關鍵字
    router.register((msg) => true, async (ctx) => {
        const isKeyword = await auctionHandler.checkAuctionKeyword(ctx.groupId, ctx.message);
        if (isKeyword) {
            const result = await auctionHandler.placeBid(ctx.groupId, ctx.userId, ctx.message);
            if (result) {
                const lineUtils = require('../utils/line');
                if (result.success && result.bubble) {
                    await lineUtils.replyFlex(ctx.replyToken, result.message, result.bubble);
                } else if (result.message) {
                    await lineUtils.replyText(ctx.replyToken, result.message);
                }
            }
            return true; // 讓其他指令不繼續執行
        }
        return false; // 讓其他指令繼續執行
    }, { isGroupOnly: true, feature: 'auction', keywords: [] });
};
