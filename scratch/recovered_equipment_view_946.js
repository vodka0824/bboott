        await lineUtils.replyText(replyToken, '❌ 讀取裝備失敗。');
    }
}

/**
 * 強化裝備 (衝裝)
 */
async function enchantEquipment(replyToken, text, userId, groupId) {
    const match = text.trim().match(/^(?:強化|衝|點|衝裝|升級)\s*(?:裝備)?\s*(武器|盾牌|翅膀|手套|項鍊|戒指)$/i);
    if (!match) return;
    
    const partChinese = match[1];
    const typeMap = {
        '武器': 'weapon',
        '盾牌': 'shield',
        '翅膀': 'wings',
        '手套': 'gloves',
        '項鍊': 'necklace',
        '戒指': 'ring'
    };
    const type = typeMap[partChinese];
    const config = EQUIP_TYPES[type];
    
    try {
        const result = await db.runTransaction(async (t) => {
            const data = await getEquipmentData(userId, t);
            let { equipments, backupEquips, scrolls, enchantCount, docRef, enchantCooldownUntil, enchantLastTimestamp, enchantBurstCount, playerData } = data;
            
            // 計算 LUK Bonus
            let luk = playerData && playerData.rpg ? (playerData.rpg.luk || 0) : 0;
            let additionsLuk = 0;
            for (const p of ['weapon', 'shield', 'wings', 'gloves', 'necklace', 'ring']) {
                if (equipments[p]) {
                    const stats = getFinalEquipStat(p, equipments[p].grade, equipments[p].level);
                    if (stats && stats.main && stats.main.type ==
                newCooldownUntil = now + 10000;
                newBurstCount = 0;
                t.set(docRef, { enchantLastTimestamp: now, enchantBurstCount: newBurstCount, enchantCooldownUntil: newCooldownUntil }, { merge: true });
                return { success: false, reason: 'burst_cooldown' };
            }

            const currentLvl = equip.level;
            if (currentLvl >= 15) {
                return { success: false, reason: 'max_level', equipName: equip.name };
            }
            
            const scrollKey = config.scrollKey;
            if ((scrolls[scrollKey] || 0) <= 0) {
                return { success: false, reason: 'no_scroll', scrollName: config.scrollName };
            }
            
            // 扣除 1 張卷軸
            scrolls[scrollKey] -= 1;
            
            // 增加衝裝次數 (僅供統計)
            const newEnchantCount = enchantCount + 1;

            // 計算強化機率
            const baseRate = PROBABILITY[currentLvl] !== undefined ? PROBABILITY[currentLvl] : 0.05;
            const rate = baseRate >= 1.0 ? 1.0 : Math.min(0.99, baseRate * (1 + lukBonus));
            const isSuccess = Math.random() < rate;
            
            let failedEquip = null;
            let nextLvl = currentLvl;

            if (isSuccess) {
                nextLvl = currentLvl + 1;
                equip.level = nextLvl;
            } else {
                // 爆裝消失
                failedEquip = { name: equip.name, grade: equip.grade };
                if (slot === 'main') equipments[type] = null;
                else backupEquips[type] = null;
            }
