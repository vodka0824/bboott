const fs = require('fs');

const content = fs.readFileSync('scratch/backup_handlers/handlers/jail.js', 'utf8');

// We need a robust function extractor.
// It finds `async function name(` or `function name(` and captures everything until the next function definition, or the `module.exports` at the end.
const functionNames = [
    'getCriminalTitle', 'calculateBailAmount', 'checkJailStatus', 'handleBail', 'confirmBail', 
    'handleBailOther', 'confirmBailOther', 'handleBlowWarden', 'handleJailbreak', 'confirmJailbreak',
    'handleDropSoap', 'handleLabor', 'handleVisit', 'loadRiotState', 'saveRiotState', 'handleRiot',
    'resolveRiot', 'handleJailList', 'handleJailRank', 'handleBribePrompt', 'handleBribe', 'confirmBribe',
    'handlePressure'
];

let functions = {};
for (let i = 0; i < functionNames.length; i++) {
    const fnName = functionNames[i];
    // Create regex to find the start of this function
    const startRegex = new RegExp(`(?:async )?function ${fnName}\\(`);
    const startMatch = content.match(startRegex);
    if (!startMatch) {
        console.error("COULD NOT FIND", fnName);
        continue;
    }
    
    let startIndex = startMatch.index;
    // Look backward for the comment block /** */
    const textBefore = content.substring(0, startIndex);
    const lastCommentStart = textBefore.lastIndexOf('/**');
    if (lastCommentStart !== -1 && textBefore.substring(lastCommentStart).trim().startsWith('/**')) {
        startIndex = lastCommentStart;
    }

    let endIndex = content.length;
    // Find the NEXT function start to delimit the end
    if (i < functionNames.length - 1) {
        const nextFnName = functionNames[i+1];
        const nextStartRegex = new RegExp(`(?:async )?function ${nextFnName}\\(`);
        const nextStartMatch = content.match(nextStartRegex);
        if (nextStartMatch) {
            let nextStartIndex = nextStartMatch.index;
            const textBeforeNext = content.substring(0, nextStartIndex);
            const lastCommentStartNext = textBeforeNext.lastIndexOf('/**');
            if (lastCommentStartNext !== -1 && textBeforeNext.substring(lastCommentStartNext).trim().startsWith('/**')) {
                nextStartIndex = lastCommentStartNext;
            }
            endIndex = nextStartIndex;
        }
    } else {
        // Last function ends before module.exports or const redemption
        const modExportMatch = content.indexOf('const redemption =');
        if (modExportMatch !== -1) endIndex = modExportMatch;
    }

    functions[fnName] = content.substring(startIndex, endIndex).trim();
}

const headerImports = `const { Firestore } = require('@google-cloud/firestore');
const { getDb } = require('../utils/db');
const db = getDb();
const COLLECTION_NAME = 'economy_users';
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flexUtils');
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
}
`;

// Build Services
function writeService(filename, fnList) {
    let body = fnList.map(name => functions[name]).join('\n\n');
    let exportsStr = `module.exports = {\n    ${fnList.join(',\n    ')}\n};\n`;
    fs.writeFileSync(`services/${filename}`, `${headerImports}\n\n${body}\n\n${exportsStr}`);
    console.log(`Wrote services/${filename} (${fnList.length} functions)`);
}

writeService('jailInfoService.js', ['getCriminalTitle', 'checkJailStatus', 'handleJailList', 'handleJailRank']);
writeService('jailBailService.js', ['calculateBailAmount', 'handleBail', 'confirmBail', 'handleBailOther', 'confirmBailOther', 'handleBribePrompt', 'handleBribe', 'confirmBribe']);
writeService('jailbreakService.js', ['handleJailbreak', 'confirmJailbreak', 'loadRiotState', 'saveRiotState', 'handleRiot', 'resolveRiot', 'handlePressure']);
writeService('jailLifeService.js', ['handleBlowWarden', 'handleDropSoap', 'handleLabor', 'handleVisit']);

