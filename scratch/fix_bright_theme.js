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

    // Fix incorrect background color replacements
    // The previous patch incorrectly replaced "#FFFFFF" with "flexUtils.COLORS.TEXT_MAIN" everywhere.
    // TEXT_MAIN is dark (#1C1C1E). So backgrounds became dark instead of bright.
    
    // 1. backgroundColor: flexUtils.COLORS.TEXT_MAIN -> backgroundColor: flexUtils.COLORS.BG_MAIN
    content = content.replace(/backgroundColor:\s*flexUtils\.COLORS\.TEXT_MAIN/g, 'backgroundColor: flexUtils.COLORS.BG_MAIN');
    
    // 2. createHeader(..., ..., flexUtils.COLORS.TEXT_MAIN -> createHeader(..., ..., flexUtils.COLORS.BG_MAIN
    content = content.replace(/createHeader\(([^,]+),\s*([^,]+),\s*flexUtils\.COLORS\.TEXT_MAIN/g, 'createHeader($1, $2, flexUtils.COLORS.BG_MAIN');

    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('Fixed', filePath);
    }
}

processDirectory(path.join(__dirname, '../handlers'));
processDirectory(path.join(__dirname, '../services'));

console.log('Fix completed.');
