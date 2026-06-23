const fs = require('fs');
const bkContent = fs.readFileSync('scratch/backup_handlers/handlers/jail.js', 'utf8');

function extractCode(startMarker, endMarker) {
    const startIndex = bkContent.indexOf(startMarker);
    const endIndex = bkContent.indexOf(endMarker);
    let commentStart = bkContent.lastIndexOf('/**', startIndex);
    if(commentStart === -1 || !bkContent.substring(commentStart, startIndex).trim().startsWith('/**')) commentStart = startIndex;
    return bkContent.substring(commentStart, endIndex);
}

const riotAndPressureCode = extractCode('async function loadRiotState()', 'async function handleJailList(');

let header = fs.readFileSync('services/jailbreakService.js', 'utf8').split('async function loadRiotState()')[0].split('async function handleJailbreak(')[0];
// Ensure flexUtils is using flex, not flexUtils since it caused an error earlier
header = header.replace(/require\('\.\.\/utils\/flexUtils'\)/g, "require('../utils/flex')");

// get handleJailbreak and confirmJailbreak from my inject script
const injectScript = fs.readFileSync('scratch/inject_jailbreak.js', 'utf8');
function extractCodeFromInject(startMarker, endMarker, content) {
    const startIndex = content.indexOf(startMarker);
    const endIndex = content.indexOf(endMarker);
    return content.substring(startIndex, endIndex);
}
const handleJbStr = extractCodeFromInject('async function handleJailbreak(', 'async function confirmJailbreak(', injectScript);
const confirmJbStr = extractCodeFromInject('async function confirmJailbreak(', '// 覆寫 jailbreakService.js', injectScript);

// Additional imports for jailbreakService
const extraImports = `
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

let riotState = {
    active: false,
    groupId: null,
    initiatorId: null,
    participants: new Set(),
    endTime: null,
    timer: null,
    joinMessageId: null,
    guards: 10,
    wardenPresent: false
};
`;

const finalContent = header + extraImports + '\n' + handleJbStr + '\n' + confirmJbStr + '\n' + riotAndPressureCode + '\nmodule.exports = { handleJailbreak, confirmJailbreak, loadRiotState, saveRiotState, handleRiot, resolveRiot, handlePressure };\n';

fs.writeFileSync('services/jailbreakService.js', finalContent, 'utf8');
console.log('REBUILT jailbreakService.js again!');
