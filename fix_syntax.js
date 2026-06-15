const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'handlers');
const files = fs.readdirSync(dir).filter(f => f.startsWith('multi_') && f.endsWith('.js') && f !== 'multi_tableManager.js');

for (const file of files) {
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // Fix `));` to `);` right above `contents.push(flexUtils.createBox('vertical', dealerBox`
    content = content.replace(/\)\);\ncontents\.push\(flexUtils\.createBox\('vertical', dealerBox/g, ");\ncontents.push(flexUtils.createBox('vertical', dealerBox");

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Fixed syntax in ${file}`);
}
