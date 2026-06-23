const { Firestore } = require('@google-cloud/firestore');
const { db } = require('../utils/db');
const COLLECTION_NAME = 'economy_users';
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const authUtils = require('../utils/auth');
const economyHandler = require('../handlers/economy');
const professionHandler = require('../handlers/profession');
const rpgHandler = require('../handlers/rpg');

const { EQUIP_TYPES, EQUIP_VARIANTS, PROBABILITY, generateReqId, getNextLevelInfo, getFinalEquipStat, formatEquipStats, getEquipmentData, buildSingleEnchantBubble, calculateLukBonus } = require('./equipmentCoreService');

const EQUIP_PRICE = 100000;
const SCROLL_PRICES = {
    weapon: 100000,
    armor: 50000,
    accessory: 200000
};

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
        let slot = 'main';
        const docRef = db.collection('players').doc(userId);
        const doc = await docRef.get();
        if (doc.exists) {
            const data = doc.data();
            const equipments = data.equipments || {};
            const backupEquips = data.backupEquips || {};
            if (!equipments[type] && backupEquips[type]) {
                slot = 'backup';
            } else if (!equipments[type] && !backupEquips[type]) {
                await lineUtils.replyText(replyToken, `❌ 您在 ${config.displayName} 欄位目前沒有任何裝備！\n請輸入「裝備店」購買。`);
                return;
            }
        } else {
            await lineUtils.replyText(replyToken, `❌ 您在 ${config.displayName} 欄位目前沒有任何裝備！\n請輸入「裝備店」購買。`);
            return;
        }
        await enchantEquipmentPostback(replyToken, type, slot, 1, userId, '', groupId);
    } catch (e) {
        console.error('[Equipment] enchantEquipment Error:', e);
        await lineUtils.replyText(replyToken, `❌ 強化過程中發生錯誤：${e.message}`);
    }
}


async function enchantEquipmentPostback(replyToken, type, slot, times, userId, reqId, groupId = 'direct') {
    const config = EQUIP_TYPES[type];
    if (!config) return;
    
    try {
        const result = await db.runTransaction(async (t) => {
            let data = await getEquipmentData(userId, t);
            let { equipments, backupEquips, scrolls, enchantCount, docRef, lastEnchantReqId, enchantLastTimestamp, enchantBurstCount, enchantCooldownUntil, playerData } = data;

            // 計算 LUK Bonus
            const lukBonus = calculateLukBonus(playerData, equipments);

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
            
        const quickReply = {
            items: [
                { type: 'action', action: { type: 'message', label: '⚔️ 更換武器', text: '裝備 武器' } },
                { type: 'action', action: { type: 'message', label: '🛡️ 更換防具', text: '裝備 防具' } },
                { type: 'action', action: { type: 'message', label: '🔨 強化', text: '強化' } }
            ]
        };
        await lineUtils.replyFlex(replyToken, isBroken ? '強化失敗' : '強化成功', bubble, [], quickReply);
            
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
            bodyItems.push(flexUtils.createText({ text: `星級: ${stars}`, size: 'md', color: flexUtils.COLORS.PRIMARY, weight: 'bold', margin: 'sm' }));
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
                            flexUtils.createButton({ action: { type: 'postback', label: `🔥連x5`, data: `action=enchant_equip&type=${type}&slot=${slot}&times=5&reqId=${newReqId}` }, style: 'primary', color: flexUtils.COLORS.SECONDARY, height: 'sm', margin: 'xs', flex: 2 })
                        ], { margin: 'sm' }),
                        flexUtils.createBox('horizontal', [
                            flexUtils.createButton({ action: { type: 'postback', label: `💥狂衝x8`, data: `action=enchant_equip&type=${type}&slot=${slot}&times=8&reqId=${newReqId}` }, style: 'primary', color: '#E91E63', height: 'sm', margin: 'xs', flex: 3 }),
                        ], { margin: 'sm' })
                );
            }
        }
        footerItems.push(flexUtils.createButton({ action: { type: 'message', label: '🛡️ 我的背包', text: '我的裝備' }, style: 'secondary', margin: 'sm' }));
        
        const flexBubble = flexUtils.createBubble({ size: 'mega', header: flexUtils.createHeader(headerTitle, headerSub, headerColor), body: flexUtils.createBox('vertical', bodyItems, { backgroundColor: flexUtils.COLORS.BG_MAIN, paddingAll: 'xl'  }), footer: flexUtils.createBox('vertical', footerItems, { paddingAll: 'md' }) });
        
        await lineUtils.replyFlex(replyToken, isBroken ? '強化失敗' : '強化成功', flexBubble);
        
    } catch (e) {
        console.error('[Equipment] enchantEquipmentPostback Error:', e);
        await lineUtils.replyText(replyToken, `❌ 強化過程中發生錯誤：${e.message}`);
    }
}

// 建立單次強化的 Bubble

async function buyAndSafeEnchantPostback(replyToken, type, slot, grade, userId, groupId, reqId) {
    try {
        const price = EQUIP_PRICE;
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
                scrollPrice = need * SCROLL_PRICES[config.scrollKey];
            }
            const totalPrice = price + scrollPrice;

            // 一次性扣款 (買裝備 + 補卷軸)
            let consumeResult = await economyHandler.consumeCoin(groupId, userId, totalPrice, true, t);
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
        const { getFinalPlayerStats } = require('../handlers/rpg');
        const statsForSafe = await getFinalPlayerStats(userId);
        const cappedLuk = statsForSafe.final.luk;
        const lukBonus = cappedLuk * 0.005;

        const bubble = buildSingleEnchantBubble(true, type, slot, newEquip, config, 0, 4, scrollsCount, 4, newEnchantCount, lukBonus, newReqId, userId, newBalance);
        
        const quickReply = {
            items: [
                { type: 'action', action: { type: 'message', label: '⚔️ 更換武器', text: '裝備 武器' } },
                { type: 'action', action: { type: 'message', label: '🛡️ 更換防具', text: '裝備 防具' } },
                { type: 'action', action: { type: 'message', label: '🔨 強化', text: '強化' } }
            ]
        };
        await lineUtils.replyFlex(replyToken, '直升安定值成功', bubble, [], quickReply);
    } catch (e) {
        console.error('[Equipment] buyAndSafeEnchantPostback Error:', e);
        await lineUtils.replyText(replyToken, '❌ 買回直升失敗。');
    }
}



module.exports = {
    enchantEquipment,
    enchantEquipmentPostback,
    buyAndSafeEnchantPostback
};
