const fs = require('fs');
const path = require('path');

const jailPath = path.join(__dirname, '../handlers/jail.js');
const routesPath = path.join(__dirname, '../routes/jailRoutes.js');

let code = fs.readFileSync(jailPath, 'utf8');

// 1. Bail Amount Logic
code = code.replace(
    /const bailAmount = 50000 \+ \(crimeRecord \* 100000\);/g,
    `const kuCoin = data.kuCoin || 0;\n        const bailAmount = 50000 + (crimeRecord * 500000) + Math.floor(kuCoin * 0.15);`
);
code = code.replace(
    /const crimeRecord = targetData\.crimeRecord \|\| 0;\n\s*const bailAmount = 50000 \+ \(crimeRecord \* 100000\);/g,
    `const targetCoin = targetData.kuCoin || 0;\n            const crimeRecord = targetData.crimeRecord || 0;\n            const bailAmount = 50000 + (crimeRecord * 500000) + Math.floor(targetCoin * 0.15);`
);

// 2. handleJailbreak logic
code = code.replace(
    /const lukBonus = Math\.min\(25, luk \* 0\.5\);\n\s*const finalChance = 5 \+ lukBonus;/g,
    `const eva = stats.final.eva || 0;\n            const finalChance = 5 + (eva * 1.0625);`
);
// replace wantedLevel: 1.0 if it's not already
// It already is 1.0 from our previous text.

// 3. handleLabor logic modification
// Need to add RPG stats fetching and modify reduceMins
code = code.replace(
    /const rand = Math\.random\(\) \* 100;\n\s*const cooldownTime = Date\.now\(\) \+ 5 \* 60 \* 1000;\n\s*(\/\/ 基礎減刑.*?)\n\s*const reduceMins = Math\.floor\(Math\.random\(\) \* 6\) \+ 10;/g,
    `const { getFinalPlayerStats } = require('./rpg');\n            const stats = await getFinalPlayerStats(userId);\n            const str = stats.final.str || 0;\n            const luk = stats.final.luk || 0;\n\n            const rand = Math.random() * 100;\n            const cooldownTime = Date.now() + 5 * 60 * 1000;\n            \n            const reduceMins = Math.floor(Math.random() * 6) + 10 + Math.floor(str * 0.5);`
);

// 4. handleBlowWarden function (new)
const blowWardenCode = `
/**
 * 幫典獄長吹喇叭
 */
async function handleBlowWarden(replyToken, context) {
    const { userId, groupId } = context;

    try {
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);
        const result = await db.runTransaction(async (t) => {
            const docRef = db.collection('economy_users').doc(userId);
            const doc = await t.get(docRef);
            if (!doc.exists) return { success: false, message: '找不到資料。' };
            const data = doc.data();
            
            if (!data.jailedUntil || Date.now() >= data.jailedUntil) {
                return { success: false, message: '你又沒坐牢，跑來吹什麼喇叭？' };
            }

            if (data.blowCooldownUntil && Date.now() < data.blowCooldownUntil) {
                const remaining = Math.ceil((data.blowCooldownUntil - Date.now()) / 60000);
                return { success: false, message: \`典獄長現在進入聖人模式，請休息 \${remaining} 分鐘後再來！\` };
            }

            const rand = Math.random() * 100;
            const cooldownTime = Date.now() + 30 * 60 * 1000;
            
            let isFree = false;
            let finalJailedUntil = data.jailedUntil;
            let eventMsg = '';
            let isBad = false;

            if (rand < 10) {
                // 10% 典獄長覺得不舒服，加刑 30 分鐘
                finalJailedUntil = Math.max(Date.now(), data.jailedUntil) + (30 * 60 * 1000);
                eventMsg = '你牙齒撞到典獄長，他不舒服一怒之下給你加刑 30 分鐘！';
                isBad = true;
            } else if (rand < 50) {
                // 40% 白嫖
                eventMsg = '你賣力服務了半天，典獄長爽完提上褲子就不認人了，刑期一點也沒少！(被白嫖)';
                isBad = true;
            } else {
                // 50% 扣除一半剩餘刑期
                const remainingMins = Math.ceil((data.jailedUntil - Date.now()) / 60000);
                const deductMins = Math.floor(remainingMins / 2);
                finalJailedUntil = data.jailedUntil - (deductMins * 60 * 1000);
                eventMsg = \`典獄長龍心大悅！直接幫你減去了一半的剩餘刑期 (\${deductMins} 分鐘)！\`;
                if (finalJailedUntil <= Date.now()) isFree = true;
            }

            if (isFree) {
                t.update(docRef, { jailedUntil: db.FieldValue.delete(), blowCooldownUntil: cooldownTime });
            } else {
                t.update(docRef, { jailedUntil: finalJailedUntil, blowCooldownUntil: cooldownTime });
            }

            return { success: true, isFree, eventMsg, isBad, name: memberName || data.name, finalJailedUntil };
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, \`❌ \${result.message}\`);
            return;
        }

        if (result.isFree) {
            await lineUtils.replyText(replyToken, \`👄 【特殊服務】\\n\${result.name} 敲開了典獄長的辦公室...\\n\${result.eventMsg}\\n\\n🎉 由於刑期已滿，典獄長批准你出獄啦！\`);
        } else {
            const remainingMins = Math.ceil((result.finalJailedUntil - Date.now()) / 60000);
            const icon = result.isBad ? '😭' : '👄';
            await lineUtils.replyText(replyToken, \`\${icon} 【特殊服務】\\n\${result.name} 敲開了典獄長的辦公室...\\n\${result.eventMsg}\\n\\n目前剩餘刑期：\${remainingMins} 分鐘。 (冷卻30分)\`);
        }

    } catch (e) {
        console.error('[Jail] handleBlowWarden Error:', e);
    }
}
`;

// Insert handleBlowWarden before handleJailbreak
code = code.replace(
    /\/\*\*\n \* 越獄/,
    blowWardenCode + '\n/**\n * 越獄'
);

// Add export
code = code.replace(
    /handleBribe,\n\s*confirmBribe\n};/,
    `handleBribe,\n    confirmBribe,\n    handleBlowWarden\n};`
);

// 5. handleRiot logic
// Add STR fetch to resolveRiot
code = code.replace(
    /async function resolveRiot\(groupId, replyToken = null, prependMsg = null\) \{/,
    `async function resolveRiot(groupId, replyToken = null, prependMsg = null) {\n    const { getFinalPlayerStats } = require('./rpg');`
);
code = code.replace(
    /if \(participants\.length >= 3\) \{/,
    `let totalStr = 0;\n        for (const uid of participants) {\n            const stats = await getFinalPlayerStats(uid);\n            totalStr += (stats.final.str || 0);\n        }\n        const riotChance = Math.min(80, 10 + Math.floor(totalStr * 0.5));\n        const rand = Math.random() * 100;\n\n        if (participants.length >= 2 && rand < riotChance) {`
);
code = code.replace(
    /if \(participants\.length === 0\) return;\n\n    try \{/,
    `if (participants.length === 0) return;\n\n    try {\n        // Fetch str is inside try now`
);

code = code.replace(
    /batch\.update\(ref, \{ jailedUntil: db\.FieldValue\.delete\(\) \}\);/g,
    `batch.update(ref, { jailedUntil: db.FieldValue.delete(), wantedLevel: 1.0 });`
);

code = code.replace(
    /\(participants\.length >= 3\)/g,
    `(participants.length >= 2 && rand < riotChance)`
);

// update UI for riot
code = code.replace(
    /由於響應人數不足 \(\$\{participants\.length\} 人\)/,
    `暴動行動不幸失敗！`
);
code = code.replace(
    /\(最少需要 3 人才能成功\)/,
    `(需要 2 人以上，隊伍總力量越高成功率越大！)`
);

// 6. Bribe Logic
// In handleBribePrompt
code = code.replace(
    /const bailAmount = 50000 \+ \(crimeRecord \* 100000\);\n\s*const header = flexUtils\.createHeader/g,
    `const kuCoin = data.kuCoin || 0;\n        const bailAmount = 50000 + (crimeRecord * 500000) + Math.floor(kuCoin * 0.15);\n        const header = flexUtils.createHeader`
);
code = code.replace(
    /const bailAmount = 50000 \+ \(crimeRecord \* 100000\);\n\s*const requiredAmount = Math\.floor\(bailAmount \* 0\.5\);/g,
    `const kuCoin = data.kuCoin || 0;\n            const bailAmount = 50000 + (crimeRecord * 500000) + Math.floor(kuCoin * 0.15);\n            const requiredAmount = Math.floor(bailAmount * 0.5);`
);
// In confirmBribe
code = code.replace(
    /t\.update\(docRef, \{ jailedUntil: db\.FieldValue\.delete\(\) \}\);/g,
    `t.update(docRef, { jailedUntil: db.FieldValue.delete(), wantedLevel: 0 });` // Already sets wantedLevel to 0
);


fs.writeFileSync(jailPath, code, 'utf8');

// Modify routes
let routeCode = fs.readFileSync(routesPath, 'utf8');
if (!routeCode.includes('handleBlowWarden')) {
    routeCode = routeCode.replace(
        /router\.register\(\/\^\(勞動\|勞動改造\)\$\/, async \(context\) => \{/,
        `router.register(/^(吹喇叭|幫典獄長吹喇叭)$/, async (context) => {\n        await jailHandler.handleBlowWarden(context.replyToken, context);\n    }, { isGroupOnly: true, needAuth: true });\n\n    router.register(/^(勞動|勞動改造)$/, async (context) => {`
    );
    fs.writeFileSync(routesPath, routeCode, 'utf8');
}

console.log("Jail mechanics successfully patched.");
