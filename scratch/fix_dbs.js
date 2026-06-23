const fs = require('fs');
const path = require('path');
const servicesDir = path.join(__dirname, '../services');
const files = fs.readdirSync(servicesDir);

for (const file of files) {
    if (!file.endsWith('.js')) continue;
    const filePath = path.join(servicesDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    const target1 = "const { getDb } = require('../utils/db');\nconst db = getDb();";
    const target2 = "const { getDb } = require('../../utils/db');\nconst db = getDb();";
    const target3 = "const { getDb } = require('../utils/db');\r\nconst db = getDb();";
    const target4 = "const { getDb } = require('../../utils/db');\r\nconst db = getDb();";
    
    const replacement1 = "const { db } = require('../utils/db');";
    const replacement2 = "const { db } = require('../../utils/db');";
    
    let modified = false;
    if (content.includes(target1)) {
        content = content.replace(target1, replacement1);
        modified = true;
    }
    if (content.includes(target2)) {
        content = content.replace(target2, replacement2);
        modified = true;
    }
    if (content.includes(target3)) {
        content = content.replace(target3, replacement1);
        modified = true;
    }
    if (content.includes(target4)) {
        content = content.replace(target4, replacement2);
        modified = true;
    }

    if (modified) {
        fs.writeFileSync(filePath, content);
        console.log('Fixed', file);
    }
}
