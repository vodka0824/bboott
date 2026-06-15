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

        const { logs, costCount, isBroken, currentLvl, newReqId, equip, failedEquip, scrollsLeft, newEnchantCount, slot, lukBonus, initialLevel } = result;
        
        // 若為單次強化，維持原本單純的 Bubble
        if (times === 1) {
            const bubble = buildSingleEnchantBubble(
                !isBroken, type, slot, equip, config, 
                isBroken ? currentLvl : currentLvl - 1, 
                isBroken ? 0 : currentLvl, 
                scrollsLeft, costCount, newEnchantCount, lukBonus, newReqId, userId
            );
            await lineUtils.replyFlex(replyToken, isBroken ? '強化失敗' : '強化成功', bubble);
            
            db.collection('log_enchants').doc().set({
                userId, groupId: groupId || 'direct', type, slot, equipName: equip.name, variant: equip.grade, oldLevel: initialLevel, newLevel: isBroken ? 0 : currentLvl, isSuccess: !isBroken, timestamp: new Date()
            }).catch(e => console.error(e));
            return;
        }
        
        // 若 > 5，產生戰報 Summary
        const headerColor = isBroken ? flexUtils.COLORS.DANGER : flexUtils.COLORS.SUCCESS;
        const headerTitle = isBroken ? '💥 連續強化失敗' : '✨ 連續強化成功';
        const headerSub = isBroken ? '裝備已損毀' : '裝備屬性提升';
        
        const bodyItems = [
            flexUtils.createText({ text: `消耗 ${costCount} 張 ${config.scrollName}`, size: 'xs', color: flexUtils.COLORS.GRAY }),
            flexUtils.createSeparator('sm'),