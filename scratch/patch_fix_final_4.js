const fs = require('fs');
const path = require('path');

const equipPath = path.join(__dirname, '../handlers/equipment.js');
let code = fs.readFileSync(equipPath, 'utf8');

// 1. Shorten btnText in getNextLevelInfo
code = code.replace(/✨ 繼續衝 \+/g, '✨ 衝 +');
code = code.replace(/🔥 繼續衝 \+/g, '🔥 衝 +');
code = code.replace(/⚠️ 挑戰 \+/g, '⚠️ 衝 +');
code = code.replace(/💀 拼死一搏 \+/g, '💀 衝 +');

// 2. Change buildSingleEnchantBubble signature
code = code.replace(
    /function buildSingleEnchantBubble\(isSuccess, type, slot, equip, config, oldLvl, newLvl, scrollsLeft, costCount, enchantCount, lukBonus = 0, reqId = '', isAdmin = false\)/g,
    "function buildSingleEnchantBubble(isSuccess, type, slot, equip, config, oldLvl, newLvl, scrollsLeft, costCount, enchantCount, lukBonus = 0, reqId = '', userId = '')"
);

// Add const isAdmin inside buildSingleEnchantBubble
code = code.replace(
    /function buildSingleEnchantBubble\([\s\S]*?\) \{/,
    "$& \n    const isAdmin = userId === 'Ub9d430ac171216287573a0b9541494dd';"
);

// 3. Update all buildSingleEnchantBubble calls to pass userId
// line 683: buildSingleEnchantBubble(true, type, slot, equip, config, currentLvl, nextLvl, scrolls[scrollKey], 1, newEnchantCount, lukBonus, reqId)
code = code.replace(
    /buildSingleEnchantBubble\(true, type, slot, equip, config, currentLvl, nextLvl, scrolls\[scrollKey\], 1, newEnchantCount, lukBonus, reqId\);/g,
    "buildSingleEnchantBubble(true, type, slot, equip, config, currentLvl, nextLvl, scrolls[scrollKey], 1, newEnchantCount, lukBonus, reqId, userId);"
);

// line 713: buildSingleEnchantBubble(false, type, slot, failedEquip, config, currentLvl, 0, scrolls[scrollKey], 1, newEnchantCount, lukBonus, reqId)
code = code.replace(
    /buildSingleEnchantBubble\(false, type, slot, failedEquip, config, currentLvl, 0, scrolls\[scrollKey\], 1, newEnchantCount, lukBonus, reqId\);/g,
    "buildSingleEnchantBubble(false, type, slot, failedEquip, config, currentLvl, 0, scrolls[scrollKey], 1, newEnchantCount, lukBonus, reqId, userId);"
);

// line 921: enchantEquipmentPostback calls buildSingleEnchantBubble
// It might be split across lines. Let's find the exact call in enchantEquipmentPostback.
// From previous check:
// scrolls[scrollKey], costCount, enchantCount, lukBonus, newReqId, (userId === 'Ub9d430ac171216287573a0b9541494dd')
code = code.replace(
    /scrolls\[scrollKey\], costCount, enchantCount, lukBonus, newReqId, \(userId === 'Ub9d430ac171216287573a0b9541494dd'\)/g,
    "scrolls[scrollKey], costCount, enchantCount, lukBonus, newReqId, userId"
);

// line 1111: buyAndSafeEnchantPostback calls buildSingleEnchantBubble
// const bubble = buildSingleEnchantBubble(true, type, slot, newEquip, config, 0, 4, scrolls[config.scrollKey], 4, newEnchantCount, lukBonus, newReqId);
code = code.replace(
    /buildSingleEnchantBubble\(true, type, slot, newEquip, config, 0, 4, scrolls\[config\.scrollKey\], 4, newEnchantCount, lukBonus, newReqId\);/g,
    "buildSingleEnchantBubble(true, type, slot, newEquip, config, 0, 4, scrolls[config.scrollKey], 4, newEnchantCount, lukBonus, newReqId, userId);"
);

// 4. Also fix flex layout in buildSingleEnchantBubble and enchantEquipmentPostback (if needed, but text shortening is usually enough, let's also change flex: 2 -> flex: 3 for the first button)
code = code.replace(
    /flexUtils\.createButton\(\{ action: \{ type: 'postback', label: nextInfo\.btnText, data: `action=enchant_equip&type=\$\{type\}&slot=\$\{slot\}&times=1&reqId=\$\{reqId\}` \}, style: 'primary', height: 'sm', color: nextInfo\.btnColor, margin: 'xs', flex: 2 \}\)/g,
    "flexUtils.createButton({ action: { type: 'postback', label: nextInfo.btnText, data: `action=enchant_equip&type=${type}&slot=${slot}&times=1&reqId=${reqId}` }, style: 'primary', height: 'sm', color: nextInfo.btnColor, margin: 'xs', flex: 3 })"
);

// enchantEquipmentPostback has newReqId
code = code.replace(
    /flexUtils\.createButton\(\{ action: \{ type: 'postback', label: nextInfo\.btnText, data: `action=enchant_equip&type=\$\{type\}&slot=\$\{slot\}&times=1&reqId=\$\{newReqId\}` \}, style: 'primary', height: 'sm', color: nextInfo\.btnColor, margin: 'xs', flex: 2 \}\)/g,
    "flexUtils.createButton({ action: { type: 'postback', label: nextInfo.btnText, data: `action=enchant_equip&type=${type}&slot=${slot}&times=1&reqId=${newReqId}` }, style: 'primary', height: 'sm', color: nextInfo.btnColor, margin: 'xs', flex: 3 })"
);

// Also shorten the other buttons slightly
code = code.replace(/⚡連衝x3/g, '⚡連x3');
code = code.replace(/🔥連衝x5/g, '🔥連x5');

fs.writeFileSync(equipPath, code, 'utf8');
console.log("Fixes applied.");
