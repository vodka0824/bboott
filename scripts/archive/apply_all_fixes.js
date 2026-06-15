const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, 'handlers', 'routes.js');
let content = fs.readFileSync(p, 'utf8');

// 1. Fix slot regex
content = content.replace(
    /router\.register\(\/\^🎰\|拉霸\$\/, async \(ctx\) => \{\r?\n\s+await slotHandler\.handleSlot\(ctx\.replyToken, ctx\);\s+\/\/ 傳遞 ctx 以支援管理員作弊\r?\n\s+\}, \{ feature: 'game', isGroupOnly: true, needAuth: true \}\);/g,
    `router.register(/^(?:🎰|拉霸)(?:\\s+(\\d+))?$/, async (ctx, match) => {
        await slotHandler.handleSlot(ctx.replyToken, ctx, match[1] || '10');  // 傳遞 ctx 以支援管理員作弊
    }, { feature: 'game', isGroupOnly: true, needAuth: true });`
);

// 2. Add Blackjack routes
const blackjackRoutes = `
    // === 21點 (Blackjack) ===
    const blackjackHandler = require('./blackjack');
    router.register(/^21點(?:\\s+(\\d+))?$/, async (ctx, match) => {
        await blackjackHandler.startGame(ctx.replyToken, ctx, match[1] || '10');
    }, { feature: 'game', isGroupOnly: true, needAuth: true });

    router.register(/^補牌$/, async (ctx) => {
        await blackjackHandler.hit(ctx.replyToken, ctx);
    }, { feature: 'game', isGroupOnly: true, needAuth: true });

    router.register(/^停牌$/, async (ctx) => {
        await blackjackHandler.stand(ctx.replyToken, ctx);
    }, { feature: 'game', isGroupOnly: true, needAuth: true });
`;

// 3. Add Economy routes (including relaxed 財富排行榜)
const economyRoutes = `
    // ==========================================
    // 哭幣 (Ku Coin) 點數系統
    // ==========================================
    const economyHandler = require('./economy');

    // 1. 我的哭幣 / 錢包
    router.register(/^\\s*(我的哭幣|錢包|餘額)\\s*$/, async (ctx) => {
        await economyHandler.checkBalance(ctx.replyToken, ctx.groupId, ctx.userId);
        return true;
    }, { isGroupOnly: false });

    // 2. 每日簽到
    router.register(/^\\s*(每日簽到|簽到|領哭幣)\\s*$/, async (ctx) => {
        await economyHandler.dailyCheckIn(ctx.replyToken, ctx.groupId, ctx.userId);
    }, { isGroupOnly: true, needAuth: true, feature: 'game' });

    // 3. 轉帳給別人
    router.register(/^\\s*轉帳\\s+(?:@)?(\\S+)\\s+(\\d+)\\s*$/, async (ctx, match) => {
        const targetName = match[1];
        const amount = parseInt(match[2], 10);
        await economyHandler.transferCoin(ctx.replyToken, ctx.groupId, ctx.userId, targetName, amount);
    }, { isGroupOnly: true, needAuth: true, feature: 'game' });

    // 4. 管理員發放/扣除
    router.register(/^\\s*(發放|扣除)哭幣\\s+(?:@)?(\\S+)\\s+(\\d+)\\s*$/, async (ctx, match) => {
        const action = match[1]; // '發放' 或 '扣除'
        const targetName = match[2];
        const amount = parseInt(match[3], 10);
        await economyHandler.adminManageCoin(ctx.replyToken, ctx.groupId, ctx.userId, targetName, amount, action === '發放');
    }, { isGroupOnly: true, needAdmin: true });

    // 5. 財富排行榜 (Relaxed Regex)
    router.register(/^\\s*(財富排行榜|首富)\\s*$/, async (ctx) => {
        await economyHandler.showLeaderboard(ctx.replyToken, ctx.groupId);
    }, { isGroupOnly: true, needAuth: true, feature: 'game' });
`;

// Insert Blackjack and Economy routes before Catch-All Routes
if (!content.includes('blackjackHandler') && !content.includes('economyHandler')) {
    content = content.replace(
        /(\/\/\s*===\s*Catch-All Routes)/i,
        `${blackjackRoutes}\n${economyRoutes}\n    $1`
    );
}

// 4. Relax Auction Status regex
content = content.replace(
    /router\.register\(\/\^\(競標狀態\|目前拍賣\)\$\/, async \(ctx\) => \{/g,
    `router.register(/^\\s*(競標狀態|目前拍賣)\\s*$/, async (ctx) => {`
);

fs.writeFileSync(p, content);
console.log('All routes successfully patched!');
