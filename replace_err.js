const fs = require('fs');
const path = require('path');

const dir = 'C:\\Users\\USER\\.gemini\\antigravity\\scratch\\lineBot\\handlers';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));

let total = 0;
for (const file of files) {
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    // Pattern to find: catch (var) { ... await lineUtils.replyText(replyToken, '❌ ...'); ... }
    // Since regex replacement over multiple lines is tricky, we can replace lines matching `replyText(replyToken, '❌` or `replyText(replyToken, "❌` or `replyText(replyToken, \`❌` inside the handlers if they contain `錯誤` or `失敗`.
    // Actually, a simpler regex:
    // /catch\s*\(\s*([a-zA-Z0-9_]+)\s*\)\s*\{([\s\S]*?)replyText\([^,]+,\s*['"`]❌.*?(錯誤|失敗).*?['"`]\)([\s\S]*?)\}/g
    // But it's safer to just iterate line by line or do a targeted replace.
    
    const lines = content.split('\n');
    let inCatch = false;
    let catchVar = 'e';
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const catchMatch = line.match(/catch\s*\(\s*([a-zA-Z0-9_]+)\s*\)/);
        if (catchMatch) {
            inCatch = true;
            catchVar = catchMatch[1];
        }
        
        if (inCatch && line.includes('replyText') && line.includes('❌') && (line.includes('錯誤') || line.includes('失敗') || line.includes('發生未知錯誤'))) {
            // Check if it's replyToken or context.replyToken or ctx.replyToken
            const replyTokenMatch = line.match(/replyText\(([^,]+),/);
            if (replyTokenMatch) {
                const rt = replyTokenMatch[1];
                // Replace the line
                const indentMatch = line.match(/^(\s*)/);
                const indent = indentMatch ? indentMatch[1] : '';
                lines[i] = `${indent}await lineUtils.replyText(${rt}, \`❌ 系統發生程式錯誤，請截圖通知 @管理員 ！\\n詳細資訊：\${${catchVar}.message || ${catchVar}}\`);`;
                modified = true;
                total++;
                inCatch = false; // assumes one replyText per catch
            }
        }
        
        // Reset inCatch if we see the end of the block (naive, but works for our simple catch blocks)
        if (inCatch && line.trim() === '}') {
            inCatch = false;
        }
    }

    if (modified) {
        fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
        console.log(`Updated ${file}`);
    }
}
console.log(`Total replaced: ${total}`);
