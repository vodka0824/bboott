const fs = require('fs');
const path = require('path');

const handlersDir = path.join(__dirname, '../handlers');
const servicesDir = path.join(__dirname, '../services');

// The mapping of functions to their new service files
const functionMapping = {
    // === Jail Services ===
    'jailBailService.js': [
        'handleBail', 'confirmBail', 'handleBailOther', 'confirmBailOther', 
        'handleBribePrompt', 'handleBribe', 'confirmBribe'
    ],
    'jailbreakService.js': [
        'handleJailbreak', 'handleRiot', 'handlePressure'
    ],
    'jailLifeService.js': [
        'handleDropSoap', 'handleLabor', 'handleBlowWarden', 'handleVisit'
    ],
    'jailInfoService.js': [
        'getCriminalTitle', 'checkJailStatus', 'handleJailList', 'handleJailRank', 'replyJailMenu'
    ],
    // === Redemption Services ===
    'militaryService.js': [
        'handleEnlist', 'handleDischarge', 'handleMilitaryChore', 'handleHanKuang', 
        'checkAndDischargeMilitary', 'getMilitaryRankInfo'
    ],
    'atonementService.js': [
        'handleHungerStrike', 'handleSutra', 'handlePsychiatric', 'checkStatusBlock'
    ],
    'politicalService.js': [
        'handleLiveStream', 'handleSnitch', 'handleDragDown', 'handleScapegoat', 
        'handleElection', 'handleDonation'
    ]
};

// Find which file has which function
function extractFunctionCode(sourceCode, functionName) {
    // Regex to match:
    // async function foo(...) { ... }
    // function foo(...) { ... }
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

// Find any standalone const/let related to the file (like COLLECTION_NAME, CACHE_PREFIX, etc)
const commonHeader = `const { db } = require('../utils/db');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const memoryCache = require('../utils/memoryCache');
const { getSpamResponse } = require('../utils/spamHandler');
const COLLECTION_NAME = 'economy_users';\n\n`;

function generateServices() {
    const jailCode = fs.readFileSync(path.join(handlersDir, 'jail.js'), 'utf8');
    const redemptionCode = fs.readFileSync(path.join(handlersDir, 'jail_redemption.js'), 'utf8');
    const fullCode = jailCode + '\n\n' + redemptionCode;

    for (const [serviceName, funcs] of Object.entries(functionMapping)) {
        let fileContent = commonHeader;
        let exportedFuncs = [];

        for (const funcName of funcs) {
            const funcCode = extractFunctionCode(fullCode, funcName);
            if (funcCode) {
                fileContent += funcCode + '\n\n';
                exportedFuncs.push(funcName);
            } else {
                console.error(`Function ${funcName} not found!`);
            }
        }

        // Add exports
        fileContent += `module.exports = {\n    ${exportedFuncs.join(',\n    ')}\n};\n`;
        
        fs.writeFileSync(path.join(servicesDir, serviceName), fileContent);
        console.log(`Created ${serviceName} with ${exportedFuncs.length} functions.`);
    }
}

// Generate the new Facade handlers/jail.js and handlers/jail_redemption.js
function generateFacades() {
    let jailFacade = `// Facade for Jail Services\n`;
    jailFacade += `const jailBailService = require('../services/jailBailService.js');\n`;
    jailFacade += `const jailbreakService = require('../services/jailbreakService.js');\n`;
    jailFacade += `const jailLifeService = require('../services/jailLifeService.js');\n`;
    jailFacade += `const jailInfoService = require('../services/jailInfoService.js');\n`;
    jailFacade += `const jailRedemption = require('./jail_redemption.js');\n\n`;
    jailFacade += `module.exports = {\n`;
    jailFacade += `    ...jailBailService,\n`;
    jailFacade += `    ...jailbreakService,\n`;
    jailFacade += `    ...jailLifeService,\n`;
    jailFacade += `    ...jailInfoService,\n`;
    jailFacade += `    ...jailRedemption\n`;
    jailFacade += `};\n`;

    fs.writeFileSync(path.join(handlersDir, 'jail.js'), jailFacade);
    console.log(`Updated handlers/jail.js to be a Facade.`);

    let redemptionFacade = `// Facade for Jail Redemption Services\n`;
    redemptionFacade += `const militaryService = require('../services/militaryService.js');\n`;
    redemptionFacade += `const atonementService = require('../services/atonementService.js');\n`;
    redemptionFacade += `const politicalService = require('../services/politicalService.js');\n\n`;
    redemptionFacade += `module.exports = {\n`;
    redemptionFacade += `    ...militaryService,\n`;
    redemptionFacade += `    ...atonementService,\n`;
    redemptionFacade += `    ...politicalService\n`;
    redemptionFacade += `};\n`;

    fs.writeFileSync(path.join(handlersDir, 'jail_redemption.js'), redemptionFacade);
    console.log(`Updated handlers/jail_redemption.js to be a Facade.`);
}

generateServices();
generateFacades();
