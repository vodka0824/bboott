const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, 'handlers', 'routes.js');
let content = fs.readFileSync(p, 'utf8');

// 1. Replace slot regex
content = content.replace(
    /router\.register\(\/\^🎰\|拉霸\$\/, async \(ctx\) => \{\r?\n\s+await slotHandler\.handleSlot\(ctx\.replyToken, ctx\);\s+\/\/ 傳遞 ctx 以支援管理員作弊\r?\n\s+\}, \{ feature: 'game', isGroupOnly: true, needAuth: true \}\);/g,
    `router.register(/^(?:🎰|拉霸)(?:\\s+(\\d+))?$/, async (ctx, match) => {
        await slotHandler.handleSlot(ctx.replyToken, ctx, match[1] || '10');  // 傳遞 ctx 以支援管理員作弊
    }, { feature: 'game', isGroupOnly: true, needAuth: true });`
);

// 2. Insert blackjack routes
const insertion = `
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

content = content.replace(
    /(\}, \{ feature: 'game', isGroupOnly: true, needAuth: true \}\);)(\r?\n\s*\/\/\s*==========================================\r?\n\s*\/\/\s*哭幣)/,
    `$1\n${insertion}$2`
);

fs.writeFileSync(p, content);
console.log('Fixed routes.js completely!');
