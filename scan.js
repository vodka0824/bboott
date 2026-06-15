const fs = require('fs');
const path = require('path');
const handlersDir = 'C:/Users/USER/.gemini/antigravity/scratch/lineBot/handlers';

const files = fs.readdirSync(handlersDir).filter(f => f.startsWith('multi_') || f === 'auction.js' || f === 'lottery.js');

files.forEach(f => {
    const lines = fs.readFileSync(path.join(handlersDir, f), 'utf8').split('\n');
    lines.forEach((line, i) => {
        if ((line.includes('replyText') || line.includes('pushMessage') || line.includes('text:')) && (line.includes('請') || line.includes('下注') || line.includes('換') || line.includes('操作') || line.includes('開桌') || line.includes('發牌'))) {
            console.log(`${f}:${i+1}  ${line.trim()}`);
        }
    });
});
