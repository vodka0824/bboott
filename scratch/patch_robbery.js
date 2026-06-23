const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../services/robberyCombatService.js');
let content = fs.readFileSync(filePath, 'utf8');

// We will do several string replacements or inject our new logic.

// 1. Add confirmation check in robCoin
const robCoinRegex = /async function robCoin\(replyToken, groupId, fromUserId, messageObject\) \{([\s\S]*?)const result = await db.runTransaction\(async \(t\) => \{/;
const robCoinMatch = content.match(robCoinRegex);
if (robCoinMatch) {
    const isConfirmedStr = `
    const isConfirmed = messageObject && messageObject.text && messageObject.text.includes('確認');
    try {
        const fromMemberName = await lineUtils.getGroupMemberName(groupId, fromUserId);
        const targetMemberName = await lineUtils.getGroupMemberName(groupId, targetUserId);

        const robberStatsObj = await getFinalPlayerStats(fromUserId);
        const targetStatsObj = await getFinalPlayerStats(targetUserId);

        const result = await db.runTransaction(async (t) => {
            return await executeRobTransaction(t, fromUserId, targetUserId, fromMemberName, targetMemberName, robberStatsObj, targetStatsObj, isConfirmed);
`;
    content = content.replace(/try \{[\s\S]*?const result = await db.runTransaction\(async \(t\) => \{/, isConfirmedStr);
}

// 2. Add isConfirmed argument to executeRobTransaction
content = content.replace(/async function executeRobTransaction\(t, fromUserId, targetUserId, fromMemberName, targetMemberName, robberStatsObj, targetStatsObj\) \{/, `async function executeRobTransaction(t, fromUserId, targetUserId, fromMemberName, targetMemberName, robberStatsObj, targetStatsObj, isConfirmed) {`);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Patched');
