const fs = require('fs');
const path = require('path');

const handlersDir = path.join(__dirname, 'handlers');
const files = fs.readdirSync(handlersDir).filter(f => f.startsWith('multi_') && f !== 'multi_tableManager.js');

let patchedCount = 0;

for (const file of files) {
    const filePath = path.join(handlersDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    if (content.includes('getQuickReply')) {
        console.log(`Skipping ${file}, already patched.`);
        continue;
    }

    const gameTypeMap = {
        'multi_blackjack.js': '21點',
        'multi_baccarat.js': '百家樂',
        'multi_goldenflower.js': '炸金花',
        'multi_niuniu.js': '牛牛',
        'multi_reddog.js': '射龍門',
        'multi_shibala.js': '十八仔',
        'multi_tenhalf.js': '十點半',
        'multi_tuitongzi.js': '推筒子'
    };
    const gameName = gameTypeMap[file] || '多人遊戲';

    // Regex to find:
    // const messages = [{ type: 'flex', altText: altText, contents: bubble }, ...extraMessages];
    // if (messages.length <= 5) {
    
    // We will replace it with the quickreply logic.
    // Note: Some files have "altText: altText", some might have just "altText".
    const regex = /(const messages = \[.*?\.\.\.extraMessages\];\s*)(if \(messages\.length <= 5\) \{)/g;

    content = content.replace(regex, (match, p1, p2) => {
        return `${p1}
    const quickReply = require('../utils/multi_quickReply').getQuickReply(table, '${gameName}');
    if (quickReply) {
        messages[messages.length - 1].quickReply = quickReply;
    }

    ${p2}`;
    });
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Patched ${file}`);
    patchedCount++;
}

console.log(`Done patching ${patchedCount} files.`);
