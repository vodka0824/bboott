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
                    if (stats && stats.main && stats.main.type === 'luk') additionsLuk += stats.main.value;
                    if (stats && stats.sub && stats.sub.type === 'luk') additionsLuk += stats.sub.value;
                }
            }
            let cappedLuk = Math.min(80, luk + additionsLuk);
            const lukBonus = cappedLuk * 0.005;
            
            let equip = equipments[type];
            let slot = 'main';
            if (!equip) {
                if (backupEquips[type]) {
                    equip = backupEquips[type];
                    slot = 'backup';
                } else {
                    return { success: false, reason: 'no_equip', slotName: config.displayName };
                }
            }