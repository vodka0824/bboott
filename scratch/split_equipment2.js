const fs = require('fs');
const path = require('path');

const servicesDir = path.join(__dirname, '../services');
const handlersDir = path.join(__dirname, '../handlers');

const functionMapping = {
    'equipmentShopService.js': [
        'showEquipmentShop', 'buyEquipment', 'buyScrolls', 'buyEquipmentPostback', 'buyScrollsPostback'
    ],
    'equipmentForgeService.js': [
        'enchantEquipment', 'enchantEquipmentPostback', 'buyAndSafeEnchantPostback', 
        'checkAndDeductScrolls', 'applyEnchantResult', 'buildSingleEnchantBubble', 'getNextLevelInfo'
    ],
    'equipmentInfoService.js': [
        'getEquipmentData', 'showMyEquipments', 'swapEquipmentPostback', 'getFinalEquipStat'
    ]
};

// Also we need some common unexported helpers in BOTH files, or we can just duplicate them:
// generateReqId, formatEquipStats, consumeCoin.
// Actually, it's easier to just put them in the commonHeader!

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

const originalCode = fs.readFileSync(path.join(__dirname, 'recovered_equipment.js'), 'utf8');

const commonHeader = `const { db } = require('../utils/db');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const memoryCache = require('../utils/memoryCache');
const { getFinalPlayerStats } = require('../handlers/rpg');

const COLLECTION_NAME = 'economy_users';

const EQUIP_TYPES = {
    weapon: { id: 'weapon', name: '武器', typeName: 'weapon', emoji: '⚔️' },
    gloves: { id: 'gloves', name: '手套', typeName: 'gloves', emoji: '🥊' },
    ring: { id: 'ring', name: '戒指', typeName: 'ring', emoji: '💍' },
    shield: { id: 'shield', name: '盾牌', typeName: 'shield', emoji: '🛡️' },
    wings: { id: 'wings', name: '翅膀', typeName: 'wings', emoji: '🦅' }
};

${extractFunctionCode(originalCode, 'generateReqId')}
${extractFunctionCode(originalCode, 'formatEquipStats')}
${extractFunctionCode(originalCode, 'consumeCoin')}

`;

for (const [serviceName, funcs] of Object.entries(functionMapping)) {
    let fileContent = commonHeader;
    let exportedFuncs = [];
    
    // Add imports for cross-service dependencies
    if (serviceName === 'equipmentShopService.js' || serviceName === 'equipmentForgeService.js') {
        fileContent += `const { getEquipmentData, getFinalEquipStat } = require('./equipmentInfoService.js');\n\n`;
    }

    for (const funcName of funcs) {
        const funcCode = extractFunctionCode(originalCode, funcName);
        if (funcCode) {
            fileContent += funcCode + '\n\n';
            exportedFuncs.push(funcName);
        }
    }

    if (serviceName === 'equipmentInfoService.js') {
        exportedFuncs.push('EQUIP_TYPES');
    }

    fileContent += `module.exports = {\n    ${exportedFuncs.join(',\n    ')}\n};\n`;
    fs.writeFileSync(path.join(servicesDir, serviceName), fileContent);
    console.log(`Updated ${serviceName}`);
}

// Generate Facade
let facade = `// Facade for Equipment Services\n`;
facade += `const shopService = require('../services/equipmentShopService.js');\n`;
facade += `const forgeService = require('../services/equipmentForgeService.js');\n`;
facade += `const infoService = require('../services/equipmentInfoService.js');\n\n`;
facade += `module.exports = {\n    ...shopService,\n    ...forgeService,\n    ...infoService\n};\n`;
fs.writeFileSync(path.join(handlersDir, 'equipment.js'), facade);
