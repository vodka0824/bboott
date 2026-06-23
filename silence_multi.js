const fs = require('fs');
const path = require('path');

const files = fs.readdirSync(path.join(__dirname, 'handlers'))
    .filter(f => f.startsWith('multi_') && f.endsWith('.js'));

const msgs = [
    '只有開局的賭場老闆可以決定收注開牌',
    '只有老闆可以收掉百家樂牌桌',
    '只有莊家可以解散牌桌',
    '只有莊家可以發牌',
    '您沒有參與這局遊戲',
    '只有莊家可以執行開牌',
    '只有莊家或管理員可以解散牌桌',
    '只有莊家可以擲骰開獎'
];

for (const file of files) {
    const filePath = path.join(__dirname, 'handlers', file);
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('replyText') && msgs.some(m => lines[i].includes(m))) {
            if (!lines[i].trim().startsWith('//')) {
                lines[i] = lines[i].replace(/await\s+(lineUtils\.)?replyText/, '// await $1replyText');
                changed = true;
            }
        }
    }

    if (changed) {
        fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
        console.log(`Silenced messages in ${file}`);
    }
}
