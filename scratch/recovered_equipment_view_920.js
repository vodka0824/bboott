    const scrollBubble = flexUtils.createBubble({
        size: 'mega',
        header: flexUtils.createHeader(`📜 神秘卷軸商`, '強化裝備必備', '#9C27B0'),
        body: flexUtils.createBox('vertical', scrollItems, { paddingAll: 'lg' })
    });
    bubbles.push(scrollBubble);

    const carousel = flexUtils.createCarousel(bubbles);
    await lineUtils.replyFlex(replyToken, '皇家裝備店 (支援輪播)', carousel);
}

/**
 * 購買裝備
 */
async function buyEquipment(replyToken, text, userId, groupId) {
    const match = text.trim().match(/^(?:買|購買|買裝備|購買裝備)\s*(武器|盾牌|翅膀|手套|項鍊|戒指)\s*([1-5])$/i);
    if (!match) {
        await lineUtils.replyText(replyToken, '❌ 找不到該裝備項目或格式錯誤！請輸入「裝備店」查看所有可購買商品。\n格式範例：買武器3 或 購買 武器 3');
        return;
    }
    
    const typeChinese = match[1];
    const grade = parseInt(match[2], 10);
    
    const typeMap = {
        '武器': 'weapon',
        '盾牌': 'shield',
        '翅膀': 'wings',
        '手套': 'gloves',
        '項鍊': 'necklace',
        '戒指': 'ring'
    };
    const type = typeMap[typeChinese];
    const config = EQUIP_TYPES[type];
    
    const price = 100; // 測試期間售價為 100 哭幣
    
    try {
        const result = await db.runTransaction(asy
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
            }
            return;
        }

        const scrolls = result.newScrolls;
        await lineUtils.replyText(replyToken, `🛒 卷軸購買成功！\n花費了 ${price} 哭幣購買了 ${amount} 張 ${displayScrollName}。\n目前剩餘卷軸：武卷 ${scrolls.weapon} 張 | 防卷 ${scrolls.armor} 張 | 飾品卷 ${scrolls.accessory} 張`);
    } catch (e) {
        console.error('[Equipment] buyScrolls Error:', e);
        await lineUtils.replyText(replyToken, '❌ 購買卷軸失敗，系統發生錯誤。');
    }
}
