const fs = require('fs');
const path = require('path');

const handlersDir = path.join(__dirname, '../handlers');
const servicesDir = path.join(__dirname, '../services');

// The mapping of functions to their new service files
const functionMapping = {
    'equipmentShopService.js': [
        'showEquipmentShop', 'buyEquipment', 'buyScrolls', 'buyEquipmentPostback', 'buyScrollsPostback'
    ],
    'equipmentForgeService.js': [
        'enchantEquipment', 'enchantEquipmentPostback', 'buyAndSafeEnchantPostback', 'checkAndDeductScrolls', 'applyEnchantResult'
    ],
    'equipmentInfoService.js': [
        'getEquipmentData', 'showMyEquipments', 'swapEquipmentPostback', 'getFinalEquipStat'
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

const commonHeader = `const { db } = require('../utils/db');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const memoryCache = require('../utils/memoryCache');

const COLLECTION_NAME = 'economy_users';

const EQUIP_TYPES = {
    weapon: { id: 'weapon', name: '武器', typeName: 'weapon', emoji: '⚔️' },
    gloves: { id: 'gloves', name: '手套', typeName: 'gloves', emoji: '🥊' },
    ring: { id: 'ring', name: '戒指', typeName: 'ring', emoji: '💍' },
    shield: { id: 'shield', name: '盾牌', typeName: 'shield', emoji: '🛡️' },
    wings: { id: 'wings', name: '翅膀', typeName: 'wings', emoji: '🦅' }
};

`;

function generateServices() {
    const equipCode = fs.readFileSync(path.join(handlersDir, 'equipment.js'), 'utf8');

    for (const [serviceName, funcs] of Object.entries(functionMapping)) {
        let fileContent = commonHeader;
        let exportedFuncs = [];

        for (const funcName of funcs) {
            const funcCode = extractFunctionCode(equipCode, funcName);
            if (funcCode) {
                fileContent += funcCode + '\n\n';
                exportedFuncs.push(funcName);
            } else {
                console.error(`Function ${funcName} not found!`);
            }
        }

        if (serviceName === 'equipmentInfoService.js') {
            exportedFuncs.push('EQUIP_TYPES');
        }

        fileContent += `module.exports = {\n    ${exportedFuncs.join(',\n    ')}\n};\n`;
        fs.writeFileSync(path.join(servicesDir, serviceName), fileContent);
        console.log(`Created ${serviceName} with ${exportedFuncs.length} exports.`);
    }
}

function generateFacades() {
    let facade = `// Facade for Equipment Services\n`;
    facade += `const shopService = require('../services/equipmentShopService.js');\n`;
    facade += `const forgeService = require('../services/equipmentForgeService.js');\n`;
    facade += `const infoService = require('../services/equipmentInfoService.js');\n\n`;
    facade += `module.exports = {\n`;
    facade += `    ...shopService,\n`;
    facade += `    ...forgeService,\n`;
    facade += `    ...infoService\n`;
    facade += `};\n`;

    fs.writeFileSync(path.join(handlersDir, 'equipment.js'), facade);
    console.log(`Updated handlers/equipment.js to be a Facade.`);
}

generateServices();
generateFacades();
