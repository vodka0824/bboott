const fs = require('fs');
const path = require('path');

function processDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        if (!file.endsWith('.js')) continue;
        const filePath = path.join(dir, file);
        let content = fs.readFileSync(filePath, 'utf8');

        // Regex to find: await [lineUtils.]replyText([context.]replyToken, '❌ (這不是你的|只有|您沒有參與|這不是你)...')
        // And prepend with `if (!(typeof ctx !== 'undefined' ? ctx : typeof context !== 'undefined' ? context : {}).isButton) `
        // But only if it's not already prefixed with `if (!ctx.isButton)` or `if (!context.isButton)`
        
        let changed = false;
        
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('if (!') && lines[i].includes('isButton)')) {
                continue; // Already has check
            }
            if (lines[i].includes('replyText(') && lines[i].includes('❌')) {
                // Check if it's a permission/wrong user message
                const msgPatterns = [
                    '這不是你的', '只有', '您沒有參與', '這不是你'
                ];
                
                const hasPattern = msgPatterns.some(p => lines[i].includes(p));
                if (hasPattern) {
                    // Prepend the check
                    // We need to figure out if the variable is ctx or context
                    let ctxVar = 'context';
                    if (lines[i].includes('ctx.replyToken') || (content.includes('async function') && content.includes('(replyToken, ctx'))) {
                        ctxVar = 'ctx';
                    }
                    if (content.match(/function.*\(context\)/) || lines[i].includes('context.replyToken')) {
                        ctxVar = 'context';
                    }
                    
                    // Simple prepend
                    lines[i] = lines[i].replace(/await\s+(lineUtils\.)?replyText\(/, `if (!${ctxVar}.isButton) await $1replyText(`);
                    changed = true;
                }
            }
        }

        if (changed) {
            fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
            console.log(`Patched button errors in ${file}`);
        }
    }
}

processDir(path.join(__dirname, 'handlers'));
processDir(path.join(__dirname, 'routes'));

// Also make sure utils/router.js sets isButton = true for postbacks
const routerPath = path.join(__dirname, 'utils', 'router.js');
let routerContent = fs.readFileSync(routerPath, 'utf8');
if (!routerContent.includes('context.isButton = true;')) {
    routerContent = routerContent.replace(
        'async executePostback(data, context) {\n        if (!this.postbackRoutes) return false;\n',
        'async executePostback(data, context) {\n        if (!this.postbackRoutes) return false;\n        context.isButton = true;\n'
    );
    fs.writeFileSync(routerPath, routerContent, 'utf8');
    console.log('Patched router.js to set isButton=true');
}

