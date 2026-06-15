    } catch (e) {
        console.error('[Equipment] buyScrollsPostback Error:', e);
        await lineUtils.replyText(replyToken, '❌ 購買卷軸失敗。');
    }
}

// 供 Postback 呼叫的強化邏輯 (支援連續衝裝)
async function enchantEquipmentPostback(replyToken, type, slot, times, userId, reqId, groupId = 'direct') {
    const config = EQUIP_TYPES[type];
    if (!config) return;
    
    try {
        const result = await db.runTransaction(async (t) => {
            let data = await getEquipmentData(userId, t);
            let { equipments, backupEquips, scrolls, enchantCount, docRef, lastEnchantReqId, enchantLastTimestamp, enchantBurstCount, enchantCooldownUntil, playerData } = data;

            // 計算 LUK Bonus
            let luk = playerData && playerData.rpg ? (playerData.rpg.luk || 0) : 0;
            let additionsLuk = 0;
            for (const p of ['weapon', 'shield', 'wings', 'gloves', 'necklace', 'ring']) {
                let eq = equipments[p];
                if (eq) {
                    const stats = getFinalEquipStat(p, eq.grade, eq.level);
                    if (stats && stats.main && stats.main.type === 'luk') additionsLuk += stats.main.value;
                    if (stats && stats.sub && stats.sub.type === 'luk') additionsLuk += stats.sub.value;
                }
            }
            let cappedLuk = Math.min(80, luk + additionsLuk);
            const lukBonus = capped
            let newCooldownUntil = 0;
            if (now - enchantLastTimestamp < 2000) { // 2 秒內連續點擊
                newBurstCount += 1;
            } else {
                newBurstCount = 1;
            }
            
            if (newBurstCount > 5) {
                newCooldownUntil = now + 10000;
                newBurstCount = 0;
                t.set(docRef, { enchantLastTimestamp: now, enchantBurstCount: newBurstCount, enchantCooldownUntil: newCooldownUntil }, { merge: true });
                return { success: false, reason: 'burst_cooldown' };
            }
            
            let equip = slot === 'main' ? equipments[type] : backupEquips[type];
            if (!equip) {
                return { success: false, reason: 'no_equip', slotName: slot === 'main' ? '裝備' : '備用' };
            }
            
            const scrollKey = config.scrollKey;
            const initialLevel = equip.level;
            
            if (initialLevel >= 15) {
                return { success: false, reason: 'max_level', equipName: equip.name };
            }

            // 開始連衝邏輯
            let currentLvl = initialLevel;
            let logs = [];
            let costCount = 0;
            let isBroken = false;
            let finalSuccess = false;
            
            let maxExec = Math.min(times, 10);

            for (let i = 0; i < maxExec; i++) {
                if (currentLvl >= 15) break; // 滿級中斷
                if ((scrolls[scrollKey] || 0) <= 0) {
                    logs.push(`⚠️ 卷軸不足，已自動停止強化。`);
                    break;