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
                        flex: 3,
                        margin: 'sm'
                    })
                ], { alignItems: 'center', margin: 'md' })
            );
        }

        const bubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader(`🏪 皇家裝備店 - ${config.chinese}`, '選擇裝備以購買', '#FF9800'),
            body: flexUtils.createBox('vertical', items, { paddingAll: 'lg' })
        });
        bubbles.push(bubble);
    }

    // 5. 卷軸分類 Bubble
    const scrollItems = [];
    const scrollTypes = [
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
    const match = text.trim().match(/^(?:買|購買|買裝備|購買裝備)\s*(武器|盾牌|翅膀|手套|項鍊|戒指)\s*([1-5])$/i);
    if (!match) {
        await lineUtils.replyText(replyToken, '❌ 找不到該裝備項目或格式錯誤！請輸入「裝備店」查看所有可購買商品。\n格式範例：買武器3 或 購買 武器 3');
        return;
    }
    
    const typeChinese = match[1];
    const grade = parseInt(match[2], 10);
    
    const typeMap = {
        '武器': 'weapon',
        '盾牌': 'shield',
        '翅膀': 'wings',
        '手套': 'gloves',
        '項鍊': 'necklace',
        '戒指': 'ring'
    };
    const type = typeMap[typeChinese];
    const config = EQUIP_TYPES[type];
    
    const price = 100; // 測試期間售價為 100 哭幣
    
    try {
        const result = await db.runTransaction(async (t) => {
            const { equipments, scrolls, docRef } = await getEquipmentData(userId, t);
            
            const consumeResult = await economy.consumeCoin(groupId, userId, price, true, t);
            if (!consumeResult.success) {
                return { success: false, reason: 'insufficient' };
            }
            
            const oldEquip = equipments[type];
            const equipName = EQUIP_VARIANTS[type][grade]?.name || `${typeChinese}${grade}`;
            
            equipments[type] = {
                name: equipName,
                grade: grade, // 在新系統中 grade 代表 variant
                level: 0
            };
            
            t.set(docRef, { equipments }, { merge: true });
            
            return { success: true, oldEquip, equipName };
        });

        if (!result.success) {
            if (result.reason === 'insufficient') {
                await lineUtils.replyText(replyToken, `❌ 購買失敗：您的餘額不足 ${price} 哭幣！`);
            }
            return;
        }

        const { oldEquip, equipName } = result;
        const oldText = oldEquip ? `\n(已覆蓋您原本的 +${oldEquip.level} ${oldEquip.name})` : '';
        
        const msg = [
            `⚒️ 購買裝備成功！`,
            `花費了 ${price} 哭幣購買了全新的 [${equipName}] (初始數值 ${formatEquipStats(type, grade, 0)})。`,
            `裝備已自動穿戴至 ${config.displayName} 欄位！${oldText}`
        ].join('\n');
        
        await lineUtils.replyText(replyToken, msg);
    } catch (e) {
        console.error('[Equipment] buyEquipment Error:', e);
        await lineUtils.replyText(replyToken, '❌ 購買裝備失敗，系統發生錯誤。');
    }
}

/**
 * 購買卷軸
 */
async function buyScrolls(replyToken, text, userId, groupId) {
    const match = text.trim().match(/^(?:買|購買|買卷軸|買卷)\s*(武卷|防卷|飾品卷)\s*(\d+)(?:張|個)?$/i);
    if (!match) {
        await lineUtils.replyText(replyToken, '❌ 卷軸購買指令格式錯誤。\n正確格式：買卷軸 [卷種] [數量] (例如: 買武卷5 或 購買 武卷 5張)\n範例：買卷軸 武卷 5');
        return;
    }
    
    const scrollTypeChinese = match[1];
    const amount = parseInt(match[2], 10);
    
    if (isNaN(amount) || amount <= 0) {
        await lineUtils.replyText(replyToken, '❌ 購買數量必須是大於 0 的整數。');
        return;
    }
    
    const scrollTypeMap = {
        '武卷': 'weapon',
        '防卷': 'armor',
        '飾品卷': 'accessory',
        '武': 'weapon',
        '防': 'armor',
        '飾品': 'accessory'
    };
    const scrollKey = scrollTypeMap[scrollTypeChinese];
    
    // 統一回覆時使用的名稱
    const displayTypeMap = {
        'weapon': '武卷',
        'armor': '防卷',
        'accessory': '飾品卷'
    };
    const displayScrollName = displayTypeMap[scrollKey];
    const price = amount * 100; // 測試期間統一為 100 哭幣
    
    try {
        const result = await db.runTransaction(async (t) => {
            const { equipments, scrolls, docRef } = await getEquipmentData(userId, t);
            
            const consumeResult = await economy.consumeCoin(groupId, userId, price, false, t);
            if (!consumeResult.success) {
                return { success: false, reason: 'insufficient' };
            }
            
            scrolls[scrollKey] = (scrolls[scrollKey] || 0) + amount;
            
            t.set(docRef, { scrolls }, { merge: true });
            
            return { success: true, newScrolls: scrolls };
        });

        if (!result.success) {
            if (result.reason === 'insufficient') {
                await lineUtils.replyText(replyToken, `❌ 購買失敗：您的餘額不足 ${price} 哭幣！`);
            }
            return;
        }

        const scrolls = result.newScrolls;
        await lineUtils.replyText(replyToken, `🛒 卷軸購買成功！\n花費了 ${price} 哭幣購買了 ${amount} 張 ${displayScrollName}。\n目前剩餘卷軸：武卷 ${scrolls.weapon} 張 | 防卷 ${scrolls.armor} 張 | 飾品卷 ${scrolls.accessory} 張`);
    } catch (e) {
        console.error('[Equipment] buyScrolls Error:', e);
        await lineUtils.replyText(replyToken, '❌ 購買卷軸失敗，系統發生錯誤。');
    }
}

/**
 * 查看當前裝備
 */
async function showMyEquipments(replyToken, userId) {
    try {
        const { equipments, backupEquips, scrolls, enchantCount } = await getEquipmentData(userId);
        
        const { getFinalPlayerStats, getPlayerTitle } = require('./rpg');
        const stats = await getFinalPlayerStats(userId);
        const level = stats.level || 1;
        const { title: playerTitle, color: titleColor } = getPlayerTitle(level);
        
        const bubbles = [];
        
        for (const type of ['weapon', 'shield', 'wings', 'gloves', 'necklace', 'ring']) {
            const config = EQUIP_TYPES[type];
            const mainEquip = equipments[type];
            const backupEquip = backupEquips[type];
            const isAdmin = userId === ADMIN_USER_ID;
            
            const bodyItems = [];
            
            // --- 🟢 裝備中 (Main Slot) ---
            const mainItems = [
                flexUtils.createText({ text: '🟢 裝備中 (套用屬性)', size: 'xs', weight: 'bold', color: '#4CAF50', margin: 'sm' })
            ];
            
            if (mainEquip) {
                mainItems.push(flexUtils.createBox('horizontal', [
                    flexUtils.createText({ text: `+${mainEquip.level} ${mainEquip.name}`, size: 'md', weight: 'bold', color: '#1976D2', flex: 7, wrap: true }),
                    flexUtils.createText({ text: `(${formatEquipStats(type, mainEquip.grade, mainEquip.level)})`, size: 'xs', color: '#E91E63', flex: 6, align: 'end', wrap: true })
                ], { alignItems: 'center', margin: 'sm' }));
                
                if (mainEquip.level === 0) {
                    const reqId = generateReqId();
                    mainItems.push(flexUtils.createBox('horizontal', [
                        flexUtils.createButton({ action: { type: 'postback', label: `🔨 直升+4 (扣4卷)`, data: `action=enchant_equip&type=${type}&slot=main&times=4&reqId=${reqId}` }, style: 'primary', height: 'sm', color: '#FF9800', margin: 'xs', flex: 3 }),
                        flexUtils.createButton({ action: { type: 'postback', label: `卸下至備用`, data: `action=swap_equip&type=${type}` }, style: 'secondary', height: 'sm', margin: 'xs', flex: 2 })
                    ], { margin: 'sm' }));
                } else if (mainEquip.level < 15) {
                    const reqId = generateReqId();
                    mainItems.push(flexUtils.createBox('horizontal', [
                        flexUtils.createButton({ action: { type: 'postback', label: `⚡衝`, data: `action=enchant_equip&type=${type}&slot=main&times=1&reqId=${reqId}` }, style: 'primary', height: 'sm', color: '#FF5722', margin: 'xs', flex: 1 }),
                        flexUtils.createButton({ action: { type: 'postback', label: `⚡連x3`, data: `action=enchant_equip&type=${type}&slot=main&times=3&reqId=${reqId}` }, style: 'secondary', height: 'sm', margin: 'xs', flex: 2 }),
                        flexUtils.createButton({ action: { type: 'postback', label: `🔥連x5`, data: `action=enchant_equip&type=${type}&slot=main&times=5&reqId=${reqId}` }, style: 'primary', color: '#FF9800', height: 'sm', margin: 'xs', flex: 2 })
                    ], { margin: 'sm' }));
                    mainItems.push(flexUtils.createBox('horizontal', [
                        flexUtils.createButton({ action: { type: 'postback', label: `💥狂衝x8`, data: `action=enchant_equip&type=${type}&slot=main&times=8&reqId=${reqId}` }, style: 'primary', color: '#E91E63', height: 'sm', margin: 'xs', flex: 3 }),
                        flexUtils.createButton({ action: { type: 'postback', label: `卸下至備用`, data: `action=swap_equip&type=${type}` }, style: 'secondary', height: 'sm', margin: 'xs', flex: 3 })
                    ], { margin: 'xs' }));
                } else {
                    mainItems.push(flexUtils.createBox('horizontal', [
                        flexUtils.createText({ text: '🌟 已達最高神兵等級 🌟', size: 'sm', color: '#E91E63', weight: 'bold', align: 'center', flex: 1 }),
                        flexUtils.createButton({ action: { type: 'postback', label: `卸下至備用`, data: `action=swap_equip&type=${type}` }, style: 'secondary', height: 'sm', margin: 'xs', flex: 1 })
                    ], { margin: 'sm', alignItems: 'center' }));
                }
            } else {
                mainItems.push(flexUtils.createText({ text: '無裝備', size: 'sm', color: '#AAAAAA', margin: 'sm', align: 'center' }));
                mainItems.push(flexUtils.createButton({ action: { type: 'message', label: '🏪 前往商店購買', text: '裝備店' }, style: 'secondary', height: 'sm', margin: 'sm' }));
            }
            
            bodyItems.push(flexUtils.createBox('vertical', mainItems, { backgroundColor: '#F4FAFF', paddingAll: 'md', cornerRadius: 'md' }));
            bodyItems.push(flexUtils.createSeparator('md'));
            
            // --- 🎒 備用欄 (Backup Slot) ---
            const backupItems = [
                flexUtils.createText({ text: '🎒 備用欄 (單純存放與強化)', size: 'xs', weight: 'bold', color: '#795548', margin: 'sm' })
            ];
            
            if (backupEquip) {
                backupItems.push(flexUtils.createBox('horizontal', [
                    flexUtils.createText({ text: `+${backupEquip.level} ${backupEquip.name}`, size: 'md', weight: 'bold', color: '#607D8B', flex: 7, wrap: true }),
                    flexUtils.createText({ text: `(${formatEquipStats(type, backupEquip.grade, backupEquip.level)})`, size: 'xs', color: '#9E9E9E', flex: 6, align: 'end', wrap: true })
                ], { alignItems: 'center', margin: 'sm' }));
                
                if (backupEquip.level === 0) {
                    const reqId = generateReqId();
                    backupItems.push(flexUtils.createBox('horizontal', [
                        flexUtils.createButton({ action: { type: 'postback', label: `🔨 直升+4 (扣4卷)`, data: `action=enchant_equip&type=${type}&slot=backup&times=4&reqId=${reqId}` }, style: 'primary', height: 'sm', color: '#FF9800', margin: 'xs', flex: 3 }),
                        flexUtils.createButton({ action: { type: 'postback', label: `替換上陣`, data: `action=swap_equip&type=${type}` }, style: 'secondary', height: 'sm', margin: 'xs', flex: 2 })
                    ], { margin: 'sm' }));
                } else if (backupEquip.level < 15) {
                    const reqId = generateReqId();
                    backupItems.push(flexUtils.createBox('horizontal', [
                        flexUtils.createButton({ action: { type: 'postback', label: `⚡衝`, data: `action=enchant_equip&type=${type}&slot=backup&times=1&reqId=${reqId}` }, style: 'primary', height: 'sm', color: '#FF5722', margin: 'xs', flex: 1 }),
                        flexUtils.createButton({ action: { type: 'postback', label: `⚡連x3`, data: `action=enchant_equip&type=${type}&slot=backup&times=3&reqId=${reqId}` }, style: 'secondary', height: 'sm', margin: 'xs', flex: 2 }),
                        flexUtils.createButton({ action: { type: 'postback', label: `🔥連x5`, data: `action=enchant_equip&type=${type}&slot=backup&times=5&reqId=${reqId}` }, style: 'primary', color: '#FF9800', height: 'sm', margin: 'xs', flex: 2 })
                    ], { margin: 'sm' }));
                    backupItems.push(flexUtils.createBox('horizontal', [
                        flexUtils.createButton({ action: { type: 'postback', label: `💥狂衝x8`, data: `action=enchant_equip&type=${type}&slot=backup&times=8&reqId=${reqId}` }, style: 'primary', color: '#E91E63', height: 'sm', margin: 'xs', flex: 3 }),
                        flexUtils.createButton({ action: { type: 'postback', label: `替換上陣`, data: `action=swap_equip&type=${type}` }, style: 'secondary', height: 'sm', margin: 'xs', flex: 3 })
                    ], { margin: 'xs' }));
                } else {
                    backupItems.push(flexUtils.createBox('horizontal', [
                        flexUtils.createText({ text: '🌟 已達最高神兵等級 🌟', size: 'sm', color: '#E91E63', weight: 'bold', align: 'center', flex: 1 }),
                        flexUtils.createButton({ action: { type: 'postback', label: `替換上陣`, data: `action=swap_equip&type=${type}` }, style: 'secondary', height: 'sm', margin: 'xs', flex: 1 })
                    ], { margin: 'sm', alignItems: 'center' }));
                }
            } else {
                backupItems.push(flexUtils.createText({ text: '無裝備', size: 'sm', color: '#AAAAAA', margin: 'sm', align: 'center' }));
            }
            
            bodyItems.push(flexUtils.createBox('vertical', backupItems, { backgroundColor: '#FAFAFA', paddingAll: 'md', cornerRadius: 'md', margin: 'md' }));
            
            const header = flexUtils.createHeader(`${config.displayName}`, `${playerTitle}  |  Lv.${level}`, titleColor);
            const body = flexUtils.createBox('vertical', bodyItems, { paddingAll: 'md' });
            
            bubbles.push(flexUtils.createBubble({ size: 'mega', header, body }));
        }
        
        // --- 📜 卷軸與商店 ---
        const inventoryHeader = flexUtils.createHeader('🎒 我的資源與卷軸', `冒險等級: Lv.${level}`, '#9C27B0');
        const inventoryBody = flexUtils.createBox('vertical', [
            flexUtils.createText({ text: '目前的卷軸庫存', size: 'xs', weight: 'bold', color: '#673AB7', margin: 'md' }),
            flexUtils.createBox('horizontal', [
                flexUtils.createText({ text: `📜 武卷: ${scrolls.weapon} 張`, size: 'sm', weight: 'bold', flex: 1, color: '#333333' }),
                flexUtils.createText({ text: `📜 防卷: ${scrolls.armor} 張`, size: 'sm', weight: 'bold', flex: 1, color: '#333333' })
            ], { margin: 'md' }),
            flexUtils.createBox('horizontal', [
                flexUtils.createText({ text: `📜 飾品卷: ${scrolls.accessory} 張`, size: 'sm', weight: 'bold', flex: 1, color: '#333333' }),
                flexUtils.createText({ text: `(已強化 ${enchantCount} 次)`, size: 'xs', color: '#9E9E9E', flex: 1, align: 'end' })
            ], { margin: 'md' }),
            flexUtils.createSeparator('md'),
            flexUtils.createText({ text: '快速補充卷軸 ($1000/10張)', size: 'xs', weight: 'bold', color: '#E91E63', margin: 'md' }),
            flexUtils.createBox('horizontal', [
                flexUtils.createButton({ action: { type: 'postback', label: '買武卷x10', data: `action=buy_scroll&type=weapon&amount=10` }, style: 'secondary', height: 'sm', margin: 'xs', flex: 1 }),
                flexUtils.createButton({ action: { type: 'postback', label: '買防卷x10', data: `action=buy_scroll&type=armor&amount=10` }, style: 'secondary', height: 'sm', margin: 'xs', flex: 1 })
            ], { margin: 'sm' })
        ], { paddingAll: 'lg' });
        const inventoryFooter = flexUtils.createBox('horizontal', [
            flexUtils.createButton({ action: { type: 'message', label: '🏪 前往皇家裝備店', text: '裝備店' }, style: 'primary', color: '#9C27B0' })
        ], { paddingAll: 'md' });
        
        bubbles.push(flexUtils.createBubble({ size: 'mega', header: inventoryHeader, body: inventoryBody, footer: inventoryFooter }));
        
        const carousel = flexUtils.createCarousel(bubbles);
        await lineUtils.replyFlex(replyToken, '我的裝備與背包', carousel);
    } catch (e) {
        console.error('[Equipment] showMyEquipments Error:', e);
        await lineUtils.replyText(replyToken, '❌ 讀取裝備失敗。');
    }
}

/**
 * 強化裝備 (衝裝)
 */
async function enchantEquipment(replyToken, text, userId, groupId) {
    const match = text.trim().match(/^(?:強化|衝|點|衝裝|升級)\s*(?:裝備)?\s*(武器|盾牌|翅膀|手套|項鍊|戒指)$/i);
    if (!match) return;
    
    const partChinese = match[1];
    const typeMap = {
        '武器': 'weapon',
        '盾牌': 'shield',
        '翅膀': 'wings',
        '手套': 'gloves',
        '項鍊': 'necklace',
        '戒指': 'ring'
    };
    const type = typeMap[partChinese];
    const config = EQUIP_TYPES[type];
    
    try {
        const result = await db.runTransaction(async (t) => {
            const data = await getEquipmentData(userId, t);
            let { equipments, backupEquips, scrolls, enchantCount, docRef, enchantCooldownUntil, enchantLastTimestamp, enchantBurstCount, playerData } = data;
            
            // 計算 LUK Bonus
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
            const lukBonus = cappedLuk * 0.005;
            
            let equip = equipments[type];
            let slot = 'main';
            if (!equip) {
                if (backupEquips[type]) {
                    equip = backupEquips[type];
                    slot = 'backup';
                } else {
                    return { success: false, reason: 'no_equip', slotName: config.displayName };
                }
            }
            
            const now = Date.now();
            enchantCooldownUntil = enchantCooldownUntil || 0;
            enchantLastTimestamp = enchantLastTimestamp || 0;
            enchantBurstCount = enchantBurstCount || 0;

            if (enchantCooldownUntil > now) {
                const leftSec = Math.ceil((enchantCooldownUntil - now) / 1000);
                return { success: false, reason: 'cooldown', leftSec };
            }

            let newBurstCount = enchantBurstCount;
            let newCooldownUntil = 0;
            if (now - enchantLastTimestamp < 2000) {
                newBurstCount += 1;
            } else {
                newBurstCount = 1;
            }

            if (newBurstCount > 5) {
                newCooldownUntil = now + 10000;
                newBurstCount = 0;
                t.set(docRef, { enchantLastTimestamp: now, enchantBurstCount: newBurstCount, enchantCooldownUntil: newCooldownUntil }, { merge: true });
                return { success: false, reason: 'burst_cooldown' };
            }

            const currentLvl = equip.level;
            if (currentLvl >= 15) {
                return { success: false, reason: 'max_level', equipName: equip.name };
            }
            
            const scrollKey = config.scrollKey;
            if ((scrolls[scrollKey] || 0) <= 0) {
                return { success: false, reason: 'no_scroll', scrollName: config.scrollName };
            }
            
            // 扣除 1 張卷軸
            scrolls[scrollKey] -= 1;
            
            // 增加衝裝次數 (僅供統計)
            const newEnchantCount = enchantCount + 1;

            // 計算強化機率
            const baseRate = PROBABILITY[currentLvl] !== undefined ? PROBABILITY[currentLvl] : 0.05;
            const rate = baseRate >= 1.0 ? 1.0 : Math.min(0.99, baseRate * (1 + lukBonus));
            const isSuccess = Math.random() < rate;
            
            let failedEquip = null;
            let nextLvl = currentLvl;

            if (isSuccess) {
                nextLvl = currentLvl + 1;
                equip.level = nextLvl;
            } else {
                // 爆裝消失
                failedEquip = { name: equip.name, grade: equip.grade };
                if (slot === 'main') equipments[type] = null;
                else backupEquips[type] = null;
            }

            t.set(docRef, { 
                equipments, backupEquips, scrolls, enchantCount: newEnchantCount,
                enchantLastTimestamp: now, enchantBurstCount: newBurstCount, enchantCooldownUntil: newCooldownUntil
            }, { merge: true });

            return { success: true, isSuccess, equip, slot, failedEquip, currentLvl, nextLvl, scrollsLeft: scrolls[scrollKey], newEnchantCount, lukBonus };
        });

        if (!result.success) {
            if (result.reason === 'no_equip') {
                await lineUtils.replyText(replyToken, `❌ 您在 ${result.slotName} 欄位目前沒有任何裝備！\n請輸入「裝備店」購買。`);
            } else if (result.reason === 'cooldown') {
                await lineUtils.replyText(replyToken, `🔥 鐵砧過熱中！\n你敲得太快了，請等待 ${result.leftSec} 秒後再繼續強化！\n(請勿使用連點器或按鍵精靈)`);
            } else if (result.reason === 'burst_cooldown') {
                await lineUtils.replyText(replyToken, `🔥 警告：連續操作過快，觸發鐵砧過熱！\n系統已強制冷卻 10 秒。\n(請勿使用連點器或按鍵精靈)`);
            } else if (result.reason === 'max_level') {
                await lineUtils.replyText(replyToken, `❌ 您的 ${result.equipName} 已經達到最高強化上限 +15 了！`);
            } else if (result.reason === 'no_scroll') {
                await lineUtils.replyText(replyToken, `❌ 您的 ${result.scrollName} 不足！\n請輸入「買卷軸 [卷種] [數量]」進行購買。`);
            }
            return;
        }

        const { isSuccess, equip, slot, failedEquip, currentLvl, nextLvl, scrollsLeft, newEnchantCount, lukBonus } = result;

        if (isSuccess) {
            db.collection('log_enchants').doc().set({
                userId,
                groupId: groupId || 'direct',
                type,
                slot,
                equipName: equip.name,
                variant: equip.grade,
                oldLevel: currentLvl,
                newLevel: nextLvl,
                isSuccess: true,
                timestamp: new Date()
            }).catch(e => console.error('[Equipment] Log enchant error:', e));
            
            const reqId = generateReqId();
            const flexBubble = buildSingleEnchantBubble(true, type, slot, equip, config, currentLvl, nextLvl, scrollsLeft, 1, newEnchantCount, lukBonus, reqId, userId);
            
            await lineUtils.replyFlex(replyToken, `[強化成功] ${equip.name} +${nextLvl}`, flexBubble);
        } else {
            db.collection('log_enchants').doc().set({
                userId,
                groupId: groupId || 'direct',
                type,
                slot,
                equipName: failedEquip.name,
                variant: failedEquip.grade,
                oldLevel: currentLvl,
                newLevel: 0,
                isSuccess: false,
                timestamp: new Date()
            }).catch(e => console.error('[Equipment] Log enchant error:', e));
            
            const reqId = generateReqId();
            const flexBubble = buildSingleEnchantBubble(false, type, slot, failedEquip, config, currentLvl, 0, scrollsLeft, 1, newEnchantCount, lukBonus, reqId, userId);
            
            await lineUtils.replyFlex(replyToken, `[強化失敗] ${failedEquip.name} 爆裂消失`, flexBubble);
        }
    } catch (e) {
        console.error('[Equipment] enchantEquipment Error:', e);
        await lineUtils.replyText(replyToken, `❌ 強化過程中發生錯誤：${e.message}`);
    }
}

async function buyEquipmentPostback(replyToken, type, grade, userId, groupId) {
    try {
        const config = EQUIP_TYPES[type];
        const price = 100; // 裝備售價（測試期間）
        let targetSlot = '';
        let equipName = '';

        const result = await db.runTransaction(async (t) => {
            const { equipments, backupEquips, scrolls, docRef } = await getEquipmentData(userId, t);
            
            if (!equipments[type]) {
                targetSlot = 'main';
            } else if (!backupEquips[type]) {
                targetSlot = 'backup';
            } else {
                return { success: false, reason: 'full' };
            }

            const consumeResult = await economy.consumeCoin(groupId, userId, price, true, t);
            if (!consumeResult.success) {
                return { success: false, reason: 'insufficient', message: consumeResult.message };
            }

            equipName = EQUIP_VARIANTS[type]?.[grade]?.name || `${config.chinese}${grade}`;
            
            if (targetSlot === 'main') {
                equipments[type] = { name: equipName, grade: grade, level: 0 };
            } else {
                backupEquips[type] = { name: equipName, grade: grade, level: 0 };
            }
            t.set(docRef, { equipments, backupEquips }, { merge: true });

            return { success: true, newBalance: consumeResult.newBalance };
        });

        if (!result.success) {
            if (result.reason === 'full') {
                await lineUtils.replyText(replyToken, `❌ 裝備已滿無法購買！請先衝爆或替換掉其中一件 ${config.chinese}。`);
            } else if (result.reason === 'insufficient') {
                await lineUtils.replyText(replyToken, `❌ 購買失敗：您的餘額不足 ${price} 哭幣！`);
            }
            return;
        }

        const header = flexUtils.createHeader('⚒️ 購買裝備成功', targetSlot === 'main' ? '全新裝備已穿上' : '放入備用背包', '#4CAF50');
        const body = flexUtils.createBox('vertical', [
            flexUtils.createText({ text: `花費 ${price} 哭幣購買了：`, size: 'sm', color: '#555555' }),
            flexUtils.createText({ text: `[${equipName}]`, size: 'lg', weight: 'bold', color: '#1976D2', margin: 'sm' }),
            flexUtils.createText({ text: `初始屬性加成：${formatEquipStats(type, grade, 0)}`, size: 'sm', margin: 'md' }),
            flexUtils.createSeparator('md'),
            flexUtils.createText({ text: `💰 結算總資產：${result.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#1A1A1A', margin: 'md' })
        ], { paddingAll: 'xl' });
        
        const reqId = generateReqId();
        const footer = flexUtils.createBox('horizontal', [
            flexUtils.createButton({ action: { type: 'postback', label: `🔨 強化它`, data: `action=enchant_equip&type=${type}&slot=${targetSlot}&times=1&reqId=${reqId}` }, style: 'primary', color: '#FF5722' }),
            flexUtils.createButton({ action: { type: 'message', label: '🛡️ 我的背包', text: '我的裝備' }, style: 'secondary', margin: 'sm' })
        ], { paddingAll: 'md' });
        
        const bubble = flexUtils.createBubble({ size: 'mega', header, body, footer });
        await lineUtils.replyFlex(replyToken, '購買裝備成功', bubble);
    } catch (e) {
        console.error('[Equipment] buyEquipmentPostback Error:', e);
        await lineUtils.replyText(replyToken, '❌ 購買裝備失敗。');
    }
}

async function buyScrollsPostback(replyToken, scrollKey, amount, userId, groupId) {
    try {
        const price = amount * 100; // 每張卷軸 100 哭幣
        let scrolls = {};

        const result = await db.runTransaction(async (t) => {
            const data = await getEquipmentData(userId, t);
            scrolls = data.scrolls;
            const docRef = data.docRef;

            const consumeResult = await economy.consumeCoin(groupId, userId, price, false, t);
            if (!consumeResult.success) {
                return { success: false, reason: 'insufficient', message: consumeResult.message };
            }

            scrolls[scrollKey] = (scrolls[scrollKey] || 0) + amount;
            t.set(docRef, { scrolls }, { merge: true });

            return { success: true, newBalance: consumeResult.newBalance };
        });

        if (!result.success) {
            if (result.reason === 'insufficient') {
                await lineUtils.replyText(replyToken, `❌ 購買失敗：您的餘額不足 ${price} 哭幣！`);
            }
            return;
        }

        const displayTypeMap = { 'weapon': '武卷', 'armor': '防卷', 'accessory': '飾品卷' };
        const displayScrollName = displayTypeMap[scrollKey];

        const header = flexUtils.createHeader('🛒 卷軸購買成功', '補給完成', '#9C27B0');
        const body = flexUtils.createBox('vertical', [
            flexUtils.createText({ text: `花費 ${price} 哭幣購買了：`, size: 'sm', color: '#555555' }),
            flexUtils.createText({ text: `${amount} 張 ${displayScrollName}`, size: 'lg', weight: 'bold', color: '#1976D2', margin: 'sm' }),
            flexUtils.createSeparator('md'),
            flexUtils.createText({ text: `💰 結算總資產：${result.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#1A1A1A', margin: 'sm' }),
            flexUtils.createSeparator('md'),
            flexUtils.createText({ text: `目前剩餘卷軸：`, size: 'sm', weight: 'bold', margin: 'md' }),
            flexUtils.createText({ text: `📜 武卷: ${scrolls.weapon} | 📜 防卷: ${scrolls.armor} | 📜 飾品卷: ${scrolls.accessory}`, size: 'xs', margin: 'sm' })
        ], { paddingAll: 'xl' });
        
        const footer = flexUtils.createBox('horizontal', [
            flexUtils.createButton({ action: { type: 'message', label: '🛡️ 去強化', text: '我的裝備' }, style: 'primary' })
        ], { paddingAll: 'md' });
        
        const bubble = flexUtils.createBubble({ size: 'mega', header, body, footer });
        await lineUtils.replyFlex(replyToken, '購買卷軸成功', bubble);
    } catch (e) {
        console.error('[Equipment] buyScrollsPostback Error:', e);
        await lineUtils.replyText(replyToken, '❌ 購買卷軸失敗。');
    }
}

// 供 Postback 呼叫的強化邏輯 (支援連續衝裝)
async function enchantEquipmentPostback(replyToken, type, slot, times, userId, reqId, groupId = 'direct') {
    const config = EQUIP_TYPES[type];
    if (!config) return;
    
    try {
        const result = await db.runTransaction(async (t) => {
            let data = await getEquipmentData(userId, t);
            let { equipments, backupEquips, scrolls, enchantCount, docRef, lastEnchantReqId, enchantLastTimestamp, enchantBurstCount, enchantCooldownUntil, playerData } = data;

            // 計算 LUK Bonus
            let luk = playerData && playerData.rpg ? (playerData.rpg.luk || 0) : 0;
            let additionsLuk = 0;
            for (const p of ['weapon', 'shield', 'wings', 'gloves', 'necklace', 'ring']) {
                let eq = equipments[p];
                if (eq) {
                    const stats = getFinalEquipStat(p, eq.grade, eq.level);
                    if (stats && stats.main && stats.main.type === 'luk') additionsLuk += stats.main.value;
                    if (stats && stats.sub && stats.sub.type === 'luk') additionsLuk += stats.sub.value;
                }
            }
            let cappedLuk = Math.min(80, luk + additionsLuk);
            const lukBonus = cappedLuk * 0.005;

            const now = Date.now();
            if (enchantCooldownUntil > now) {
                const leftSec = Math.ceil((enchantCooldownUntil - now) / 1000);
                return { success: false, reason: 'cooldown', leftSec };
            }

            if (reqId && reqId === lastEnchantReqId) {
                return { success: false, reason: 'invalid_req' };
            }

            let newBurstCount = enchantBurstCount;
            let newCooldownUntil = 0;
            if (now - enchantLastTimestamp < 2000) { // 2 秒內連續點擊
                newBurstCount += 1;
            } else {
                newBurstCount = 1;
            }
            
            if (newBurstCount > 5) {
                newCooldownUntil = now + 10000;
                newBurstCount = 0;
                t.set(docRef, { enchantLastTimestamp: now, enchantBurstCount: newBurstCount, enchantCooldownUntil: newCooldownUntil }, { merge: true });
                return { success: false, reason: 'burst_cooldown' };
            }
            
            let equip = slot === 'main' ? equipments[type] : backupEquips[type];
            if (!equip) {
                return { success: false, reason: 'no_equip', slotName: slot === 'main' ? '裝備' : '備用' };
            }
            
            const scrollKey = config.scrollKey;
            const initialLevel = equip.level;
            
            if (initialLevel >= 15) {
                return { success: false, reason: 'max_level', equipName: equip.name };
            }

            // 開始連衝邏輯
            let currentLvl = initialLevel;
            let logs = [];
            let costCount = 0;
            let isBroken = false;
            let finalSuccess = false;
            
            let maxExec = Math.min(times, 10);

            for (let i = 0; i < maxExec; i++) {
                if (currentLvl >= 15) break; // 滿級中斷
                if ((scrolls[scrollKey] || 0) <= 0) {
                    logs.push(`⚠️ 卷軸不足，已自動停止強化。`);
                    break;
                }
                
                scrolls[scrollKey] -= 1;
                costCount++;
                enchantCount++;

                const baseRate = PROBABILITY[currentLvl] !== undefined ? PROBABILITY[currentLvl] : 0.05;
                const rate = baseRate >= 1.0 ? 1.0 : Math.min(0.99, baseRate * (1 + lukBonus));
                const isSuccess = Math.random() < rate;
                
                if (isSuccess) {
                    const nextLvl = currentLvl + 1;
                    logs.push(`+${currentLvl} ➔ +${nextLvl} (✨成功)`);
                    currentLvl = nextLvl;
                    equip.level = currentLvl;
                    finalSuccess = true;
                } else {
                    logs.push(`+${currentLvl} ➔ 💥爆裂消失`);
                    isBroken = true;
                    const failedGrade = equip.grade;
                    if (slot === 'main') equipments[type] = null;
                    else backupEquips[type] = null;
                    // 為了下面 buildSingleEnchantBubble 能抓到原本資訊
                    equip = { name: equip.name, grade: failedGrade };
                    break; // 爆裝立刻停止
                }
            }
            
            // 寫入 DB
            const newReqId = generateReqId();
            t.set(docRef, { 
                equipments, backupEquips, scrolls, enchantCount,
                lastEnchantReqId: reqId, enchantLastTimestamp: now, enchantBurstCount: newBurstCount, enchantCooldownUntil: newCooldownUntil
            }, { merge: true });

            return { success: true, logs, costCount, isBroken, finalSuccess, 
                currentLvl, newReqId, equip, failedEquip: isBroken ? { name: equip.name, grade: equip.grade } : null, scrollsLeft: scrolls[scrollKey], newEnchantCount: enchantCount, lukBonus, initialLevel };
        });

        if (!result.success) {
            if (result.reason === 'cooldown') {
                await lineUtils.replyText(replyToken, `🔥 鐵砧過熱中！\n你敲得太快了，請等待 ${result.leftSec} 秒後再繼續強化！\n(請勿使用連點器或按鍵精靈)`);
            } else if (result.reason === 'invalid_req') {
                await lineUtils.replyText(replyToken, `⚠️ 此強化按鈕已失效。\n請點擊最新出現的「強化戰報」上的按鈕繼續，或輸入「我的裝備」呼叫新選單。`);
            } else if (result.reason === 'burst_cooldown') {
                await lineUtils.replyText(replyToken, `🔥 警告：連續操作過快，觸發鐵砧過熱！\n系統已強制冷卻 10 秒。\n(請勿使用連點器或按鍵精靈)`);
            } else if (result.reason === 'no_equip') {
                await lineUtils.replyText(replyToken, `❌ 您在 ${config.displayName} ${result.slotName}欄位目前沒有任何裝備！`);
            } else if (result.reason === 'max_level') {
                await lineUtils.replyText(replyToken, `❌ 您的 ${result.equipName} 已經達到最高強化上限 +15 了！`);
            }
            return;
        }

        const { logs, costCount, isBroken, currentLvl, newReqId, equip, failedEquip, scrollsLeft, newEnchantCount, lukBonus, initialLevel } = result;
        
        // 若為單次強化，維持原本單純的 Bubble
        if (times === 1) {
            const bubble = buildSingleEnchantBubble(
                !isBroken, type, slot, equip, config, 
                isBroken ? currentLvl : currentLvl - 1, 
                isBroken ? 0 : currentLvl, 
                scrollsLeft, costCount, newEnchantCount, lukBonus, newReqId, userId
            );
            await lineUtils.replyFlex(replyToken, isBroken ? '強化失敗' : '強化成功', bubble);
            
            db.collection('log_enchants').doc().set({
                userId, groupId: groupId || 'direct', type, slot, equipName: equip.name, variant: equip.grade, oldLevel: initialLevel, newLevel: isBroken ? 0 : currentLvl, isSuccess: !isBroken, timestamp: new Date()
            }).catch(e => console.error(e));
            return;
        }
        
        // 若 > 5，產生戰報 Summary
        const headerColor = isBroken ? flexUtils.COLORS.DANGER : flexUtils.COLORS.SUCCESS;
        const headerTitle = isBroken ? '💥 連續強化失敗' : '✨ 連續強化成功';
        const headerSub = isBroken ? '裝備已損毀' : '裝備屬性提升';
        
        const bodyItems = [
            flexUtils.createText({ text: `消耗 ${costCount} 張 ${config.scrollName}`, size: 'xs', color: flexUtils.COLORS.GRAY }),
            flexUtils.createSeparator('sm'),
            flexUtils.createText({ text: `⚡ 連續強化戰報`, weight: 'bold', size: 'md', margin: 'md', color: '#673AB7' })
        ];
        
        logs.forEach(l => {
            const isSuccessLog = l.includes('成功');
            bodyItems.push(flexUtils.createText({ text: l, size: 'sm', color: isSuccessLog ? flexUtils.COLORS.SUCCESS : flexUtils.COLORS.DANGER, margin: 'xs' }));
        });
        
        bodyItems.push(flexUtils.createSeparator('md'));
        
        if (isBroken) {
            bodyItems.push(flexUtils.createText({ text: `裝備已化為灰燼...`, weight: 'bold', size: 'sm', color: flexUtils.COLORS.DANGER, wrap: true, margin: 'sm' }));
        } else {
            bodyItems.push(flexUtils.createText({ text: `[${equip.name}] 最終等級：+${currentLvl}\n加成：${formatEquipStats(type, equip.grade, currentLvl)}`, weight: 'bold', size: 'sm', color: flexUtils.COLORS.PRIMARY, wrap: true, margin: 'sm' }));
            const stars = '★'.repeat(Math.min(currentLvl, 5)) + '☆'.repeat(Math.max(0, 5 - currentLvl));
            bodyItems.push(flexUtils.createText({ text: `星級: ${stars}`, size: 'md', color: '#FFD700', weight: 'bold', margin: 'sm' }));
        }
        bodyItems.push(flexUtils.createText({ text: `📜 剩餘 ${config.scrollName.substring(0,2)}：${scrollsLeft} 張`, size: 'xs', color: '#555555', margin: 'sm' }));
        
        const footerItems = [];
        if (isBroken) {
            // 一鍵買回並直升+4 (只有爆裝時顯示)
            footerItems.push(flexUtils.createButton({ action: { type: 'postback', label: `買回並直升+4`, data: `action=buy_and_safe_enchant&type=${type}&slot=${slot}&grade=${equip ? equip.grade : 1}&reqId=${newReqId}` }, style: 'primary', color: flexUtils.COLORS.DANGER, margin: 'sm' }));
            footerItems.push(flexUtils.createButton({ action: { type: 'postback', label: '補充卷軸x5', data: `action=buy_scroll&type=${config.scrollKey}&amount=5` }, style: 'secondary', margin: 'sm' }));
        } else if (currentLvl < 15) {
            const nextInfo = getNextLevelInfo(currentLvl, lukBonus);
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
                        ], { margin: 'sm' })
                );
            }
        }
        footerItems.push(flexUtils.createButton({ action: { type: 'message', label: '🛡️ 我的背包', text: '我的裝備' }, style: 'secondary', margin: 'sm' }));
        
        const flexBubble = flexUtils.createBubble({ size: 'mega', header: flexUtils.createHeader(headerTitle, headerSub, headerColor), body: flexUtils.createBox('vertical', bodyItems, { paddingAll: 'xl' }), footer: flexUtils.createBox('vertical', footerItems, { paddingAll: 'md' }) });
        
        await lineUtils.replyFlex(replyToken, isBroken ? '強化失敗' : '強化成功', flexBubble);
        
    } catch (e) {
        console.error('[Equipment] enchantEquipmentPostback Error:', e);
        await lineUtils.replyText(replyToken, `❌ 強化過程中發生錯誤：${e.message}`);
    }
}

// 建立單次強化的 Bubble
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
        bodyItems.push(flexUtils.createText({ text: `星級: ${stars}`, size: 'md', color: '#FFD700', weight: 'bold', margin: 'sm' }));
    } else {
        bodyItems.push(flexUtils.createText({ text: `激烈的銀色光芒閃爍後...`, size: 'sm', margin: 'md' }));
        bodyItems.push(flexUtils.createText({ text: `你的 +${oldLvl} [${equip.name}] 碎裂化為灰燼...`, weight: 'bold', size: 'sm', color: flexUtils.COLORS.DANGER, wrap: true, margin: 'sm' }));
    }
    
    bodyItems.push(flexUtils.createText({ text: `📜 剩餘 ${config.scrollName.substring(0,2)}：${scrollsLeft} 張`, size: 'xs', color: '#555555', margin: 'sm' }));
    
    if (newBalance !== null) {
        bodyItems.push(flexUtils.createSeparator('md'));
        bodyItems.push(flexUtils.createText({ text: `💰 結算總資產：${newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#1A1A1A', margin: 'md' }));
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
                    flexUtils.createButton({ action: { type: 'postback', label: `🔥連x5`, data: `action=enchant_equip&type=${type}&slot=${slot}&times=5&reqId=${reqId}` }, style: 'primary', color: '#FF9800', height: 'sm', margin: 'xs', flex: 2 })
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
        body: flexUtils.createBox('vertical', bodyItems, { paddingAll: 'xl' }),
        footer: flexUtils.createBox('vertical', footerItems, { paddingAll: 'md' })
    });
}

async function buyAndSafeEnchantPostback(replyToken, type, slot, grade, userId, groupId, reqId) {
    try {
        const price = 100; // 裝備售價（測試期間）
        const config = EQUIP_TYPES[type];
        
        const result = await db.runTransaction(async (t) => {
            const data = await getEquipmentData(userId, t);
            let { equipments, backupEquips, scrolls, enchantCount, docRef } = data;
            
            const equipName = EQUIP_VARIANTS[type]?.[grade]?.name || `${config.chinese}${grade}`;

            // 檢查卷軸是否足夠 4 張，計算總共需要的費用
            let need = 0;
            let scrollPrice = 0;
            if ((scrolls[config.scrollKey] || 0) < 4) {
                need = 4 - (scrolls[config.scrollKey] || 0);
                scrollPrice = need * 100;
            }
            const totalPrice = price + scrollPrice;

            // 一次性扣款 (買裝備 + 補卷軸)
            let consumeResult = await economy.consumeCoin(groupId, userId, totalPrice, true, t);
            if (!consumeResult.success) {
                return { success: false, reason: 'total_insufficient', totalPrice };
            }

            if (need > 0) {
                scrolls[config.scrollKey] += need;
            }

            // 直升 +4
            const newEquip = { name: equipName, grade: grade, level: 4 };
            if (slot === 'main') equipments[type] = newEquip;
            else backupEquips[type] = newEquip;
            
            scrolls[config.scrollKey] -= 4;
            const newEnchantCount = enchantCount + 4;
            
            const now = Date.now();
            const newReqId = generateReqId();

            t.set(docRef, { 
                equipments, backupEquips, scrolls, enchantCount: newEnchantCount,
                lastEnchantReqId: reqId, enchantLastTimestamp: now
            }, { merge: true });

            return { success: true, equipName, scrollsCount: scrolls[config.scrollKey], newEnchantCount, newReqId, newEquip, newBalance: consumeResult.newBalance };
        });

        if (!result.success) {
            if (result.reason === 'total_insufficient') {
                await lineUtils.replyText(replyToken, `❌ 餘額不足！買回並直升 +4 共需要 ${result.totalPrice} 哭幣。`);
            }
            return;
        }

        const { equipName, scrollsCount, newEnchantCount, newReqId, newEquip, newBalance } = result;
        
        db.collection('log_enchants').doc().set({
            userId,
            groupId: groupId || 'direct',
            type,
            slot,
            equipName: equipName,
            variant: grade,
            oldLevel: 0,
            newLevel: 4,
            isSuccess: true,
            timestamp: new Date()
        }).catch(e => console.error('[Equipment] Log safe enchant error:', e));
        
        // 需引入 lukBonus 來顯示正確 Bubble
        const { getFinalPlayerStats } = require('./rpg');
        const statsForSafe = await getFinalPlayerStats(userId);
        const cappedLuk = statsForSafe.final.luk;
        const lukBonus = cappedLuk * 0.005;

        const bubble = buildSingleEnchantBubble(true, type, slot, newEquip, config, 0, 4, scrollsCount, 4, newEnchantCount, lukBonus, newReqId, userId, newBalance);
        await lineUtils.replyFlex(replyToken, '直升安定值成功', bubble);
    } catch (e) {
        console.error('[Equipment] buyAndSafeEnchantPostback Error:', e);
        await lineUtils.replyText(replyToken, '❌ 買回直升失敗。');
    }
}

async function swapEquipmentPostback(replyToken, type, userId) {
    try {
        const result = await db.runTransaction(async (t) => {
            const { equipments, backupEquips, docRef } = await getEquipmentData(userId, t);
            
            // 互換裝備
            const temp = equipments[type];
            equipments[type] = backupEquips[type];
            backupEquips[type] = temp;
            
            t.set(docRef, { equipments, backupEquips }, { merge: true });
            return { success: true };
        });
        
        // 互換後直接重新顯示「我的裝備」UI
        await showMyEquipments(replyToken, userId);
    } catch (e) {
        console.error('[Equipment] swapEquipmentPostback Error:', e);
        await lineUtils.replyText(replyToken, '❌ 裝備替換失敗。');
    }
}

module.exports = {
    getEquipmentData,
    showEquipmentShop,
    buyEquipment,
    buyScrolls,
    showMyEquipments,
    enchantEquipment,
    buyEquipmentPostback,
    buyScrollsPostback,
    enchantEquipmentPostback,
    buyAndSafeEnchantPostback,
    swapEquipmentPostback,
    EQUIP_TYPES,
    getFinalEquipStat
};
