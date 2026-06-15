const fs = require('fs');

const lines = fs.readFileSync('handlers/routes.js', 'utf8').split('\n');

const head = lines.slice(0, 572); // Up to line 571 (index 571 is included)
const tail = lines.slice(769); // From line 770 onwards

fs.writeFileSync('handlers/routes.js', head.join('\n') + '\n\n' + tail.join('\n'), 'utf8');
console.log('Fixed routes.js syntax successfully.');
