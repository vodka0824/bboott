const fs = require('fs');
const path = require('path');

const equipPath = path.join(__dirname, '../handlers/equipment.js');
let lines = fs.readFileSync(equipPath, 'utf8').split('\n');

const newLines = `                        flexUtils.createBox('horizontal', [
                            flexUtils.createButton({ action: { type: 'postback', label: nextInfo.btnText, data: \`action=enchant_equip&type=\${type}&slot=\${slot}&times=1&reqId=\${newReqId}\` }, style: 'primary', height: 'sm', color: nextInfo.btnColor, margin: 'xs', flex: 2 }),
                            flexUtils.createButton({ action: { type: 'postback', label: \`⚡連衝x3\`, data: \`action=enchant_equip&type=\${type}&slot=\${slot}&times=3&reqId=\${newReqId}\` }, style: 'secondary', height: 'sm', margin: 'xs', flex: 2 }),
                            flexUtils.createButton({ action: { type: 'postback', label: \`🔥連衝x5\`, data: \`action=enchant_equip&type=\${type}&slot=\${slot}&times=5&reqId=\${newReqId}\` }, style: 'primary', color: '#FF9800', height: 'sm', margin: 'xs', flex: 2 })
                        ], { margin: 'sm' }),
                        flexUtils.createBox('horizontal', [
                            flexUtils.createButton({ action: { type: 'postback', label: \`💥狂衝x8\`, data: \`action=enchant_equip&type=\${type}&slot=\${slot}&times=8&reqId=\${newReqId}\` }, style: 'primary', color: '#E91E63', height: 'sm', margin: 'xs', flex: 3 }),
                            ...(userId === 'Ub9d430ac171216287573a0b9541494dd' ? [flexUtils.createButton({ action: { type: 'postback', label: \`👽作弊+1\`, data: \`action=enchant_equip&type=\${type}&slot=\${slot}&times=1&reqId=\${newReqId}&cheat=true\` }, style: 'primary', height: 'sm', color: '#9C27B0', margin: 'xs', flex: 3 })] : [])
                        ], { margin: 'sm' })`.split('\n');

// Verify we are at the right place
// Line 967 in file is lines[966]
if (lines[966].includes("flexUtils.createBox('horizontal', [") && lines[971].includes("flexUtils.createButton({ action: { type: 'postback', label: `💥狂衝x8`")) {
    lines.splice(966, 6, ...newLines);
    // Remember some elements in newLines might not end with \r on Windows, but .join('\n') will mostly keep it okay or we map it
    fs.writeFileSync(equipPath, lines.join('\n'), 'utf8');
    console.log("Lines 967-972 replaced successfully.");
} else {
    console.log("Line 967-972 did not match expected content.");
    console.log(lines[966]);
    console.log(lines[971]);
}
