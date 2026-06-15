
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
            const lukBonus = cappedLuk * 0.005;

            const now = Date.now();
            if (enchantCooldownUntil > now) {
                const leftSec = Math.ceil((enchantCooldownUntil - now) / 1000
            } else if (result.reason === 'invalid_req') {
                await lineUtils.replyText(replyToken, `⚠️ 此強化按鈕已失效。\n請點擊最新出現的「強化戰報」上的按鈕繼續，或輸入「我的裝備」呼叫新選單。`);
            } else if (result.reason === 'burst_cooldown') {
                await lineUtils.replyText(replyToken, `🔥 警告：連續操作過快，觸發鐵砧過熱！\n系統已強制冷卻 10 秒。\n(請勿使用連點器或按鍵精靈)`);
            } else if (result.reason === 'no_equip') {
                await lineUtils.replyText(replyToken, `❌ 您在 ${config.displayName} ${result.slotName}欄位目前沒有任何裝備！`);
            } else if (result.reason === 'max_level') {
                await lineUtils.replyText(replyToken, `❌ 您的 ${result.equipName} 已經達到最高強化上限 +15 了！`);
            }
            return;
        }

        const { logs, costCount, isBroken, currentLvl, newReqId, equip, failedEquip, scrollsLeft, newEnchantCount, lukBonus, initialLevel } = result;
        
        // 若為單次強化，維持原本單純的 Bubble
        if (times === 1) {
            const bubble = buildSingleEnchantBubble(
                !isBroken, type, slot, equip, config, 
                isBroken ? currentLvl : currentLvl - 1, 
                isBroken ? 0 : currentLvl, 
                scrollsLeft, costCount, newEnchantCount, lukBonus, newReqId, userId
            );
            await lineUtils.replyFlex(replyToken, isBroken ? '強化失敗' : '強化成功', bubble);