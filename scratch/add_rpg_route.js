const fs = require('fs');
const path = require('path');

const routePath = path.join(__dirname, '../routes/rpgRoutes.js');
let routeCode = fs.readFileSync(routePath, 'utf8');

const newRoute = `    // RPG 排行榜
    router.register(
        /^\\s*(RPG排行榜|戰鬥力排行榜)\\s*$/i,
        (context) => rpgHandler.handleRpgRank(context),
        { isGroupOnly: false, allowDM: true, needAuth: false, feature: 'rpg_leaderboard', keywords: ['RPG排行榜', '戰鬥力排行榜'] }
    );
`;

if (!routeCode.includes('handleRpgRank')) {
    routeCode = routeCode.replace('};', newRoute + '};\n');
    fs.writeFileSync(routePath, routeCode, 'utf8');
    console.log('Appended handleRpgRank route to rpgRoutes.js');
} else {
    console.log('handleRpgRank route already exists');
}
