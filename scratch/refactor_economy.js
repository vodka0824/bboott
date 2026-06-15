const fs = require('fs');
const path = require('path');

const economyFile = path.join(__dirname, '../handlers/economy.js');
let code = fs.readFileSync(economyFile, 'utf8');

if (!code.includes("require('../utils/formatUtils')")) {
    // Inject require at the top
    const requireLine = "const { formatCoins, cleanName, getProfessionName, getProfessionSuffix } = require('../utils/formatUtils');\n";
    const dbRequireIndex = code.indexOf("const { db, admin } = require('../utils/db');");
    code = code.slice(0, dbRequireIndex) + requireLine + code.slice(dbRequireIndex);
}

// In showLeaderboard, remove the local definitions
const definitionsToRemove = [
    /const getProfessionName = \(user, title\) => \{[\s\S]*?\};\s*/,
    /const cleanName = \(name\) => \{[\s\S]*?\};\s*/,
    /const getProfessionSuffix = \(user\) => \{[\s\S]*?\};\s*/,
    /const formatCoins = \(coins\) => \{[\s\S]*?\};\s*/
];

let replaced = false;
definitionsToRemove.forEach(regex => {
    if (regex.test(code)) {
        code = code.replace(regex, '');
        replaced = true;
    }
});

if (replaced) {
    fs.writeFileSync(economyFile, code, 'utf8');
    console.log("Refactored economy.js successfully.");
} else {
    console.log("No definitions found to replace, or already refactored.");
}
