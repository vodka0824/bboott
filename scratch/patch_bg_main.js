const fs = require('fs');
const path = require('path');

const dirs = [
    path.join(__dirname, '../handlers'),
    path.join(__dirname, '../services')
];

function processDirectory(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            processDirectory(fullPath);
        } else if (fullPath.endsWith('.js')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let modified = false;

            // 我們要尋找 `body: flexUtils.createBox(` 並且在最後一個參數沒有 backgroundColor 的時候補上
            // 由於用正則表達式很難處理括號配對，我們用簡單的替換：
            // 找 `], { paddingAll:` 換成 `], { backgroundColor: flexUtils.COLORS.BG_MAIN, paddingAll:`
            // 但這可能會替換到不是 body 的 box。

            // 更好的做法是用正則表達式尋找 body 的定義
            // `body:\s*flexUtils\.createBox\(\s*['"]vertical['"]\s*,\s*(\[[\s\S]*?\])\s*\)`
            // 以及 `body:\s*flexUtils\.createBox\(\s*['"]vertical['"]\s*,\s*([a-zA-Z0-9_]+)\s*\)`
            
            // let's do a simple replace for common patterns
            const regex = /body:\s*flexUtils\.createBox\(\s*['"]vertical['"]\s*,\s*([a-zA-Z0-9_]+|\[(?:[^\[\]]|\[(?:[^\[\]]|\[[^\[\]]*\])*\])*\])\s*\)/g;
            content = content.replace(regex, (match, p1) => {
                modified = true;
                return `body: flexUtils.createBox('vertical', ${p1}, { backgroundColor: flexUtils.COLORS.BG_MAIN, paddingAll: 'xl' })`;
            });

            // 如果有已經有 options 但是沒有 backgroundColor 的：
            const regex2 = /body:\s*flexUtils\.createBox\(\s*['"]vertical['"]\s*,\s*([a-zA-Z0-9_]+|\[(?:[^\[\]]|\[(?:[^\[\]]|\[[^\[\]]*\])*\])*\])\s*,\s*\{\s*([^\}]+)\s*\}\s*\)/g;
            content = content.replace(regex2, (match, p1, p2) => {
                if (!p2.includes('backgroundColor') && !p2.includes('BG_MAIN')) {
                    modified = true;
                    return `body: flexUtils.createBox('vertical', ${p1}, { backgroundColor: flexUtils.COLORS.BG_MAIN, ${p2} })`;
                }
                return match;
            });

            if (modified) {
                fs.writeFileSync(fullPath, content, 'utf8');
                console.log(`Patched ${file}`);
            }
        }
    }
}

for (const dir of dirs) {
    if (fs.existsSync(dir)) {
        processDirectory(dir);
    }
}
console.log('Done!');
