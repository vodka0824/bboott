const fs = require('fs');
const path = 'C:/Users/USER/.gemini/antigravity/scratch/lineBot/routes/casinoRoutes.js';
let content = fs.readFileSync(path, 'utf8');

// Replace multiplayer casino features
content = content.replace(/feature:\s*'casino'(.*?)isMultiplayer:\s*true/g, "feature: 'multiplayer'$1isMultiplayer: true");
content = content.replace(/isMultiplayer:\s*true(.*?)feature:\s*'casino'/g, "isMultiplayer: true$1feature: 'multiplayer'");

// Replace slot
content = content.replace(/feature:\s*'casino'(.*?)gameKey:\s*'slot'/g, "feature: 'slot'$1gameKey: 'slot'");

// Replace dice (single player)
content = content.replace(/feature:\s*'casino'(.*?)gameKey:\s*'dice'/g, "feature: 'dice'$1gameKey: 'dice'");

// Replace horse
content = content.replace(/feature:\s*'casino'(.*?)gameKey:\s*'horse'/g, "feature: 'horse'$1gameKey: 'horse'");

// Replace roulette (VIP wheel)
content = content.replace(/feature:\s*'casino'(.*?)gameKey:\s*'vipwheel'/g, "feature: 'roulette'$1gameKey: 'vipwheel'");

// Replace by keywords
const mappings = [
    { keywords: /尊爵獎池|輪盤下注|扣扳機|繼續扣扳機|拿錢走人|逃跑|走人|退出/, feature: 'roulette' },
    { keywords: /賽馬場|賽馬/, feature: 'horse' },
    { keywords: /21點|二十一點/, feature: 'multiplayer' } // specific for some missed multiplayers
];

for (const m of mappings) {
    content = content.replace(new RegExp("feature:\\s*'casino'(.*?)keywords:\\s*\\[([^\\]]+)\\]", 'g'), (match, p1, p2) => {
        if (m.keywords.test(p2)) {
            return "feature: '" + m.feature + "'" + p1 + "keywords: [" + p2 + "]";
        }
        return match;
    });
}

fs.writeFileSync(path, content, 'utf8');
console.log('Done updating casinoRoutes.js');
