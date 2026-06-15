const fs = require('fs');

const logPath = 'C:\\Users\\USER\\.gemini\\antigravity\\brain\\dc7b9c0f-37b3-4522-a847-70cfd3536590\\.system_generated\\logs\\transcript.jsonl';
const lines = fs.readFileSync(logPath, 'utf8').split('\n');

for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes('equipment.js') && lines[i].includes('CodeContent')) {
        const obj = JSON.parse(lines[i]);
        if (obj.tool_calls) {
            for (const call of obj.tool_calls) {
                if (call.name === 'write_to_file' && call.args && call.args.TargetFile && 
                   (call.args.TargetFile.endsWith('handlers\\equipment.js') || call.args.TargetFile.endsWith('handlers/equipment.js'))) {
                    fs.writeFileSync('scratch/recovered_equipment_real.js', call.args.CodeContent);
                    console.log('Recovered from write_to_file at step ' + obj.step_index);
                    process.exit(0);
                }
            }
        }
    }
}
console.log('Not found via write_to_file, looking for other tools...');

for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes('equipment.js')) {
        const obj = JSON.parse(lines[i]);
        if (obj.type === 'VIEW_FILE') {
            console.log('Found VIEW_FILE at step ' + obj.step_index);
        }
    }
}
