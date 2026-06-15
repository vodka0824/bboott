    }
}

// 建立單次強化的 Bubble
function buildSingleEnchantBubble(isSuccess, type, slot, equip, config, oldLvl, newLvl, scrollsLeft, costCount, enchantCount, lukBonus = 0, reqId = '', userId = '') { 
    const isAdmin = userId === ADMIN_USER_ID;
    const headerColor = isSuccess ? flexUtils.COLORS.SUCCESS : flexUtils.COLORS.DANGER;
    const headerTitle = isSuccess ? '✨ 強化成功' : '💥 強化失敗';
    const headerSub = isSuccess ? '裝備屬性提升' : '裝備已爆裂';
    
    const bodyItems = [
        flexUtils.createText({ text: `消耗 ${costCount} 張 ${config.scrollName}`, size: 'xs', color: flexUtils.COLORS.GRAY }),
        flexUtils.createSeparator('sm')
    ];
    
    if (isSuccess) {
        bodyItems.push(flexUtils.createText({ text: `[${equip.name}] 成功強化為 +${newLvl}！`, weight: 'bold', size: 'md', margin: 'md', wrap: true }));
        bodyItems.push(flexUtils.createText({ text: `屬性加成提升為：\n${formatEquipStats(type, equip.grade, newLvl)}`, size: 'sm', color: flexUtils.COLORS.PRIMARY, weight: 'bold', wrap: true }));
        const stars = '★'.repeat(Math.min(newLvl, 5)) + '☆'.repeat(Math.max(0, 5 - newLvl));
        bodyItems.push(flexUtils.createText({ text: `星級: ${stars}`, size: 'md', color: '#FFD700', weight: 'bold', margin: 'sm' }));
    } else {
        bodyItems.push(flexUtils.createText({ text: `激烈的銀色光芒閃爍後...`, size: 'sm', margin: '
                await lineUtils.replyText(replyToken, `❌ 餘額不足！買回並直升 +4 共需要 ${result.totalPrice} 哭幣。`);
            }
            return;
        }

        const { equipName, scrollsCount, newEnchantCount, newReqId, newEquip } = result;
        
        db.collection('log_enchants').doc().set({
            userId,
            groupId: groupId || 'direct',
            type,
            slot,
            equipName: equipName,
            variant: grade,
            oldLevel: 0,
            newLevel: 4,
            isSuccess: true,
            timestamp: new Date()
        }).catch(e => console.error('[Equipment] Log safe enchant error:', e));
        
        // 需引入 lukBonus 來顯示正確 Bubble
        const { getFinalPlayerStats } = require('./rpg');
        const statsForSafe = await getFinalPlayerStats(userId);
        const cappedLuk = statsForSafe.final.luk;
        const lukBonus = cappedLuk * 0.005;

        const bubble = buildSingleEnchantBubble(true, type, slot, newEquip, config, 0, 4, scrollsCount, 4, newEnchantCount, lukBonus, newReqId, userId);
        await lineUtils.replyFlex(replyToken, '直升安定值成功', bubble);
    } catch (e) {
        console.error('[Equipment] buyAndSafeEnchantPostback Error:', e);
        await lineUtils.replyText(replyToken, '❌ 買回直升失敗。');
    }
}

async function swapEquipmentPostback(replyToken, type, userId) {
    try {
        const result = await db.runTransaction(async (t) => {
            const { equipments, backupEquips, docRef } = await getEquipmentData(userId, t);