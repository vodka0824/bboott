const fs = require('fs');
let content = fs.readFileSync('services/jailbreakService.js', 'utf8');
content = content.replace(/\\\\`/g, '`');
content = content.replace(/\\\\\$/g, '$');
fs.writeFileSync('services/jailbreakService.js', content);
console.log('Fixed properly!');
