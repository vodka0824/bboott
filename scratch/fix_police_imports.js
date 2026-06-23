const fs = require('fs');
const files = ['policeCareerService.js', 'policeActionService.js', 'policeCorruptionService.js'];
files.forEach(f => {
    let content = fs.readFileSync('services/' + f, 'utf8');
    content = content.replace(/require\('\.\/economy'\)/g, "require('../handlers/economy')");
    content = content.replace(/require\('\.\/profession'\)/g, "require('../handlers/profession')");
    content = content.replace(/require\('\.\/rpg'\)/g, "require('../handlers/rpg')");
    fs.writeFileSync('services/' + f, content, 'utf8');
});
console.log('Fixed handler imports!');
