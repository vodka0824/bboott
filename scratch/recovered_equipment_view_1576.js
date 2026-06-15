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
            bodyItems.push(flexUtils.createText({ text: `星級: ${stars}`, size: 'md', color: '#FFD700', weight: 'bold', margin: 'sm' }));
        }
        bodyItems.push(flexUtils.createText({ text: `📜 剩餘 ${config.scrollName.substring(0,2)}：${scrollsLeft} 張`, size: 'xs', color: '#555555', margin: 'sm' }));
        
        const fo
                            flexUtils.createButton({ action: { type: 'postback', label: `💥狂衝x8`, data: `action=enchant_equip&type=${type}&slot=${slot}&times=8&reqId=${newReqId}` }, style: 'primary', color: '#E91E63', height: 'sm', margin: 'xs', flex: 3 }),
                        ], { margin: 'sm' })
                );
            }
        }
        footerItems.push(flexUtils.createButton({ action: { type: 'message', label: '🛡️ 我的背包', text: '我的裝備' }, style: 'secondary', margin: 'sm' }));
        
        const flexBubble = flexUtils.createBubble({ size: 'mega', header: flexUtils.createHeader(headerTitle, headerSub, headerColor), body: flexUtils.createBox('vertical', bodyItems, { paddingAll: 'xl' }), footer: flexUtils.createBox('vertical', footerItems, { paddingAll: 'md' }) });
        
        await lineUtils.replyFlex(replyToken, isBroken ? '強化失敗' : '強化成功', flexBubble);
        
    } catch (e) {
        console.error('[Equipment] enchantEquipmentPostback Error:', e);
        await lineUtils.replyText(replyToken, '❌ 強化過程中發生錯誤，請稍後再試。');
    }
}

// 建立單次強化的 Bubble
function buildSingleEnchantBubble(isSuccess, type, slot, equip, config, oldLvl, newLvl, scrollsLeft, costCount, enchantCount, lukBonus = 0, reqId = '', userId = '') { 
    const isAdmin = userId === ADMIN_USER_ID;
    const headerColor = isSuccess ? flexUtils.COLORS.SUCCESS : flexUtils.COLORS.DANGER;
    const headerTitle = isSuccess ? '✨ 強化成功' : '💥 強化失敗';
    const headerSub = isSuccess ? '裝備屬性提升' : '裝備已爆裂';
    
    const bodyItems = [