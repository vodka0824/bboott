module.exports = function(router, handlers) {
    const { rpgHandler } = handlers;
    
    // RPG 系統相關指令
    router.register(
        /^\s*(狀態|我的屬性|屬性|我的狀態)\s*$/i,
        (context) => rpgHandler.handleMyStats(context),
        { isGroupOnly: false, allowDM: true, needAuth: false, feature: 'rpg' }
    );
    // RPG 排行榜
    router.register(
        /^\s*(RPG排行榜|戰鬥力排行榜)\s*$/i,
        (context) => rpgHandler.handleRpgRank(context),
        { isGroupOnly: false, allowDM: true, needAuth: false, feature: 'rpg_leaderboard', keywords: ['RPG排行榜', '戰鬥力排行榜'] }
    );

    

};

