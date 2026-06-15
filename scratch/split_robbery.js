const fs = require('fs');
const path = require('path');

const handlersDir = path.join(__dirname, '../handlers');
const servicesDir = path.join(__dirname, '../services');

const functionMapping = {
    'robberyValidationService.js': [
        'getUserProfile', 'validateRobTarget'
    ],
    'robberyCombatService.js': [
        'calculateRobOutcome', 'buildRobResultBubble', 'executeRobTransaction', 'robCoin'
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

const originalCode = fs.readFileSync(path.join(handlersDir, 'robberyHandler.js'), 'utf8');

const commonHeader = `const { db } = require('../utils/db');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const { ADMIN_USER_ID } = require('../config/constants');
const { getSpamResponse } = require('../utils/spamHandler');
const { getFinalPlayerStats } = require('../handlers/rpg');
const { getWantedList, getMafiaRank, applyWantedDecay, applyBossBetrayal, getBossBetrayalFlex, getMafiaBoss } = require('../handlers/profession');
const economyHandler = require('../handlers/economy');

const COLLECTION_NAME = 'economy_users';

const sp = (n) => parseInt(n || 0, 10);
const eqSp = (eq) => eq ? Object.values(eq).reduce((sum, item) => sum + (item?.sp || 0), 0) : 0;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

`;

for (const [serviceName, funcs] of Object.entries(functionMapping)) {
    let fileContent = commonHeader;
    let exportedFuncs = [];

    // For combat service, we also need to import validateRobTarget
    if (serviceName === 'robberyCombatService.js') {
        fileContent += `const { validateRobTarget } = require('./robberyValidationService');\n\n`;
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
let facade = `// Facade for Robbery Services\n`;
facade += `const validationService = require('../services/robberyValidationService.js');\n`;
facade += `const combatService = require('../services/robberyCombatService.js');\n\n`;
facade += `module.exports = {\n    ...validationService,\n    ...combatService\n};\n`;
fs.writeFileSync(path.join(handlersDir, 'robberyHandler.js'), facade);
console.log('Facade created for robberyHandler.js');
