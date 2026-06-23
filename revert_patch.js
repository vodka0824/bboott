const fs = require('fs');
const path = require('path');

function processDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        if (!file.endsWith('.js')) continue;
        const filePath = path.join(dir, file);
        let content = fs.readFileSync(filePath, 'utf8');

        if (content.includes('if (!context.isButton) ') || content.includes('if (!ctx.isButton) ')) {
            content = content.replace(/if \(!context\.isButton\) /g, '');
            content = content.replace(/if \(!ctx\.isButton\) /g, '');
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`Reverted button patch in ${file}`);
        }
    }
}

processDir(path.join(__dirname, 'handlers'));
processDir(path.join(__dirname, 'routes'));
