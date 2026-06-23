const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'services');
const filesToFix = {
    'welfareService.js': [
        { from: /require\('\.\/rpg'\)/g, to: "require('../handlers/rpg')" },
        { from: /require\('\.\/jail_redemption'\)/g, to: "require('../handlers/jail_redemption')" }
    ],
    'rpgLeaderboardService.js': [
        { from: /require\('\.\/equipment'\)/g, to: "require('../handlers/equipment')" },
        { from: /require\('\.\/jail'\)/g, to: "require('../handlers/jail')" }
    ],
    'rpgCombatStatService.js': [
        { from: /require\('\.\/equipment'\)/g, to: "require('../handlers/equipment')" }
    ],
    'politicalService.js': [
        { from: /require\('\.\/rpg'\)/g, to: "require('../handlers/rpg')" }
    ],
    'jailLifeService.js': [
        { from: /require\('\.\/rpg'\)/g, to: "require('../handlers/rpg')" }
    ],
    'jailbreakService.js': [
        { from: /require\('\.\/rpg'\)/g, to: "require('../handlers/rpg')" }
    ],
    'crimeService.js': [
        { from: /require\('\.\/jail'\)/g, to: "require('../handlers/jail')" }
    ],
    'bankingService.js': [
        { from: /require\('\.\/jail_redemption'\)/g, to: "require('../handlers/jail_redemption')" },
        { from: /require\('\.\/rpg'\)/g, to: "require('../handlers/rpg')" }
    ]
};

for (const [filename, rules] of Object.entries(filesToFix)) {
    const filePath = path.join(dir, filename);
    if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf8');
        let modified = false;
        for (const rule of rules) {
            if (rule.from.test(content)) {
                content = content.replace(rule.from, rule.to);
                modified = true;
            }
        }
        if (modified) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log('Fixed', filename);
        }
    }
}
console.log('Done');
