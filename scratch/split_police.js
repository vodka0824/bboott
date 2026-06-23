const fs = require('fs');

const fileContent = fs.readFileSync('handlers/police.js', 'utf8');

const functionsToExtract = [
    'checkInternalAffairs',
    'handleJoinPolice',
    'handleResignPolice',
    'handleArrest',
    'handleQuickArrest',
    'handleIndict',
    'handleFrisk',
    'handleCoverUp',
    'handleRaid'
];

function extractCode(fnName, nextFnName) {
    const startStr = 'async function ' + fnName + '(';
    const startIndex = fileContent.indexOf(startStr);
    if(startIndex === -1) {
        console.log('NOT FOUND:', fnName);
        return '';
    }
    
    let endIndex = fileContent.length;
    if (nextFnName) {
        const nextStr = 'async function ' + nextFnName + '(';
        endIndex = fileContent.indexOf(nextStr);
        if(endIndex === -1) endIndex = fileContent.length;
    } else {
        // for the last function, end at module.exports
        endIndex = fileContent.indexOf('module.exports = {');
    }
    
    let commentStart = fileContent.lastIndexOf('/**', startIndex);
    if(commentStart === -1 || !fileContent.substring(commentStart, startIndex).trim().startsWith('/**')) {
        commentStart = startIndex;
    }
    
    return fileContent.substring(commentStart, endIndex);
}

const functionBlocks = {};
for(let i=0; i<functionsToExtract.length; i++) {
    functionBlocks[functionsToExtract[i]] = extractCode(functionsToExtract[i], functionsToExtract[i+1]);
}

const header = `const { Firestore } = require('@google-cloud/firestore');
const { getDb } = require('../utils/db');
const db = getDb();
const COLLECTION_NAME = 'economy_users';
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const authUtils = require('../utils/auth');
const economyHandler = require('./economy');
const professionHandler = require('./profession');
const rpgHandler = require('./rpg');\n\n`;

function writeService(serviceName, fnList, extraHeader = '') {
    let content = header + extraHeader;
    let exportsList = [];
    for(const fn of fnList) {
        if(functionBlocks[fn]) {
            content += functionBlocks[fn] + '\n';
            exportsList.push(fn);
        }
    }
    content += `\nmodule.exports = {\n    ${exportsList.join(',\n    ')}\n};\n`;
    fs.writeFileSync('services/' + serviceName, content, 'utf8');
    console.log(`Wrote services/${serviceName} (${exportsList.length} functions)`);
}

// Write the new microservices
// Note: checkInternalAffairs is used by handleCoverUp and handleRaid and handleIndict and handleFrisk and handleArrest... wait!
// Is checkInternalAffairs an exported function or just an internal helper in police.js?
// Let's check if it's exported. 
// It's not in the export list. So I need to put it where it's used, or put it in a shared place or just inside policeActionService and export it to others.
// It's used everywhere. Let's just put it in policeActionService and export it for others.

writeService('policeCareerService.js', ['handleJoinPolice', 'handleResignPolice']);
writeService('policeActionService.js', ['checkInternalAffairs', 'handleArrest', 'handleQuickArrest', 'handleIndict', 'handleFrisk', 'handleRaid']);
writeService('policeCorruptionService.js', ['handleCoverUp'], "const { checkInternalAffairs } = require('./policeActionService');\n");

console.log('Police Split Complete!');
