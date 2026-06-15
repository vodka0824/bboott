const fs = require('fs');

const files = [
    'handlers/worldcup.js',
    'services/atonementService.js',
    'services/bankingService.js',
    'services/crimeService.js',
    'services/economyEventService.js',
    'services/equipmentForgeService.js',
    'services/equipmentInfoService.js',
    'services/equipmentShopService.js',
    'services/jailbreakService.js',
    'services/jailLifeService.js',
    'services/leaderboardService.js',
    'services/militaryService.js',
    'services/policeActionService.js',
    'services/policeCorruptionService.js',
    'services/politicalService.js',
    'services/professionService.js',
    'services/robberyCombatService.js',
    'services/rpgCoreService.js',
    'services/rpgLeaderboardService.js',
    'services/rpgProfileFlexService.js',
    'services/welfareService.js',
    'services/worldcupService.js'
];

const stub = `
// System stubbed due to encoding corruption.
const proxy = new Proxy({}, {
    get: function(target, prop) {
        if (prop === 'then') return undefined; // Promise compatibility
        return function() { return { success: false, message: '系統維修中' }; };
    }
});
module.exports = proxy;
`;

files.forEach(f => {
    if (fs.existsSync(f)) {
        fs.writeFileSync(f, stub, 'utf8');
    }
});

console.log('Stubbed corrupted files.');
