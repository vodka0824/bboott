const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../services/robberyCombatService.js');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Replace robCoin to accept isConfirmed
const robCoinRegex = /async function robCoin\(replyToken, groupId, fromUserId, messageObject\) \{\s*const mentionObj = messageObject && messageObject\.mention;/;
content = content.replace(robCoinRegex, `async function robCoin(replyToken, groupId, fromUserId, messageObject) {\n    const isConfirmed = messageObject && messageObject.text && messageObject.text.includes('確認');\n    const mentionObj = messageObject && messageObject.mention;`);

// 2. Replace executeRobTransaction call
content = content.replace(
    /return await executeRobTransaction\(t, fromUserId, targetUserId, fromMemberName, targetMemberName, robberStatsObj, targetStatsObj\);/,
    `return await executeRobTransaction(t, fromUserId, targetUserId, fromMemberName, targetMemberName, robberStatsObj, targetStatsObj, isConfirmed);`
);

// 3. Update executeRobTransaction signature and early checks
const executeSigRegex = /async function executeRobTransaction\(t, fromUserId, targetUserId, fromMemberName, targetMemberName, robberStatsObj, targetStatsObj\) \{\s*const fromProfile = await getUserProfile\(t, fromUserId, fromMemberName\);\s*const targetProfile = await getUserProfile\(t, targetUserId, targetMemberName\);\s*const isCouncilor = fromProfile\.data\.councilorUntil && Date\.now\(\) < fromProfile\.data\.councilorUntil;/;
const newExecuteSig = `async function executeRobTransaction(t, fromUserId, targetUserId, fromMemberName, targetMemberName, robberStatsObj, targetStatsObj, isConfirmed) {
    const fromProfile = await getUserProfile(t, fromUserId, fromMemberName);
    const targetProfile = await getUserProfile(t, targetUserId, targetMemberName);

    const isCouncilor = fromProfile.data.councilorUntil && Date.now() < fromProfile.data.councilorUntil;
    const isTargetCouncilor = targetProfile.data.councilorUntil && Date.now() < targetProfile.data.councilorUntil;
    const isTargetPolice = targetProfile.data.isPolice;
    const isTargetMilitary = targetProfile.data.militaryUntil && Date.now() < targetProfile.data.militaryUntil;

    // 檢查醫療負債
    if (fromProfile.data.medicalDebt && fromProfile.data.medicalDebt > 0) {
        return { success: false, reason: 'debt', message: '❌ 你身上還有醫療負債未清，傷勢未癒，無法發動搶劫！' };
    }

    if (isTargetMilitary) {
        return { success: false, reason: 'military', message: '🛡️ 警告：對方目前正在營區服役，軍事重地禁止靠近！' };
    }`;
content = content.replace(executeSigRegex, newExecuteSig);

// 4. Add confirmation checks before Mafia aura
const auraRegex = /\/\/ 威壓護體 \(免被市民搶劫\)/;
content = content.replace(auraRegex, `if (!isConfirmed) {
        if (isTargetPolice) return { success: false, reason: 'warning_police', message: '🚨 警告：對方是現役警察！襲警失敗將面臨 3 倍刑期與武器沒收，但若成功可能摸走警局證物！確定請輸入 \`確認搶劫 @目標\`' };
        if (isTargetCouncilor) return { success: false, reason: 'warning_councilor', message: '🏛️ 警告：對方是市議員！突破保鑣失敗將面臨國家重罰，但成功將獲得鉅額黑金！確定請輸入 \`確認搶劫 @目標\`' };
        if (targetMafiaRank === 'boss' || targetMafiaRank === 'capo') return { success: false, reason: 'warning_mafia', message: '🕶️ 警告：對方是黑幫高層！惹毛他們可能會讓你背上鉅額醫療負債！確定請輸入 \`確認搶劫 @目標\`' };
    }

    // 威壓護體 (免被市民搶劫)`);

// 5. Replace calculateRobOutcome block
const calcBlockRegex = /const isTargetCouncilor = targetProfile\.data\.councilorUntil && Date\.now\(\) < targetProfile\.data\.councilorUntil;\s*if \(isTargetCouncilor\) \{[\s\S]*?outcomeData = calculateRobOutcome\(robberStatsObj\.final, targetStatsObj\.final, targetCoins, crimeRecord, wantedLevel, isCouncilor, isSnitch, mafiaRank, targetMafiaRank\);\s*\}\s*\}/;
content = content.replace(calcBlockRegex, `const targetLevel = targetProfile.data.level || 1;
        outcomeData = calculateRobOutcome(robberStatsObj.final, targetStatsObj.final, targetCoins, crimeRecord, wantedLevel, isCouncilor, isTargetPolice, isTargetCouncilor, isSnitch, mafiaRank, targetMafiaRank, targetLevel, isTargetMilitary);
    `);

// 6. Replace calculateRobOutcome function
const calcFuncRegex = /function calculateRobOutcome\([\s\S]*?return \{ outcome: 'success', newWantedLevel, robAmount, robRatio, isCrit, atkDefDiff, pen \};\s*\}\s*\}/;
const newCalcFunc = fs.readFileSync(path.join(__dirname, 'robberyRewritePart1.js'), 'utf8');
content = content.replace(calcFuncRegex, newCalcFunc);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Patch complete.');
