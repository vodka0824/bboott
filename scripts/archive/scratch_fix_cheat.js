const fs = require('fs');

function removeCheat() {
    // 1. rpgRoutes.js
    let rpgRoutes = fs.readFileSync('routes/rpgRoutes.js', 'utf8');
    rpgRoutes = rpgRoutes.replace(/\/\/ 測試指令：開掛[\s\S]*?feature: 'rpg_cheat' \}\n    \);/g, '');
    fs.writeFileSync('routes/rpgRoutes.js', rpgRoutes);

    // 2. casinoRoutes.js
    let casinoRoutes = fs.readFileSync('routes/casinoRoutes.js', 'utf8');
    casinoRoutes = casinoRoutes.replace(/const cheat = params\.get\('cheat'\) === 'true';\s*await equipmentHandler\.enchantEquipmentPostback\(ctx\.replyToken, type, slot, times, ctx\.userId, reqId, cheat, ctx\.groupId\);/g, 
        `await equipmentHandler.enchantEquipmentPostback(ctx.replyToken, type, slot, times, ctx.userId, reqId, ctx.groupId);`);
    fs.writeFileSync('routes/casinoRoutes.js', casinoRoutes);

    // 3. rpg.js
    let rpgJs = fs.readFileSync('handlers/rpg.js', 'utf8');
    rpgJs = rpgJs.replace(/\/\*\*\n \* 內部測試用指令：!無敵開掛[\s\S]*?async function handleCheatCode\(context\) \{[\s\S]*?\}\n\n/g, '');
    rpgJs = rpgJs.replace(/,\s*handleCheatCode/g, '');
    fs.writeFileSync('handlers/rpg.js', rpgJs);

    // 4. equipment.js
    let eqJs = fs.readFileSync('handlers/equipment.js', 'utf8');
    // Remove UI buttons
    eqJs = eqJs.replace(/\s*\.\.\.\(isAdmin \? \[flexUtils\.createButton\(\{ action: \{ type: 'postback', label: `👽作弊\+1`, data: `action=enchant_equip&type=\$\{type\}&slot=main&times=1&reqId=\$\{reqId\}&cheat=true` \}, style: 'primary', height: 'sm', color: '#9C27B0', margin: 'xs', flex: 3 \}\)\] : \[\]\),/g, '');
    eqJs = eqJs.replace(/\s*\.\.\.\(isAdmin \? \[flexUtils\.createButton\(\{ action: \{ type: 'postback', label: `👽作弊\+1`, data: `action=enchant_equip&type=\$\{type\}&slot=backup&times=1&reqId=\$\{reqId\}&cheat=true` \}, style: 'primary', height: 'sm', color: '#9C27B0', margin: 'xs', flex: 3 \}\)\] : \[\]\),/g, '');
    eqJs = eqJs.replace(/\s*\.\.\.\(userId === ADMIN_USER_ID \? \[flexUtils\.createButton\(\{ action: \{ type: 'postback', label: `👽作弊\+1`, data: `action=enchant_equip&type=\$\{type\}&slot=\$\{slot\}&times=1&reqId=\$\{newReqId\}&cheat=true` \}, style: 'primary', height: 'sm', color: '#9C27B0', margin: 'xs', flex: 3 \}\)\] : \[\]\)/g, '');
    eqJs = eqJs.replace(/\s*\.\.\.\(isAdmin \? \[flexUtils\.createButton\(\{ action: \{ type: 'postback', label: `👽作弊\+1`, data: `action=enchant_equip&type=\$\{type\}&slot=\$\{slot\}&times=1&reqId=\$\{reqId\}&cheat=true` \}, style: 'primary', height: 'sm', color: '#9C27B0', margin: 'xs', flex: 3 \}\)\] : \[\]\)/g, '');
    
    // Remove cheat parameter from enchantEquipmentPostback
    eqJs = eqJs.replace(/async function enchantEquipmentPostback\(replyToken, type, slot, times, userId, reqId, cheat = false, groupId = 'direct'\) \{/g, 
        `async function enchantEquipmentPostback(replyToken, type, slot, times, userId, reqId, groupId = 'direct') {`);
    eqJs = eqJs.replace(/if \(!cheat && \(scrolls\[scrollKey\] \|\| 0\) <= 0\) \{/g, `if ((scrolls[scrollKey] || 0) <= 0) {`);
    eqJs = eqJs.replace(/const isSuccess = cheat \? true : Math\.random\(\) < rate;/g, `const isSuccess = Math.random() < rate;`);
    
    // Clean up enchantEquipment text command cheat reference
    eqJs = eqJs.replace(/const cheat = false;\s*/g, '');
    eqJs = eqJs.replace(/if \(!cheat\) scrolls\[scrollKey\] -= 1;/g, `scrolls[scrollKey] -= 1;`);

    fs.writeFileSync('handlers/equipment.js', eqJs);
    console.log("Cheat features removed successfully.");
}

removeCheat();
