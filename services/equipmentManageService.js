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
const { EQUIP_TYPES, generateReqId, getNextLevelInfo, getFinalEquipStat, formatEquipStats, getEquipmentData, buildSingleEnchantBubble, calculateTotalStats } = require('./equipmentCoreService');

function buildEquipBox(type, equip, slot, config) {
    const isMain = slot === 'main';
    const titleText = isMain ? '🟢 裝備中 (套用屬性)' : '🎒 備用欄 (單純存放與強化)';
    const titleColor = isMain ? '#4CAF50' : '#795548';
    const nameColor = isMain ? '#1976D2' : '#607D8B';
    const statColor = isMain ? '#E91E63' : '#9E9E9E';
    const bgColor = isMain ? '#F4FAFF' : '#FAFAFA';
    const actionLabel = isMain ? '卸下至備用' : '替換上陣';

    const items = [
        flexUtils.createText({ text: titleText, size: 'xs', weight: 'bold', color: titleColor, margin: 'sm' })
    ];

    if (equip) {
        items.push(flexUtils.createBox('horizontal', [
            flexUtils.createText({ text: `+${equip.level} ${equip.name}`, size: 'md', weight: 'bold', color: nameColor, flex: 7, wrap: true }),
            flexUtils.createText({ text: `(${formatEquipStats(type, equip.grade, equip.level)})`, size: 'xs', color: statColor, flex: 6, align: 'end', wrap: true })
        ], { alignItems: 'center', margin: 'sm' }));
        
        if (equip.level === 0) {
            const reqId = generateReqId();
            items.push(flexUtils.createBox('horizontal', [
                flexUtils.createButton({ action: { type: 'postback', label: `🔨 直升+4 (扣4卷)`, data: `action=enchant_equip&type=${type}&slot=${slot}&times=4&reqId=${reqId}` }, style: 'primary', height: 'sm', color: flexUtils.COLORS.SECONDARY, margin: 'xs', flex: 3 }),
                flexUtils.createButton({ action: { type: 'postback', label: actionLabel, data: `action=swap_equip&type=${type}` }, style: 'secondary', height: 'sm', margin: 'xs', flex: 2 })
            ], { margin: 'sm' }));
        } else if (equip.level < 15) {
            const reqId = generateReqId();
            items.push(flexUtils.createBox('horizontal', [
                flexUtils.createButton({ action: { type: 'postback', label: `⚡衝`, data: `action=enchant_equip&type=${type}&slot=${slot}&times=1&reqId=${reqId}` }, style: 'primary', height: 'sm', color: '#FF5722', margin: 'xs', flex: 1 }),
                flexUtils.createButton({ action: { type: 'postback', label: `⚡連x3`, data: `action=enchant_equip&type=${type}&slot=${slot}&times=3&reqId=${reqId}` }, style: 'secondary', height: 'sm', margin: 'xs', flex: 2 }),
                flexUtils.createButton({ action: { type: 'postback', label: `🔥連x5`, data: `action=enchant_equip&type=${type}&slot=${slot}&times=5&reqId=${reqId}` }, style: 'primary', color: flexUtils.COLORS.SECONDARY, height: 'sm', margin: 'xs', flex: 2 })
            ], { margin: 'sm' }));
            items.push(flexUtils.createBox('horizontal', [
                flexUtils.createButton({ action: { type: 'postback', label: `💥狂衝x8`, data: `action=enchant_equip&type=${type}&slot=${slot}&times=8&reqId=${reqId}` }, style: 'primary', color: '#E91E63', height: 'sm', margin: 'xs', flex: 3 }),
                flexUtils.createButton({ action: { type: 'postback', label: actionLabel, data: `action=swap_equip&type=${type}` }, style: 'secondary', height: 'sm', margin: 'xs', flex: 3 })
            ], { margin: 'xs' }));
        } else {
            items.push(flexUtils.createBox('horizontal', [
                flexUtils.createText({ text: '🌟 已達最高神兵等級 🌟', size: 'sm', color: '#E91E63', weight: 'bold', align: 'center', flex: 1 }),
                flexUtils.createButton({ action: { type: 'postback', label: actionLabel, data: `action=swap_equip&type=${type}` }, style: 'secondary', height: 'sm', margin: 'xs', flex: 1 })
            ], { margin: 'sm', alignItems: 'center' }));
        }
    } else {
        items.push(flexUtils.createText({ text: '無裝備', size: 'sm', color: flexUtils.COLORS.TEXT_SUB, margin: 'sm', align: 'center' }));
        if (isMain) {
            items.push(flexUtils.createButton({ action: { type: 'message', label: '🏪 前往商店購買', text: '裝備店' }, style: 'secondary', height: 'sm', margin: 'sm' }));
        }
    }
    
    return flexUtils.createBox('vertical', items, { backgroundColor: bgColor, paddingAll: 'md', cornerRadius: 'md', margin: isMain ? 'none' : 'md' });
}

/**
 * 查看當前裝備
 */
async function showMyEquipments(replyToken, userId) {
    try {
        const { equipments, backupEquips, scrolls, enchantCount } = await getEquipmentData(userId);
        
        const { getFinalPlayerStats, getPlayerTitle } = require('../handlers/rpg');
        const stats = await getFinalPlayerStats(userId);
        const level = stats.level || 1;
        const { title: playerTitle, color: titleColor } = getPlayerTitle(level);
        
        const bubbles = [];
        
        // --- 📊 總覽面板 ---
        const totalStats = calculateTotalStats(equipments);
        const overviewHeader = flexUtils.createHeader('📊 角色裝備屬性總覽', `${playerTitle}  |  Lv.${level}`, titleColor);
        const overviewBody = flexUtils.createBox('vertical', [
            flexUtils.createText({ text: '這反映了您當前「裝備中」的總和加成', size: 'xs', color: flexUtils.COLORS.TEXT_SUB, margin: 'sm' }),
            flexUtils.createSeparator('md'),
            flexUtils.createBox('horizontal', [
                flexUtils.createText({ text: `⚔️ 總攻擊 (ATK): +${totalStats.atk}`, size: 'sm', weight: 'bold', flex: 1 }),
                flexUtils.createText({ text: `🛡️ 總防禦 (DEF): +${totalStats.def}`, size: 'sm', weight: 'bold', flex: 1 })
            ], { margin: 'md' }),
            flexUtils.createBox('horizontal', [
                flexUtils.createText({ text: `💥 總爆擊 (CRIT): +${totalStats.crit}%`, size: 'sm', weight: 'bold', flex: 1 }),
                flexUtils.createText({ text: `💨 總迴避 (EVA): +${totalStats.eva}%`, size: 'sm', weight: 'bold', flex: 1 })
            ], { margin: 'md' }),
            flexUtils.createBox('horizontal', [
                flexUtils.createText({ text: `🏹 總穿透 (PEN): +${totalStats.pen}%`, size: 'sm', weight: 'bold', flex: 1 }),
                flexUtils.createText({ text: `🍀 總幸運 (LUK): +${totalStats.luk}%`, size: 'sm', weight: 'bold', flex: 1 })
            ], { margin: 'md' })
        ], { paddingAll: 'lg' });
        bubbles.push(flexUtils.createBubble({ size: 'mega', header: overviewHeader, body: overviewBody }));

        for (const type of ['weapon', 'shield', 'wings', 'gloves', 'necklace', 'ring']) {
            const config = EQUIP_TYPES[type];
            const mainEquip = equipments[type];
            const backupEquip = backupEquips[type];
            
            const bodyItems = [];
            bodyItems.push(buildEquipBox(type, mainEquip, 'main', config));
            bodyItems.push(flexUtils.createSeparator('md'));
            bodyItems.push(buildEquipBox(type, backupEquip, 'backup', config));
            
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
    showMyEquipments,
    swapEquipmentPostback
};
