                    style: 'secondary', height: 'sm', flex: 1, margin: 'xs'
                }),
                flexUtils.createButton({ 
                    action: { type: 'postback', label: '買 10 張', data: `action=buy_scroll&type=${scroll.key}&amount=10` },
                    style: 'primary', color: '#2196F3', height: 'sm', flex: 1, margin: 'xs'
                }),
                flexUtils.createButton({ 
                    action: { type: 'postback', label: '買 50 張', data: `action=buy_scroll&type=${scroll.key}&amount=50` },
                    style: 'primary', color: '#673AB7', height: 'sm', flex: 1, margin: 'xs'
                })
            ], { margin: 'sm' })
        );
        scrollItems.push(flexUtils.createSeparator('md'));
    }

    const scrollBubble = flexUtils.createBubble({
        size: 'mega',
        header: flexUtils.createHeader(`📜 神秘卷軸商`, '強化裝備必備', '#9C27B0'),
        body: flexUtils.createBox('vertical', scrollItems, { paddingAll: 'lg' })
    });
    bubbles.push(scrollBubble);

    const carousel = flexUtils.createCarousel(bubbles);
    await lineUtils.replyFlex(replyToken, '皇家裝備店 (支援輪播)', carousel);
}

/**
 * 購買裝備
 */
async function buyEquipment(replyToken, text, userId, groupId) {
    const match = text.trim().match(/^(?:買|購買|買裝備|購買裝備)\s*(武器|盾牌|翅膀|手套|項鍊|戒指)\s*([1-5])$/i
            if (nextInfo) {
                bodyItems.push(flexUtils.createText({ text: `📈 下一階成功率：${nextInfo.ratePercent}% ${lukBonus > 0 ? '(含幸運)' : ''}`, size: 'xs', color: '#E91E63', margin: 'xs', weight: 'bold' }));
                footerItems.push(
                        flexUtils.createBox('horizontal', [
                            flexUtils.createButton({ action: { type: 'postback', label: nextInfo.btnText, data: `action=enchant_equip&type=${type}&slot=${slot}&times=1&reqId=${newReqId}` }, style: 'primary', height: 'sm', color: nextInfo.btnColor, margin: 'xs', flex: 3 }),
                            flexUtils.createButton({ action: { type: 'postback', label: `⚡連x3`, data: `action=enchant_equip&type=${type}&slot=${slot}&times=3&reqId=${newReqId}` }, style: 'secondary', height: 'sm', margin: 'xs', flex: 2 }),
                            flexUtils.createButton({ action: { type: 'postback', label: `🔥連x5`, data: `action=enchant_equip&type=${type}&slot=${slot}&times=5&reqId=${newReqId}` }, style: 'primary', color: '#FF9800', height: 'sm', margin: 'xs', flex: 2 })
                        ], { margin: 'sm' }),
                        flexUtils.createBox('horizontal', [
                            flexUtils.createButton({ action: { type: 'postback', label: `💥狂衝x8`, data: `action=enchant_equip&type=${type}&slot=${slot}&times=8&reqId=${newReqId}` }, style: 'primary', color: '#E91E63', height: 'sm', margin: 'xs', flex: 3 }),
                            ...(userId === ADMIN_USER_ID ? [flexUtils.createButton({ action: { type: 'postback', label: `👽作弊+1`, data: `action=enchant_equip&type=${type}&slot=${slot}&times=1&reqId=${newReqId}&cheat=true` }, style: 'primary', height: 'sm', color: '#9C27B0',