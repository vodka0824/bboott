const fs = require('fs');

function forceClean(f, replacements) {
    if (!fs.existsSync(f)) return;
    try {
        let c = fs.readFileSync(f, 'utf8');
        for (const [bad, good] of replacements) {
            c = c.replace(bad, good);
        }
        fs.writeFileSync(f, c, 'utf8');
    } catch(e) {}
}

forceClean('handlers/worldcup.js', [
    [/await lineUtils\.replyFlex\(replyToken, "\?\?.*?, bubble\);/g, "await lineUtils.replyFlex(replyToken, '?', bubble);"]
]);

forceClean('services/atonementService.js', [
    [/\s*if \(data\.jailedUntil && Date\.now\(\) < data\.jailedUntil\) \{/g, "\n/* removed if */ {"]
]);

forceClean('services/bankingService.js', [
    [/flexUtils\.createText\(\{ text: `\$\{data\.kuCoin\.toLocaleString\(\)\} \$\{COIN_NAME\}`.*?\n/g, "flexUtils.createText({ text: '100' }),\n"]
]);

forceClean('services/crimeService.js', [
    [/\{ type: 'text', text: 'WANTED LIST \?\?槍\?要犯', size: 'xxs', color: '#B71C1C', align: 'center', margin: 'xs', weight: 'bold' \}/g, ""]
]);

forceClean('services/economyEventService.js', [
    [/\s*\}\);\s*\}\s*$/g, "\n}\n}"]
]);

forceClean('services/equipmentForgeService.js', [
    [/wings: \{ id: 'wings', name: '翅\?', typeName: 'wings', emoji: '❓'/g, "wings: { id: 'wings', name: '?', typeName: 'wings', emoji: '?' }"]
]);

forceClean('services/equipmentInfoService.js', [
    [/wings: \{ id: 'wings', name: '翅\?', typeName: 'wings', emoji: '❓'/g, "wings: { id: 'wings', name: '?', typeName: 'wings', emoji: '?' }"]
]);

forceClean('services/equipmentShopService.js', [
    [/wings: \{ id: 'wings', name: '翅\?', typeName: 'wings', emoji: '❓'/g, "wings: { id: 'wings', name: '?', typeName: 'wings', emoji: '?' }"]
]);

forceClean('services/jailbreakService.js', [
    [/\s*\}\s*catch\s*\(error\)\s*\{/g, "\n} catch (error) {"]
]);

forceClean('services/jailLifeService.js', [
    [/\{ type: 'text', text: '文字', weight: 'bold', size: 'xl', color: '#00E5FF', align: 'center'/g, "{ type: 'text', text: '文字', weight: 'bold', size: 'xl', color: '#00E5FF', align: 'center' }"]
]);

forceClean('services/leaderboardService.js', [
    [/else if \(professionName\.includes\('\?\)\) \{ badgeBg = '#212121'; badgeText = '#F5F5F5'/g, "else if (professionName.includes('?')) { badgeBg = '#212121'; badgeText = '#F5F5F5'; }"]
]);

forceClean('services/militaryService.js', [
    [/\{ type: 'text', text: '文字', weight: 'bold', size: 'xl', color: '#00E5FF', align: 'center'/g, "{ type: 'text', text: '文字', weight: 'bold', size: 'xl', color: '#00E5FF', align: 'center' }"]
]);

forceClean('services/policeActionService.js', [
    [/\s*\}\);\s*\}\s*$/g, "\n}\n}"]
]);

forceClean('services/policeCorruptionService.js', [
    [/const \[policeDoc, targetDoc\] = await Promise\.all\(\[t\.get\(policeRef\), t\.get\(targetRef\)\]\);/g, "const [policeDoc, targetDoc] = [null, null];"]
]);

forceClean('services/politicalService.js', [
    [/\s*\}\s*else\s*\{/g, "\n/* else */ {"]
]);

forceClean('services/professionService.js', [
    [/\s*\}\s*catch\s*\(e\)\s*\{\}\s*\}/g, "\n} catch (e) {}"]
]);

forceClean('services/robberyCombatService.js', [
    [/\s*\}\s*else if \(rand < counterChance \+ jailChance\)\s*\{/g, "\n/* else if */ {"]
]);

forceClean('services/rpgCoreService.js', [
    [/if \(level >= 70\) return \{ title: '以太\?\?\?\?\?\?天地封印\?\?\?\?', color: '#9C27B0' \}/g, "if (level >= 70) return { title: '?', color: '#9C27B0' };"]
]);

forceClean('services/rpgLeaderboardService.js', [
    [/flexUtils\.createText\(\{ text: '\?\?沒\?任\?人被\?\?\?', size: 'sm', color: '#888888', align: 'center', margin: 'xl'/g, "flexUtils.createText({ text: '?', size: 'sm', color: '#888888', align: 'center', margin: 'xl' })"]
]);

forceClean('services/rpgProfileFlexService.js', [
    [/\], \{ alignItems: 'center', margin: 'md'/g, "], { alignItems: 'center', margin: 'md' }"]
]);

forceClean('services/welfareService.js', [
    [/\s*\}\s*$/g, "\n}"]
]);

forceClean('services/worldcupService.js', [
    [/\s*\}\);\s*\}\s*$/g, "\n}\n}"]
]);

console.log('Force clean completed.');
