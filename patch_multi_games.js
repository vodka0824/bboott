const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'handlers');
const files = fs.readdirSync(dir).filter(f => f.startsWith('multi_') && f.endsWith('.js') && f !== 'multi_tableManager.js');

for (const file of files) {
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // 1. Upgrade Dealer UI Box
    // Find: contents.push(\n  flexUtils.createText({ text: `🏦 莊家...
    content = content.replace(
        /contents\.push\(\s*flexUtils\.createText\(\{ text: `🏦 莊家[^;]+;/g,
        match => {
            return `const dealerBox = [];\n    dealerBox.push(${match.substring(14).replace(/;\s*$/, '')});\n    contents.push(flexUtils.createBox('vertical', dealerBox, { backgroundColor: '#2D1B2E', cornerRadius: 'md', paddingAll: 'md', margin: 'md', borderColor: '#FFD700', borderWidth: '1px' }));`;
        }
    );

    // 2. Upgrade Player UI Box
    // Find: contents.push(flexUtils.createBox('horizontal', [\n flexUtils.createText({ text: `👤 ...
    // Up to: contents.push(flexUtils.createSeparator('sm'));
    // This is tricky with regex. Instead of a complex regex, I will do a string replacement for the player loop.
    // Let's replace the `contents.push(` with `pBox.push(` inside the player loop.
    
    let inPlayerLoop = false;
    let newLines = [];
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        if (line.includes('for (const p of table.players.values()) {') && !line.includes('economyHandler')) {
            inPlayerLoop = true;
            newLines.push(line);
            newLines.push('            const pBox = [];');
            continue;
        }
        
        if (inPlayerLoop) {
            if (line.includes('contents.push(flexUtils.createSeparator')) {
                // Instead of a separator, we push the pBox into contents
                newLines.push(`            contents.push(flexUtils.createBox('vertical', pBox, { backgroundColor: '#1A1A24', cornerRadius: 'md', paddingAll: 'md', margin: 'sm', borderColor: '#333344', borderWidth: '1px' }));`);
                continue;
            }
            if (line.includes('contents.push(')) {
                newLines.push(line.replace('contents.push(', 'pBox.push('));
                continue;
            }
            if (line.trim() === '}' && newLines[newLines.length-1].includes('contents.push(flexUtils.createBox(\'vertical\', pBox')) {
                inPlayerLoop = false;
                newLines.push(line);
                continue;
            }
        }
        
        newLines.push(line);
    }
    
    fs.writeFileSync(filePath, newLines.join('\n'), 'utf8');
    console.log(`Patched ${file}`);
}
