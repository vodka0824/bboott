module.exports = function(router, handlers) {
    const { rpgHandler } = handlers;
    
    // RPG 系統相關指令
    router.register(
        /^\s*(狀態|我的屬性|屬性|我的狀態|個人狀態|查詢個人狀態|查詢狀態)(?:\s+(?:@)?(.+?))?\s*$/i,
        (context, match) => {
            let targetUserId = context.userId;
            if (context.messageObject && context.messageObject.mention && context.messageObject.mention.mentionees && context.messageObject.mention.mentionees.length > 0) {
                targetUserId = context.messageObject.mention.mentionees[0].userId;
            }
            return handlers.economyHandler.queryPlayerProfile(context.replyToken, context.groupId, targetUserId, context.userId);
        },
        { isGroupOnly: false, allowDM: true, needAuth: false, feature: 'rpg', keywords: ['狀態', '屬性', '個人'] }
    );
    // RPG 排行榜
    router.register(
        /^\s*(RPG排行榜|戰鬥力排行榜)\s*$/i,
        (context) => rpgHandler.handleRpgRank(context),
        { isGroupOnly: false, allowDM: true, needAuth: false, feature: 'rpg_leaderboard', keywords: ['RPG排行榜', '戰鬥力排行榜'] }
    );

    

};

