const { db } = require('../utils/db');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');

const DEFAULT_STATS = { level: 1, exp: 0, hp: 100, attack: 10, defense: 5 };

const { getOrInitPlayerStats, getPlayerTitle } = require('./rpgCoreService');

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
    
    // 新版等級加成：Level + floor(Level^2 / 30)
    const levelBonus = level + Math.floor((level * level) / 30);
    const levelBonusPct = 0; // 百搭機率屬性不再有等級加成
    
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
    
    // 獲取議員狀態 (議會戰神特權)
    let isCouncilor = false;
    try {
        const economyDoc = await db.collection('economy_users').doc(userId).get();
        if (economyDoc.exists) {
            const economyData = economyDoc.data();
            if (economyData.councilorUntil && Date.now() < economyData.councilorUntil) {
                isCouncilor = true;
            }
        }
    } catch (e) {
        console.error('[RPG] Failed to check councilor status:', e);
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

module.exports = {
    getFinalPlayerStats
};
