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
        await docRef.set(newData, { merge: true });
        return { ...newData, docRef, playerData: newData };
    }
    
    const data = doc.data();
    const equipments = data.equipments || { ...DEFAULT_EQUIPMENT_DATA.equipments };
    const backupEquips = data.backupEquips || { weapon: null, shield: null, wings: null, gloves: null, necklace: null, ring: null };