    const isSubFlat = varConfig.sub === 'atk' || varConfig.sub === 'def';
    let subValue = 0;
    if (isSubFlat) {
        // Base 50, +15% 乘算
        subValue = Math.floor(50 * Math.pow(1.15, level));
    } else {
        // Base 1%, 每3級+1%
        subValue = 1 + Math.floor(level / 3);
    }
    
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
            backupEquips: { weapon: null,
        { key: 'weapon', name: '武卷', icon: '📜' },
        { key: 'armor', name: '防卷', icon: '📜' },
        { key: 'accessory', name: '飾品卷', icon: '📜' }
    ];

    for (const scroll of scrollTypes) {
        scrollItems.push(
            flexUtils.createBox('horizontal', [
                flexUtils.createText({ text: `${scroll.icon} ${scroll.name}`, size: 'md', weight: 'bold', flex: 4 }),
                flexUtils.createText({ text: '$100/張', size: 'sm', color: '#D32F2F', weight: 'bold', flex: 3, align: 'end', gravity: 'center' }),
            ], { alignItems: 'center', margin: 'md' })
        );
        scrollItems.push(
            flexUtils.createBox('horizontal', [
                flexUtils.createButton({ 
                    action: { type: 'postback', label: '買 1 張', data: `action=buy_scroll&type=${scroll.key}&amount=1` },
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