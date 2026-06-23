const fs = require('fs');
const path = './handlers/monk.js';
let content = fs.readFileSync(path, 'utf8');

// Remove all updateCooldown calls
content = content.replace(/^[ \t]*await updateCooldown\(userId, '([^']+)'\);\r?\n/gm, '');

// Update processSkillResult signature
content = content.replace(
    /async function processSkillResult\(replyToken, groupId, userId, data, skillName, resultMsg, moneyChange, followersChange, karmaChange\) \{/g,
    `async function processSkillResult(replyToken, groupId, userId, data, skillName, resultMsg, moneyChange, followersChange, karmaChange, skillKey) {`
);

// Map skills to their skillKeys
const skillMapping = {
    'fortuneTelling': 'fortune',
    'chanting': 'chanting',
    'releaseAnimal': 'release',
    'begging': 'begging',
    'preach': 'preach',
    'ceremony': 'ceremony',
    'sellNiche': 'sellNiche',
    'dualCultivation': 'dualCultivation'
};

// Replace processSkillResult calls inside each function
for (const [funcName, skillKey] of Object.entries(skillMapping)) {
    // Find the function block
    const funcRegex = new RegExp(`async function ${funcName}\\([\\s\\S]*?\\n\\}`);
    const match = content.match(funcRegex);
    if (match) {
        let funcContent = match[0];
        // Append skillKey to processSkillResult calls in this function
        funcContent = funcContent.replace(
            /(await processSkillResult\(.*?)(?=\);)/g,
            `$1, '${skillKey}'`
        );
        content = content.replace(match[0], funcContent);
    }
}

// Rewrite processSkillResult implementation to use db.runTransaction
const oldProcessBodyRegex = /async function processSkillResult[^{]+\{[\s\S]*?(?=\n\s*let profitText)/;
const newProcessBody = `async function processSkillResult(replyToken, groupId, userId, data, skillName, resultMsg, moneyChange, followersChange, karmaChange, skillKey) {
    const docRef = db.collection('economy_users').doc(userId);
    const doc = await docRef.get();
    if (!doc.exists) return;
    const currentData = doc.data();

    const isPunished = await checkKarmaPunishment(groupId, userId, currentData);
    if (isPunished) return; // 天譴發動，行動中斷 (不進冷卻)

    let newCoin = 0, newFollowers = 0, newKarma = 0;

    await db.runTransaction(async (t) => {
        const tDoc = await t.get(docRef);
        if (!tDoc.exists) return;
        const tData = tDoc.data();

        newCoin = (tData.kuCoin || 0) + moneyChange;
        newFollowers = Math.max(0, (tData.followers || 0) + followersChange);
        newKarma = Math.max(0, (tData.karma || 0) + karmaChange);

        const updates = {
            kuCoin: newCoin,
            followers: newFollowers,
            karma: newKarma
        };
        if (skillKey) {
            updates[\`monkCooldowns.\${skillKey}\`] = Date.now();
        }
        t.update(docRef, updates);
    });
`;

content = content.replace(oldProcessBodyRegex, newProcessBody);

fs.writeFileSync(path, content, 'utf8');
console.log('Refactoring monk.js complete.');
