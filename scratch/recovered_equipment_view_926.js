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
        ], { paddingAll: 'xl' });
        
        const reqId = generateReqId();
        const footer = flexUtils.createBox('horizontal', [
            flexUtils.createButton({ action: { type: 'postback', label: `🔨 強化它`, data: `action=enchant_equip&type=${type}&slot=${targetSlot}&times=1&reqId=${reqId}` }, style: 'primary', color: '#FF5722' }),
            flexUtils.createButton({ action: { type: 'message', label: '🛡️ 我的背包', text: '我的裝備' }, style: 'secondary', margin: 'sm' })
        ], { paddingAll: 'md' });
        
        const bubble = flexUtils.createBubble({ size: 'mega', header, body, footer });
        await lineUtils.replyFlex(replyToken, '購買裝備成功', bubble);
    } catch (e) {
        console.error('[Equipment] buyEquipmentPostback Error:', e);
        await lineUtils.replyText(replyToken, '❌ 購買裝備失敗。');
    }
}

async function buyScrollsPostback(replyToken, scrollKey, amount, userId, groupId) {
    try {
        const price = amount * 100; // 每張卷軸 100 哭幣
        let scrolls = {};

        const result = await db.runTransaction(async (t) => {
            const data = await getEquipmentData(userId, t);
            scrolls = data.scrolls;
            const docRef = data.docRef;

            const consumeResult = await economy.consumeCoin(groupId, userId, price, false, t);
            if (!consumeResult.success) {
                return { success: false, reason: 'insufficient', message: consumeResult.message };
            }

            scrolls[scrollKey] = (scrolls[scrollKey] || 0) + amount;
            t.set(docRef, { scrolls }, { merge: true });