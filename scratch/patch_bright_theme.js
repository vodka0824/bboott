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

    // 1. Backgrounds -> BG_CARD or BG_MAIN (only if it's currently hardcoded dark)
    // To be safe, we only replace exactly "#121212" and "#1A1A1A" if they are in flex-related properties.
    // Actually, any "#121212" in the code is likely a background.
    content = content.replace(/['"]#121212['"]/g, 'flexUtils.COLORS.BG_MAIN');
    content = content.replace(/['"]#1A1A1A['"]/g, 'flexUtils.COLORS.BG_CARD');

    // 2. Text colors
    content = content.replace(/['"]#FFFFFF['"]/gi, 'flexUtils.COLORS.TEXT_MAIN');
    content = content.replace(/['"]#E0E0E0['"]/gi, 'flexUtils.COLORS.TEXT_MAIN');
    content = content.replace(/['"]#AAAAAA['"]/gi, 'flexUtils.COLORS.TEXT_SUB');
    content = content.replace(/['"]#888888['"]/gi, 'flexUtils.COLORS.TEXT_MUTED');
    content = content.replace(/['"]#666666['"]/gi, 'flexUtils.COLORS.TEXT_MUTED');
    
    // Other specific bright elements that used to contrast with dark mode but now need to be darker or use semantic colors
    content = content.replace(/['"]#FFD700['"]/gi, 'flexUtils.COLORS.PRIMARY'); // Gold
    content = content.replace(/['"]#FF9800['"]/gi, 'flexUtils.COLORS.SECONDARY'); // Orange

    // Wait, if I replace all #FFFFFF with TEXT_MAIN, what if it's the background of something?
    // In our dark theme, #FFFFFF was ONLY used for text because backgrounds were #121212/#1A1A1A.
    // So #FFFFFF is safe to replace with TEXT_MAIN.
    
    // Check if we need to require flexUtils if we replaced things and it's missing
    if (content !== original && content.includes('flexUtils.COLORS') && !content.includes('flexUtils = require')) {
        content = `const flexUtils = require('../utils/flex');\n` + content;
        // Fix relative path if it's in services vs handlers
        if (filePath.includes('services')) {
             // already '../utils/flex'
        }
    }

    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('Patched', filePath);
    }
}

processDirectory(path.join(__dirname, '../handlers'));
processDirectory(path.join(__dirname, '../services'));
