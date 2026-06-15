const fs = require('fs');
const path = require('path');

const equipPath = path.join(__dirname, '../handlers/equipment.js');
let equipCode = fs.readFileSync(equipPath, 'utf8');

// 1. showMyEquipments (Main)
equipCode = equipCode.replace(
`                    mainItems.push(flexUtils.createBox('horizontal', [
                        flexUtils.createButton({ action: { type: 'postback', label: \`⚡衝\`, data: \`action=enchant_equip&type=\${type}&slot=main&times=1&reqId=\${reqId}\` }, style: 'primary', height: 'sm', color: '#FF5722', margin: 'xs', flex: 1 }),
                        flexUtils.createButton({ action: { type: 'postback', label: \`⚡連衝x3\`, data: \`action=enchant_equip&type=\${type}&slot=main&times=3&reqId=\${reqId}\` }, style: 'secondary', height: 'sm', margin: 'xs', flex: 2 }),
                        flexUtils.createButton({ action: { type: 'postback', label: \`👽作弊+1\`, data: \`action=enchant_equip&type=\${type}&slot=main&times=1&reqId=\${reqId}&cheat=true\` }, style: 'primary', height: 'sm', color: '#9C27B0', margin: 'xs', flex: 2 }),
                        flexUtils.createButton({ action: { type: 'postback', label: \`🔥連衝x5\`, data: \`action=enchant_equip&type=\${type}&slot=main&times=5&reqId=\${reqId}\` }, style: 'primary', color: '#FF9800', height: 'sm', margin: 'xs', flex: 2 })
                    ], { margin: 'sm' }));
                    mainItems.push(flexUtils.createBox('horizontal', [
                        flexUtils.createButton({ action: { type: 'postback', label: \`💥狂衝x8\`, data: \`action=enchant_equip&type=\${type}&slot=main&times=8&reqId=\${reqId}\` }, style: 'primary', color: '#E91E63', height: 'sm', margin: 'xs', flex: 3 }),
                        flexUtils.createButton({ action: { type: 'postback', label: \`卸下至備用\`, data: \`action=swap_equip&type=\${type}\` }, style: 'secondary', height: 'sm', margin: 'xs', flex: 3 })
                    ], { margin: 'xs' }));`,
`                    mainItems.push(flexUtils.createBox('horizontal', [
                        flexUtils.createButton({ action: { type: 'postback', label: \`⚡衝\`, data: \`action=enchant_equip&type=\${type}&slot=main&times=1&reqId=\${reqId}\` }, style: 'primary', height: 'sm', color: '#FF5722', margin: 'xs', flex: 1 }),
                        flexUtils.createButton({ action: { type: 'postback', label: \`⚡連衝x3\`, data: \`action=enchant_equip&type=\${type}&slot=main&times=3&reqId=\${reqId}\` }, style: 'secondary', height: 'sm', margin: 'xs', flex: 2 }),
                        flexUtils.createButton({ action: { type: 'postback', label: \`🔥連衝x5\`, data: \`action=enchant_equip&type=\${type}&slot=main&times=5&reqId=\${reqId}\` }, style: 'primary', color: '#FF9800', height: 'sm', margin: 'xs', flex: 2 })
                    ], { margin: 'sm' }));
                    mainItems.push(flexUtils.createBox('horizontal', [
                        flexUtils.createButton({ action: { type: 'postback', label: \`💥狂衝x8\`, data: \`action=enchant_equip&type=\${type}&slot=main&times=8&reqId=\${reqId}\` }, style: 'primary', color: '#E91E63', height: 'sm', margin: 'xs', flex: 3 }),
                        flexUtils.createButton({ action: { type: 'postback', label: \`👽作弊+1\`, data: \`action=enchant_equip&type=\${type}&slot=main&times=1&reqId=\${reqId}&cheat=true\` }, style: 'primary', height: 'sm', color: '#9C27B0', margin: 'xs', flex: 3 }),
                        flexUtils.createButton({ action: { type: 'postback', label: \`卸下至備用\`, data: \`action=swap_equip&type=\${type}\` }, style: 'secondary', height: 'sm', margin: 'xs', flex: 3 })
                    ], { margin: 'xs' }));`
);

// 2. showMyEquipments (Backup)
equipCode = equipCode.replace(
`                    backupItems.push(flexUtils.createBox('horizontal', [
                        flexUtils.createButton({ action: { type: 'postback', label: \`⚡衝\`, data: \`action=enchant_equip&type=\${type}&slot=backup&times=1&reqId=\${reqId}\` }, style: 'primary', height: 'sm', color: '#FF5722', margin: 'xs', flex: 1 }),
                        flexUtils.createButton({ action: { type: 'postback', label: \`⚡連衝x3\`, data: \`action=enchant_equip&type=\${type}&slot=backup&times=3&reqId=\${reqId}\` }, style: 'secondary', height: 'sm', margin: 'xs', flex: 2 }),
                        flexUtils.createButton({ action: { type: 'postback', label: \`👽作弊+1\`, data: \`action=enchant_equip&type=\${type}&slot=backup&times=1&reqId=\${reqId}&cheat=true\` }, style: 'primary', height: 'sm', color: '#9C27B0', margin: 'xs', flex: 2 }),
                        flexUtils.createButton({ action: { type: 'postback', label: \`🔥連衝x5\`, data: \`action=enchant_equip&type=\${type}&slot=backup&times=5&reqId=\${reqId}\` }, style: 'primary', color: '#FF9800', height: 'sm', margin: 'xs', flex: 2 })
                    ], { margin: 'sm' }));
                    backupItems.push(flexUtils.createBox('horizontal', [
                        flexUtils.createButton({ action: { type: 'postback', label: \`💥狂衝x8\`, data: \`action=enchant_equip&type=\${type}&slot=backup&times=8&reqId=\${reqId}\` }, style: 'primary', color: '#E91E63', height: 'sm', margin: 'xs', flex: 3 }),
                        flexUtils.createButton({ action: { type: 'postback', label: \`替換上陣\`, data: \`action=swap_equip&type=\${type}\` }, style: 'secondary', height: 'sm', margin: 'xs', flex: 3 })
                    ], { margin: 'xs' }));`,
`                    backupItems.push(flexUtils.createBox('horizontal', [
                        flexUtils.createButton({ action: { type: 'postback', label: \`⚡衝\`, data: \`action=enchant_equip&type=\${type}&slot=backup&times=1&reqId=\${reqId}\` }, style: 'primary', height: 'sm', color: '#FF5722', margin: 'xs', flex: 1 }),
                        flexUtils.createButton({ action: { type: 'postback', label: \`⚡連衝x3\`, data: \`action=enchant_equip&type=\${type}&slot=backup&times=3&reqId=\${reqId}\` }, style: 'secondary', height: 'sm', margin: 'xs', flex: 2 }),
                        flexUtils.createButton({ action: { type: 'postback', label: \`🔥連衝x5\`, data: \`action=enchant_equip&type=\${type}&slot=backup&times=5&reqId=\${reqId}\` }, style: 'primary', color: '#FF9800', height: 'sm', margin: 'xs', flex: 2 })
                    ], { margin: 'sm' }));
                    backupItems.push(flexUtils.createBox('horizontal', [
                        flexUtils.createButton({ action: { type: 'postback', label: \`💥狂衝x8\`, data: \`action=enchant_equip&type=\${type}&slot=backup&times=8&reqId=\${reqId}\` }, style: 'primary', color: '#E91E63', height: 'sm', margin: 'xs', flex: 3 }),
                        flexUtils.createButton({ action: { type: 'postback', label: \`👽作弊+1\`, data: \`action=enchant_equip&type=\${type}&slot=backup&times=1&reqId=\${reqId}&cheat=true\` }, style: 'primary', height: 'sm', color: '#9C27B0', margin: 'xs', flex: 3 }),
                        flexUtils.createButton({ action: { type: 'postback', label: \`替換上陣\`, data: \`action=swap_equip&type=\${type}\` }, style: 'secondary', height: 'sm', margin: 'xs', flex: 3 })
                    ], { margin: 'xs' }));`
);

// 3. enchantEquipmentPostback
equipCode = equipCode.replace(
`                        flexUtils.createBox('horizontal', [
                            flexUtils.createButton({ action: { type: 'postback', label: nextInfo.btnText, data: \`action=enchant_equip&type=\${type}&slot=\${slot}&times=1&reqId=\${newReqId}\` }, style: 'primary', height: 'sm', color: nextInfo.btnColor, margin: 'xs', flex: 2 }),
                            flexUtils.createButton({ action: { type: 'postback', label: \`⚡連衝x3\`, data: \`action=enchant_equip&type=\${type}&slot=\${slot}&times=3&reqId=\${newReqId}\` }, style: 'secondary', height: 'sm', margin: 'xs', flex: 2 }),
                            flexUtils.createButton({ action: { type: 'postback', label: \`👽作弊+1\`, data: \`action=enchant_equip&type=\${type}&slot=\${slot}&times=1&reqId=\${newReqId}&cheat=true\` }, style: 'primary', height: 'sm', color: '#9C27B0', margin: 'xs', flex: 2 }),
                            flexUtils.createButton({ action: { type: 'postback', label: \`💥狂衝x8\`, data: \`action=enchant_equip&type=\${type}&slot=\${slot}&times=8&reqId=\${newReqId}\` }, style: 'primary', color: '#E91E63', height: 'sm', margin: 'xs', flex: 2 })
                        ], { margin: 'sm' })`,
`                        flexUtils.createBox('horizontal', [
                            flexUtils.createButton({ action: { type: 'postback', label: nextInfo.btnText, data: \`action=enchant_equip&type=\${type}&slot=\${slot}&times=1&reqId=\${newReqId}\` }, style: 'primary', height: 'sm', color: nextInfo.btnColor, margin: 'xs', flex: 2 }),
                            flexUtils.createButton({ action: { type: 'postback', label: \`⚡連衝x3\`, data: \`action=enchant_equip&type=\${type}&slot=\${slot}&times=3&reqId=\${newReqId}\` }, style: 'secondary', height: 'sm', margin: 'xs', flex: 2 }),
                            flexUtils.createButton({ action: { type: 'postback', label: \`🔥連衝x5\`, data: \`action=enchant_equip&type=\${type}&slot=\${slot}&times=5&reqId=\${newReqId}\` }, style: 'primary', color: '#FF9800', height: 'sm', margin: 'xs', flex: 2 })
                        ], { margin: 'sm' }),
                        flexUtils.createBox('horizontal', [
                            flexUtils.createButton({ action: { type: 'postback', label: \`💥狂衝x8\`, data: \`action=enchant_equip&type=\${type}&slot=\${slot}&times=8&reqId=\${newReqId}\` }, style: 'primary', color: '#E91E63', height: 'sm', margin: 'xs', flex: 3 }),
                            flexUtils.createButton({ action: { type: 'postback', label: \`👽作弊+1\`, data: \`action=enchant_equip&type=\${type}&slot=\${slot}&times=1&reqId=\${newReqId}&cheat=true\` }, style: 'primary', height: 'sm', color: '#9C27B0', margin: 'xs', flex: 3 })
                        ], { margin: 'sm' })`
);

// 4. buildSingleEnchantBubble
equipCode = equipCode.replace(
`                flexUtils.createBox('horizontal', [
                    flexUtils.createButton({ action: { type: 'postback', label: nextInfo.btnText, data: \`action=enchant_equip&type=\${type}&slot=\${slot}&times=1&reqId=\${reqId}\` }, style: 'primary', height: 'sm', color: nextInfo.btnColor, margin: 'xs', flex: 2 }),
                    flexUtils.createButton({ action: { type: 'postback', label: \`⚡連衝x3\`, data: \`action=enchant_equip&type=\${type}&slot=\${slot}&times=3&reqId=\${reqId}\` }, style: 'secondary', height: 'sm', margin: 'xs', flex: 3 }),
                    flexUtils.createButton({ action: { type: 'postback', label: \`👽作弊+1\`, data: \`action=enchant_equip&type=\${type}&slot=\${slot}&times=1&reqId=\${reqId}&cheat=true\` }, style: 'primary', height: 'sm', color: '#9C27B0', margin: 'xs', flex: 3 }),
                    flexUtils.createButton({ action: { type: 'postback', label: \`💥狂衝x8\`, data: \`action=enchant_equip&type=\${type}&slot=\${slot}&times=8&reqId=\${reqId}\` }, style: 'primary', color: '#E91E63', height: 'sm', margin: 'xs', flex: 3 })
                ], { margin: 'sm' })`,
`                flexUtils.createBox('horizontal', [
                    flexUtils.createButton({ action: { type: 'postback', label: nextInfo.btnText, data: \`action=enchant_equip&type=\${type}&slot=\${slot}&times=1&reqId=\${reqId}\` }, style: 'primary', height: 'sm', color: nextInfo.btnColor, margin: 'xs', flex: 2 }),
                    flexUtils.createButton({ action: { type: 'postback', label: \`⚡連衝x3\`, data: \`action=enchant_equip&type=\${type}&slot=\${slot}&times=3&reqId=\${reqId}\` }, style: 'secondary', height: 'sm', margin: 'xs', flex: 2 }),
                    flexUtils.createButton({ action: { type: 'postback', label: \`🔥連衝x5\`, data: \`action=enchant_equip&type=\${type}&slot=\${slot}&times=5&reqId=\${reqId}\` }, style: 'primary', color: '#FF9800', height: 'sm', margin: 'xs', flex: 2 })
                ], { margin: 'sm' }),
                flexUtils.createBox('horizontal', [
                    flexUtils.createButton({ action: { type: 'postback', label: \`💥狂衝x8\`, data: \`action=enchant_equip&type=\${type}&slot=\${slot}&times=8&reqId=\${reqId}\` }, style: 'primary', color: '#E91E63', height: 'sm', margin: 'xs', flex: 3 }),
                    flexUtils.createButton({ action: { type: 'postback', label: \`👽作弊+1\`, data: \`action=enchant_equip&type=\${type}&slot=\${slot}&times=1&reqId=\${reqId}&cheat=true\` }, style: 'primary', height: 'sm', color: '#9C27B0', margin: 'xs', flex: 3 })
                ], { margin: 'sm' })`
);

fs.writeFileSync(equipPath, equipCode, 'utf8');
console.log('UI Patched!');
