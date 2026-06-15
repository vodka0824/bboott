const { db } = require('../utils/db');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const economy = require('./economy');
const { ADMIN_USER_ID } = require('../config/constants');

const DEFAULT_EQUIPMENT_DATA = {
    equipments: {
        weapon: null,  // 武器
        shield: null,  // 盾牌
        wings: null,   // 翅膀
        gloves: null,  // 手套
        necklace: null,// 項鍊
        ring: null     // 戒指
    },
    scrolls: {
        weapon: 0,     // 武卷
        armor: 0,      // 防卷
        accessory: 0   // 飾品卷
    },
    enchantCount: 0    // 衝裝次數 (每100次升1級)
};

function generateReqId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

const EQUIP_TYPES = {
    weapon: { chinese: '武器', statKey: 'atk', displayName: '⚔️ 武器', scrollKey: 'weapon', scrollName: '武器強化卷軸 (武卷)' },
    shield: { chinese: '盾牌', statKey: 'def', displayName: '🛡️ 盾牌', scrollKey: 'armor', scrollName: '防具強化卷軸 (防卷)' },
    wings: { chinese: '翅膀', statKey: 'eva', displayName: '💨 翅膀', scrollKey: 'accessory', scrollName: '飾品強化卷軸 (飾品卷)' },
    gloves: { chinese: '手套', statKey: 'crit', displayName: '💥 手套', scrollKey: 'armor', scrollName: '防具強化卷軸 (防卷)' },
    necklace: { chinese: '項鍊', statKey: 'luk', displayName: '🍀 項鍊', scroll
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
        // 機率屬性：Base 5%, 線性成長
        let bonus = 0;
        for (let i = 1; i <= level; i++) {
            if (i <= 5) bonus += 1;
            else if (i <= 10) bonus += 2;
            else if (i <= 15) bonus += 3;
            else bonus += 4;
        }
        mainValue = 5 + bonus;
    }
    
    // 副屬性成長
    const isSubFlat = varConfig.sub === 'atk' || varConfig.sub === 'def';
    let subValue = 0;
    if (isSubFlat) {
        // Base 50, +15% 乘算
        subValue = Math.floor(50 * Math.pow(1.15, level));
    } else {
        // Base 2%, 每2級+1%
        subValue = 2 + Math.floor(level / 2);
    }
    