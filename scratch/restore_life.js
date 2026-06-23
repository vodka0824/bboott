const fs = require('fs');
const content = fs.readFileSync('scratch/old_jail.js', 'utf8');

const regexBlow = /async function handleBlowWarden[\s\S]*?console\.error\('\[Jail\] handleBlowWarden Error:', e\);\n    }\n}/;
const matchBlow = content.match(regexBlow);

const regexSoap = /async function handleDropSoap[\s\S]*?console\.error\('\[Jail\] handleDropSoap Error:', e\);\n        await lineUtils\.replyText\(replyToken, '❌ 撿肥皂失敗。'\);\n    }\n}/;
const matchSoap = content.match(regexSoap);

const regexLabor = /async function handleLabor[\s\S]*?console\.error\('\[Jail\] handleLabor Error:', e\);\n        await lineUtils\.replyText\(replyToken, '❌ 勞動改造發生錯誤。'\);\n    }\n}/;
const matchLabor = content.match(regexLabor);

const regexVisit = /async function handleVisit[\s\S]*?console\.error\('\[Jail\] handleVisit Error:', e\);\n        await lineUtils\.replyText\(replyToken, '❌ 探監發生錯誤。'\);\n    }\n}/;
const matchVisit = content.match(regexVisit);

const lifeService = `const { Firestore } = require('@google-cloud/firestore');
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
}

/**
 * 幫典獄長吹喇叭
 */
${matchBlow[0]}

/**
 * 撿肥皂
 */
${matchSoap[0]}

/**
 * 勞動改造
 */
${matchLabor[0]}

/**
 * 探監
 */
${matchVisit[0]}

module.exports = {
    handleBlowWarden,
    handleDropSoap,
    handleLabor,
    handleVisit
};
`;

fs.writeFileSync('services/jailLifeService.js', lifeService);
console.log('RESTORED jailLifeService.js');
