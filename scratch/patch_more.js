const fs = require('fs');
const path = require('path');

function patchFile(relativePath, qrLabel1, qrText1, qrLabel2, qrText2, qrLabel3, qrText3) {
    const filePath = path.join(__dirname, relativePath);
    let content = fs.readFileSync(filePath, 'utf8');

    // Remove old patches if any (to be safe)
    content = content.replace(/const quickReply = \{[\s\S]*?\};\s*await lineUtils\.replyFlex\(replyToken, ([^,]+), bubble, \[\], quickReply\);/g, "await lineUtils.replyFlex(replyToken, $1, bubble);");

    const qrCode = `
        const quickReply = {
            items: [
                { type: 'action', action: { type: 'message', label: '${qrLabel1}', text: '${qrText1}' } },
                { type: 'action', action: { type: 'message', label: '${qrLabel2}', text: '${qrText2}' } },
                { type: 'action', action: { type: 'message', label: '${qrLabel3}', text: '${qrText3}' } }
            ]
        };
        await lineUtils.replyFlex(replyToken, $1, bubble, [], quickReply);`;

    content = content.replace(/await lineUtils\.replyFlex\(replyToken, ([^,]+), bubble\);/g, qrCode);

    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Patched', relativePath);
}

patchFile('../services/welfareService.js', '🏥 去醫院', '醫療', '📊 我的狀態', '我的狀態', '💰 領紅包', '每日簽到');
patchFile('../services/jailLifeService.js', '⛓️ 勞改', '勞改', '🤝 保釋', '保釋金', '🚪 越獄', '越獄');
patchFile('../handlers/jail.js', '⛓️ 勞改', '勞改', '🤝 保釋', '保釋金', '🚪 越獄', '越獄');
patchFile('../handlers/equipment.js', '⚔️ 更換武器', '裝備 武器', '🛡️ 更換防具', '裝備 防具', '🔨 強化', '強化');
patchFile('../handlers/enchant.js', '🔨 強化裝備', '強化', '🛡️ 我的裝備', '裝備', '📊 我的狀態', '我的狀態');

