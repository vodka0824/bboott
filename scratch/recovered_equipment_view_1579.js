                equipName: failedEquip.name,
                variant: failedEquip.grade,
                oldLevel: currentLvl,
                newLevel: 0,
                isSuccess: false,
                timestamp: new Date()
            }).catch(e => console.error('[Equipment] Log enchant error:', e));
            
            const reqId = generateReqId();
            const flexBubble = buildSingleEnchantBubble(false, type, slot, failedEquip, config, currentLvl, 0, scrollsLeft, 1, newEnchantCount, lukBonus, reqId, userId);
            
            await lineUtils.replyFlex(replyToken, `[強化失敗] ${failedEquip.name} 爆裂消失`, flexBubble);
        }
    } catch (e) {
        console.error('[Equipment] enchantEquipment Error:', e);
        await lineUtils.replyText(replyToken, '❌ 強化過程中發生錯誤。');
    }
}

async function buyEquipmentPostback(replyToken, type, grade, userId, groupId) {
    try {
        const config = EQUIP_TYPES[type];
        const price = 100; // 裝備售價（測試期間）
        let targetSlot = '';
        let equipName = '';

        const result = await db.runTransaction(async (t) => {
            const { equipments, backupEquips, scrolls, docRef } = await getEquipmentData(userId, t);
            
            if (!equipments[type]) {
                targetSlot = 'main';
            } else if (!backupEquips[type]) {
                targetSl
            flexUtils.createText({ text: `📜 武卷: ${scrolls.weapon} | 📜 防卷: ${scrolls.armor} | 📜 飾品卷: ${scrolls.accessory}`, size: 'xs', margin: 'sm' })
        ], { paddingAll: 'xl' });
        
        const footer = flexUtils.createBox('horizontal', [
            flexUtils.createButton({ action: { type: 'message', label: '🛡️ 去強化', text: '我的裝備' }, style: 'primary' })
        ], { paddingAll: 'md' });
        
        const bubble = flexUtils.createBubble({ size: 'mega', header, body, footer });
        await lineUtils.replyFlex(replyToken, '購買卷軸成功', bubble);
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