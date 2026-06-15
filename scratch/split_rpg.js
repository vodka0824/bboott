const fs = require('fs');
const path = require('path');

const handlersDir = path.join(__dirname, '../handlers');
const servicesDir = path.join(__dirname, '../services');

const functionMapping = {
    'rpgCoreService.js': [
        'getPlayerTitle', 'getOrInitPlayerStats', 'addExp'
    ],
    'rpgCombatStatService.js': [
        'getFinalPlayerStats'
    ],
    'rpgProfileFlexService.js': [
        'handleMyStats'
    ],
    'rpgLeaderboardService.js': [
        'handleRpgRank'
    ]
};

function extractFunctionCode(sourceCode, functionName) {
    const regex = new RegExp(`^(?:async\\s+)?function\\s+${functionName}\\s*\\([\\s\\S]*?\\)\\s*\\{`, 'm');
    const match = regex.exec(sourceCode);
    if (!match) return null;
    let startIndex = match.index;
    let braceCount = 0;
    let endIndex = startIndex;
    let foundFirstBrace = false;
    for (let i = startIndex; i < sourceCode.length; i++) {
        if (sourceCode[i] === '{') {
            braceCount++;
            foundFirstBrace = true;
        } else if (sourceCode[i] === '}') {
            braceCount--;
        }
        if (foundFirstBrace && braceCount === 0) {
            endIndex = i + 1;
            break;
        }
    }
    return sourceCode.substring(startIndex, endIndex);
}

const originalCode = fs.readFileSync(path.join(handlersDir, 'rpg.js'), 'utf8');

const commonHeader = `const { db } = require('../utils/db');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');

const DEFAULT_STATS = { level: 1, exp: 0, hp: 100, attack: 10, defense: 5 };

`;

for (const [serviceName, funcs] of Object.entries(functionMapping)) {
    let fileContent = commonHeader;
    let exportedFuncs = [];

    // Internal imports between RPG services
    if (serviceName === 'rpgCombatStatService.js') {
        fileContent += `const { getOrInitPlayerStats, getPlayerTitle } = require('./rpgCoreService');\n\n`;
    }
    if (serviceName === 'rpgProfileFlexService.js') {
        fileContent += `const { getOrInitPlayerStats, getPlayerTitle } = require('./rpgCoreService');\n`;
        fileContent += `const { getFinalPlayerStats } = require('./rpgCombatStatService');\n\n`;
    }

    for (const funcName of funcs) {
        const funcCode = extractFunctionCode(originalCode, funcName);
        if (funcCode) {
            fileContent += funcCode + '\n\n';
            exportedFuncs.push(funcName);
        } else {
            console.error(`Missing ${funcName}`);
        }
    }

    fileContent += `module.exports = {\n    ${exportedFuncs.join(',\n    ')}\n};\n`;
    fs.writeFileSync(path.join(servicesDir, serviceName), fileContent);
    console.log(`Created ${serviceName}`);
}

// Generate Facade
let facade = `// Facade for RPG Services\n`;
facade += `const core = require('../services/rpgCoreService.js');\n`;
facade += `const combat = require('../services/rpgCombatStatService.js');\n`;
facade += `const profile = require('../services/rpgProfileFlexService.js');\n`;
facade += `const leaderboard = require('../services/rpgLeaderboardService.js');\n\n`;
facade += `module.exports = {\n    ...core,\n    ...combat,\n    ...profile,\n    ...leaderboard\n};\n`;

fs.writeFileSync(path.join(handlersDir, 'rpg.js'), facade);
console.log('Facade created for rpg.js');
