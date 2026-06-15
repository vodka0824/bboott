    
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
            flexUtils.createSeparator('md'),
            flexUtils.createText({ text: '快速補充卷軸 ($10/10張)', size: 'xs', weight: 'bold', color: '#E91E63', margin: 'md' }),
            flexUtils.createBox('horizontal', [
                flexUtils.createButton({ action: { type: 'postback', label: '買武卷x10', data: `action=buy_scroll&type=weapon&amount=10` }, style: 'secondary', height: 'sm', margin: 'xs', flex: 1 }),
                flexUtils.createButton({ action: { type: 'postback', label: '買防卷x10', data: `action=buy_scroll&type=armor&amount=10` }, style: 'secondary', height: 'sm', margin: 'xs', flex: 1 })
            ], { margin: 'sm' })
        ], { paddingAll: 'lg' });
        const inventoryFooter = flexUtils.createBox('horizontal', [
            flexUtils.createButton({ action: { type: 'message', label: '🏪 前往皇家裝備店', text: '裝備店' }, style: 'primary', color: '#9C27B0' })
        ], { paddingAll: 'md' });
        
        bubbles.push(flexUtils.createBubble({ size: 'mega', header: inventoryHeader, body: inventoryBody, footer: inventoryFooter }));
        
        const carousel = flexUtils.createCarousel(bubbles);
        await lineUtils.replyFlex(replyToken, '我的裝備與背包', carousel);
    } catch (e) {
        console.error('[Equipment] showMyEquipments Error:', e);
        await lineUtils.replyText(replyToken, '❌ 讀取裝備失敗。');
    }
}

/**
 * 強化裝備 (衝裝)
 */
async function enchantEquipment(replyToken, text, userId, groupId) {
    const match = text.trim().match(/^(?:強化|衝|點|衝裝|升級)\s*(?:裝備)?\s*(武器|盾牌|翅膀|手套|項鍊|戒指)$/i);
    if (!match) return;
    