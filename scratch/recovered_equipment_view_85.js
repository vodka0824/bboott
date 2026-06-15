    13: 0.10, // +13 -> +14
    14: 0.05, // +14 -> +15
};

function getNextLevelInfo(currentLvl, lukBonus) {
    if (currentLvl >= 15) return null;
    const baseRate = PROBABILITY[currentLvl] !== undefined ? PROBABILITY[currentLvl] : 0.05;
    const rate = baseRate >= 1.0 ? 1.0 : Math.min(0.99, baseRate * (1 + lukBonus));
    const ratePercent = (rate * 100).toFixed(1);
    
    let btnColor, btnText;
    if (rate >= 0.7) {
        btnColor = flexUtils.COLORS.SUCCESS;
        btnText = `✨ 衝 +${currentLvl + 1}`;
    } else if (rate >= 0.4) {
        btnColor = flexUtils.COLORS.PRIMARY;
        btnText = `🔥 衝 +${currentLvl + 1}`;
    } else if (rate >= 0.2) {
        btnColor = flexUtils.COLORS.WARNING;
        btnText = `⚠️ 衝 +${currentLvl + 1}`;
    } else {
        btnColor = flexUtils.COLORS.DANGER;
        btnText = `💀 衝 +${currentLvl + 1}`;
    }
    
    return { ratePercent, btnColor, btnText, isSafe: rate >= 1.0 };
}

function getFinalEquipStat(type, variant, level) {
    const config = EQUIP_TYPES[type];
    const varConfig = EQUIP_VARIANTS[type][variant] || EQUIP_VARIANTS[type][1];
    
    // 主屬性成長
    const isMainFlat = config.statKey === 'atk' || config.statKey === 'def';
    let mainValue = 0;
    if (isMainFlat) {
        // Base 100, +20% 乘算
        mainValue = Math.floor(100 * Math.pow(1.2, level));
    } else {
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