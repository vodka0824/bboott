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
        // 機率屬性：Base 5%, 緩慢成長
        let bonus = 0;
        for (let i = 1; i <= level; i++) {
            if (i <= 5) bonus += 0.5;
            else if (i <= 10) bonus += 1.0;
            else bonus += 1.5;
        }
        mainValue = 5 + Math.floor(bonus);
    }
    
    // 副屬性成長
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