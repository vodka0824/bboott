            
            await lineUtils.replyFlex(replyToken, `[強化失敗] ${failedEquip.name} 爆裂消失`, flexBubble);
        }
    } catch (e) {
        console.error('[Equipment] enchantEquipment Error:', e);
        await lineUtils.replyText(replyToken, `❌ 強化過程中發生錯誤：${e.message}`);
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
                targetSlot = 'backup';
            } else {
                return { success: false, reason: 'full' };
            }

            const consumeResult = await economy.consumeCoin(groupId, userId, price, true, t);
            if (!consumeResult.success) {
                return { success: false, reason: 'insufficient', message: consumeResult.message };
            }

            equipName = EQUIP_VARIANTS[type]?.[grade]?.name || `${config.chinese}${grade}`;
            
            if (targetSlot === 'main') {

                await lineUtils.replyText(replyToken, `❌ 購買失敗：您的餘額不足 ${price} 哭幣！`);
            }
            return;
        }

        const header = flexUtils.createHeader('⚒️ 購買裝備成功', targetSlot === 'main' ? '全新裝備已穿上' : '放入備用背包', '#4CAF50');
        const body = flexUtils.createBox('vertical', [
            flexUtils.createText({ text: `花費 ${price} 哭幣購買了：`, size: 'sm', color: '#555555' }),
            flexUtils.createText({ text: `[${equipName}]`, size: 'lg', weight: 'bold', color: '#1976D2', margin: 'sm' }),
            flexUtils.createText({ text: `初始屬性加成：${formatEquipStats(type, grade, 0)}`, size: 'sm', margin: 'md' })
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