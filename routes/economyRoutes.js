module.exports = function (router, handlers) {
    console.log("[DEBUG] Handlers in economyRoutes:", Object.keys(handlers));
    const { financeHandler, economyHandler } = handlers;
    console.log("[DEBUG] economyHandler is:", economyHandler ? "defined" : "undefined");

    // === 分期/借款 ===
    router.register(/^分唄(\d+)$/, async (ctx, match) => {
        await financeHandler.handleInstallmentFenbei(ctx.replyToken, parseInt(match[1]));
    }, { allowDM: true, feature: 'finance', keywords: ['分唄'] }); 

    router.register(/^銀角(\d+)$/, async (ctx, match) => {
        await financeHandler.handleInstallmentYinjiao(ctx.replyToken, parseInt(match[1]));
    }, { allowDM: true, feature: 'finance', keywords: ['銀角'] }); 

    router.register(/^刷卡(\d+)$/, async (ctx, match) => {
        await financeHandler.handleInstallmentCredit(ctx.replyToken, parseInt(match[1]));
    }, { allowDM: true, feature: 'finance', keywords: ['刷卡'] }); 

    // === 哭幣 (Ku Coin) 系統 ===
    
    // 1. 我的哭幣 / 錢包
    router.register(/^\s*(?:我的哭幣|我的餘額|錢包|餘額|查餘額)\s*$/i, async (ctx) => {
        await economyHandler.checkBalance(ctx.replyToken, ctx.groupId, ctx.userId);
        return true;
    }, { isGroupOnly: false, needAuth: true, allowDM: true, feature: 'bank', keywords: ['我的哭幣', '錢包', '餘額'] });

    // 2. 每日簽到
    router.register(/^\s*(?:每日簽到|簽到|領哭幣|領錢)\s*$/i, async (ctx) => {
        await economyHandler.dailyCheckIn(ctx.replyToken, ctx.groupId, ctx.userId);
    }, { isGroupOnly: true, needAuth: true, feature: 'bank', keywords: ['簽到', '領哭幣', '領錢'] });

    // 2.5 乞討 (For bankrupt players)
    router.register(/^\s*(?:乞討|要飯|求包養)\s*$/i, async (ctx) => {
        await economyHandler.begCoin(ctx.replyToken, ctx.groupId, ctx.userId);
    }, { isGroupOnly: true, needAuth: true, feature: 'bank', keywords: ['乞討', '要飯', '求包養'] });

    // 2.7 急難救助金 (負債玩家每日一次，10萬)
    router.register(/^\s*(急難救助|救助金|救助)\s*$/, async (ctx) => {
        await economyHandler.claimEmergencyAid(ctx.replyToken, ctx.groupId, ctx.userId);
    }, { isGroupOnly: true, needAuth: true, feature: 'bank', keywords: ['急難救助', '救助金', '救助'] });

    // 2.6 搶劫
    router.register(/^\s*搶劫\s*(?:@)?(.+?)\s*$/, async (ctx, match) => {
        await economyHandler.robCoin(ctx.replyToken, ctx.groupId, ctx.userId, ctx.messageObject);
    }, { isGroupOnly: true, needAuth: true, feature: 'bank', keywords: ['搶劫'] });

    // 3. 轉帳給別人
    router.register(/^\s*(?:轉帳\s*(?:@)?|\+\s*@)(.+?)\s*(\d+)\s*$/, async (ctx, match) => {
        const amount = match[2];
        await economyHandler.transferCoin(ctx.replyToken, ctx.groupId, ctx.userId, amount, ctx.messageObject);
    }, { isGroupOnly: true, needAuth: true, feature: 'bank', keywords: ['轉帳'] });

    // 4. 管理員發放/扣除
    router.register(/^\s*(發放|扣除)哭幣\s*(?:@)?(.+?)\s*(\d+)\s*$/, async (ctx, match) => {
        const action = match[1]; // '發放' 或 '扣除'
        const amount = match[3];
        await economyHandler.adminManageCoin(ctx.replyToken, ctx.groupId, ctx.userId, amount, action === '發放', ctx.messageObject);
    }, { isGroupOnly: true, needAdmin: true, keywords: ['發放哭幣', '扣除哭幣'] });

    // 4.5 管理員快速加減 (@用戶 +金額, @用戶 -金額)
    router.register(/^\s*@(.+?)\s*([\+\-])\s*(\d+)\s*$/, async (ctx, match) => {
        if (!ctx.messageObject || !ctx.messageObject.mention || !ctx.messageObject.mention.mentionees) return false;
        
        const isAdd = match[2] === '+';
        const amount = match[3];
        await economyHandler.adminManageCoin(ctx.replyToken, ctx.groupId, ctx.userId, amount, isAdd, ctx.messageObject);
    }, { isGroupOnly: true, needAdmin: true });

    // 4.6 私訊補充哭幣 (超級管理員專用)
    router.register(/^\s*(?:補充哭幣|加錢|充值)(?:\s*(\d+|歐印|all\s*in))?\s*$/i, async (ctx, match) => {
        const { isSuperAdmin } = require('../utils/auth');
        const lineUtils = require('../utils/line');
        if (!isSuperAdmin(ctx.userId)) {
            if (!ctx.isButton) await lineUtils.replyText(ctx.replyToken, '❌ 只有超級管理員可以使用此指令');
            return;
        }
        
        if (!match[1]) {
            await lineUtils.replyText(ctx.replyToken, '❌ 請輸入要補充的金額，例如：補充哭幣 100000');
            return;
        }
        
        // 如果輸入的是歐印/all in，這裡當作 1 億好了
        let amount = parseInt(match[1]);
        if (isNaN(amount)) {
            amount = 100000000; // 預設一億
        }
        
        await economyHandler.addCoinFast(ctx.userId, amount);
        await lineUtils.replyText(ctx.replyToken, `✅ 已為自己補充 ${amount.toLocaleString()} 哭幣`);
    }, { allowDM: true, isGroupOnly: false, needAuth: false, keywords: ['補充哭幣', '加錢'] });

    // 5. 排行榜 (財富、賭博、債務已拆分獨立)
    router.register(/^\s*(財富排行榜|首富|哭幣排行榜)\s*$/, async (ctx) => {
        await economyHandler.showAllLeaderboards(ctx.replyToken);
    }, { allowDM: true, needAuth: true, feature: 'leaderboard', keywords: ['財富排行榜', '哭幣排行榜', '首富'] });

    router.register(/^\s*(賭狗排行榜|賭神)\s*$/, async (ctx) => {
        await economyHandler.showAllLeaderboards(ctx.replyToken);
    }, { allowDM: true, needAuth: true, feature: 'leaderboard', keywords: ['賭狗排行榜', '賭神'] });

    router.register(/^\s*(債務排行榜|欠債榜|負債榜|負債排行榜)\s*$/, async (ctx) => {
        await economyHandler.showAllLeaderboards(ctx.replyToken);
    }, { allowDM: true, needAuth: true, feature: 'leaderboard', keywords: ['債務排行榜', '欠債榜', '負債榜', '負債排行榜'] });

    // === 查詢系統 ===
    
    // 8. 查詢玩家
    router.register(/^\s*(查詢\s*(?:@)?(.+?)|個人資料|我的資料)\s*$/, async (ctx, match) => {
        const lineUtils = require('../utils/line');
        let targetUserId = ctx.userId; // 預設查自己

        if (match[1].startsWith('查詢')) {
            if (ctx.messageObject && ctx.messageObject.mention && ctx.messageObject.mention.mentionees) {
                const mention = ctx.messageObject.mention.mentionees[0];
                if (mention) {
                    targetUserId = mention.userId;
                }
            } else {
                await lineUtils.replyText(ctx.replyToken, '❌ 請正確標記 (@某人) 想要查詢的玩家。');
                return;
            }
        }

        await economyHandler.queryPlayerProfile(ctx.replyToken, ctx.groupId, targetUserId, ctx.userId);
    }, { isGroupOnly: true, needAuth: true, feature: 'bank', keywords: ['查詢', '個人資料', '我的資料'] });

    // 9. 查通緝
    router.register(/^\s*查通緝\s*$/, async (ctx) => {
        await economyHandler.queryWantedLevel(ctx.replyToken, ctx.groupId, ctx.userId);
    }, { isGroupOnly: true, needAuth: true, feature: 'bank', keywords: ['查通緝'] });

    // 10. 通緝榜
    router.register(/^\s*通緝榜\s*$/, async (ctx) => {
        await economyHandler.showCombinedWantedAndJailRank(ctx.replyToken, ctx.groupId);
    }, { allowDM: true, needAuth: true, feature: 'leaderboard', keywords: ['通緝榜'] });

    // 10-1. 通緝名單 (前科排行 Top 5，警察可快速逮捕)
    router.register(/^\s*通緝名單\s*$/, async (ctx) => {
        await economyHandler.showCriminalList(ctx.replyToken, ctx);
    }, { isGroupOnly: true, needAuth: true, feature: 'leaderboard', keywords: ['通緝名單'] });

    // 11. 捐款洗白
    router.register(/^\s*(捐款|贖罪|懺悔)\s*$/, async (ctx) => {
        await economyHandler.handleDonationPrompt(ctx.replyToken, ctx.groupId, ctx.userId);
    }, { isGroupOnly: true, needAuth: true, feature: 'bank', keywords: ['捐款', '贖罪', '懺悔'] });

    // 12. 收割韭菜 (議員專屬)
    router.register(/^\s*收割韭菜\s*$/, async (ctx) => {
        await economyHandler.handleHarvestLeeks(ctx.replyToken, ctx.groupId, ctx.userId);
    }, { isGroupOnly: true, needAuth: true, feature: 'bank', keywords: ['收割韭菜'] });

    // 13. 查冷卻 (監控所有技能與行為的冷卻時間)
    router.register(/^\s*(查冷卻|我的冷卻|冷卻時間)\s*$/, async (ctx) => {
        await economyHandler.checkCooldowns(ctx.replyToken, ctx.groupId, ctx.userId);
    }, { isGroupOnly: false, needAuth: true, allowDM: true, feature: 'bank', keywords: ['查冷卻', '我的冷卻', '冷卻時間'] });

    // 14. 圍標工程 (議員專屬)
    router.register(/^\s*(圍標工程|圍標)\s*$/, async (ctx) => {
        await economyHandler.handleRigBidding(ctx.replyToken, ctx);
    }, { isGroupOnly: true, needAuth: true, feature: 'bank', keywords: ['圍標工程', '圍標'] });

    // 15. 詐領助理費 (議員專屬)
    router.register(/^\s*(詐領助理費|詐領)\s*$/, async (ctx) => {
        await economyHandler.handleEmbezzle(ctx.replyToken, ctx);
    }, { isGroupOnly: true, needAuth: true, feature: 'bank', keywords: ['詐領助理費', '詐領'] });


    router.registerPostback(
        (data) => {
            try {
                const action = new URLSearchParams(data).get('action');
                return ['confirmDonation'].includes(action);
            } catch (e) { return false; }
        },
        async (ctx) => {
            const params = new URLSearchParams(ctx.postbackData);
            const action = params.get('action');
            if (action === 'confirmDonation') {
                const isAllIn = params.get('allIn') === '1';
                await economyHandler.handleDonationConfirm(ctx.replyToken, ctx.groupId, ctx.userId, isAllIn);
            }
        }
    );
};
