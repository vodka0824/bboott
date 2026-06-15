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
            const bubble = buildSingleEnchantBubble(
                !isBroken, type, slot, equip, config, 
                isBroken ? currentLvl : currentLvl - 1, 
                isBroken ? 0 : currentLvl, 
                scrollsLeft, costCount, newEnchantCount, lukBonus, newReqId, userId
            );
            await lineUtils.replyFlex(replyToken, isBroken ? '強化失敗' : '強化成功', bubble);
            
            db.collection('log_enchants').doc().set({
                userId, groupId: groupId 
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
            flexUtils.createText({ text: `⚡ 連續強化戰報`, weight: 'bold', size: 'md', margin: 'md', color: '#673AB7' })
        ];
        
        logs.forEach(l => {
            const isSuccessLog = l.includes('成功');
            bodyItems.push(flexUtils.createText({ text: l, size: 'sm', color: isSuccessLog ? flexUtils.COLORS.SUCCESS : flexUtils.COLORS.DANGER, margin: 'xs' }));
        });
        
        bodyItems.push(flexUtils.createSeparator('md'));
        
        if (isBroken) {
            bodyItems.push(flexUtils.createText({ text: `裝備已化為灰燼...`, weight: 'bold', size: 'sm', color: flexUtils.COLORS.DANGER, wrap: true, margin: 'sm' }));
        } else {
            bodyItems.push(flexUtils.createText({ text: `[${equip.name}] 最終等級：+${currentLvl}\n加成：${formatEquipStats(type, equip.grade, currentLvl)}`, weight: 'bold', size: 'sm', color: flexUtils.COLORS.PRIMARY, wrap: true, margin: 'sm' }));
            const stars = '★'.repeat(Math.min(currentLvl, 5)) + '☆'.repeat(Math.max(0, 5 - currentLvl));