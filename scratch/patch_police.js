const fs = require('fs');
const path = require('path');

function patchPolice() {
    const filePath = path.join(__dirname, '../handlers/police.js');
    let content = fs.readFileSync(filePath, 'utf8');

    // Remove old patches if any (to be safe)
    content = content.replace(/const quickReply = \{[\s\S]*?\};\s*await lineUtils\.replyFlex\(replyToken, ([^,]+), bubble, \[\], quickReply\);/g, "await lineUtils.replyFlex(replyToken, $1, bubble);");

    const qrCode = `
        const quickReply = {
            items: [
                { type: 'action', action: { type: 'message', label: '🚓 繼續臨檢', text: '臨檢' } },
                { type: 'action', action: { type: 'message', label: '📜 通緝榜', text: '通緝' } },
                { type: 'action', action: { type: 'message', label: '📊 我的狀態', text: '我的狀態' } }
            ]
        };
        await lineUtils.replyFlex(replyToken, $1, bubble, [], quickReply);`;

    content = content.replace(/await lineUtils\.replyFlex\(replyToken, ([^,]+), bubble\);/g, qrCode);

    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Patched police.js');
}

function patchMafia() {
    const filePath = path.join(__dirname, '../handlers/mafia.js');
    let content = fs.readFileSync(filePath, 'utf8');

    content = content.replace(/const quickReply = \{[\s\S]*?\};\s*await lineUtils\.replyFlex\(replyToken, ([^,]+), bubble, \[\], quickReply\);/g, "await lineUtils.replyFlex(replyToken, $1, bubble);");

    const qrCode = `
        const quickReply = {
            items: [
                { type: 'action', action: { type: 'message', label: '💰 繼續收費', text: '收保護費' } },
                { type: 'action', action: { type: 'message', label: '🏛️ 黑幫總部', text: '黑幫總部' } },
                { type: 'action', action: { type: 'message', label: '📊 我的狀態', text: '我的狀態' } }
            ]
        };
        await lineUtils.replyFlex(replyToken, $1, bubble, [], quickReply);`;

    content = content.replace(/await lineUtils\.replyFlex\(replyToken, ([^,]+), bubble\);/g, qrCode);

    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Patched mafia.js');
}

patchPolice();
patchMafia();
