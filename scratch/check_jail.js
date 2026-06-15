const fs = require('fs');
const path = require('path');

const handlersDir = path.join(__dirname, '../handlers');
const servicesDir = path.join(__dirname, '../services');

// We will read jail.js and jail_redemption.js, and output their exports, 
// then we can manually or programmatically build the split logic.

function checkExports(fileName) {
    const filePath = path.join(handlersDir, fileName);
    const code = fs.readFileSync(filePath, 'utf8');
    
    // Find module.exports
    const exportMatch = code.match(/module\.exports\s*=\s*\{([\s\S]*?)\};/);
    if (exportMatch) {
        console.log(`\n=== Exports of ${fileName} ===`);
        const exportsList = exportMatch[1].split(',').map(s => s.trim()).filter(Boolean);
        console.log(exportsList.join('\n'));
        return exportsList;
    } else {
        console.log(`No module.exports found in ${fileName}`);
        return [];
    }
}

const jailExports = checkExports('jail.js');
const redemptionExports = checkExports('jail_redemption.js');

// Dump the full code line count to know size
console.log(`\njail.js lines: ${fs.readFileSync(path.join(handlersDir, 'jail.js'), 'utf8').split('\n').length}`);
console.log(`jail_redemption.js lines: ${fs.readFileSync(path.join(handlersDir, 'jail_redemption.js'), 'utf8').split('\n').length}`);
