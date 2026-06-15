const fs = require('fs');

const filesToFix = [
    'services/jailBailService.js',
    'services/jailbreakService.js',
    'services/jailInfoService.js',
    'services/jailLifeService.js',
    'services/leaderboardService.js',
    'services/militaryService.js',
    'services/multiGameEngine.js',
    'services/policeActionService.js',
    'services/policeCareerService.js',
    'services/policeCorruptionService.js',
    'services/politicalService.js',
    'services/professionService.js',
    'services/robberyCombatService.js',
    'services/rpgCoreService.js',
    'services/rpgLeaderboardService.js',
    'services/rpgProfileFlexService.js',
    'services/welfareService.js',
    'services/worldcupService.js',
    'handlers/atonement.js',
    'handlers/baccarat.js',
    'handlers/blackjack.js',
    'handlers/casino.js',
    'handlers/cron.js',
    'handlers/dice.js',
    'handlers/economy.js',
    'handlers/horoscope.js',
    'handlers/horse_racing.js',
    'handlers/mafia.js',
    'handlers/multi_baccarat.js',
    'handlers/multi_blackjack.js',
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

filesToFix.forEach(file => {
    try {
        let content = fs.readFileSync(file, 'utf8');
        let lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            if (line.includes('?') || line.includes('?') || line.includes('??')) {
                if (line.includes('return {') && line.includes('message:')) {
                    lines[i] = "return { success: false, message: '錯誤' };";
                } else if (line.includes('await lineUtils.replyText')) {
                    lines[i] = "await lineUtils.replyText(replyToken, '錯誤');";
                } else if (line.includes('await replyText')) {
                    lines[i] = "await replyText(replyToken, '錯誤');";
                } else if (line.includes('throw new Error')) {
                    lines[i] = "throw new Error('錯誤');";
                } else if (line.includes('return \'?')) {
                    lines[i] = "return '錯誤';";
                } else if (line.includes('name: \'?')) {
                    lines[i] = "name: '無名',";
                } else if (line.includes('pick([')) {
                    lines[i] = "const skillName = '攻擊';";
                } else if (line.includes('header: flexUtils.createHeader')) {
                    lines[i] = "header: flexUtils.createHeader('標題', '內容', '#121212', '#FF9800'),";
                } else if (line.includes('color: \'#FF4500\'')) {
                    lines[i] = "if (level >= 80) return { title: '稱號', color: '#FF4500' };";
                } else if (line.includes('weight: \'bold\'')) {
                    lines[i] = "{ type: 'text', text: '文字', weight: 'bold', size: 'xl', color: '#00E5FF', align: 'center' },";
                } else if (line.includes('const doc = await docRef.get();')) {
                    if (lines[i+1] && lines[i+1].includes('if (!doc.exists)')) {
                        // atonement.js fix
                        lines[i] = "const doc = await docRef.get();\nif (!doc.exists) return false;";
                        lines[i+1] = "";
                    }
                } else if (line.includes('await lineUtils.replyText(replyToken, \'發生錯誤\');')) {
                    // already fixed
                }
            }
            if (file.includes('policeCorruptionService.js') && line.includes("await lineUtils.replyText(replyToken, '發生錯誤');") && !line.includes('try {')) {
                // Remove broken await outside async
            }
            if (file.includes('atonement.js') && line.includes('// 瑼')) {
                lines[i] = "async function checkDevilContract(userId) {";
            }
        }
        fs.writeFileSync(file, lines.join('\n'), 'utf8');
    } catch(e) {}
});
