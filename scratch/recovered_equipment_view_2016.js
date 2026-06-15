    return {
        main: { type: config.statKey, value: mainValue },
        sub: { type: varConfig.sub, value: subValue }
    };
}

function formatEquipStats(type, variant, level) {
    const stats = getFinalEquipStat(type, variant, level);
    if (!stats) return '';
    const mName = STAT_NAMES[stats.main.type];
    const sName = STAT_NAMES[stats.sub.type];
    const mSign = (stats.main.type === 'atk' || stats.main.type === 'def') ? '' : '%';
    const sSign = (stats.sub.type === 'atk' || stats.sub.type === 'def') ? '' : '%';
    return `${mName}+${stats.main.value}${mSign} / ${sName}+${stats.sub.value}${sSign}`;
}

/**
 * 取得或初始化裝備資料 (存於 players 集合中以優化效能)
 */
async function getEquipmentData(userId, t = null) {
    const docRef = db.collection('players').doc(userId);
    const doc = t ? await t.get(docRef) : await docRef.get();
    
    if (!doc.exists) {
        const newData = {
            equipments: { weapon: null, shield: null, wings: null, gloves: null, necklace: null, ring: null },
            backupEquips: { weapon: null, shield: null, wings: null, gloves: null, necklace: null, ring: null },
            scrolls: { weapon: 0, armor: 0, accessory: 0 },
            enchantCount: 0,
            lastEnchantReqId: '',
            enchantLastTimestamp: 0,
            enchantBurstCount: 0,
            enchantCooldownUntil: 0
        };
      
        if (scrolls[key] === undefined) scrolls[key] = 0;
    }
    
    return { 
        equipments, backupEquips, scrolls, enchantCount, docRef,
        lastEnchantReqId, enchantLastTimestamp, enchantBurstCount, enchantCooldownUntil,
        playerData: data
    };
}

/**
 * 顯示裝備店 Flex Message 目錄
 */
async function showEquipmentShop(replyToken) {
    const bubbles = [];

    // 1-6. 裝備分類 Bubble
    for (const type of ['weapon', 'shield', 'wings', 'gloves', 'necklace', 'ring']) {
        const config = EQUIP_TYPES[type];
        const variants = EQUIP_VARIANTS[type];
        
        const items = [];
        for (let variant = 1; variant <= 5; variant++) {
            let statText = formatEquipStats(type, variant, 0);

            items.push(
                flexUtils.createBox('horizontal', [
                    flexUtils.createBox('vertical', [
                        flexUtils.createText({ text: `[${variants[variant].subName}] ${variants[variant].name}`, size: 'sm', weight: 'bold', wrap: true }),
                        flexUtils.createText({ text: statText, size: 'xs', color: '#888888' })
                    ], { flex: 6, justifyContent: 'center' }),
                    flexUtils.createText({ text: `$100`, size: 'sm', color: '#D32F2F', weight: 'bold', flex: 2, align: 'center', gravity: 'center' }),
                    flexUtils.createButton({ 
                        action: { type: 'postback', label: '購買', data: `action=buy_equip&type=${type}&grade=${variant}` },
                        style: 'primary',
                        height: 'sm',
                        color: '#4CAF50',