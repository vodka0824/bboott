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
        await docRef.set(newData, { merge: true });
        return { ...newData, docRef, playerData: newData };
    }
    
    const data = doc.data();
    const equipments = data.equipments || { ...DEFAULT_EQUIPMENT_DATA.equipments };
    const backupEquips = data.backupEquips || { weapon: null, shield: null, wings: null, gloves: null, necklace: null, ring: null };
    const scrolls = data.scrolls || { ...DEFAULT_EQUIPMENT_DATA.scrolls };
    const enchantCount = data.enchantCount || 0;
    const lastEnchantReqId = data.lastEnchantReqId || '';
    const enchantLastTimestamp = data.enchantLastTimestamp || 0;
    const enchantBurstCount = data.enchantBurstCount || 0;
    const enchantCooldownUntil = data.enchantCooldownUntil || 0;
    
    }
    for (const key in DEFAULT_EQUIPMENT_DATA.scrolls) {
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