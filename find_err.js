const fs = require('fs');
const path = require('path');

const dir = 'C:\\Users\\USER\\.gemini\\antigravity\\scratch\\lineBot\\handlers';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));

let total = 0;
for (const file of files) {
    const filePath = path.join(dir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    
    const regex = /catch\s*\(\s*([a-zA-Z0-9_]+)\s*\)\s*\{([^}]*?replyText\([^}]*?\)[^}]*?)\}/g;
    
    let match;
    while ((match = regex.exec(content)) !== null) {
        const errVar = match[1];
        const block = match[2];
        if (block.includes('replyText') && (block.includes('錯誤') || block.includes('失敗'))) {
            console.log(`Found in ${file}`);
            total++;
        }
    }
}
console.log(`Total blocks found: ${total}`);
