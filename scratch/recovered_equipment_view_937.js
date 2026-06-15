        size: 'mega',
        header: flexUtils.createHeader(headerTitle, headerSub, headerColor),
        body: flexUtils.createBox('vertical', bodyItems, { paddingAll: 'xl' }),
        footer: flexUtils.createBox('vertical', footerItems, { paddingAll: 'md' })
    });
}

async function buyAndSafeEnchantPostback(replyToken, type, slot, grade, userId, groupId, reqId) {
    try {
        const price = 100; // 裝備售價（測試期間）
        const config = EQUIP_TYPES[type];
        
        const result = await db.runTransaction(async (t) => {
            const data = await getEquipmentData(userId, t);
            let { equipments, backupEquips, scrolls, enchantCount, docRef } = data;
            
            const equipName = EQUIP_VARIANTS[type]?.[grade]?.name || `${config.chinese}${grade}`;

            // 先買裝備
            let consumeResult = await economy.consumeCoin(groupId, userId, price, true, t);
            if (!consumeResult.success) {
                return { success: false, reason: 'eq_insufficient' };
            }

            // 檢查卷軸是否足夠 4 張，不夠則自動補買
            let need = 0;
            if ((scrolls[config.scrollKey] || 0) < 4) {
                need = 4 - (scrolls[config.scrollKey] || 0);
                const scrollPrice = need * 100;
                consumeResult = await economy.consumeCoin(groupId, userId, scrollP

        const bubble = buildSingleEnchantBubble(true, type, slot, newEquip, config, 0, 4, scrolls[config.scrollKey], 4, newEnchantCount, lukBonus, newReqId, userId);
        await lineUtils.replyFlex(replyToken, '直升安定值成功', bubble);
    } catch (e) {
        console.error('[Equipment] buyAndSafeEnchantPostback Error:', e);
        await lineUtils.replyText(replyToken, '❌ 買回直升失敗。');
    }
}

async function swapEquipmentPostback(replyToken, type, userId) {
    try {
        const result = await db.runTransaction(async (t) => {
            const { equipments, backupEquips, docRef } = await getEquipmentData(userId, t);
            
            // 互換裝備
            const temp = equipments[type];
            equipments[type] = backupEquips[type];
            backupEquips[type] = temp;
            
            t.set(docRef, { equipments, backupEquips }, { merge: true });
            return { success: true };
        });
        
        // 互換後直接重新顯示「我的裝備」UI
        await showMyEquipments(replyToken, userId);
    } catch (e) {
        console.error('[Equipment] swapEquipmentPostback Error:', e);
        await lineUtils.replyText(replyToken, '❌ 裝備替換失敗。');
    }
}

module.exports = {
    getEquipmentData,
    showEquipmentShop,
    buyEquipment,
    buyScrolls,
    showMyEquipments,
    enchantEquipment,
    buyEquipmentPostback,
    buyScrollsPostback,
    enchantEquipmentPostback,
    buyAndSafeEnchantPostback,
    swapEquipmentPostback,
    EQUIP_TYPES,
    getFinalEquipStat
};
