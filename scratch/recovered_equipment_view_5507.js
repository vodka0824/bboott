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

            return { success: true };
        });

        if (!result.success) {
            if (result.reason === 'insufficient') {
                await lineUtils.replyText(replyToken, `❌ 購買失敗：您的餘額不足 ${price} 哭幣！`);
            }
            return;
        }

        const displayTypeMap = { 'weapon': '武卷', 'armor': '防卷', 'accessory': '飾品卷' };
        const displayScrollName = displayTypeMap[scrollKey];

        const header = flexUtils.createHeader('🛒 卷軸購買成功', '補給完成', '#9C27B0');
        const body = flexUtils.createBox('vertical', [
            flexUtils.createText({ text: `花費 ${price} 哭幣購買了：`, size: 'sm', color: '#555555' }),
            flexUtils.createText({ text: `${amount} 張 ${displayScrollName}`, size: 'lg', weight: 'bold', color: '#1976D2', margin: 'sm' }),
            flexUtils.createSeparator('md'),
            flexUtils.createText({ text: `目前剩餘卷軸：`, size: 'sm', weight: 'bold', margin: 'md' }),
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
    