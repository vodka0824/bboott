const fs = require('fs');
const content = fs.readFileSync('services/jailbreakService.js', 'utf8');
const lines = content.split('\n');
let count = 0;
for (let i = 0; i < 360; i++) {
    count += (lines[i].match(/`/g) || []).length;
}
console.log('Backticks: ' + count);
