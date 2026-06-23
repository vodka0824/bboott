const fs = require('fs');
const path = require('path');

const handlersDir = path.join(__dirname, 'handlers');
const files = fs.readdirSync(handlersDir).filter(f => f.startsWith('multi_') && f !== 'multi_tableManager.js');

let patchedCount = 0;

for (const file of files) {
    const filePath = path.join(handlersDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Check if already patched
    if (content.includes('persistenceService.recordBet')) {
        console.log(`Skipping ${file}, already patched.`);
        continue;
    }

    // Add require statement at the top if not present
    if (!content.includes('multiplayerPersistenceService')) {
        // Find the line with economyHandler or similar and inject
        content = content.replace(/(const economyHandler = require\('\.\/economy'\);)/, "$1\nconst persistenceService = require('../services/multiplayerPersistenceService');");
    }
    
    // We want to find:
    // const consumeResult = await economyHandler.consumeCoin(groupId, userId, betAmount, true);
    // if (!consumeResult.success) { ... }
    // AND insert after it.
    
    // The exact variable names differ: betAmount, betAmt, p.bet, potAmount
    // But they all use consumeResult.success check.
    
    // Regex strategy: Find consumeCoin... followed by if (!consumeResult.success) { ... }
    const regex = /(const (?:consumeResult|.*) = await economyHandler\.consumeCoin\(groupId, ([a-zA-Z0-9_.]+), ([a-zA-Z0-9_.]+), true\);\s*if \(![a-zA-Z0-9_.]+\.success\) \{[^}]+\}\s*(?:const userName = [^;]+;)?)/g;
    
    content = content.replace(regex, (match, p1, p2_userId, p3_betVar) => {
        // Need to extract the userName variable if it exists, otherwise pass '玩家'
        let nameVar = '玩家';
        if (match.includes('userName =')) {
            nameVar = 'userName';
        } else if (match.includes('consumeResult.name')) {
            nameVar = 'consumeResult.name';
        }
        
        const gameTypeMap = {
            'multi_blackjack.js': '21點',
            'multi_baccarat.js': '百家樂',
            'multi_goldenflower.js': '炸金花',
            'multi_niuniu.js': '牛牛',
            'multi_reddog.js': '射龍門',
            'multi_shibala.js': '十八仔',
            'multi_tenhalf.js': '十點半',
            'multi_tuitongzi.js': '推筒子'
        };
        const gameName = gameTypeMap[file] || '多人遊戲';
        
        return `${match}\n    persistenceService.recordBet(groupId, '${gameName}', ${p2_userId}, ${p3_betVar}, ${nameVar});`;
    });
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Patched ${file}`);
    patchedCount++;
}

console.log(`Done patching ${patchedCount} files.`);
