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
    },
    gloves: {
        1: { name: '力量手套', sub: 'atk', subName: '攻擊' },
        2: { name: '重裝臂鎧', sub: 'def', subName: '防禦' },
        3: { name: '盜賊手套', sub: 'eva', subName: '迴避' },
        4: { name: '幸運手鐲', sub: 'luk', subName: '幸運' },
        5: { name: '破甲拳套', sub: 'pen', subName: '穿透' }
    },
    necklace: {
        1: { name: '力量項鍊', sub: 'atk', subName: '攻擊' },
        2: { name: '守護項鍊', sub: 'def', subName: '防禦' },
        3: { name: '刺客項鍊', sub: 'crit', subName: '爆擊' },
        4: { name: '疾風項鍊', sub: 'eva', subName: '迴避' },
        5: { name: '破甲墜飾', sub: 'pen', subName: '穿透' }
    },
    ring: {
        1: { name: '力量戒指', sub: 'atk', subName: '攻擊' },
        2: { name: '守護戒指', sub: 'def', subName: '防禦' },
        3: { name: '致命戒指', sub: 'crit', subName: '爆擊' },
        4: { name: '疾風戒指', sub: 'eva', subName: '迴避' },
        5: { name: '幸運戒指', sub: 'luk', subName: '幸運' }
    }
};

const STAT_NAMES = {
    atk: '攻擊', def: '防禦', eva: '迴避', crit: '爆擊', luk: '幸運', pen: '穿透'
};

const PROBABILITY = {
    0: 1.0,  // +0 -> +1 (100% 成功)
    1: 1.0,  // +1 -> +2
    2: 1.0,  // +2 -> +3
    3: 1.0,  // +3 -> +4 (安全期上限)
    4: 0.70, // +4 -> +5
    5: 0.60, // +5 -> +6
    6: 0.50, // +6 -> +7
    7: 0.40, // +7 -> +8
    8: 0.35, // +8 -> +9
    9: 0.30, // +9 -> +10
    10: 0.25, // +10 -> +11
    11: 0.20, // +11 -> +12
    12: 0.15, // +12 -> +13
    13: 0.10, // +13 -> +14