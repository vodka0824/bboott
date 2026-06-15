const { db } = require('../utils/db');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');

const DEFAULT_STATS = { level: 1, exp: 0, hp: 100, attack: 10, defense: 5 };

async function handleRpgRank(context) {
    const { replyToken } = context;

    try {
        const { getFinalEquipStat } = require('./equipment');
        
        // 取得通緝值與前科資料 (這裡有名字)
        const economySnapshot = await db.collection('economy_users').get();
        const wantedList = [];
        const crimeList = [];
        const nameMap = new Map();
        
        economySnapshot.forEach(doc => {
            const data = doc.data();
            const displayName = data.displayName || data.name || '未知玩家';
            nameMap.set(doc.id, displayName);
            
            if (data.wantedLevel && data.wantedLevel > 0) {
                wantedList.push({ name: displayName, wantedLevel: data.wantedLevel });
            }
            if (data.crimeRecord && data.crimeRecord > 0) {
                crimeList.push({ name: displayName, crimeRecord: data.crimeRecord });
            }
        });
        
        wantedList.sort((a, b) => b.wantedLevel - a.wantedLevel);
        crimeList.sort((a, b) => b.crimeRecord - a.crimeRecord);
        const topWanted = wantedList.slice(0, 10);
        const topCrime = crimeList.slice(0, 10);

        // 取得所有玩家資料 (計算戰鬥力)
        const playersSnapshot = await db.collection('players').get();
        const combatPowers = [];
        
        playersSnapshot.forEach(doc => {
            const data = doc.data();
            const displayName = nameMap.get(doc.id) || '隱士高手';
            
            const level = data.level || 1;
            const levelBonus = level + Math.floor((level * level) / 30);
            
            const rpgStats = data.rpg || { atk: 0, def: 0, eva: 0, crit: 0, luk: 0, pen: 0 };
            
            let atk = (rpgStats.atk || 0) + levelBonus;
            let def = (rpgStats.def || 0) + levelBonus;
            let eva = rpgStats.eva || 0;
            let crit = rpgStats.crit || 0;
            let luk = rpgStats.luk || 0;
            let pen = rpgStats.pen || 0;
            
            const equipments = data.equipments || {};
            const applyEquip = (part) => {
                if (!equipments[part]) return;
                const stats = getFinalEquipStat(part, equipments[part].grade, equipments[part].level);
                if (stats) {
                    if (stats.main) {
                        if (stats.main.type === 'atk') atk += stats.main.value;
                        else if (stats.main.type === 'def') def += stats.main.value;
                        else if (stats.main.type === 'eva') eva += stats.main.value;
                        else if (stats.main.type === 'crit') crit += stats.main.value;
                        else if (stats.main.type === 'luk') luk += stats.main.value;
                        else if (stats.main.type === 'pen') pen += stats.main.value;
                    }
                    if (stats.sub) {
                        if (stats.sub.type === 'atk') atk += stats.sub.value;
                        else if (stats.sub.type === 'def') def += stats.sub.value;
                        else if (stats.sub.type === 'eva') eva += stats.sub.value;
                        else if (stats.sub.type === 'crit') crit += stats.sub.value;
                        else if (stats.sub.type === 'luk') luk += stats.sub.value;
                        else if (stats.sub.type === 'pen') pen += stats.sub.value;
                    }
                }
            };
            
            ['weapon', 'shield', 'wings', 'gloves', 'necklace', 'ring'].forEach(applyEquip);
            
            if (crit > 80) crit = 80;
            if (eva > 80) eva = 80;
            if (luk > 80) luk = 80;
            if (pen > 80) pen = 80;
            
            const cp = Math.floor(atk * 2.5 + def * 2 + Math.pow(eva, 2) * 0.8 + Math.pow(crit, 2) * 0.8 + Math.pow(luk, 2) * 0.6 + Math.pow(pen, 2) * 0.8);
            
            combatPowers.push({
                userId: doc.id,
                name: displayName,
                level,
                cp
            });
        });
        
        combatPowers.sort((a, b) => b.cp - a.cp);
        const topCp = combatPowers.slice(0, 10);
        
        // 建立 Flex Message Bubbles
        const bubbles = [];
        
        // 1. 戰鬥力排行榜 Bubble
        const buildCpBubble = () => {
            if (topCp.length === 0) {
                return flexUtils.createBubble({
                    size: 'mega',
                    header: flexUtils.createHeader('⚡ 戰鬥力排行榜 (Top 10)', '目前沒有玩家資料。', '#121212', '#FF9800'),
                    body: flexUtils.createBox('vertical', [
                        flexUtils.createText({ text: '尚未有玩家覺醒力量！', size: 'sm', color: '#888888', align: 'center', margin: 'xl' })
                    ], { paddingAll: 'xl' })
                });
            }
            
            const contents = [];
            topCp.forEach((player, idx) => {
                let emoji = '🏅';
                let color = '#333333';
                if (idx === 0) { emoji = '🥇'; color = '#FFD700'; }
                else if (idx === 1) { emoji = '🥈'; color = '#C0C0C0'; }
                else if (idx === 2) { emoji = '🥉'; color = '#CD7F32'; }
                
                const { title, color: titleColor } = getPlayerTitle(player.level);
                
                contents.push(
                    flexUtils.createBox('horizontal', [
                        flexUtils.createText({ text: `${emoji} ${idx + 1}`, size: 'sm', weight: 'bold', color: color, flex: 2 }),
                        flexUtils.createBox('vertical', [
                            flexUtils.createText({ text: `${player.name}`, size: 'sm', weight: 'bold', color: '#333333', wrap: true }),
                            flexUtils.createText({ text: `Lv.${player.level} | ${title}`, size: 'xs', color: titleColor, wrap: true })
                        ], { flex: 6 }),
                        flexUtils.createText({ text: `${player.cp.toLocaleString()}⚡`, size: 'sm', weight: 'bold', color: '#FF9800', flex: 3, align: 'end' })
                    ], { margin: 'md', alignItems: 'center' })
                );
                if (idx < topCp.length - 1) contents.push(flexUtils.createSeparator('sm'));
            });
            
            return flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('⚡ 戰鬥力排行榜 (Top 10)', '綜合屬性評分', '#121212', '#FF9800'),
                body: flexUtils.createBox('vertical', contents, { paddingAll: 'lg', backgroundColor: '#FFFDF9' })
            });
        };
        bubbles.push(buildCpBubble());
        
        // 2. 通緝值排行榜 Bubble
        const buildWantedBubble = () => {
            if (topWanted.length === 0) {
                return flexUtils.createBubble({
                    size: 'mega',
                    header: flexUtils.createHeader('🚨 通緝排行榜 (Top 10)', '目前天下太平。', '#121212', '#D32F2F'),
                    body: flexUtils.createBox('vertical', [
                        flexUtils.createText({ text: '目前沒有任何人被通緝！', size: 'sm', color: '#888888', align: 'center', margin: 'xl' })
                    ], { paddingAll: 'xl' })
                });
            }
            
            const contents = [];
            topWanted.forEach((player, idx) => {
                let emoji = '🏅';
                let color = '#333333';
                if (idx === 0) { emoji = '🥇'; color = '#FFD700'; }
                else if (idx === 1) { emoji = '🥈'; color = '#C0C0C0'; }
                else if (idx === 2) { emoji = '🥉'; color = '#CD7F32'; }
                
                const percent = (player.wantedLevel * 100).toFixed(1);
                contents.push(
                    flexUtils.createBox('horizontal', [
                        flexUtils.createText({ text: `${emoji} ${idx + 1}`, size: 'sm', weight: 'bold', color: color, flex: 2 }),
                        flexUtils.createText({ text: `${player.name}`, size: 'sm', weight: 'bold', color: '#333333', flex: 5, wrap: true }),
                        flexUtils.createText({ text: `${percent}%`, size: 'sm', weight: 'bold', color: '#D32F2F', flex: 3, align: 'end' })
                    ], { margin: 'md', alignItems: 'center' })
                );
                if (idx < topWanted.length - 1) contents.push(flexUtils.createSeparator('sm'));
            });
            
            return flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('🚨 通緝排行榜 (Top 10)', '頭號罪犯名單', '#121212', '#D32F2F'),
                body: flexUtils.createBox('vertical', contents, { paddingAll: 'lg', backgroundColor: '#FFF5F5' })
            });
        };
        bubbles.push(buildWantedBubble());
        
        // 3. 前科排行榜 Bubble
        const buildCrimeBubble = () => {
            if (topCrime.length === 0) {
                return flexUtils.createBubble({
                    size: 'mega',
                    header: flexUtils.createHeader('🏆 前科排行榜 (Top 10)', '目前無人入獄。', '#121212', '#424242'),
                    body: flexUtils.createBox('vertical', [
                        flexUtils.createText({ text: '目前大家都是乖寶寶！', size: 'sm', color: '#888888', align: 'center', margin: 'xl' })
                    ], { paddingAll: 'xl' })
                });
            }
            
            const contents = [];
            topCrime.forEach((player, idx) => {
                let emoji = '🏅';
                let color = '#333333';
                if (idx === 0) { emoji = '🥇'; color = '#FFD700'; }
                else if (idx === 1) { emoji = '🥈'; color = '#C0C0C0'; }
                else if (idx === 2) { emoji = '🥉'; color = '#CD7F32'; }
                
                const { getCriminalTitle } = require('./jail');
                const title = getCriminalTitle ? getCriminalTitle(player.crimeRecord) : '';
                
                contents.push(
                    flexUtils.createBox('horizontal', [
                        flexUtils.createText({ text: `${emoji} ${idx + 1}`, size: 'sm', weight: 'bold', color: color, flex: 2 }),
                        flexUtils.createBox('vertical', [
                            flexUtils.createText({ text: `${title}${player.name}`, size: 'sm', weight: 'bold', color: '#333333', wrap: true })
                        ], { flex: 5 }),
                        flexUtils.createText({ text: `${player.crimeRecord} 次`, size: 'sm', weight: 'bold', color: '#424242', flex: 3, align: 'end' })
                    ], { margin: 'md', alignItems: 'center' })
                );
                if (idx < topCrime.length - 1) contents.push(flexUtils.createSeparator('sm'));
            });
            
            return flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('🏆 前科排行榜 (Top 10)', '監獄常客榜單', '#FFFFFF', '#424242'),
                body: flexUtils.createBox('vertical', contents, { paddingAll: 'lg', backgroundColor: '#FAFAFA' })
            });
        };
        bubbles.push(buildCrimeBubble());
        
        const carousel = flexUtils.createCarousel(bubbles);
        const altText = '📊 RPG 排行榜 (戰鬥力 / 通緝 / 前科)';
        await lineUtils.replyFlex(replyToken, altText, carousel);
    } catch (e) {
        console.error('[RPG] handleRpgRank Error:', e);
        await lineUtils.replyText(replyToken, '❌ 查詢 RPG 排行榜發生錯誤。');
    }
}

module.exports = {
    handleRpgRank
};
