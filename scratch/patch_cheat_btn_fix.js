const fs = require('fs');
const path = require('path');

const equipPath = path.join(__dirname, '../handlers/equipment.js');
let equipCode = fs.readFileSync(equipPath, 'utf8');

// 1. Fix the cheat logic in enchantEquipmentPostback
// a. scroll check
equipCode = equipCode.replace(
    'if ((scrolls[scrollKey] || 0) <= 0) {',
    'if (!cheat && (scrolls[scrollKey] || 0) <= 0) {'
);
// b. scroll consume
equipCode = equipCode.replace(
    'scrolls[scrollKey] -= 1;',
    'if (!cheat) scrolls[scrollKey] -= 1;'
);
// c. success check
equipCode = equipCode.replace(
    'const isSuccess = Math.random() < rate;',
    'const isSuccess = cheat ? true : Math.random() < rate;'
);

// 2. Add isAdmin checks for cheat buttons in showMyEquipments
const adminCheck = "const isAdmin = userId === 'Ub9d430ac171216287573a0b9541494dd';";

equipCode = equipCode.replace(
    "const backupEquip = backupEquips[type];",
    "const backupEquip = backupEquips[type];\n            const isAdmin = userId === 'Ub9d430ac171216287573a0b9541494dd';"
);

// We need to conditionally include the cheat button in mainItems.push
equipCode = equipCode.replace(
    "flexUtils.createButton({ action: { type: 'postback', label: `💥狂衝x8`, data: `action=enchant_equip&type=${type}&slot=main&times=8&reqId=${reqId}` }, style: 'primary', color: '#E91E63', height: 'sm', margin: 'xs', flex: 3 }),\n                        flexUtils.createButton({ action: { type: 'postback', label: `👽作弊+1`, data: `action=enchant_equip&type=${type}&slot=main&times=1&reqId=${reqId}&cheat=true` }, style: 'primary', height: 'sm', color: '#9C27B0', margin: 'xs', flex: 3 }),",
    "flexUtils.createButton({ action: { type: 'postback', label: `💥狂衝x8`, data: `action=enchant_equip&type=${type}&slot=main&times=8&reqId=${reqId}` }, style: 'primary', color: '#E91E63', height: 'sm', margin: 'xs', flex: 3 }),\n                        ...(isAdmin ? [flexUtils.createButton({ action: { type: 'postback', label: `👽作弊+1`, data: `action=enchant_equip&type=${type}&slot=main&times=1&reqId=${reqId}&cheat=true` }, style: 'primary', height: 'sm', color: '#9C27B0', margin: 'xs', flex: 3 })] : []),"
);

equipCode = equipCode.replace(
    "flexUtils.createButton({ action: { type: 'postback', label: `💥狂衝x8`, data: `action=enchant_equip&type=${type}&slot=backup&times=8&reqId=${reqId}` }, style: 'primary', color: '#E91E63', height: 'sm', margin: 'xs', flex: 3 }),\n                        flexUtils.createButton({ action: { type: 'postback', label: `👽作弊+1`, data: `action=enchant_equip&type=${type}&slot=backup&times=1&reqId=${reqId}&cheat=true` }, style: 'primary', height: 'sm', color: '#9C27B0', margin: 'xs', flex: 3 }),",
    "flexUtils.createButton({ action: { type: 'postback', label: `💥狂衝x8`, data: `action=enchant_equip&type=${type}&slot=backup&times=8&reqId=${reqId}` }, style: 'primary', color: '#E91E63', height: 'sm', margin: 'xs', flex: 3 }),\n                        ...(isAdmin ? [flexUtils.createButton({ action: { type: 'postback', label: `👽作弊+1`, data: `action=enchant_equip&type=${type}&slot=backup&times=1&reqId=${reqId}&cheat=true` }, style: 'primary', height: 'sm', color: '#9C27B0', margin: 'xs', flex: 3 })] : []),"
);


// 3. Add isAdmin checks for cheat buttons in enchantEquipmentPostback
// In enchantEquipmentPostback, userId is in context.userId
equipCode = equipCode.replace(
    "const slot = params.slot || 'main';",
    "const slot = params.slot || 'main';\n    const isAdmin = userId === 'Ub9d430ac171216287573a0b9541494dd';"
);

equipCode = equipCode.replace(
    "flexUtils.createButton({ action: { type: 'postback', label: `💥狂衝x8`, data: `action=enchant_equip&type=${type}&slot=${slot}&times=8&reqId=${newReqId}` }, style: 'primary', color: '#E91E63', height: 'sm', margin: 'xs', flex: 3 }),\n                            flexUtils.createButton({ action: { type: 'postback', label: `👽作弊+1`, data: `action=enchant_equip&type=${type}&slot=${slot}&times=1&reqId=${newReqId}&cheat=true` }, style: 'primary', height: 'sm', color: '#9C27B0', margin: 'xs', flex: 3 })",
    "flexUtils.createButton({ action: { type: 'postback', label: `💥狂衝x8`, data: `action=enchant_equip&type=${type}&slot=${slot}&times=8&reqId=${newReqId}` }, style: 'primary', color: '#E91E63', height: 'sm', margin: 'xs', flex: 3 }),\n                            ...(isAdmin ? [flexUtils.createButton({ action: { type: 'postback', label: `👽作弊+1`, data: `action=enchant_equip&type=${type}&slot=${slot}&times=1&reqId=${newReqId}&cheat=true` }, style: 'primary', height: 'sm', color: '#9C27B0', margin: 'xs', flex: 3 })] : [])"
);

// 4. Update buildSingleEnchantBubble to take isAdmin and use it
equipCode = equipCode.replace(
    "function buildSingleEnchantBubble(isSuccess, type, slot, equip, config, oldLvl, newLvl, scrollsLeft, costCount, enchantCount, lukBonus = 0, reqId = '') {",
    "function buildSingleEnchantBubble(isSuccess, type, slot, equip, config, oldLvl, newLvl, scrollsLeft, costCount, enchantCount, lukBonus = 0, reqId = '', isAdmin = false) {"
);

equipCode = equipCode.replace(
    "const bubble = buildSingleEnchantBubble(\n                !isBroken, type, slot, equip, config, \n                isBroken ? currentLvl : currentLvl - 1, \n                isBroken ? 0 : currentLvl, \n                scrolls[scrollKey], costCount, enchantCount, lukBonus, newReqId\n            );",
    "const bubble = buildSingleEnchantBubble(\n                !isBroken, type, slot, equip, config, \n                isBroken ? currentLvl : currentLvl - 1, \n                isBroken ? 0 : currentLvl, \n                scrolls[scrollKey], costCount, enchantCount, lukBonus, newReqId, isAdmin\n            );"
);

equipCode = equipCode.replace(
    "flexUtils.createButton({ action: { type: 'postback', label: `💥狂衝x8`, data: `action=enchant_equip&type=${type}&slot=${slot}&times=8&reqId=${reqId}` }, style: 'primary', color: '#E91E63', height: 'sm', margin: 'xs', flex: 3 }),\n                    flexUtils.createButton({ action: { type: 'postback', label: `👽作弊+1`, data: `action=enchant_equip&type=${type}&slot=${slot}&times=1&reqId=${reqId}&cheat=true` }, style: 'primary', height: 'sm', color: '#9C27B0', margin: 'xs', flex: 3 })",
    "flexUtils.createButton({ action: { type: 'postback', label: `💥狂衝x8`, data: `action=enchant_equip&type=${type}&slot=${slot}&times=8&reqId=${reqId}` }, style: 'primary', color: '#E91E63', height: 'sm', margin: 'xs', flex: 3 }),\n                    ...(isAdmin ? [flexUtils.createButton({ action: { type: 'postback', label: `👽作弊+1`, data: `action=enchant_equip&type=${type}&slot=${slot}&times=1&reqId=${reqId}&cheat=true` }, style: 'primary', height: 'sm', color: '#9C27B0', margin: 'xs', flex: 3 })] : [])"
);

fs.writeFileSync(equipPath, equipCode, 'utf8');
console.log('Cheat button visibility patched!');
