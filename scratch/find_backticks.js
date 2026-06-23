const fs = require('fs');
const content = fs.readFileSync('services/jailbreakService.js', 'utf8');
const lines = content.split('\n');
let count = 0;
for (let i = 0; i < 360; i++) {
    const match = lines[i].match(/`/g);
    const ticks = match ? match.length : 0;
    if (ticks > 0) {
        count += ticks;
        console.log('Line ' + (i+1) + ': ' + ticks + ' ticks -> ' + count + ' ' + (count%2!==0?'(OPEN)':'(CLOSED)') + ' ' + lines[i].trim());
    }
}
