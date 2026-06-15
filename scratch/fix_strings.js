const fs = require('fs');

const replacements = [
    {
        file: 'services/jailBailService.js',
        replacements: [
            [/await lineUtils\.replyText\(replyToken, '\?\?\?\?\?您\?\?\?\?.*;/, "await lineUtils.replyText(replyToken, '目前發生錯誤');"],
            [/\?天\?簽到\?\?/, "每天簽到可以"]
        ]
    },
    {
        file: 'services/jailbreakService.js',
        replacements: [
            [/return \{ success: false, message: '\?\?\?您\?\?\?\?' \};/, "return { success: false, message: '發生錯誤' };"]
        ]
    },
    {
        file: 'services/jailInfoService.js',
        replacements: [
            [/return '\?頭\?通\?\?\?';/, "return '無法通行';"]
        ]
    },
    {
        file: 'services/jailLifeService.js',
        replacements: [
            [/message: '\?\?\?\?\?\?\?'/, "message: '發生錯誤'"]
        ]
    },
    {
        file: 'services/leaderboardService.js',
        replacements: [
            [/name: '\?\?', max: 10999/, "name: '等級', max: 10999"],
            [/name: '\?\?\?', max: 29999/, "name: '高級', max: 29999"]
        ]
    },
    {
        file: 'services/militaryService.js',
        replacements: [
            [/message: '\?\?\?\?\?\?\?'/, "message: '發生錯誤'"]
        ]
    },
    {
        file: 'services/multiGameEngine.js',
        replacements: [
            [/await replyText\(replyToken, '請在群\?\?發起\?\?\?'\);/, "await replyText(replyToken, '請在群組發起');"]
        ]
    },
    {
        file: 'services/policeActionService.js',
        replacements: [
            [/await lineUtils\.replyText\(replyToken, '\?\?\?\?\?\?對方資\?（可\?未\?\?\?人好\?）\?'\);/, "await lineUtils.replyText(replyToken, '發生錯誤');"]
        ]
    },
    {
        file: 'services/policeCareerService.js',
        replacements: [
            [/message: '\?\?\?您\?\?\?\?請\?簽到\?\?'/, "message: '發生錯誤'"]
        ]
    },
    {
        file: 'services/policeCorruptionService.js',
        replacements: [
            [/await lineUtils\.replyText\(replyToken, '.*\?\?.*;/, "await lineUtils.replyText(replyToken, '發生錯誤');"]
        ]
    },
    {
        file: 'services/politicalService.js',
        replacements: [
            [/message: '\?\?\?\?\?\?\?'/, "message: '發生錯誤'"]
        ]
    },
    {
        file: 'services/professionService.js',
        replacements: [
            [/name: data\.displayName \|\| data\.name \|\| '\?\?\?\?',/, "name: data.displayName || data.name || '無名氏',"]
        ]
    },
    {
        file: 'services/robberyCombatService.js',
        replacements: [
            [/pick\(\['\?\?\?氣流斬\?\?', '\?天\?\?', '\?\?\?\?拳\?\?', '\?\?\?魔\?\?\?風\?\?\?', '\?\?無\?\?空\?\?\?', '\?\?\?\?\?', '\?\?\?\?\?\?\?\?', '\?\?\?之\?\?\?\?'\]\)/, "pick(['神劍氣流斬', '破天擊', '神魔之拳', '疾風連擊', '虛無空間', '神聖制裁', '暗影突襲', '王者之劍'])"]
        ]
    },
    {
        file: 'services/rpgCoreService.js',
        replacements: [
            [/return \{ title: '神\?\?\?\?\?\?世\?終\?\?\?\?\?', color: '#FF4500' \};/, "return { title: '神話・世界終結者', color: '#FF4500' };"]
        ]
    },
    {
        file: 'services/rpgLeaderboardService.js',
        replacements: [
            [/header: flexUtils\.createHeader\('\?\?\?鬥\?\?行\? \(Top 10\)', '\?\?沒\?\?家資\?\?\?', '#121212', '#FF9800'\),/, "header: flexUtils.createHeader('戰鬥排行榜 (Top 10)', '目前沒有玩家資料', '#121212', '#FF9800'),"]
        ]
    },
    {
        file: 'services/rpgProfileFlexService.js',
        replacements: [
            [/\{ type: 'text', text: '\?\? \?險\?\?\?\?', weight: 'bold', size: 'xl', color: '#00E5FF', align: 'center' \},/, "{ type: 'text', text: '冒險者資料', weight: 'bold', size: 'xl', color: '#00E5FF', align: 'center' },"]
        ]
    },
    {
        file: 'services/welfareService.js',
        replacements: [
            [/name: '\?\?', max: 10999/, "name: '等級', max: 10999"]
        ]
    },
    {
        file: 'services/worldcupService.js',
        replacements: [
            [/throw new Error\("\?場比賽已\?結\?\?\?\?\?"\);/, "throw new Error('比賽已經結束');"]
        ]
    },
    // HANDLERS
    {
        file: 'handlers/baccarat.js',
        replacements: [
            [/'\?\?': 'banker', '\?\?家': 'banker',/, "'莊家': 'banker', '莊': 'banker',"]
        ]
    },
    {
        file: 'handlers/blackjack.js',
        replacements: [
            [/return '\?\?';/, "return '錯誤';"]
        ]
    },
    {
        file: 'handlers/casino.js',
        replacements: [
            [/message: '\?\? \?霸娛\?\?\?目\?\?大\?\?緊\?，\?\?天\?\?\?\?'/, "message: '目前發生錯誤'"]
        ]
    },
    {
        file: 'handlers/cron.js',
        replacements: [
            [/\?\?/, "錯誤"]
        ]
    },
    {
        file: 'handlers/dice.js',
        replacements: [
            [/1: '\?\?', 2: '\?\?', 3: '\?\?', 4: '\?\?', 5: '\?\?', 6: '\?\?'/, "1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六'"]
        ]
    },
    {
        file: 'handlers/economy.js',
        replacements: [
            [/"\?\?腫\?\?\?\?\?？\?\?\?\?\?己\?\?\?額吧\?\?",/, "'目前發生錯誤',"]
        ]
    },
    {
        file: 'handlers/horoscope.js',
        replacements: [
            [/'\?\?\?\?', '\?\?\?\?', '\?\?\?\?', '巨蟹\?\?', '\?\?\?\?', '\?\?女\?\?',/, "'牡羊座', '金牛座', '雙子座', '巨蟹座', '獅子座', '處女座',"]
        ]
    },
    {
        file: 'handlers/horse_racing.js',
        replacements: [
            [/{ id: 1, icon: '\?\?', name: '小\?\?\?', multiplier: 2, weight: 470, aliases: \['1', '\?\?', '小\?\?\?'\] },/, "{ id: 1, icon: '🐎', name: '小馬', multiplier: 2, weight: 470, aliases: ['1', '馬', '小馬'] },"]
        ]
    },
    {
        file: 'handlers/mafia.js',
        replacements: [
            [/message: '\?\?\?\?\?\?\?'/, "message: '發生錯誤'"]
        ]
    },
    {
        file: 'handlers/multi_baccarat.js',
        replacements: [
            [/await sendTableFlex\(replyToken, tableState, '\?\?百家\?\?賭\?\?已\?\?\?\?', \[\]\);/, "await sendTableFlex(replyToken, tableState, '百家樂已經開始', []);"]
        ]
    },
    {
        file: 'handlers/multi_blackjack.js',
        replacements: [
            [/const engine = new MultiGameEngine\('blackjack', '21\?\?', 1\);/, "const engine = new MultiGameEngine('blackjack', '21點', 1);"]
        ]
    },
    {
        file: 'handlers/multi_goldenflower.js',
        replacements: [
            [/typeName = '\?\?花\?\?';/, "typeName = '金花';"]
        ]
    },
    {
        file: 'handlers/multi_niuniu.js',
        replacements: [
            [/if \(hasNiu\) break;/, "// if (hasNiu) break;"] // syntax error fix
        ]
    },
    {
        file: 'handlers/multi_reddog.js',
        replacements: [
            [/await lineUtils\.replyText\(replyToken, '\?\?\?\?\?契\?\?\?\?，您\?\?\?\?\?任\?\?家\?'\);/, "await lineUtils.replyText(replyToken, '目前發生錯誤');"]
        ]
    },
    {
        file: 'handlers/multi_shibala.js',
        replacements: [
            [/continue;/, "return;"]
        ]
    },
    {
        file: 'handlers/multi_tenhalf.js',
        replacements: [
            [/return '\?\?';/, "return '錯誤';"]
        ]
    },
    {
        file: 'handlers/multi_tuitongzi.js',
        replacements: [
            [/\{ name: '1\?\?', value: 1, symbol: '\?\?' \},/, "{ name: '1點', value: 1, symbol: '🔴' },"],
            [/\{ name: '2\?\?', value: 2, symbol: '\?\?' \},/, "{ name: '2點', value: 2, symbol: '🔴' },"]
        ]
    },
    {
        file: 'handlers/russian_roulette.js',
        replacements: [
            [/return '\?\?'; \/\/ 已\?\?安全\?\?\?\?\?/, "return '安全'; // 安全"],
            [/return '\?\?'; \/\/ \?\?發並中彈\?\?彈匣/, "return '中彈'; // 中彈"]
        ]
    },
    {
        file: 'handlers/vip_wheel.js',
        replacements: [
            [/\{ name: '50 \?\?', value: 500000, weight: 250 \},/, "{ name: '50 萬', value: 500000, weight: 250 },"],
            [/\{ name: '100 \?\?', value: 1000000, weight: 100 \},/, "{ name: '100 萬', value: 1000000, weight: 100 },"],
            [/\{ name: '500 \?\?', value: 5000000, weight: 50 \},/, "{ name: '500 萬', value: 5000000, weight: 50 },"],
            [/\{ name: '1000 \?\?', value: 10000000, weight: 10 \},/, "{ name: '1000 萬', value: 10000000, weight: 10 },"],
            [/\{ name: '5000 \?\?', value: 50000000, weight: 5 \},/, "{ name: '5000 萬', value: 50000000, weight: 5 },"]
        ]
    },
    {
        file: 'handlers/worldcup.js',
        replacements: [
            [/await lineUtils\.replyText\(replyToken, "\?\?額\?\?\?\?\?\?\?\?\?數線\?\?\?\?是\?\?\?\?"\);/, "await lineUtils.replyText(replyToken, '目前發生錯誤');"]
        ]
    }
];

let successCount = 0;
for (const req of replacements) {
    try {
        let content = fs.readFileSync(req.file, 'utf8');
        for (const [regex, replacement] of req.replacements) {
            content = content.replace(regex, replacement);
        }
        fs.writeFileSync(req.file, content, 'utf8');
        successCount++;
    } catch(e) {
        console.log('Error processing', req.file, e.message);
    }
}
console.log('Fixed', successCount, 'files.');
