const fs = require('fs');

const logPath = 'C:\\Users\\USER\\.gemini\\antigravity\\brain\\dc7b9c0f-37b3-4522-a847-70cfd3536590\\.system_generated\\logs\\transcript.jsonl';
const lines = fs.readFileSync(logPath, 'utf8').split('\n');

for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes('police.js')) {
        const obj = JSON.parse(lines[i]);
        if (obj.type === 'VIEW_FILE' && obj.content && (obj.content.includes('handlers/police.js') || obj.content.includes('handlers\\\\police.js'))) {
            const content = obj.content;
            const contentLines = content.split('\n');
            let codeLines = [];
            let inCode = false;
            for (const line of contentLines) {
                if (line.match(/^\d+:/)) {
                    inCode = true;
                    codeLines.push(line.replace(/^\d+:\s?/, ''));
                } else if (inCode) {
                    if (line.includes('The above content shows')) {
                        break;
                    }
                }
            }
            if (codeLines.length > 0 && codeLines[0].includes('require')) {
                fs.writeFileSync(`scratch/recovered_police_${obj.step_index}.js`, codeLines.join('\n'));
                console.log(`Saved scratch/recovered_police_${obj.step_index}.js`);
                process.exit(0);
            }
        }
    }
}
