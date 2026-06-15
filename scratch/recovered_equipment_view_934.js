        if (!result.success) {
            if (result.reason === 'cooldown') {
                await lineUtils.replyText(replyToken, `🔥 鐵砧過熱中！\n你敲得太快了，請等待 ${result.leftSec} 秒後再繼續強化！\n(請勿使用連點器或按鍵精靈)`);
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

        const { logs, costCount, isBroken, currentLvl, newReqId, equip, failedEquip, scrollsLeft, newEnchantCount, slot, lukBonus } = result;
        
        // 若為單次強化，維持原本單純的 Bubble
        if (times === 1) {
      
                    flexUtils.createButton({ action: { type: 'postback', label: `⚡連x3`, data: `action=enchant_equip&type=${type}&slot=${slot}&times=3&reqId=${reqId}` }, style: 'secondary', height: 'sm', margin: 'xs', flex: 2 }),
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