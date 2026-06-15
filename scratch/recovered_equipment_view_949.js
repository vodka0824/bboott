
            t.set(docRef, { 
                equipments, backupEquips, scrolls, enchantCount: newEnchantCount,
                enchantLastTimestamp: now, enchantBurstCount: newBurstCount, enchantCooldownUntil: newCooldownUntil
            }, { merge: true });

            return { success: true, isSuccess, equip, slot, failedEquip, currentLvl, nextLvl, scrollsLeft: scrolls[scrollKey], newEnchantCount, lukBonus };
        });

        if (!result.success) {
            if (result.reason === 'no_equip') {
                await lineUtils.replyText(replyToken, `❌ 您在 ${result.slotName} 欄位目前沒有任何裝備！\n請輸入「裝備店」購買。`);
            } else if (result.reason === 'cooldown') {
                await lineUtils.replyText(replyToken, `🔥 鐵砧過熱中！\n你敲得太快了，請等待 ${result.leftSec} 秒後再繼續強化！\n(請勿使用連點器或按鍵精靈)`);
            } else if (result.reason === 'burst_cooldown') {
                await lineUtils.replyText(replyToken, `🔥 警告：連續操作過快，觸發鐵砧過熱！\n系統已強制冷卻 10 秒。\n(請勿使用連點器或按鍵精靈)`);
            } else if (result.reason === 'max_level') {
                await lineUtils.replyText(replyToken, `❌ 您的 ${result.equipName} 已經達到最高強化上限 +15 了！`);
            } else if (result.reason === 'no_scroll') {
                await lineUtils.replyText(replyToken, `❌ 您的 ${resu
                newLevel: nextLvl,
                isSuccess: true,
                timestamp: new Date()
            }).catch(e => console.error('[Equipment] Log enchant error:', e));
            
            const reqId = generateReqId();
            const flexBubble = buildSingleEnchantBubble(true, type, slot, equip, config, currentLvl, nextLvl, scrollsLeft, 1, newEnchantCount, lukBonus, reqId, userId);
            
            await lineUtils.replyFlex(replyToken, `[強化成功] ${equip.name} +${nextLvl}`, flexBubble);
        } else {
            db.collection('log_enchants').doc().set({
                userId,
                groupId: groupId || 'direct',
                type,
                slot,
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