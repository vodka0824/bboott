const fs = require('fs');
const files = ['jailInfoService.js', 'jailBailService.js', 'jailbreakService.js', 'jailLifeService.js'];
files.forEach(f => {
    let content = fs.readFileSync('services/' + f, 'utf8');
    content = content.replace(/require\('\.\.\/utils\/flexUtils'\)/g, "require('../utils/flex')");
    fs.writeFileSync('services/' + f, content, 'utf8');
});
console.log('Fixed imports');
