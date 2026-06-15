const fs = require('fs');
const path = require('path');

const equipPath = path.join(__dirname, '../handlers/equipment.js');
let equipCode = fs.readFileSync(equipPath, 'utf8');

// 1. 修改 enchantEquipmentPostback signature
equipCode = equipCode.replace(
    'async function enchantEquipmentPostback(replyToken, type, slot, times, userId, reqId) {',
    'async function enchantEquipmentPostback(replyToken, type, slot, times, userId, reqId, cheat = false) {'
);

// 2. 修改 isSuccess 邏輯
equipCode = equipCode.replace(
    'const isSuccess = Math.random() < rate;',
    'const isSuccess = cheat ? true : Math.random() < rate;'
);

// 3. 在 showMyEquipments 中增加 GM直升 按鈕 (Main Slot)
equipCode = equipCode.replace(
    /flexUtils\.createButton\(\{ action: \{ type: 'postback', label: \`⚡連衝x3\`, data: \`action=enchant_equip&type=\$\{type\}&slot=main&times=3&reqId=\$\{reqId\}\` \}, style: 'secondary', height: 'sm', margin: 'xs', flex: 2 \}\),/g,
    `flexUtils.createButton({ action: { type: 'postback', label: \`⚡連衝x3\`, data: \`action=enchant_equip&type=\${type}&slot=main&times=3&reqId=\${reqId}\` }, style: 'secondary', height: 'sm', margin: 'xs', flex: 2 }),
                        flexUtils.createButton({ action: { type: 'postback', label: \`👽作弊+1\`, data: \`action=enchant_equip&type=\${type}&slot=main&times=1&reqId=\${reqId}&cheat=true\` }, style: 'primary', height: 'sm', color: '#9C27B0', margin: 'xs', flex: 2 }),`
);

// 4. 在 showMyEquipments 中增加 GM直升 按鈕 (Backup Slot)
equipCode = equipCode.replace(
    /flexUtils\.createButton\(\{ action: \{ type: 'postback', label: \`⚡連衝x3\`, data: \`action=enchant_equip&type=\$\{type\}&slot=backup&times=3&reqId=\$\{reqId\}\` \}, style: 'secondary', height: 'sm', margin: 'xs', flex: 2 \}\),/g,
    `flexUtils.createButton({ action: { type: 'postback', label: \`⚡連衝x3\`, data: \`action=enchant_equip&type=\${type}&slot=backup&times=3&reqId=\${reqId}\` }, style: 'secondary', height: 'sm', margin: 'xs', flex: 2 }),
                        flexUtils.createButton({ action: { type: 'postback', label: \`👽作弊+1\`, data: \`action=enchant_equip&type=\${type}&slot=backup&times=1&reqId=\${reqId}&cheat=true\` }, style: 'primary', height: 'sm', color: '#9C27B0', margin: 'xs', flex: 2 }),`
);

// 5. 連衝介面的按鈕
equipCode = equipCode.replace(
    /flexUtils\.createButton\(\{ action: \{ type: 'postback', label: \`⚡連衝x3\`, data: \`action=enchant_equip&type=\$\{type\}&slot=\$\{slot\}&times=3&reqId=\$\{newReqId\}\` \}, style: 'secondary', height: 'sm', margin: 'xs', flex: 2 \}\),/g,
    `flexUtils.createButton({ action: { type: 'postback', label: \`⚡連衝x3\`, data: \`action=enchant_equip&type=\${type}&slot=\${slot}&times=3&reqId=\${newReqId}\` }, style: 'secondary', height: 'sm', margin: 'xs', flex: 2 }),
                        flexUtils.createButton({ action: { type: 'postback', label: \`👽作弊+1\`, data: \`action=enchant_equip&type=\${type}&slot=\${slot}&times=1&reqId=\${newReqId}&cheat=true\` }, style: 'primary', height: 'sm', color: '#9C27B0', margin: 'xs', flex: 2 }),`
);

// 單次強化的 Bubble
equipCode = equipCode.replace(
    /flexUtils\.createButton\(\{ action: \{ type: 'postback', label: \`⚡連衝x3\`, data: \`action=enchant_equip&type=\$\{type\}&slot=\$\{slot\}&times=3&reqId=\$\{reqId\}\` \}, style: 'secondary', height: 'sm', margin: 'xs', flex: 3 \}\),/g,
    `flexUtils.createButton({ action: { type: 'postback', label: \`⚡連衝x3\`, data: \`action=enchant_equip&type=\${type}&slot=\${slot}&times=3&reqId=\${reqId}\` }, style: 'secondary', height: 'sm', margin: 'xs', flex: 3 }),
                    flexUtils.createButton({ action: { type: 'postback', label: \`👽作弊+1\`, data: \`action=enchant_equip&type=\${type}&slot=\${slot}&times=1&reqId=\${reqId}&cheat=true\` }, style: 'primary', height: 'sm', color: '#9C27B0', margin: 'xs', flex: 3 }),`
);


// 不扣卷邏輯
equipCode = equipCode.replace(
    'scrolls[scrollKey] -= 1;',
    'if (!cheat) scrolls[scrollKey] -= 1;'
);
equipCode = equipCode.replace(
    'if ((scrolls[scrollKey] || 0) <= 0) {',
    'if (!cheat && (scrolls[scrollKey] || 0) <= 0) {'
);

fs.writeFileSync(equipPath, equipCode, 'utf8');

const routePath = path.join(__dirname, '../routes/casinoRoutes.js');
let routeCode = fs.readFileSync(routePath, 'utf8');

routeCode = routeCode.replace(
    /const reqId = params\.get\('reqId'\) \|\| '';\s*await equipmentHandler\.enchantEquipmentPostback\(ctx\.replyToken, type, slot, times, ctx\.userId, reqId\);/,
    `const reqId = params.get('reqId') || '';
            const cheat = params.get('cheat') === 'true';
            await equipmentHandler.enchantEquipmentPostback(ctx.replyToken, type, slot, times, ctx.userId, reqId, cheat);`
);

fs.writeFileSync(routePath, routeCode, 'utf8');
console.log('Done!');
