const fs = require('fs');
const path = require('path');

const dirs = [
    path.join(__dirname, '../handlers'),
    path.join(__dirname, '../services')
];

// 色碼對應表
const backgroundReplacements = {
    '#1A1A2E': 'flexUtils.COLORS.BG_CARD',
    '#1A1A1D': 'flexUtils.COLORS.BG_CARD',
    '#0D0D0D': 'flexUtils.COLORS.BG_CARD',
    '#000000': 'flexUtils.COLORS.BG_CARD',
    '#2C2C35': 'flexUtils.COLORS.BG_CARD',
    '#16213E': 'flexUtils.COLORS.BG_CARD',
    '#3E001F': 'flexUtils.COLORS.BG_CARD',
    '#2D0016': 'flexUtils.COLORS.BG_CARD',
    '#0F3429': 'flexUtils.COLORS.BG_CARD',
    '#092019': 'flexUtils.COLORS.BG_CARD',
    '#1E1E24': 'flexUtils.COLORS.BG_CARD',
    '#2B0000': 'flexUtils.COLORS.BG_CARD',
    '#1A0000': 'flexUtils.COLORS.BG_CARD',
    '#111111': 'flexUtils.COLORS.BG_CARD',
    '#1A0B2E': 'flexUtils.COLORS.BG_CARD',
    '#1a237e': 'flexUtils.COLORS.BG_CARD'
};

const textReplacements = {
    '#E0F7FA': 'flexUtils.COLORS.TEXT_SUB',
    '#F5F5F5': 'flexUtils.COLORS.TEXT_SUB',
    '#B0BEC5': 'flexUtils.COLORS.TEXT_SUB',
    '#757575': 'flexUtils.COLORS.TEXT_SUB',
    '#FFFFFF': 'flexUtils.COLORS.TEXT_MAIN',
    '#EEEEEE': 'flexUtils.COLORS.TEXT_MAIN',
    '#E0E0E0': 'flexUtils.COLORS.TEXT_MAIN',
    '#CCCCCC': 'flexUtils.COLORS.TEXT_SUB',
    '#FFFF00': 'flexUtils.COLORS.WARNING',
    '#00BCD4': 'flexUtils.COLORS.PRIMARY',
    '#00FFFF': 'flexUtils.COLORS.PRIMARY'
};

function processDirectory(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            processDirectory(fullPath);
        } else if (fullPath.endsWith('.js')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let originalContent = content;

            // 取代背景色
            for (const [hex, replacement] of Object.entries(backgroundReplacements)) {
                // background: '#HEX' 或 backgroundColor: '#HEX' 或 endColor: '#HEX'
                const bgRegex = new RegExp(`(['"])${hex}\\1`, 'gi');
                content = content.replace(bgRegex, (match) => {
                    // 如果這個 HEX 是出現在 backgroundColor 等等欄位...我們用全域替換比較快，因為這都是很特殊的暗色
                    return replacement;
                });
            }

            // 取代過亮文字色
            for (const [hex, replacement] of Object.entries(textReplacements)) {
                const textRegex = new RegExp(`(['"])${hex}\\1`, 'gi');
                content = content.replace(textRegex, (match) => {
                    return replacement;
                });
            }

            if (content !== originalContent) {
                fs.writeFileSync(fullPath, content, 'utf8');
                console.log(`Patched colors in ${file}`);
            }
        }
    }
}

for (const dir of dirs) {
    processDirectory(dir);
}
console.log('Flex Colors Patch Done!');
