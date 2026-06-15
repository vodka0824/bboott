const fs = require('fs');
const path = require('path');

const handlersDir = path.join(__dirname, '../handlers');
const files = [
    { file: 'multi_blackjack.js', gameType: 'blackjack' },
    { file: 'multi_baccarat.js', gameType: 'baccarat' },
    { file: 'multi_goldenflower.js', gameType: 'goldenflower' },
    { file: 'multi_niuniu.js', gameType: 'niuniu' },
    { file: 'multi_reddog.js', gameType: 'reddog' },
    { file: 'multi_shibala.js', gameType: 'shibala' },
    { file: 'multi_tenhalf.js', gameType: 'tenhalf' },
    { file: 'multi_tuitongzi.js', gameType: 'tuitongzi' }
];

let count = 0;

files.forEach(({ file, gameType }) => {
    const filePath = path.join(handlersDir, file);
    if (!fs.existsSync(filePath)) return;
    
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Check if it's already using engine
    if (content.includes("require('../services/multiGameEngine')")) {
        return;
    }
    
    // Insert engine import
    content = content.replace(/(const .*? = require\(.*?\);\n)/, `$1const engine = require('../services/multiGameEngine');\n`);
    
    // Remove the old Map declaration
    content = content.replace(/const activeTables\s*=\s*new Map\(\);\n?/g, '');
    
    // Replace activeTables methods with engine methods
    content = content.replace(/activeTables\.get\((.*?)\)/g, `engine.getActiveTable('${gameType}', $1)`);
    content = content.replace(/activeTables\.set\((.*?), (.*?)\)/g, `engine.createTable('${gameType}', $1, $2)`);
    content = content.replace(/activeTables\.delete\((.*?)\)/g, `engine.deleteTable('${gameType}', $1)`);
    content = content.replace(/activeTables\.has\((.*?)\)/g, `(engine.getActiveTable('${gameType}', $1) !== undefined)`);
    
    fs.writeFileSync(filePath, content, 'utf8');
    count++;
});

console.log(`Integrated MultiGameEngine into ${count} games.`);
