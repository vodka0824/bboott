const fs = require('fs');
const path = require('path');

function processDirectory(directory) {
    const files = fs.readdirSync(directory);
    for (const file of files) {
        const fullPath = path.join(directory, file);
        if (fs.statSync(fullPath).isDirectory()) {
            processDirectory(fullPath);
        } else if (fullPath.endsWith('.js')) {
            patchFile(fullPath);
        }
    }
}

function patchFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    content = content.replace(/['"]#CCCCCC['"]/gi, 'flexUtils.COLORS.TEXT_MUTED');
    content = content.replace(/['"]#DDDDDD['"]/gi, 'flexUtils.COLORS.TEXT_SUB');
    content = content.replace(/['"]#EEEEEE['"]/gi, 'flexUtils.COLORS.TEXT_SUB');
    
    if (content !== original) {
        if (!content.includes("const flexUtils = require('../utils/flex')")) {
           // Assume flexUtils is imported if they used flexUtils.COLORS
        }
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('Patched', filePath);
    }
}

processDirectory(path.join(__dirname, '../handlers'));
processDirectory(path.join(__dirname, '../services'));
