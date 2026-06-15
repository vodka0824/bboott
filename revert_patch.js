const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'handlers');
const files = fs.readdirSync(dir).filter(f => f.startsWith('multi_') && f.endsWith('.js') && f !== 'multi_tableManager.js');

for (const file of files) {
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // 1. Revert Dealer UI Box
    content = content.replace(
        /const dealerBox = \[\];\n    dealerBox\.push\((.*)\);\n    contents\.push\(flexUtils\.createBox\('vertical', dealerBox, \{ backgroundColor: '#2D1B2E', cornerRadius: 'md', paddingAll: 'md', margin: 'md', borderColor: '#FFD700', borderWidth: '1px' \}\)\);/g,
        (match, p1) => {
            return `contents.push(\n  ${p1}\n);`; // Roughly restore
        }
    );

    // 2. Revert Player UI Box
    let newLines = [];
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        if (line.includes('const pBox = [];')) {
            continue;
        }
        if (line.includes(`contents.push(flexUtils.createBox('vertical', pBox, { backgroundColor: '#1A1A24'`)) {
            newLines.push(`            contents.push(flexUtils.createSeparator('sm'));`);
            continue;
        }
        if (line.includes('pBox.push(')) {
            newLines.push(line.replace('pBox.push(', 'contents.push('));
            continue;
        }
        newLines.push(line);
    }
    
    fs.writeFileSync(filePath, newLines.join('\n'), 'utf8');
    console.log(`Reverted ${file}`);
}
