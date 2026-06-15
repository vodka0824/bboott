const fs = require('fs');

let content = fs.readFileSync('handlers/routes.js', 'utf8');

content = content.replace(
    'const success = await economyHandler.consumeCoin(ctx.groupId, ctx.userId, cost);',
    'const consumeResult = await economyHandler.consumeCoin(ctx.groupId, ctx.userId, cost);'
);

content = content.replace(
    'if (!success) {',
    'if (!consumeResult.success) {'
);

fs.writeFileSync('handlers/routes.js', content, 'utf8');
console.log('Fixed routes.js successfully!');
