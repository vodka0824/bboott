const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, 'handlers', 'routes.js');
let content = fs.readFileSync(p, 'utf8');

const economyRoutes = `
    // ==========================================
    // 哭幣 (Ku Coin) 點數系統
    // ==========================================
    const economyHandler = require('./economy');

    // 1. 我的哭幣 / 錢包
    router.register(/^(我的哭幣|錢包|餘額)$/, async (ctx) => {
        await economyHandler.checkBalance(ctx.replyToken, ctx.groupId, ctx.userId);
        return true;
    }, { isGroupOnly: false });

    // 2. 每日簽到
    router.register(/^(每日簽到|簽到|領哭幣)$/, async (ctx) => {
        await economyHandler.dailyCheckIn(ctx.replyToken, ctx.groupId, ctx.userId);
    }, { isGroupOnly: true, needAuth: true, feature: 'game' });

    // 3. 轉帳給別人
    // 轉帳 @小明 100
    router.register(/^轉帳\\s+(?:@)?(\\S+)\\s+(\\d+)$/, async (ctx, match) => {
        const targetName = match[1];
        const amount = parseInt(match[2], 10);
        await economyHandler.transferCoin(ctx.replyToken, ctx.groupId, ctx.userId, targetName, amount);
    }, { isGroupOnly: true, needAuth: true, feature: 'game' });

    // 4. 管理員發放/扣除
    // 發放哭幣 @小明 1000
    router.register(/^(發放|扣除)哭幣\\s+(?:@)?(\\S+)\\s+(\\d+)$/, async (ctx, match) => {
        const action = match[1]; // '發放' 或 '扣除'
        const targetName = match[2];
        const amount = parseInt(match[3], 10);
        await economyHandler.adminManageCoin(ctx.replyToken, ctx.groupId, ctx.userId, targetName, amount, action === '發放');
    }, { isGroupOnly: true, needAdmin: true });

    // 5. 財富排行榜
    router.register(/^(財富排行榜|首富)$/, async (ctx) => {
        await economyHandler.showLeaderboard(ctx.replyToken, ctx.groupId);
    }, { isGroupOnly: true, needAuth: true, feature: 'game' });
`;

if (!content.includes('economyHandler')) {
    content = content.replace(
        /(\/\/\s*===\s*Catch-All Routes)/i,
        `${economyRoutes}\n    $1`
    );
    fs.writeFileSync(p, content);
    console.log('Restored economy routes successfully!');
} else {
    console.log('economyHandler already exists!');
}
