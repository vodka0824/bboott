    const scrollTypeMap = {
        '武卷': 'weapon',
        '防卷': 'armor',
        '飾品卷': 'accessory',
        '武': 'weapon',
        '防': 'armor',
        '飾品': 'accessory'
    };
    const scrollKey = scrollTypeMap[scrollTypeChinese];
    
    // 統一回覆時使用的名稱
    const displayTypeMap = {
        'weapon': '武卷',
        'armor': '防卷',
        'accessory': '飾品卷'
    };
    const displayScrollName = displayTypeMap[scrollKey];
    const price = amount * 100; // 測試期間統一為 100 哭幣
    
    try {
        const result = await db.runTransaction(async (t) => {
            const { equipments, scrolls, docRef } = await getEquipmentData(userId, t);
            
            const consumeResult = await economy.consumeCoin(groupId, userId, price, false, t);
            if (!consumeResult.success) {
                return { success: false, reason: 'insufficient' };
            }
            
            scrolls[scrollKey] = (scrolls[scrollKey] || 0) + amount;
            
            t.set(docRef, { scrolls }, { merge: true });
            
            return { success: true, newScrolls: scrolls };
        });

        if (!result.success) {
            if (result.reason === 'insufficient') {
                await lineUtils.replyText(replyToken, `❌ 購買失敗：您的餘額不足 ${price} 哭幣！`);
      
                    flexUtils.createButton({ action: { type: 'postback', label: `🔥連x5`, data: `action=enchant_equip&type=${type}&slot=${slot}&times=5&reqId=${reqId}` }, style: 'primary', color: '#FF9800', height: 'sm', margin: 'xs', flex: 2 })
                ], { margin: 'sm' }),
                flexUtils.createBox('horizontal', [
                    flexUtils.createButton({ action: { type: 'postback', label: `💥狂衝x8`, data: `action=enchant_equip&type=${type}&slot=${slot}&times=8&reqId=${reqId}` }, style: 'primary', color: '#E91E63', height: 'sm', margin: 'xs', flex: 3 }),
                ], { margin: 'sm' })
            );
        }
    }
    footerItems.push(flexUtils.createButton({ action: { type: 'message', label: '🛡️ 我的背包', text: '我的裝備' }, style: 'secondary', margin: 'sm' }));
    
    return flexUtils.createBubble({
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
            let { equipments, backupEquips, scrolls, enchantCount, docRef } = da