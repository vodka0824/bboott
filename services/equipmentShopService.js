const { Firestore } = require('@google-cloud/firestore');
const { db } = require('../utils/db');
const COLLECTION_NAME = 'economy_users';
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const authUtils = require('../utils/auth');
const economyHandler = require('../handlers/economy');
const professionHandler = require('../handlers/profession');
const rpgHandler = require('../handlers/rpg');

const { EQUIP_TYPES, EQUIP_VARIANTS, generateReqId, getNextLevelInfo, getFinalEquipStat, formatEquipStats, getEquipmentData, buildSingleEnchantBubble } = require('./equipmentCoreService');

const EQUIP_PRICE = 100000;
const SCROLL_PRICES = {
    weapon: 100000,
    armor: 50000,
    accessory: 200000
};

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
                        flexUtils.createText({ text: statText, size: 'xs', color: flexUtils.COLORS.TEXT_MUTED })
                    ], { flex: 6, justifyContent: 'center' }),
                    flexUtils.createText({ text: `$10萬`, size: 'sm', color: '#D32F2F', weight: 'bold', flex: 2, align: 'center', gravity: 'center' }),
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
            header: flexUtils.createHeader(`🏪 皇家裝備店 - ${config.chinese}`, '選擇裝備以購買', flexUtils.COLORS.SECONDARY),
            body: flexUtils.createBox('vertical', items, { backgroundColor: flexUtils.COLORS.BG_MAIN, paddingAll: 'lg'  })
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
                flexUtils.createText({ text: `$${SCROLL_PRICES[scroll.key] / 10000}萬/張`, size: 'sm', color: '#D32F2F', weight: 'bold', flex: 3, align: 'end', gravity: 'center' }),
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
        body: flexUtils.createBox('vertical', scrollItems, { backgroundColor: flexUtils.COLORS.BG_MAIN, paddingAll: 'lg'  })
    });
    bubbles.push(scrollBubble);

    const carousel = flexUtils.createCarousel(bubbles);
    await lineUtils.replyFlex(replyToken, '皇家裝備店 (支援輪播)', carousel);
}

/**
 * 購買裝備
 */

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
    
    const price = EQUIP_PRICE;
    
    try {
        const result = await db.runTransaction(async (t) => {
            const { equipments, scrolls, docRef } = await getEquipmentData(userId, t);
            
            const consumeResult = await economyHandler.consumeCoin(groupId, userId, price, true, t);
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
    const price = amount * SCROLL_PRICES[scrollKey];
    
    try {
        const result = await db.runTransaction(async (t) => {
            const { equipments, scrolls, docRef } = await getEquipmentData(userId, t);
            
            const consumeResult = await economyHandler.consumeCoin(groupId, userId, price, false, t);
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

async function buyEquipmentPostback(replyToken, type, grade, userId, groupId) {
    try {
        const config = EQUIP_TYPES[type];
        const price = EQUIP_PRICE;
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

            const consumeResult = await economyHandler.consumeCoin(groupId, userId, price, true, t);
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
            flexUtils.createText({ text: `💰 結算總資產：${result.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: flexUtils.COLORS.BG_CARD, margin: 'md' })
        ], { paddingAll: 'xl' });
        
        const reqId = generateReqId();
        const footer = flexUtils.createBox('horizontal', [
            flexUtils.createButton({ action: { type: 'postback', label: `🔨 強化它`, data: `action=enchant_equip&type=${type}&slot=${targetSlot}&times=1&reqId=${reqId}` }, style: 'primary', color: '#FF5722' }),
            flexUtils.createButton({ action: { type: 'message', label: '🛡️ 我的背包', text: '我的裝備' }, style: 'secondary', margin: 'sm' })
        ], { paddingAll: 'md' });
        
        const bubble = flexUtils.createBubble({ size: 'mega', header, body, footer });
        
        const quickReply = {
            items: [
                { type: 'action', action: { type: 'message', label: '⚔️ 更換武器', text: '裝備 武器' } },
                { type: 'action', action: { type: 'message', label: '🛡️ 更換防具', text: '裝備 防具' } },
                { type: 'action', action: { type: 'message', label: '🔨 強化', text: '強化' } }
            ]
        };
        await lineUtils.replyFlex(replyToken, '購買裝備成功', bubble, [], quickReply);
    } catch (e) {
        console.error('[Equipment] buyEquipmentPostback Error:', e);
        await lineUtils.replyText(replyToken, '❌ 購買裝備失敗。');
    }
}


async function buyScrollsPostback(replyToken, scrollKey, amount, userId, groupId) {
    try {
        const price = amount * SCROLL_PRICES[scrollKey];
        let scrolls = {};

        const result = await db.runTransaction(async (t) => {
            const data = await getEquipmentData(userId, t);
            scrolls = data.scrolls;
            const docRef = data.docRef;

            const consumeResult = await economyHandler.consumeCoin(groupId, userId, price, false, t);
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
            flexUtils.createText({ text: `💰 結算總資產：${result.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: flexUtils.COLORS.BG_CARD, margin: 'sm' }),
            flexUtils.createSeparator('md'),
            flexUtils.createText({ text: `目前剩餘卷軸：`, size: 'sm', weight: 'bold', margin: 'md' }),
            flexUtils.createText({ text: `📜 武卷: ${scrolls.weapon} | 📜 防卷: ${scrolls.armor} | 📜 飾品卷: ${scrolls.accessory}`, size: 'xs', margin: 'sm' })
        ], { paddingAll: 'xl' });
        
        const footer = flexUtils.createBox('horizontal', [
            flexUtils.createButton({ action: { type: 'message', label: '🛡️ 去強化', text: '我的裝備' }, style: 'primary' })
        ], { paddingAll: 'md' });
        
        const bubble = flexUtils.createBubble({ size: 'mega', header, body, footer });
        
        const quickReply = {
            items: [
                { type: 'action', action: { type: 'message', label: '⚔️ 更換武器', text: '裝備 武器' } },
                { type: 'action', action: { type: 'message', label: '🛡️ 更換防具', text: '裝備 防具' } },
                { type: 'action', action: { type: 'message', label: '🔨 強化', text: '強化' } }
            ]
        };
        await lineUtils.replyFlex(replyToken, '購買卷軸成功', bubble, [], quickReply);
    } catch (e) {
        console.error('[Equipment] buyScrollsPostback Error:', e);
        await lineUtils.replyText(replyToken, '❌ 購買卷軸失敗。');
    }
}

// 供 Postback 呼叫的強化邏輯 (支援連續衝裝)


module.exports = {
    showEquipmentShop,
    buyEquipment,
    buyScrolls,
    buyEquipmentPostback,
    buyScrollsPostback
};
