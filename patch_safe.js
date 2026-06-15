const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'handlers');
const files = fs.readdirSync(dir).filter(f => f.startsWith('multi_') && f.endsWith('.js') && f !== 'multi_tableManager.js');

for (const file of files) {
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // ONLY patch inside sendTableFlex
    const sendTableIdx = content.indexOf('function sendTableFlex');
    if (sendTableIdx === -1) continue;

    let preContent = content.substring(0, sendTableIdx);
    let postContent = content.substring(sendTableIdx);

    // 1. Dealer Box
    // from: contents.push(\n flexUtils.createText({ text: `🏦 莊家...
    // to: const dealerBox = []; ... contents.push(flexUtils.createBox('vertical', dealerBox ...
    postContent = postContent.replace(
        /(contents\.push\(\s*flexUtils\.createText\(\{\s*text:\s*`(?:🏦 莊家|莊家)[^;]+;)/,
        (match) => {
            if (match.includes('dealerBox')) return match;
            return match.replace('contents.push(', 'const dealerBox = [];\ndealerBox.push(') + `\ncontents.push(flexUtils.createBox('vertical', dealerBox, { backgroundColor: '#2D1B2E', cornerRadius: 'md', paddingAll: 'md', margin: 'md', borderColor: '#FFD700', borderWidth: '1px' }));\n`;
        }
    );
    // Wait, the above regex only captures ONE push, but there's a second `if (table.status === 'closed') { contents.push... }` for dealer. So that doesn't wrap everything.
    // It's safer to just wrap the Player Box.
    
    // 2. Player Box
    // Look for: for (const p of table.players.values()) {
    // and replace contents.push inside it.
    let lines = postContent.split('\n');
    let inPlayerLoop = false;
    let braceCount = 0;
    
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('for (const p of table.players.values()) {')) {
            inPlayerLoop = true;
            braceCount = 0;
        }
        
        if (inPlayerLoop) {
            if (lines[i].includes('{')) braceCount += (lines[i].match(/\{/g) || []).length;
            if (lines[i].includes('}')) braceCount -= (lines[i].match(/\}/g) || []).length;
            
            // replace contents.push with pBox.push
            if (lines[i].includes('contents.push(')) {
                if (lines[i].includes('flexUtils.createSeparator(')) {
                    lines[i] = `            contents.push(flexUtils.createBox('vertical', pBox, { backgroundColor: '#1A1A24', cornerRadius: 'md', paddingAll: 'md', margin: 'sm', borderColor: p.color || '#333344', borderWidth: '1px' }));`;
                } else {
                    lines[i] = lines[i].replace('contents.push(', 'pBox.push(');
                }
            }
            
            if (braceCount === 0) {
                inPlayerLoop = false;
            }
        }
    }
    
    // Inject `const pBox = [];` right after `for (const p of table.players.values()) {`
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('for (const p of table.players.values()) {')) {
            lines.splice(i + 1, 0, '            const pBox = [];');
            i++;
        }
    }

    fs.writeFileSync(filePath, preContent + lines.join('\n'), 'utf8');
    console.log(`Patched ${file}`);
}
