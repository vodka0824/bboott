/**
 * RPG 玩家屬性系統模組
 */
const { db } = require('../utils/db');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');

const DEFAULT_STATS = {
    atk: 0,
    def: 0,
    eva: 0,
    crit: 0, // 爆擊率 (%)
    luk: 0,  // 幸運 (%)
    pen: 0   // 穿透率 (%)
};

/**
 * 依據等級返回中二稱號與顏色
 * @param {number} level
 * @returns {{ title: string, color: string }}
 */
function getPlayerTitle(level) {
    if (level >= 80) return { title: '神域の領主 ‧ 世界終結者 ✨', color: '#FF4500' };
    if (level >= 70) return { title: '以太の法則 ‧ 天地封印者 ⚡', color: '#9C27B0' };
    if (level >= 60) return { title: '深淵廣宇 ‧ 混沌統御者 🌌', color: '#673AB7' };
    if (level >= 50) return { title: '起源の力 ‧ 死神杀戮者 🔥', color: '#F44336' };
    if (level >= 40) return { title: '破滅之刃 ‧ 命運選擇者 ☄️', color: '#FF5722' };
    if (level >= 30) return { title: '絕境覺醒 ‧ 黑暗預言者 ⚠️', color: flexUtils.COLORS.SECONDARY };
    if (level >= 20) return { title: '天煌の黎明 ‧ 黑狼之牙 ⚔️', color: '#607D8B' };
    if (level >= 10) return { title: '陰影の囚人 ‧ 被流放的靈魂 🌑', color: '#455A64' };
    return { title: '平民 ‧ 尚未覺醒的存在 🌟', color: flexUtils.COLORS.TEXT_MUTED };
}

/**
 * 取得或初始化玩家 RPG 屬性 (全域共用)
 * @param {string} userId 
 * @returns {Promise<Object>} 玩家 RPG 數值物件
 */
async function getOrInitPlayerStats(userId) {
    const userRef = db.collection('players').doc(userId);
    const doc = await userRef.get();

    let rpgStats = {};
    let needsUpdate = false;

    if (!doc.exists) {
        rpgStats = { ...DEFAULT_STATS };
        needsUpdate = true;
    } else {
        const data = doc.data();
        if (data.rpg) {
            rpgStats = { ...DEFAULT_STATS, ...data.rpg };
        } else {
            rpgStats = { ...DEFAULT_STATS };
            needsUpdate = true;
        }
    }

    if (needsUpdate) {
        await userRef.set({
            rpg: rpgStats,
            chatExp: (doc.exists ? (doc.data().chatExp || 0) : 0),
            level: (doc.exists ? (doc.data().level || 1) : 1),
            lastActive: Date.now()
        }, { merge: true });
    }

    return { 
        ...rpgStats, 
        chatExp: doc.exists && doc.data().chatExp !== undefined ? doc.data().chatExp : 0, 
        level: doc.exists && doc.data().level !== undefined ? doc.data().level : 1 
    };
}

/**
 * 增加聊天經驗值並處理升級
 * @param {string} userId 
 * @param {number} amount 
 * @returns {Promise<{ leveledUp: boolean, oldLevel: number, newLevel: number }>}
 */
async function addExp(userId, amount) {
    const userRef = db.collection('players').doc(userId);
    
    // 使用 transaction 確保正確
    return await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(userRef);
        let chatExp = 0;
        let level = 1;
        
        if (doc.exists) {
            const data = doc.data();
            chatExp = data.chatExp || 0;
            level = data.level || 1;
        }
        
        chatExp += amount;
        
        // 總需求 EXP = 10 * Level^2
        // 反推目前 Level: sqrt(chatExp / 10)
        let newLevel = Math.max(1, Math.floor(Math.sqrt(chatExp / 10)));
        if (newLevel < level) newLevel = level; // 防止掉級
        
        const leveledUp = newLevel > level;
        
        transaction.set(userRef, {
            chatExp: chatExp,
            level: newLevel,
            lastActive: Date.now()
        }, { merge: true });
        
        return { leveledUp, oldLevel: level, newLevel, chatExp };
    });
}

/**
 * 取得玩家最終戰鬥屬性 (包含裝備加成與上限防禦)
 * @param {string} userId 
 */
async function getFinalPlayerStats(userId) {
    const baseStats = await getOrInitPlayerStats(userId);
    const { getEquipmentData } = require('./equipment');
    
    let equipments = { weapon: null, shield: null, wings: null, gloves: null, necklace: null, ring: null };
    let enchantCount = 0;
    try {
        const equipData = await getEquipmentData(userId);
        equipments = equipData.equipments || equipments;
        enchantCount = equipData.enchantCount !== undefined ? equipData.enchantCount : 0;
    } catch (e) {
        console.error('[RPG] Failed to fetch equipment data for stats:', e);
    }
    
    const { getFinalEquipStat } = require('./equipment');

    const level = baseStats.level || 1;
    const chatExp = baseStats.chatExp || 0;
    
    // 新版等級加成：Lv * 15 + floor(Lv^2 / 4)
    const levelBonus = level * 15 + Math.floor((level * level) / 4);
    // 新版機率屬性加成：每 10 等 +1% (最高 8% 於 80 等)
    const levelBonusPct = Math.floor(level / 10);
    
    const finalStats = { ...baseStats };
    // 移除 chatExp 和 level 以免混入最終數值
    delete finalStats.chatExp;
    delete finalStats.level;
    
    const additions = { atk: 0, def: 0, eva: 0, crit: 0, luk: 0, pen: 0 };
    
    // 解析裝備的雙屬性加成 (main, sub)
    const applyEquipStats = (partName, equipObj) => {
        if (!equipObj) return;
        const stats = getFinalEquipStat(partName, equipObj.grade, equipObj.level); // grade 在新版代表 variant
        if (stats) {
            if (stats.main) additions[stats.main.type] += stats.main.value;
            if (stats.sub) additions[stats.sub.type] += stats.sub.value;
        }
    };

    applyEquipStats('weapon', equipments.weapon);
    applyEquipStats('shield', equipments.shield);
    applyEquipStats('wings', equipments.wings);
    applyEquipStats('gloves', equipments.gloves);
    applyEquipStats('necklace', equipments.necklace);
    applyEquipStats('ring', equipments.ring);
    
    // 獲取議員狀態與虛弱狀態
    let isCouncilor = false;
    let weakUntil = 0;
    try {
        const economyDoc = await db.collection('economy_users').doc(userId).get();
        if (economyDoc.exists) {
            const economyData = economyDoc.data();
            if (economyData.councilorUntil && Date.now() < economyData.councilorUntil) {
                isCouncilor = true;
            }
            if (economyData.weakUntil && Date.now() < economyData.weakUntil) {
                weakUntil = economyData.weakUntil;
            }
        }
    } catch (e) {
        console.error('[RPG] Failed to check councilor or weak status:', e);
    }
    
    // 最終屬性 = 基礎 + 等級加成 + 裝備加成
    finalStats.atk += levelBonus + additions.atk;
    finalStats.def += levelBonus + additions.def;
    finalStats.eva += levelBonusPct + additions.eva;
    finalStats.crit += levelBonusPct + additions.crit;
    finalStats.luk += levelBonusPct + additions.luk;
    finalStats.pen += additions.pen; 

    // 套用議會戰神 buff
    if (isCouncilor) {
        finalStats.atk += 30;
    }

    // 套用斷指虛弱 debuff
    if (weakUntil > 0) {
        finalStats.atk = Math.max(0, finalStats.atk - 20);
        finalStats.def = Math.max(0, finalStats.def - 20);
    }
    
    // 套用上限限制 (所有百分比屬性上限統一為 80%)
    if (finalStats.crit > 80) finalStats.crit = 80;
    if (finalStats.eva > 80) finalStats.eva = 80;
    if (finalStats.luk > 80) finalStats.luk = 80;
    if (finalStats.pen > 80) finalStats.pen = 80;
    
    // 計算戰鬥力 CP
    const cpAtk = finalStats.atk * 2.5;
    const cpDef = finalStats.def * 2;
    // 百分比屬性改為非線性成長 (越接近滿級價值越高)
    const cpEva = Math.pow(finalStats.eva, 2) * 0.8;
    const cpCrit = Math.pow(finalStats.crit, 2) * 0.8;
    const cpLuk = Math.pow(finalStats.luk, 2) * 0.6;
    const cpPen = Math.pow(finalStats.pen, 2) * 0.8;
    finalStats.combatPower = Math.floor(cpAtk + cpDef + cpEva + cpCrit + cpLuk + cpPen);
    
    return { base: baseStats, final: finalStats, additions, equipments, level, levelBonus, levelBonusPct, chatExp, isCouncilor };
}

/**
 * 處理查詢狀態指令 (!狀態, !我的屬性)
 */


/**
 * 處理 RPG 排行榜 (戰鬥力、通緝值、前科)
 */
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
                wantedList.push({ userId: doc.id, name: displayName, wantedLevel: data.wantedLevel });
            }
            if (data.crimeRecord && data.crimeRecord > 0) {
                crimeList.push({ userId: doc.id, name: displayName, crimeRecord: data.crimeRecord });
            }
        });
        
        wantedList.sort((a, b) => b.wantedLevel - a.wantedLevel);
        crimeList.sort((a, b) => b.crimeRecord - a.crimeRecord);

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
        
        const filterTopGroupMembers = async (list) => {
            if (!context.groupId) return list.slice(0, 10);
            const valid = [];
            for (const item of list) {
                try {
                    const profile = await lineUtils.getGroupMemberProfile(context.groupId, item.userId);
                    if (profile.inGroup === false) continue;
                    valid.push(item);
                    if (valid.length >= 10) break;
                } catch (e) {
                    // skip
                }
            }
            return valid;
        };

        const topCp = await filterTopGroupMembers(combatPowers);
        const topWanted = await filterTopGroupMembers(wantedList);
        const topCrime = await filterTopGroupMembers(crimeList);
        
        // 建立 Flex Message Bubbles
        const bubbles = [];
        
        // 1. 戰鬥力排行榜 Bubble
        const buildCpBubble = () => {
            if (topCp.length === 0) {
                return flexUtils.createBubble({
                    size: 'mega',
                    header: flexUtils.createHeader('⚡ 戰鬥力排行榜 (Top 10)', '目前沒有玩家資料。', flexUtils.COLORS.BG_MAIN, flexUtils.COLORS.SECONDARY),
                    body: flexUtils.createBox('vertical', [
                        flexUtils.createText({ text: '尚未有玩家覺醒力量！', size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, align: 'center', margin: 'xl' })
                    ], { backgroundColor: flexUtils.COLORS.BG_MAIN, paddingAll: 'xl'  })
                });
            }
            
            const contents = [];
            topCp.forEach((player, idx) => {
                let emoji = '🏅';
                let color = '#333333';
                if (idx === 0) { emoji = '🥇'; color = flexUtils.COLORS.PRIMARY; }
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
                        flexUtils.createText({ text: `${player.cp.toLocaleString()}⚡`, size: 'sm', weight: 'bold', color: flexUtils.COLORS.SECONDARY, flex: 3, align: 'end' })
                    ], { margin: 'md', alignItems: 'center' })
                );
                if (idx < topCp.length - 1) contents.push(flexUtils.createSeparator('sm'));
            });
            
            return flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('⚡ 戰鬥力排行榜 (Top 10)', '綜合屬性評分', flexUtils.COLORS.BG_MAIN, flexUtils.COLORS.SECONDARY),
                body: flexUtils.createBox('vertical', contents, { paddingAll: 'lg', backgroundColor: '#FFFDF9' })
            });
        };
        bubbles.push(buildCpBubble());
        
        // 2. 通緝值排行榜 Bubble
        const buildWantedBubble = () => {
            if (topWanted.length === 0) {
                return flexUtils.createBubble({
                    size: 'mega',
                    header: flexUtils.createHeader('🚨 通緝排行榜 (Top 10)', '目前天下太平。', flexUtils.COLORS.BG_MAIN, '#D32F2F'),
                    body: flexUtils.createBox('vertical', [
                        flexUtils.createText({ text: '目前沒有任何人被通緝！', size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, align: 'center', margin: 'xl' })
                    ], { backgroundColor: flexUtils.COLORS.BG_MAIN, paddingAll: 'xl'  })
                });
            }
            
            const contents = [];
            topWanted.forEach((player, idx) => {
                let emoji = '🏅';
                let color = '#333333';
                if (idx === 0) { emoji = '🥇'; color = flexUtils.COLORS.PRIMARY; }
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
                header: flexUtils.createHeader('🚨 通緝排行榜 (Top 10)', '頭號罪犯名單', flexUtils.COLORS.BG_MAIN, '#D32F2F'),
                body: flexUtils.createBox('vertical', contents, { paddingAll: 'lg', backgroundColor: '#FFF5F5' })
            });
        };
        bubbles.push(buildWantedBubble());
        
        // 3. 前科排行榜 Bubble
        const buildCrimeBubble = () => {
            if (topCrime.length === 0) {
                return flexUtils.createBubble({
                    size: 'mega',
                    header: flexUtils.createHeader('🏆 前科排行榜 (Top 10)', '目前無人入獄。', flexUtils.COLORS.BG_MAIN, '#424242'),
                    body: flexUtils.createBox('vertical', [
                        flexUtils.createText({ text: '目前大家都是乖寶寶！', size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, align: 'center', margin: 'xl' })
                    ], { backgroundColor: flexUtils.COLORS.BG_MAIN, paddingAll: 'xl'  })
                });
            }
            
            const contents = [];
            topCrime.forEach((player, idx) => {
                let emoji = '🏅';
                let color = '#333333';
                if (idx === 0) { emoji = '🥇'; color = flexUtils.COLORS.PRIMARY; }
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
                header: flexUtils.createHeader('🏆 前科排行榜 (Top 10)', '監獄常客榜單', flexUtils.COLORS.BG_MAIN, '#424242'),
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
    getOrInitPlayerStats,
    getFinalPlayerStats,
    getPlayerTitle,
    addExp,
    handleRpgRank
};
