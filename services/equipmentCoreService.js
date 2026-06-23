const { Firestore } = require('@google-cloud/firestore');
const { db } = require('../utils/db');
const COLLECTION_NAME = 'economy_users';
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const authUtils = require('../utils/auth');
const economyHandler = require('../handlers/economy');
const professionHandler = require('../handlers/profession');
const rpgHandler = require('../handlers/rpg');

const { ADMIN_USER_ID } = require('../config/constants');

function generateReqId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

const DEFAULT_EQUIPMENT_DATA = {
    equipments: { weapon: null, shield: null, wings: null, gloves: null, necklace: null, ring: null },
    backupEquips: { weapon: null, shield: null, wings: null, gloves: null, necklace: null, ring: null },
    scrolls: { weapon: 0, armor: 0, accessory: 0 },
    enchantCount: 0,
    lastEnchantReqId: '',
    enchantLastTimestamp: 0,
    enchantBurstCount: 0,
    enchantCooldownUntil: 0
};
const EQUIP_TYPES = {
    weapon: { chinese: '武器', statKey: 'atk', displayName: '⚔️ 武器', scrollKey: 'weapon', scrollName: '武器強化卷軸 (武卷)' },
    shield: { chinese: '盾牌', statKey: 'def', displayName: '🛡️ 盾牌', scrollKey: 'armor', scrollName: '防具強化卷軸 (防卷)' },
    wings: { chinese: '翅膀', statKey: 'eva', displayName: '💨 翅膀', scrollKey: 'accessory', scrollName: '飾品強化卷軸 (飾品卷)' },
    gloves: { chinese: '手套', statKey: 'crit', displayName: '💥 手套', scrollKey: 'armor', scrollName: '防具強化卷軸 (防卷)' },
    necklace: { chinese: '項鍊', statKey: 'luk', displayName: '🍀 項鍊', scrollKey: 'accessory', scrollName: '飾品強化卷軸 (飾品卷)' },
    ring: { chinese: '戒指', statKey: 'pen', displayName: '💍 戒指', scrollKey: 'accessory', scrollName: '飾品強化卷軸 (飾品卷)' }
};

const EQUIP_VARIANTS = {
    weapon: {
        1: { name: '鐵壁劍', sub: 'def', subName: '防禦' },
        2: { name: '狂戰斧', sub: 'crit', subName: '爆擊' },
        3: { name: '幻影刃', sub: 'eva', subName: '迴避' },
        4: { name: '幸運星', sub: 'luk', subName: '幸運' },
        5: { name: '破甲槍', sub: 'pen', subName: '穿透' }
    },
    shield: {
        1: { name: '反擊盾', sub: 'atk', subName: '攻擊' },
        2: { name: '尖刺盾', sub: 'crit', subName: '爆擊' },
        3: { name: '輕靈盾', sub: 'eva', subName: '迴避' },
        4: { name: '幸運護額', sub: 'luk', subName: '幸運' },
        5: { name: '破防巨盾', sub: 'pen', subName: '穿透' }
    },
    wings: {
        1: { name: '戰神之翼', sub: 'atk', subName: '攻擊' },
        2: { name: '守護之翼', sub: 'def', subName: '防禦' },
        3: { name: '致命之羽', sub: 'crit', subName: '爆擊' },
        4: { name: '幸運披風', sub: 'luk', subName: '幸運' },
        5: { name: '虛空之翼', sub: 'pen', subName: '穿透' }
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
    const scrolls = data.scrolls || { ...DEFAULT_EQUIPMENT_DATA.scrolls };
    const enchantCount = data.enchantCount || 0;
    const lastEnchantReqId = data.lastEnchantReqId || '';
    const enchantLastTimestamp = data.enchantLastTimestamp || 0;
    const enchantBurstCount = data.enchantBurstCount || 0;
    const enchantCooldownUntil = data.enchantCooldownUntil || 0;
    
    // 補全可能缺少的欄位
    for (const key in DEFAULT_EQUIPMENT_DATA.equipments) {
        if (equipments[key] === undefined) equipments[key] = null;
        if (backupEquips[key] === undefined) backupEquips[key] = null;
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
 * 計算裝備帶來的 LUK 加成百分比
 */
function calculateLukBonus(playerData, equipments) {
    let luk = playerData && playerData.rpg ? (playerData.rpg.luk || 0) : 0;
    let additionsLuk = 0;
    for (const p of ['weapon', 'shield', 'wings', 'gloves', 'necklace', 'ring']) {
        if (equipments[p]) {
            const stats = getFinalEquipStat(p, equipments[p].grade, equipments[p].level);
            if (stats && stats.main && stats.main.type === 'luk') additionsLuk += stats.main.value;
            if (stats && stats.sub && stats.sub.type === 'luk') additionsLuk += stats.sub.value;
        }
    }
    let cappedLuk = Math.min(80, luk + additionsLuk);
    return cappedLuk * 0.005;
}

/**
 * 計算玩家目前「裝備中」的屬性總和
 */
function calculateTotalStats(equipments) {
    let totals = { atk: 0, def: 0, eva: 0, crit: 0, luk: 0, pen: 0 };
    for (const p of ['weapon', 'shield', 'wings', 'gloves', 'necklace', 'ring']) {
        if (equipments[p]) {
            const stats = getFinalEquipStat(p, equipments[p].grade, equipments[p].level);
            if (stats && stats.main) totals[stats.main.type] += stats.main.value;
            if (stats && stats.sub) totals[stats.sub.type] += stats.sub.value;
        }
    }
    return totals;
}

/**
 * 顯示裝備店 Flex Message 目錄
 */

function buildSingleEnchantBubble(isSuccess, type, slot, equip, config, oldLvl, newLvl, scrollsLeft, costCount, enchantCount, lukBonus = 0, reqId = '', userId = '', newBalance = null) { 
    const isAdmin = userId === ADMIN_USER_ID;
    const headerColor = isSuccess ? flexUtils.COLORS.SUCCESS : flexUtils.COLORS.DANGER;
    const headerTitle = isSuccess ? '✨ 強化成功' : '💥 強化失敗';
    const headerSub = isSuccess ? '裝備屬性提升' : '裝備已爆裂';
    
    const bodyItems = [
        flexUtils.createText({ text: `消耗 ${costCount} 張 ${config.scrollName}`, size: 'xs', color: flexUtils.COLORS.GRAY }),
        flexUtils.createSeparator('sm')
    ];
    
    if (isSuccess) {
        bodyItems.push(flexUtils.createText({ text: `[${equip.name}] 成功強化為 +${newLvl}！`, weight: 'bold', size: 'md', margin: 'md', wrap: true }));
        bodyItems.push(flexUtils.createText({ text: `屬性加成提升為：\n${formatEquipStats(type, equip.grade, newLvl)}`, size: 'sm', color: flexUtils.COLORS.PRIMARY, weight: 'bold', wrap: true }));
        const stars = '★'.repeat(Math.min(newLvl, 5)) + '☆'.repeat(Math.max(0, 5 - newLvl));
        bodyItems.push(flexUtils.createText({ text: `星級: ${stars}`, size: 'md', color: flexUtils.COLORS.PRIMARY, weight: 'bold', margin: 'sm' }));
    } else {
        bodyItems.push(flexUtils.createText({ text: `激烈的銀色光芒閃爍後...`, size: 'sm', margin: 'md' }));
        bodyItems.push(flexUtils.createText({ text: `你的 +${oldLvl} [${equip.name}] 碎裂化為灰燼...`, weight: 'bold', size: 'sm', color: flexUtils.COLORS.DANGER, wrap: true, margin: 'sm' }));
    }
    
    bodyItems.push(flexUtils.createText({ text: `📜 剩餘 ${config.scrollName.substring(0,2)}：${scrollsLeft} 張`, size: 'xs', color: '#555555', margin: 'sm' }));
    
    if (newBalance !== null) {
        bodyItems.push(flexUtils.createSeparator('md'));
        bodyItems.push(flexUtils.createText({ text: `💰 結算總資產：${newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: flexUtils.COLORS.BG_CARD, margin: 'md' }));
    }
    
    const footerItems = [];
    if (!isSuccess) {
        footerItems.push(flexUtils.createButton({ action: { type: 'postback', label: `買回並直升+4`, data: `action=buy_and_safe_enchant&type=${type}&slot=${slot}&grade=${equip.grade}&reqId=${reqId}` }, style: 'primary', color: flexUtils.COLORS.DANGER, margin: 'sm' }));
        footerItems.push(flexUtils.createButton({ action: { type: 'postback', label: '補充卷軸x5', data: `action=buy_scroll&type=${config.scrollKey}&amount=5` }, style: 'secondary', margin: 'sm' }));
    } else if (newLvl < 15) {
        const nextInfo = getNextLevelInfo(newLvl, lukBonus);
        if (nextInfo) {
            bodyItems.push(flexUtils.createText({ text: `📈 下一階成功率：${nextInfo.ratePercent}% ${lukBonus > 0 ? '(含幸運)' : ''}`, size: 'xs', color: '#E91E63', margin: 'xs', weight: 'bold' }));
            footerItems.push(
                flexUtils.createBox('horizontal', [
                    flexUtils.createButton({ action: { type: 'postback', label: nextInfo.btnText, data: `action=enchant_equip&type=${type}&slot=${slot}&times=1&reqId=${reqId}` }, style: 'primary', height: 'sm', color: nextInfo.btnColor, margin: 'xs', flex: 3 }),
                    flexUtils.createButton({ action: { type: 'postback', label: `⚡連x3`, data: `action=enchant_equip&type=${type}&slot=${slot}&times=3&reqId=${reqId}` }, style: 'secondary', height: 'sm', margin: 'xs', flex: 2 }),
                    flexUtils.createButton({ action: { type: 'postback', label: `🔥連x5`, data: `action=enchant_equip&type=${type}&slot=${slot}&times=5&reqId=${reqId}` }, style: 'primary', color: flexUtils.COLORS.SECONDARY, height: 'sm', margin: 'xs', flex: 2 })
                ], { margin: 'sm' }),
                flexUtils.createBox('horizontal', [
                    flexUtils.createButton({ action: { type: 'postback', label: `💥狂衝x8`, data: `action=enchant_equip&type=${type}&slot=${slot}&times=8&reqId=${reqId}` }, style: 'primary', color: '#E91E63', height: 'sm', margin: 'xs', flex: 3 }),
                ], { margin: 'sm' })
            );
        }
    }
    footerItems.push(flexUtils.createButton({ action: { type: 'message', label: '🛡️ 我的背包', text: '我的裝備' }, style: 'secondary', margin: 'sm' }));
    
    return flexUtils.createBubble({
        size: 'mega',
        header: flexUtils.createHeader(headerTitle, headerSub, headerColor),
        body: flexUtils.createBox('vertical', bodyItems, { backgroundColor: flexUtils.COLORS.BG_MAIN, paddingAll: 'xl'  }),
        footer: flexUtils.createBox('vertical', footerItems, { paddingAll: 'md' })
    });
}



module.exports = {
    generateReqId,
    EQUIP_TYPES,
    EQUIP_VARIANTS,
    PROBABILITY,
    getNextLevelInfo,
    getFinalEquipStat,
    formatEquipStats,
    getEquipmentData,
    calculateLukBonus,
    calculateTotalStats,
    buildSingleEnchantBubble
};
