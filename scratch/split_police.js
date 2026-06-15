const fs = require('fs');
const path = require('path');

const handlersDir = path.join(__dirname, '../handlers');
const servicesDir = path.join(__dirname, '../services');

const functionMapping = {
    'policeCareerService.js': [
        'handleJoinPolice', 'handleResignPolice'
    ],
    'policeActionService.js': [
        'handleArrest', 'handleQuickArrest'
    ],
    'policeCorruptionService.js': [
        'handleOfferBribe', 'handleAssassinatePolice'
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

const originalCode = fs.readFileSync(path.join(handlersDir, 'police.js'), 'utf8');

const commonHeader = `const { db } = require('../utils/db');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const memoryCache = require('../utils/memoryCache');
const { getWantedList, getProfessionTitle, getMafiaRank } = require('../handlers/profession');
const { getFinalPlayerStats } = require('../handlers/rpg');
const economyHandler = require('../handlers/economy');

const COLLECTION_NAME = 'economy_users';

`;

for (const [serviceName, funcs] of Object.entries(functionMapping)) {
    let fileContent = commonHeader;
    let exportedFuncs = [];

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
let facade = `// Facade for Police Services\n`;
facade += `const careerService = require('../services/policeCareerService.js');\n`;
facade += `const actionService = require('../services/policeActionService.js');\n`;
facade += `const corruptionService = require('../services/policeCorruptionService.js');\n\n`;
facade += `module.exports = {\n    ...careerService,\n    ...actionService,\n    ...corruptionService\n};\n`;
fs.writeFileSync(path.join(handlersDir, 'police.js'), facade);
console.log('Facade created for police.js');
