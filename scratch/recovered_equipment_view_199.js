            const stars = '★'.repeat(Math.min(currentLvl, 5)) + '☆'.repeat(Math.max(0, 5 - currentLvl));
            bodyItems.push(flexUtils.createText({ text: `星級: ${stars}`, size: 'md', color: '#FFD700', weight: 'bold', margin: 'sm' }));
        }
        bodyItems.push(flexUtils.createText({ text: `📜 剩餘 ${config.scrollName.substring(0,2)}：${scrollsLeft} 張`, size: 'xs', color: '#555555', margin: 'sm' }));
        
        const footerItems = [];
        if (isBroken) {
            // 一鍵買回並直升+4 (只有爆裝時顯示)
            footerItems.push(flexUtils.createButton({ action: { type: 'postback', label: `買回並直升+4`, data: `action=buy_and_safe_enchant&type=${type}&slot=${slot}&grade=${equip ? equip.grade : 1}&reqId=${newReqId}` }, style: 'primary', color: flexUtils.COLORS.DANGER, margin: 'sm' }));
            footerItems.push(flexUtils.createButton({ action: { type: 'postback', label: '補充卷軸x5', data: `action=buy_scroll&type=${config.scrollKey}&amount=5` }, style: 'secondary', margin: 'sm' }));
        } else if (currentLvl < 15) {
            const nextInfo = getNextLevelInfo(currentLvl, lukBonus);
            if (nextInfo) {
                bodyItems.push(flexUtils.createText({ text: `📈 下一階成功率：${nextInfo.ratePercent}% ${lukBonus > 0 ? '(含幸運)' : ''}`, size: 'xs', color: '#E91E63', margin: 'xs', weight: 'bold' }));
                footerItems.push(
                        flexUtils.create
                        ], { margin: 'sm' }),
                        flexUtils.createBox('horizontal', [
                            flexUtils.createButton({ action: { type: 'postback', label: `💥狂衝x8`, data: `action=enchant_equip&type=${type}&slot=${slot}&times=8&reqId=${newReqId}` }, style: 'primary', color: '#E91E63', height: 'sm', margin: 'xs', flex: 3 }),
                            ...(userId === ADMIN_USER_ID ? [flexUtils.createButton({ action: { type: 'postback', label: `👽作弊+1`, data: `action=enchant_equip&type=${type}&slot=${slot}&times=1&reqId=${newReqId}&cheat=true` }, style: 'primary', height: 'sm', color: '#9C27B0', margin: 'xs', flex: 3 })] : [])
                        ], { margin: 'sm' })
                );
            }
        }
        footerItems.push(flexUtils.createButton({ action: { type: 'message', label: '🛡️ 我的背包', text: '我的裝備' }, style: 'secondary', margin: 'sm' }));
        
        const flexBubble = flexUtils.createBubble({ size: 'mega', header: flexUtils.createHeader(headerTitle, headerSub, headerColor), body: flexUtils.createBox('vertical', bodyItems, { paddingAll: 'xl' }), footer: flexUtils.createBox('vertical', footerItems, { paddingAll: 'md' }) });
        
        await lineUtils.replyFlex(replyToken, isBroken ? '強化失敗' : '強化成功', flexBubble);
        
    } catch (e) {
        console.error('[Equipment] enchantEquipmentPostback Error:', e);
    }
}

// 建立單次強化的 Bubble
function buildSingleEnchantBubble(isSuccess, type, slot, equip, config, oldLvl, newLvl, scrollsLeft, costCount, enchantCount, lukBonus = 0, reqId = '', userId = '') { 
    const isAdmin = userId === ADMIN_USER_ID;