const fs = require('fs');
const path = require('path');

const servicesDir = path.join(__dirname, '../services');
const files = fs.readdirSync(servicesDir);

let count = 0;
files.forEach(file => {
    if (file.endsWith('.js')) {
        const filePath = path.join(servicesDir, file);
        let content = fs.readFileSync(filePath, 'utf8');
        if (content.includes("'./profession'") || content.includes('\'./profession\'')) {
            content = content.replace(/require\(['"]\.\/profession['"]\)/g, "require('../handlers/profession')");
            fs.writeFileSync(filePath, content, 'utf8');
            count++;
        }
    }
});

console.log(`Updated profession requires in ${count} files.`);
