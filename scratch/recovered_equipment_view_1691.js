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

            // 檢查卷軸是否足夠 4 張，計算總共需要的費用
            let need = 0;
            let scrollPrice = 0;
            if ((scrolls[config.scrollKey] || 0) < 4) {
                need = 4 - (scrolls[config.scrollKey] || 0);
                scrollPrice = need * 100;
            }
            const totalPrice = price + scrollPrice;

            // 一次性扣款 (買裝備 + 補卷軸)
            let consumeResult = await economy.consumeCoin(groupId, userId, totalPrice, true, t);
            if (!consumeResult.success) {
                return { succ
            timestamp: new Date()
        }).catch(e => console.error('[Equipment] Log safe enchant error:', e));
        
        // 需引入 lukBonus 來顯示正確 Bubble
        const { getFinalPlayerStats } = require('./rpg');
        const statsForSafe = await getFinalPlayerStats(userId);
        const cappedLuk = statsForSafe.final.luk;
        const lukBonus = cappedLuk * 0.005;

        const bubble = buildSingleEnchantBubble(true, type, slot, newEquip, config, 0, 4, scrollsCount, 4, newEnchantCount, lukBonus, newReqId, userId);
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