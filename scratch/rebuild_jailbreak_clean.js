const fs = require('fs');

const content = fs.readFileSync('services/jailbreakService.js', 'utf8');

function extractFunction(content, funcName) {
    const lines = content.split('\n');
    let output = [];
    let capturing = false;
    let braceCount = 0;
    
    for(let i=0; i<lines.length; i++) {
        const line = lines[i];
        if (line.includes('function ' + funcName + '(')) {
            capturing = true;
        }
        if (capturing) {
            output.push(line);
            braceCount += (line.match(/\{/g) || []).length;
            braceCount -= (line.match(/\}/g) || []).length;
            if (braceCount === 0 && output.length > 1) {
                break;
            }
        }
    }
    return output.join('\n');
}

function extractVarDeclaration(content, varName) {
    const lines = content.split('\n');
    let output = [];
    let capturing = false;
    let braceCount = 0;
    
    for(let i=0; i<lines.length; i++) {
        const line = lines[i];
        if (line.includes('let ' + varName + ' =') || line.includes('const ' + varName + ' =')) {
            capturing = true;
        }
        if (capturing) {
            output.push(line);
            braceCount += (line.match(/\{/g) || []).length;
            braceCount -= (line.match(/\}/g) || []).length;
            if (braceCount === 0 && (line.includes(';') || output.length > 1)) {
                break;
            }
        }
    }
    return output.join('\n');
}

const imports = `const { Firestore } = require('@google-cloud/firestore');
const { getDb } = require('../utils/db');
const db = getDb();
const COLLECTION_NAME = 'economy_users';
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const authUtils = require('../utils/auth');

function getSpamResponse(userData, action, msg) {
    const spamLimit = 3;
    let trackers = userData.spamTracker || {};
    let count = (trackers[action] || 0) + 1;
    trackers[action] = count;
    
    if (count > spamLimit) {
        return { ignore: false, triggerPenalty: true, message: \`🚨 【警告】你已連續洗頻 \${action} 指令超過 \${spamLimit} 次！將受到懲罰！\`, newTracker: trackers };
    }
    if (count === spamLimit) {
        return { ignore: false, triggerPenalty: false, message: msg + \`\\n(再洗頻一次將受到嚴厲懲罰！)\`, newTracker: trackers };
    }
    return { ignore: false, triggerPenalty: false, message: msg, newTracker: trackers };
}`;

const handleJailbreak = extractFunction(content, 'handleJailbreak');
const handleRiot = extractFunction(content, 'handleRiot');
const resolveRiot = extractFunction(content, 'resolveRiot');
const loadRiotState = extractFunction(content, 'loadRiotState');
const saveRiotState = extractFunction(content, 'saveRiotState');
const handlePressure = extractFunction(content, 'handlePressure');
const riotState = extractVarDeclaration(content, 'riotState');

const confirmJailbreak = fs.readFileSync('scratch/extracted_confirm.js', 'utf8');

const newContent = imports + '\n\n' + handleJailbreak + '\n\n' + confirmJailbreak + '\n\n' + riotState + '\n\n' + loadRiotState + '\n\n' + saveRiotState + '\n\n' + handleRiot + '\n\n' + resolveRiot + '\n\n' + handlePressure + '\n\n' + `module.exports = {
    handleJailbreak,
    confirmJailbreak,
    loadRiotState,
    saveRiotState,
    handleRiot,
    resolveRiot,
    handlePressure
};`;

fs.writeFileSync('services/jailbreakService.js', newContent);
console.log('Cleaned and rebuilt jailbreakService.js successfully!');
