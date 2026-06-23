const fs = require('fs');
const path = require('path');
const servicesDir = path.join(__dirname, '../services');
const files = fs.readdirSync(servicesDir);

for (const file of files) {
    if (!file.endsWith('.js')) continue;
    const filePath = path.join(servicesDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    let modified = false;
    
    // Replace require('./profession') with require('../handlers/profession')
    if (content.includes("require('./profession')")) {
        content = content.replace(/require\('\.\/profession'\)/g, "require('../handlers/profession')");
        modified = true;
    }
    
    // Replace require('./rpg') with require('../handlers/rpg')
    if (content.includes("require('./rpg')")) {
        content = content.replace(/require\('\.\/rpg'\)/g, "require('../handlers/rpg')");
        modified = true;
    }

    if (modified) {
        fs.writeFileSync(filePath, content);
        console.log('Fixed', file);
    }
}
