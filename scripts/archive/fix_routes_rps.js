const fs = require('fs');

let content = fs.readFileSync('handlers/routes.js', 'utf8');

content = content.replace(
    'await gameHandler.handleRPS(ctx.replyToken, match[0]);',
    'await gameHandler.handleRPS(ctx.replyToken, match[0], ctx.groupId, ctx.userId);'
);

fs.writeFileSync('handlers/routes.js', content, 'utf8');
console.log('Fixed routes.js for RPS successfully!');
