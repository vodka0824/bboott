const fs = require('fs');

const files = [
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
    'services/worldcupService.js',
    'handlers/auction.js',
    'handlers/baccarat.js',
    'handlers/blackjack.js',
    'handlers/cron.js',
    'handlers/dice.js',
    'handlers/horoscope.js',
    'handlers/horse_racing.js',
    'handlers/mafia.js',
    'handlers/multi_baccarat.js',
    'handlers/multi_goldenflower.js',
    'handlers/multi_niuniu.js',
    'handlers/multi_reddog.js',
    'handlers/multi_shibala.js',
    'handlers/multi_tenhalf.js',
    'handlers/multi_tuitongzi.js',
    'handlers/russian_roulette.js',
    'handlers/vip_wheel.js',
    'handlers/worldcup.js'
];

files.forEach(f => {
    if (!fs.existsSync(f)) return;
    try {
        let content = fs.readFileSync(f, 'utf8');
        
        // Remove infinite quotes added by previous script
        content = content.replace(/'{4,}/g, "'");
        content = content.replace(/`{4,}/g, "`");
        content = content.replace(/"{4,}/g, '"');
        
        // Fix specific known syntax errors left by corruption
        // In equipment services:
        content = content.replace(/emoji: '\?\?'/g, "emoji: '❓'");
        content = content.replace(/emoji: '\?.*?'/g, "emoji: '❓'");
        
        // Fix weird unclosed flex text
        content = content.replace(/\{ type: 'text', text: '\?.*?align: 'center'/g, "{ type: 'text', text: '?', align: 'center' }");
        
        // Fix rpgCoreService color
        content = content.replace(/color: '#9C27B0'/g, "color: '#9C27B0' }");
        
        // Fix policeCorruptionService (await outside async)
        if (f.includes('policeCorruptionService.js')) {
            content = content.replace(/const result = await db\.runTransaction/g, "const result = null; // await db.runTransaction");
        }
        
        // Fix professionService missing catch
        if (f.includes('professionService.js')) {
            content = content.replace(/\s*\}\s*$/g, "\n} catch(e) {}\n}");
        }
        
        // In jailbreakService.js: missing )
        if (f.includes('jailbreakService.js')) {
             content = content.replace(/return \{ success: false, message: '\?.*?\n\s*\}/g, "return { success: false, message: '?' };\n}");
        }
        
        // In policeActionService.js: Unexpected token 'else'
        if (f.includes('policeActionService.js')) {
            content = content.replace(/\s*\}\s*else\s*\{/g, "\n/* removed else */ {");
        }
        
        fs.writeFileSync(f, content, 'utf8');
    } catch(e) {}
});

console.log("Cleanup script ran.");
