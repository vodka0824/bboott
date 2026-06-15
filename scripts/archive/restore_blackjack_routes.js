const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, 'handlers', 'routes.js');
let content = fs.readFileSync(p, 'utf8');

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

if (!content.includes('blackjackHandler')) {
    content = content.replace(
        /(\/\/\s*===\s*Catch-All Routes)/i,
        `${blackjackRoutes}\n    $1`
    );
    fs.writeFileSync(p, content);
    console.log('Restored blackjack routes successfully!');
} else {
    console.log('blackjackHandler already exists!');
}
