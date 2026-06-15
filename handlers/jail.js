const { db } = require('../utils/db');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const { getSpamResponse } = require('../utils/spamHandler');

const COLLECTION_NAME = 'economy_users';

function getCriminalTitle(record) {
    if (!record || record <= 0) return '';
    if (record >= 30) return '【頭號通緝犯】';
    if (record >= 10) return '【監獄角頭】';
    if (record >= 3) return '【慣犯】';
    return '';
}

function calculateBailAmount(crimeRecord, kuCoin) {
    return 50000 + (crimeRecord * 500000) + Math.floor(kuCoin * 0.15);
}

/**
 * 檢查玩家是否在坐牢中
 */
async function checkJailStatus(userId) {
    try {
        const docRef = db.collection(COLLECTION_NAME).doc(userId);
        const doc = await docRef.get();
        if (!doc.exists) return false;
        
        const data = doc.data();
        if (data.jailedUntil && Date.now() < data.jailedUntil) {
            return {
                isJailed: true,
                jailedUntil: data.jailedUntil
            };
        }
        return { isJailed: false };
    } catch (e) {
        console.error('[Jail] checkJailStatus Error:', e);
        return { isJailed: false };
    }
}

/**
 * 產生交保確認面板
 */
async function handleBail(replyToken, context) {
    const { userId } = context;

    try {
        const docRef = db.collection(COLLECTION_NAME).doc(userId);
        const doc = await docRef.get();
        if (!doc.exists) {
            await lineUtils.replyText(replyToken, '❌ 找不到您的資料。');
            return;
        }
        
        const data = doc.data();
        if (!data.jailedUntil || Date.now() >= data.jailedUntil) {
            await lineUtils.replyText(replyToken, '❌ 您目前沒有在坐牢，不用交保啦！');
            return;
        }

        const crimeRecord = data.crimeRecord || 0;
        const kuCoin = data.kuCoin || 0;
        const bailAmount = calculateBailAmount(crimeRecord, kuCoin);
        
        const header = flexUtils.createHeader('📜 交保確認', '重獲自由的代價', flexUtils.COLORS.WARNING);
        const body = flexUtils.createBox('vertical', [
            flexUtils.createText({ text: `您的前科次數：${crimeRecord} 次`, size: 'sm', color: flexUtils.COLORS.GRAY, wrap: true }),
            flexUtils.createSeparator('sm'),
            flexUtils.createText({ text: `應繳保釋金：${bailAmount.toLocaleString()} 哭幣`, weight: 'bold', size: 'md', color: flexUtils.COLORS.DANGER, margin: 'md', wrap: true }),
            flexUtils.createText({ text: `※交保後通緝值將歸零`, size: 'xs', color: flexUtils.COLORS.GRAY, margin: 'md', wrap: true })
        ], { paddingAll: 'xl' });
        
        const footer = flexUtils.createBox('horizontal', [
            flexUtils.createButton({ action: { type: 'postback', label: '確認交保', data: `action=confirmBail&targetId=${userId}&bailAmount=${bailAmount}`, displayText: '確認交保' }, style: 'primary', color: flexUtils.COLORS.WARNING })
        ], { paddingAll: 'md' });
        
        const flexBubble = flexUtils.createBubble({ size: 'mega', header, body, footer });
        await lineUtils.replyFlex(replyToken, '交保確認', flexBubble);

    } catch (e) {
        console.error('[Jail] handleBail Error:', e);
        await lineUtils.replyText(replyToken, '❌ 系統發生錯誤。');
    }
}

/**
 * 執行自己交保扣款
 */
async function confirmBail(replyToken, context, providedBailAmount = null) {
    const { userId, groupId } = context;

    try {
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);
        
        const result = await db.runTransaction(async (t) => {
            const docRef = db.collection(COLLECTION_NAME).doc(userId);
            const doc = await t.get(docRef);
            
            if (!doc.exists) return { success: false, message: '找不到資料。' };
            
            const data = doc.data();
            if (!data.jailedUntil || Date.now() >= data.jailedUntil) {
                return { success: false, message: '您已經出獄了。' };
            }

            const kuCoin = data.kuCoin || 0;
            const crimeRecord = data.crimeRecord || 0;
            const bailAmount = (providedBailAmount !== null && !isNaN(providedBailAmount))
                ? providedBailAmount
                : calculateBailAmount(crimeRecord, kuCoin);
            
            if (kuCoin < bailAmount) {
                return { success: false, message: `你的錢包只有 ${kuCoin.toLocaleString()} 哭幣，連保釋金 ${bailAmount.toLocaleString()} 都付不起，繼續蹲吧！` };
            }

            t.update(docRef, {
                kuCoin: db.FieldValue.increment(-bailAmount),
                jailedUntil: db.FieldValue.delete(),
                wantedLevel: 0
            });

            return { success: true, bailAmount, name: memberName || data.displayName || data.name, newBalance: kuCoin - bailAmount };
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        const bubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader('💸 交保成功', '重獲自由', '#F57F17', '#FFFDE7'),
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: `${result.name} 繳清了法院規定的保釋金！`, size: 'sm', color: '#666666', wrap: true }),
                flexUtils.createText({ text: `💰 支付保釋金：-${result.bailAmount.toLocaleString()} 哭幣`, size: 'md', weight: 'bold', color: '#C62828', margin: 'md' }),
                flexUtils.createText({ text: `💰 結算總資產：${result.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#1A1A1A', margin: 'sm' }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `🔓 監獄大門敞開！您的通緝值已全數歸零，請重新做人！`, size: 'sm', weight: 'bold', color: '#2E7D32', margin: 'md', wrap: true })
            ], { paddingAll: 'xl', backgroundColor: '#FFFFFF' })
        });
        await lineUtils.replyFlex(replyToken, '交保成功', bubble);

    } catch (e) {
        console.error('[Jail] confirmBail Error:', e);
        await lineUtils.replyText(replyToken, '❌ 交保失敗，請稍後再試。');
    }
}

/**
 * 產生幫人保釋確認面板
 */
async function handleBailOther(replyToken, context, messageObject) {
    const { userId: fromUserId } = context;
    const mentionObj = messageObject && messageObject.mention;
    
    if (!mentionObj || !mentionObj.mentionees || mentionObj.mentionees.length === 0) {
        await lineUtils.replyText(replyToken, '❌ 請 @標記 你要保釋的對象！');
        return;
    }

    const targetUserId = mentionObj.mentionees[0].userId;
    if (fromUserId === targetUserId) {
        await lineUtils.replyText(replyToken, '❌ 要保釋自己請使用 交保');
        return;
    }

    try {
        const targetDocRef = db.collection(COLLECTION_NAME).doc(targetUserId);
        const targetDoc = await targetDocRef.get();
        if (!targetDoc.exists) {
            await lineUtils.replyText(replyToken, '❌ 找不到該玩家資料。');
            return;
        }

        const targetData = targetDoc.data();
        if (!targetData.jailedUntil || Date.now() >= targetData.jailedUntil) {
            await lineUtils.replyText(replyToken, '❌ 對方目前沒有在坐牢。');
            return;
        }

        const crimeRecord = targetData.crimeRecord || 0;
        const kuCoin = targetData.kuCoin || 0;
        const bailAmount = calculateBailAmount(crimeRecord, kuCoin);
        const targetName = targetData.displayName || targetData.name || '該名犯人';
        
        const header = flexUtils.createHeader('📜 保釋確認', '義氣相挺的代價', flexUtils.COLORS.PRIMARY);
        const body = flexUtils.createBox('vertical', [
            flexUtils.createText({ text: `保釋對象：${targetName}`, size: 'sm', weight: 'bold', wrap: true }),
            flexUtils.createText({ text: `對方前科：${crimeRecord} 次`, size: 'sm', color: flexUtils.COLORS.GRAY, wrap: true }),
            flexUtils.createSeparator('sm'),
            flexUtils.createText({ text: `應付保釋金：${bailAmount.toLocaleString()} 哭幣`, weight: 'bold', size: 'md', color: flexUtils.COLORS.DANGER, margin: 'md', wrap: true }),
            flexUtils.createText({ text: `※對方出獄後通緝值將歸零`, size: 'xs', color: flexUtils.COLORS.GRAY, margin: 'md', wrap: true })
        ], { paddingAll: 'xl' });
        
        const footer = flexUtils.createBox('horizontal', [
            flexUtils.createButton({ action: { type: 'postback', label: '確認保釋', data: `action=confirmBailOther&targetId=${targetUserId}&initiatorId=${fromUserId}&bailAmount=${bailAmount}`, displayText: `確認保釋 @${targetName}` }, style: 'primary' })
        ], { paddingAll: 'md' });
        
        const flexBubble = flexUtils.createBubble({ size: 'mega', header, body, footer });
        await lineUtils.replyFlex(replyToken, '保釋確認', flexBubble);

    } catch (e) {
        console.error('[Jail] handleBailOther Error:', e);
        await lineUtils.replyText(replyToken, '❌ 系統錯誤。');
    }
}

/**
 * 執行幫人保釋扣款
 */
async function confirmBailOther(replyToken, context, targetUserId, providedBailAmount = null) {
    const { userId: fromUserId, groupId } = context;
    targetUserId = targetUserId.trim();

    try {
        const fromMemberName = await lineUtils.getGroupMemberName(groupId, fromUserId);
        const targetMemberName = await lineUtils.getGroupMemberName(groupId, targetUserId);

        const result = await db.runTransaction(async (t) => {
            const fromDocRef = db.collection(COLLECTION_NAME).doc(fromUserId);
            const targetDocRef = db.collection(COLLECTION_NAME).doc(targetUserId);
            
            const fromDoc = await t.get(fromDocRef);
            const targetDoc = await t.get(targetDocRef);
            
            if (!fromDoc.exists || !targetDoc.exists) return { success: false, message: '找不到玩家資料。' };

            const fromData = fromDoc.data();
            const targetData = targetDoc.data();

            if (!targetData.jailedUntil || Date.now() >= targetData.jailedUntil) {
                return { success: false, message: '對方已經出獄了。' };
            }

            const fromCoin = fromData.kuCoin || 0;
            const crimeRecord = targetData.crimeRecord || 0;
            const kuCoin = targetData.kuCoin || 0;
            const bailAmount = (providedBailAmount !== null && !isNaN(providedBailAmount))
                ? providedBailAmount
                : calculateBailAmount(crimeRecord, kuCoin);

            if (fromCoin < bailAmount) {
                return { success: false, message: `兄弟情深也要看錢包啊！保釋他需要 ${bailAmount.toLocaleString()}，你只有 ${fromCoin.toLocaleString()} 哭幣。` };
            }

            t.update(fromDocRef, {
                kuCoin: db.FieldValue.increment(-bailAmount)
            });
            
            t.update(targetDocRef, {
                jailedUntil: db.FieldValue.delete(),
                wantedLevel: 0
            });

            return { 
                success: true, 
                bailAmount, 
                fromName: fromMemberName || fromData.displayName || fromData.name,
                targetName: targetMemberName || targetData.displayName || targetData.name,
                newBalance: fromCoin - bailAmount
            };
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        const bubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader('🤝 保釋成功', '兄弟情深', '#6A1B9A', '#F3E5F5'),
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: `${result.fromName} 霸氣地甩出保釋金，保釋了 ${result.targetName}！`, size: 'sm', color: '#666666', wrap: true }),
                flexUtils.createText({ text: `💰 支付保釋金：-${result.bailAmount.toLocaleString()} 哭幣`, size: 'md', weight: 'bold', color: '#C62828', margin: 'md' }),
                flexUtils.createText({ text: `💰 結算總資產：${result.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#1A1A1A', margin: 'sm' }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `🔓 監獄大門為 ${result.targetName} 敞開！\n對方的通緝值已全數歸零，快說謝謝乾爹！`, size: 'sm', weight: 'bold', color: '#2E7D32', margin: 'md', wrap: true })
            ], { paddingAll: 'xl', backgroundColor: '#FFFFFF' })
        });
        await lineUtils.replyFlex(replyToken, '保釋成功', bubble);

    } catch (e) {
        console.error('[Jail] confirmBailOther Error:', e);
        await lineUtils.replyText(replyToken, '❌ 保釋失敗。');
    }
}



/**
 * 幫典獄長吹喇叭
 */
async function handleBlowWarden(replyToken, context) {
    const { userId, groupId } = context;

    try {
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);
        const result = await db.runTransaction(async (t) => {
            const docRef = db.collection('economy_users').doc(userId);
            const doc = await t.get(docRef);
            if (!doc.exists) return { success: false, message: '找不到資料。' };
            const data = doc.data();
            
            if (!data.jailedUntil || Date.now() >= data.jailedUntil) {
                return { success: false, message: '你又沒坐牢，跑來吹什麼喇叭？' };
            }

            if (data.blowCooldownUntil && Date.now() < data.blowCooldownUntil) {
                const remaining = Math.ceil((data.blowCooldownUntil - Date.now()) / 60000);
                return { success: false, message: `典獄長現在進入聖人模式，請休息 ${remaining} 分鐘後再來！` };
            }

            const rand = Math.random() * 100;
            const cooldownTime = Date.now() + 30 * 60 * 1000;
            
            let isFree = false;
            let finalJailedUntil = data.jailedUntil;
            let eventMsg = '';
            let isBad = false;

            if (rand < 10) {
                // 10% 典獄長覺得不舒服，加刑 30 分鐘
                finalJailedUntil = Math.max(Date.now(), data.jailedUntil) + (30 * 60 * 1000);
                eventMsg = '你牙齒撞到典獄長，他不舒服一怒之下給你加刑 30 分鐘！';
                isBad = true;
            } else if (rand < 50) {
                // 40% 白嫖
                eventMsg = '你賣力服務了半天，典獄長爽完提上褲子就不認人了，刑期一點也沒少！(被白嫖)';
                isBad = true;
            } else {
                // 50% 扣除一半剩餘刑期
                const remainingMins = Math.ceil((data.jailedUntil - Date.now()) / 60000);
                const deductMins = Math.floor(remainingMins / 2);
                finalJailedUntil = data.jailedUntil - (deductMins * 60 * 1000);
                eventMsg = `典獄長龍心大悅！直接幫你減去了一半的剩餘刑期 (${deductMins} 分鐘)！`;
                if (finalJailedUntil <= Date.now()) isFree = true;
            }

            if (isFree) {
                t.update(docRef, { jailedUntil: db.FieldValue.delete(), blowCooldownUntil: cooldownTime });
            } else {
                t.update(docRef, { jailedUntil: finalJailedUntil, blowCooldownUntil: cooldownTime });
            }

            return { success: true, isFree, eventMsg, isBad, name: memberName || data.name, finalJailedUntil };
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        if (result.isFree) {
            await lineUtils.replyText(replyToken, `👄 【特殊服務】\n${result.name} 敲開了典獄長的辦公室...\n${result.eventMsg}\n\n🎉 由於刑期已滿，典獄長批准你出獄啦！`);
        } else {
            const remainingMins = Math.ceil((result.finalJailedUntil - Date.now()) / 60000);
            const icon = result.isBad ? '😭' : '👄';
            await lineUtils.replyText(replyToken, `${icon} 【特殊服務】\n${result.name} 敲開了典獄長的辦公室...\n${result.eventMsg}\n\n目前剩餘刑期：${remainingMins} 分鐘。 (冷卻30分)`);
        }

    } catch (e) {
        console.error('[Jail] handleBlowWarden Error:', e);
    }
}

/**
 * 越獄
 */
async function handleJailbreak(replyToken, context) {
    const { userId, groupId } = context;

    try {
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);
        
        // 獲取玩家 LUK
        const { getFinalPlayerStats } = require('./rpg');
        const stats = await getFinalPlayerStats(userId);
        const luk = stats.final.luk || 0;
        
        const result = await db.runTransaction(async (t) => {
            const docRef = db.collection(COLLECTION_NAME).doc(userId);
            const doc = await t.get(docRef);
            
            if (!doc.exists) {
                return { success: false, message: '找不到您的資料。' };
            }
            
            const data = doc.data();
            if (!data.jailedUntil || Date.now() >= data.jailedUntil) {
                const spam = getSpamResponse(data, 'not_jailed', '你又沒坐牢，越什麼獄？想進來嗎？');
                t.update(docRef, { spamTracker: spam.newTracker });
                return { success: false, message: spam.message, ignore: spam.ignore };
            }

            // CD 10 分鐘
            if (data.jailbreakCooldownUntil && Date.now() < data.jailbreakCooldownUntil) {
                const remaining = Math.ceil((data.jailbreakCooldownUntil - Date.now()) / 60000);
                const spam = getSpamResponse(data, 'jailbreak_cd', `你才剛被獄警毒打一頓，腿還在發抖！請休息 ${remaining} 分鐘後再嘗試越獄。`);
                
                let extraUpdates = { spamTracker: spam.newTracker };
                if (spam.triggerPenalty) {
                    // 懲罰：加刑 5 分鐘
                    extraUpdates.jailedUntil = Math.max(Date.now(), data.jailedUntil + 5 * 60 * 1000);
                    // 同時延長一點 CD 避免一直狂刷
                    extraUpdates.jailbreakCooldownUntil = data.jailbreakCooldownUntil + 5 * 60 * 1000;
                }
                t.update(docRef, extraUpdates);
                return { success: false, message: spam.message, ignore: spam.ignore };
            }

            const rand = Math.random() * 100;
            
            // 越獄成功基礎機率 5% + (EVA * 1.0625)%
            const eva = stats.final.eva || 0;
            let finalChance = 5 + (eva * 1.0625);

            // 黑道監獄地頭蛇加成
            const { getWantedList, getMafiaRank } = require('./profession');
            const wantedList = await getWantedList();
            const mafiaRank = await getMafiaRank(userId, data, wantedList);
            
            if (mafiaRank === 'boss') {
                finalChance = 100; // 監獄是我家：越獄成功率 100%
            } else if (mafiaRank === 'capo') {
                finalChance += 50; // 監獄老手：越獄成功率 +50%
            } else if (mafiaRank === 'thug') {
                finalChance += 30; // 監獄常客：越獄成功率 +30%
            }

            let isSuccess = rand < finalChance; 
            let usedShiv = false;
            
            // 若有夾帶違禁品 (銼刀)，必定成功
            if (data.hasShiv) {
                isSuccess = true;
                usedShiv = true;
            }

            if (isSuccess) {
                const updateData = { jailedUntil: db.FieldValue.delete(), wantedLevel: 1.0 };
                if (usedShiv) updateData.hasShiv = db.FieldValue.delete();
                t.update(docRef, updateData);
                return { success: true, jailbreak: true, usedShiv, name: memberName || data.displayName || data.name };
            } else {
                // 90% 失敗，加刑 60 分鐘，並套用 10 分鐘冷卻
                const newJailedUntil = Math.max(data.jailedUntil, Date.now()) + (60 * 60 * 1000);
                const cooldownTime = Date.now() + 10 * 60 * 1000;
                t.update(docRef, { 
                    jailedUntil: newJailedUntil,
                    jailbreakCooldownUntil: cooldownTime
                });
                return { success: true, jailbreak: false, name: memberName || data.displayName || data.name, newJailedUntil };
            }
        });

        if (!result.success) {
            if (result.ignore) return;
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        if (result.jailbreak) {
            const shivMsg = result.usedShiv ? `\n(使用了偷藏的【銼刀】，不費吹灰之力鋸開了鐵窗！)` : '';
            const bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader(`🏃‍♂️💨 越獄成功`, '', '#FFFFFF', '#4CAF50'),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `${result.name} 趁著警衛打瞌睡，成功翻過高牆逃出去了！重獲自由！${shivMsg}`, size: 'sm', color: '#666666', wrap: true }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: `⚠️ 警告：該犯人現已成為全國頭號通緝犯，警方將全面追緝！`, size: 'xs', weight: 'bold', color: '#D32F2F', margin: 'md', wrap: true })
                ], { paddingAll: 'xl', backgroundColor: '#FAFAFA' })
            });
            await lineUtils.replyFlex(replyToken, '越獄成功', bubble);
        } else {
            const remainingMins = Math.ceil((result.newJailedUntil - Date.now()) / 60000);
            const bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader(`🚨 越獄失敗`, '', '#FFFFFF', '#B71C1C'),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `警報聲大作！${result.name} 卡在通風管被警衛抓個正著！`, size: 'sm', color: '#666666', wrap: true }),
                    flexUtils.createText({ text: `👮 獄警：「還敢逃？把你打到腿斷掉！」`, size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'md', wrap: true }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: `您的刑期增加 60 分鐘！\n目前剩餘刑期：${remainingMins} 分鐘。`, size: 'sm', color: '#333333', margin: 'md', wrap: true }),
                    flexUtils.createText({ text: `⏳ 冷卻時間：10 分鐘\n（可於 ${new Date(Date.now() + 10 * 60 * 1000).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })} 後再次越獄）`, size: 'xs', color: '#B71C1C', margin: 'md', wrap: true })
                ], { paddingAll: 'xl', backgroundColor: '#FFEBEE' })
            });
            await lineUtils.replyFlex(replyToken, '越獄失敗', bubble);
        }

    } catch (e) {
        console.error('[Jail] handleJailbreak Error:', e);
        await lineUtils.replyText(replyToken, '❌ 越獄行動發生意外，請稍後再試。');
    }
}

/**
 * 撿肥皂
 */
async function handleDropSoap(replyToken, context) {
    const { userId, groupId } = context;

    try {
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);
        
        const result = await db.runTransaction(async (t) => {
            const docRef = db.collection(COLLECTION_NAME).doc(userId);
            const doc = await t.get(docRef);
            
            if (!doc.exists) return { success: false, message: '找不到資料。' };
            
            const data = doc.data();
            if (!data.jailedUntil || Date.now() >= data.jailedUntil) {
                const spam = getSpamResponse(data, 'not_jailed', '你又沒坐牢，去哪裡撿肥皂？');
                t.update(docRef, { spamTracker: spam.newTracker });
                return { success: false, message: spam.message, ignore: spam.ignore };
            }

            // CD 10 分鐘
            if (data.soapCooldownUntil && Date.now() < data.soapCooldownUntil) {
                const remaining = Math.ceil((data.soapCooldownUntil - Date.now()) / 60000);
                const spam = getSpamResponse(data, 'soap_cd', `你的腰還在痛，請休息 ${remaining} 分鐘後再嘗試撿肥皂。`);
                t.update(docRef, { spamTracker: spam.newTracker });
                return { success: false, message: spam.message, ignore: spam.ignore };
            }

            const rand = Math.random() * 100;
            const cooldownTime = Date.now() + 10 * 60 * 1000;
            
            if (rand < 50) {
                // 50% 拿到 10k ~ 50k，減少 10 ~ 30 分鐘刑期
                const reward = Math.floor(Math.random() * 40001) + 10000;
                const reduceMins = Math.floor(Math.random() * 21) + 10;
                const reduceMs = reduceMins * 60 * 1000;
                
                let newJailedUntil = (data.jailedUntil || Date.now()) - reduceMs;
                if (newJailedUntil < Date.now()) newJailedUntil = Date.now(); // 直接釋放
                
                t.update(docRef, {
                    kuCoin: db.FieldValue.increment(reward),
                    jailedUntil: newJailedUntil,
                    soapCooldownUntil: cooldownTime
                });
                return { success: true, isGood: true, reward, reduceMins, isFree: newJailedUntil <= Date.now(), name: memberName || data.displayName || data.name || '未知', finalJailedUntil: newJailedUntil, newBalance: (data.kuCoin || 0) + reward };
            } else {
                // 50% 刑期增加 10 ~ 30 分鐘
                const addMins = Math.floor(Math.random() * 21) + 10;
                const addMs = addMins * 60 * 1000;
                const newJailedUntil = (data.jailedUntil || Date.now()) + addMs;
                
                t.update(docRef, {
                    jailedUntil: newJailedUntil,
                    soapCooldownUntil: cooldownTime
                });
                return { success: true, isGood: false, addMins, name: memberName || data.displayName || data.name || '未知', finalJailedUntil: newJailedUntil };
            }
        });

        if (!result.success) {
            if (result.ignore) return;
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        let bubble;
        const now = Date.now();
        const cdText = `⏳ 冷卻時間：10 分鐘\n（可於 ${new Date(Date.now() + 10 * 60 * 1000).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })} 後再次撿肥皂）`;
        
        if (result.isGood) {
            const remainingMins = Math.ceil((result.finalJailedUntil - now) / 60000);
            const bodyContents = [
                flexUtils.createText({ text: `${result.name} 在浴室撿肥皂時，意外發現了前人藏在磁磚縫裡的逃生道具！`, size: 'sm', color: '#666666', wrap: true }),
                flexUtils.createText({ text: `💰 發現暗盤：+${result.reward.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#2E7D32', margin: 'md' }),
                flexUtils.createText({ text: `⏱️ 刑期減免：-${result.reduceMins} 分鐘`, size: 'sm', weight: 'bold', color: '#2E7D32', margin: 'sm' }),
                flexUtils.createText({ text: `💰 結算總資產：${result.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#1A1A1A', margin: 'sm' }),
                flexUtils.createSeparator('md')
            ];

            if (result.isFree) {
                bodyContents.push(flexUtils.createText({ text: `🎉 由於刑期歸零，${result.name} 順利刑滿釋放出獄！`, size: 'md', weight: 'bold', color: '#2E7D32', margin: 'md', wrap: true }));
            } else {
                bodyContents.push(flexUtils.createText({ text: `⏱️ 目前剩餘刑期：${remainingMins} 分鐘。`, size: 'sm', color: '#333333', margin: 'md', wrap: true }));
            }
            bodyContents.push(flexUtils.createText({ text: cdText, size: 'xs', color: '#2E7D32', margin: 'md', wrap: true }));

            bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('🧼 意外暗盤', '好運降臨', '#2E7D32', '#E8F5E9'),
                body: flexUtils.createBox('vertical', bodyContents, { paddingAll: 'xl', backgroundColor: '#FFFFFF' })
            });
        } else {
            const remainingMins = Math.ceil((result.finalJailedUntil - now) / 60000);
            bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('🧼💥 肥皂滑落', '手滑慘劇', '#C62828', '#FFEBEE'),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `啊...手滑了！肥皂掉在地上！\n當 ${result.name} 彎腰去撿時，後方的獄霸露出了神祕的微笑...`, size: 'sm', color: '#666666', wrap: true }),
                    flexUtils.createText({ text: `(一陣慘叫聲傳來...)`, size: 'sm', weight: 'bold', color: '#C62828', margin: 'md', align: 'center' }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: `🚨 身心受創被送往醫務室，加刑 ${result.addMins} 分鐘！`, size: 'sm', weight: 'bold', color: '#C62828', margin: 'md', wrap: true }),
                    flexUtils.createText({ text: `⏱️ 目前剩餘刑期：${remainingMins} 分鐘。`, size: 'sm', color: '#333333', margin: 'sm', wrap: true }),
                    flexUtils.createText({ text: cdText, size: 'xs', color: '#C62828', margin: 'md', wrap: true })
                ], { paddingAll: 'xl', backgroundColor: '#FFFFFF' })
            });
        }
        await lineUtils.replyFlex(replyToken, '撿肥皂結果', bubble);

    } catch (e) {
        console.error('[Jail] handleDropSoap Error:', e);
        await lineUtils.replyText(replyToken, '❌ 撿肥皂失敗。');
    }
}

/**
 * 勞動改造
 */
async function handleLabor(replyToken, context) {
    const { userId, groupId } = context;

    try {
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);
        const { getFinalPlayerStats } = require('./rpg');
        const stats = await getFinalPlayerStats(userId);
        const atk = stats.final.atk || 0;
        const luk = stats.final.luk || 0;

        const result = await db.runTransaction(async (t) => {
            const docRef = db.collection(COLLECTION_NAME).doc(userId);
            const doc = await t.get(docRef);
            if (!doc.exists) return { success: false, message: '找不到資料。' };
            const data = doc.data();
            
            if (!data.jailedUntil || Date.now() >= data.jailedUntil) {
                const spam = getSpamResponse(data, 'not_jailed', '你又沒坐牢，來勞動什麼？想進來嗎？');
                t.update(docRef, { spamTracker: spam.newTracker });
                return { success: false, message: spam.message, ignore: spam.ignore };
            }

            // CD 5 分鐘
            if (data.laborCooldownUntil && Date.now() < data.laborCooldownUntil) {
                const remaining = Math.ceil((data.laborCooldownUntil - Date.now()) / 60000);
                const spam = getSpamResponse(data, 'labor_cd', `你才剛刷完馬桶，休息 ${remaining} 分鐘後再來！`);
                
                let extraUpdates = { spamTracker: spam.newTracker };
                if (spam.triggerPenalty) {
                    extraUpdates.jailedUntil = Math.max(Date.now(), data.jailedUntil + 2 * 60 * 1000);
                    extraUpdates.laborCooldownUntil = data.laborCooldownUntil + 2 * 60 * 1000;
                }
                t.update(docRef, extraUpdates);
                return { success: false, message: spam.message, ignore: spam.ignore };
            }

            const rand = Math.random() * 100;
            const cooldownTime = Date.now() + 5 * 60 * 1000;
            
            // 降低勞動收益: 基礎 5~10 分鐘，外加 10% 攻擊力加成
            const reduceMins = Math.floor(Math.random() * 6) + 5 + Math.floor(atk * 0.1);
            const newJailedUntil = Math.max(Date.now(), data.jailedUntil - (reduceMins * 60 * 1000));
            
            let eventMsg = '';
            let isFree = false;
            let finalJailedUntil = newJailedUntil;
            let extraCoin = 0;

            if (rand < 10) {
                // 10% 洗破內褲，加刑 20 分
                finalJailedUntil = Math.max(Date.now(), data.jailedUntil + (20 * 60 * 1000));
                eventMsg = '你不小心把典獄長的內褲洗破了，刑期增加 20 分鐘！';
            } else if (rand < 25) {
                // 15% 找到錢
                extraCoin = Math.floor(Math.random() * 4000) + 1000;
                eventMsg = `你在洗衣房的囚服裡摸到前人藏的 ${extraCoin.toLocaleString()} 哭幣！(已悄悄存入帳戶)`;
            } else {
                eventMsg = `你乖乖地刷了 10 個馬桶，表現良好。`;
            }

            if (finalJailedUntil <= Date.now()) {
                isFree = true;
                t.update(docRef, { jailedUntil: db.FieldValue.delete(), kuCoin: db.FieldValue.increment(extraCoin) });
            } else {
                t.update(docRef, { 
                    jailedUntil: finalJailedUntil,
                    laborCooldownUntil: cooldownTime,
                    kuCoin: db.FieldValue.increment(extraCoin)
                });
            }

            return { success: true, isFree, eventMsg, reduceMins, finalJailedUntil, name: memberName || data.name, extraCoin, newBalance: (data.kuCoin || 0) + extraCoin };
        });

        if (!result.success) {
            if (result.ignore) return;
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        let bubble;
        const now = Date.now();
        const cdText = `⏳ 冷卻時間：5 分鐘\n（可於 ${new Date(Date.now() + 5 * 60 * 1000).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })} 後再次勞動）`;

        if (result.isFree) {
            const bodyContents = [
                flexUtils.createText({ text: `${result.name} 努力進行勞動改造！`, size: 'sm', color: '#666666', wrap: true }),
                flexUtils.createText({ text: `📝 ${result.eventMsg}`, size: 'sm', weight: 'bold', color: '#333333', margin: 'md', wrap: true })
            ];
            if (result.extraCoin > 0) {
                bodyContents.push(flexUtils.createText({ text: `💰 結算總資產：${result.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#1A1A1A', margin: 'sm' }));
            }
            bodyContents.push(
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `🎉 由於刑期已滿，典獄長批准你出獄啦！重獲自由！`, size: 'md', weight: 'bold', color: '#2E7D32', margin: 'md', wrap: true }),
                flexUtils.createText({ text: cdText, size: 'xs', color: '#2E7D32', margin: 'md', wrap: true })
            );

            bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('⛏️ 勞動改造', '刑滿釋放', '#E65100', '#FFF3E0'),
                body: flexUtils.createBox('vertical', bodyContents, { paddingAll: 'xl', backgroundColor: '#FFFFFF' })
            });
        } else {
            const remainingMins = Math.ceil((result.finalJailedUntil - now) / 60000);
            const isBadEvent = result.eventMsg.includes('內褲洗破');
            const headerTitle = isBadEvent ? '🚨 勞動失誤' : '⛏️ 勞動改造';
            const headerSubtitle = isBadEvent ? '意外加刑' : '減刑成功';
            const headerBg = isBadEvent ? '#FFEBEE' : '#FFF3E0';
            const headerTextCol = isBadEvent ? '#C62828' : '#E65100';

            const bodyContents = [
                flexUtils.createText({ text: `${result.name} 努力進行勞動改造，獲得減刑 ${result.reduceMins} 分鐘！`, size: 'sm', color: '#666666', wrap: true }),
                flexUtils.createText({ text: `📝 隨機事件：${result.eventMsg}`, size: 'sm', weight: 'bold', color: isBadEvent ? '#C62828' : '#333333', margin: 'md', wrap: true })
            ];
            if (result.extraCoin > 0) {
                bodyContents.push(flexUtils.createText({ text: `💰 結算總資產：${result.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#1A1A1A', margin: 'sm' }));
            }
            bodyContents.push(
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `⏱️ 目前剩餘刑期：${remainingMins} 分鐘。`, size: 'sm', color: '#333333', margin: 'md', wrap: true }),
                flexUtils.createText({ text: cdText, size: 'xs', color: isBadEvent ? '#C62828' : '#E65100', margin: 'md', wrap: true })
            );

            bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader(headerTitle, headerSubtitle, headerTextCol, headerBg),
                body: flexUtils.createBox('vertical', bodyContents, { paddingAll: 'xl', backgroundColor: '#FFFFFF' })
            });
        }
        await lineUtils.replyFlex(replyToken, '勞動改造結果', bubble);

    } catch (e) {
        console.error('[Jail] handleLabor Error:', e);
        await lineUtils.replyText(replyToken, '❌ 勞動失敗。');
    }
}

/**
 * 探監
 */
async function handleVisit(replyToken, context, messageObject) {
    const { userId: fromUserId, groupId } = context;
    const mentionObj = messageObject && messageObject.mention;
    
    if (!mentionObj || !mentionObj.mentionees || mentionObj.mentionees.length === 0) {
        await lineUtils.replyText(replyToken, '❌ 請問你要探誰的監？請 @標記 探監對象！(費用: 50,000 哭幣)');
        return;
    }

    const targetUserId = mentionObj.mentionees[0].userId;

    if (fromUserId === targetUserId) {
        await lineUtils.replyText(replyToken, '❌ 你要探監你自己？有病嗎？');
        return;
    }

    const visitCost = 50000;

    try {
        const fromMemberName = await lineUtils.getGroupMemberName(groupId, fromUserId);
        const targetMemberName = await lineUtils.getGroupMemberName(groupId, targetUserId);

        const result = await db.runTransaction(async (t) => {
            const fromDocRef = db.collection(COLLECTION_NAME).doc(fromUserId);
            const targetDocRef = db.collection(COLLECTION_NAME).doc(targetUserId);
            
            const fromDoc = await t.get(fromDocRef);
            const targetDoc = await t.get(targetDocRef);
            
            if (!fromDoc.exists || !targetDoc.exists) {
                return { success: false, message: '找不到玩家資料。' };
            }

            const fromData = fromDoc.data();
            const targetData = targetDoc.data();

            if (!targetData.jailedUntil || Date.now() >= targetData.jailedUntil) {
                return { success: false, message: '對方目前沒有在坐牢，你探個屁監？' };
            }

            const fromCoin = fromData.kuCoin || 0;
            if (fromCoin < visitCost) {
                return { success: false, message: `打通獄警探監需要 ${visitCost.toLocaleString()} 哭幣，你只有 ${fromCoin.toLocaleString()} 哭幣。` };
            }

            const rand = Math.random() * 100;
            
            if (rand < 20) {
                // 20% 被抓包
                const jailedUntil = Date.now() + (30 * 60 * 1000);
                t.update(fromDocRef, {
                    kuCoin: db.FieldValue.increment(-visitCost),
                    jailedUntil,
                    jailbreakCooldownUntil: db.FieldValue.delete()
                });
                return { success: true, caught: true, name: fromMemberName || fromData.name, targetName: targetMemberName || targetData.name, newBalance: fromCoin - visitCost };
            } else {
                // 80% 成功送達違禁品
                t.update(fromDocRef, { kuCoin: db.FieldValue.increment(-visitCost) });
                t.update(targetDocRef, { hasShiv: true });
                return { success: true, caught: false, name: fromMemberName || fromData.name, targetName: targetMemberName || targetData.name, newBalance: fromCoin - visitCost };
            }
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        let bubble;
        if (result.caught) {
            bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('🚨 探監失敗', '夾帶違禁品被捕', '#C62828', '#FFEBEE'),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `${result.name} 帶了一碗「藏有銼刀的豬腳麵線」去探監 ${result.targetName}...`, size: 'sm', color: '#666666', wrap: true }),
                    flexUtils.createText({ text: `結果在金屬探測門逼逼大作！👮 獄警：「當我瞎了嗎？抓起來！」`, size: 'sm', weight: 'bold', color: '#C62828', margin: 'md', wrap: true }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: `💸 沒收打點費：${visitCost.toLocaleString()} 哭幣`, size: 'xs', color: '#888888', margin: 'md' }),
                    flexUtils.createText({ text: `💰 結算總資產：${result.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#1A1A1A', margin: 'sm' }),
                    flexUtils.createText({ text: `🔒 懲罰：${result.name} 被收押入獄 30 分鐘！(買一送一)`, size: 'sm', weight: 'bold', color: '#C62828', margin: 'sm', wrap: true })
                ], { paddingAll: 'xl', backgroundColor: '#FFFFFF' })
            });
        } else {
            bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('🍱 探監成功', '義氣相挺', '#006064', '#E0F7FA'),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `${result.name} 成功用 ${visitCost.toLocaleString()} 哭幣打通獄警，前去探望了 ${result.targetName}！`, size: 'sm', color: '#666666', wrap: true }),
                    flexUtils.createText({ text: `「兄弟，麵線趁熱吃，底下有好康的...」`, size: 'sm', weight: 'bold', color: '#006064', margin: 'md', wrap: true }),
                    flexUtils.createText({ text: `💰 結算總資產：${result.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#1A1A1A', margin: 'sm' }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: `🔑 ${result.targetName} 獲得了逃生工具【銼刀】！\n下一次使用「越獄」指令時必定成功！`, size: 'sm', weight: 'bold', color: '#2E7D32', margin: 'md', wrap: true })
                ], { paddingAll: 'xl', backgroundColor: '#FFFFFF' })
            });
        }
        await lineUtils.replyFlex(replyToken, '探監結果', bubble);

    } catch (e) {
        console.error('[Jail] handleVisit Error:', e);
        await lineUtils.replyText(replyToken, '❌ 探監失敗。');
    }
}

// 全域暴動狀態追蹤
let riotState = {
    active: false,
    startTime: 0,
    participants: new Set(),
    groupId: null
};

async function loadRiotState() {
    try {
        const doc = await db.collection('system_state').doc('riot').get();
        if (doc.exists) {
            const data = doc.data();
            if (data.active && Date.now() - data.startTime <= 3 * 60 * 1000) {
                riotState.active = data.active;
                riotState.startTime = data.startTime;
                riotState.participants = new Set(data.participants || []);
                riotState.groupId = data.groupId;
                return;
            }
        }
    } catch (e) {
        console.error('[Jail] loadRiotState Error:', e);
    }
    // Default or expired
    riotState.active = false;
    riotState.startTime = 0;
    riotState.participants = new Set();
    riotState.groupId = null;
}

async function saveRiotState() {
    try {
        await db.collection('system_state').doc('riot').set({
            active: riotState.active,
            startTime: riotState.startTime,
            participants: Array.from(riotState.participants),
            groupId: riotState.groupId
        });
    } catch (e) {
        console.error('[Jail] saveRiotState Error:', e);
    }
}

async function handleRiot(replyToken, context) {
    const { userId, groupId } = context;

    try {
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);
        const docRef = db.collection(COLLECTION_NAME).doc(userId);
        const doc = await docRef.get();
        if (!doc.exists) return;
        const data = doc.data();

        if (!data.jailedUntil || Date.now() >= data.jailedUntil) {
            await lineUtils.replyText(replyToken, '❌ 你不在監獄裡，湊什麼熱鬧？');
            return;
        }

        // CD 10 分鐘
        if (data.riotCooldownUntil && Date.now() < data.riotCooldownUntil) {
            const remaining = Math.ceil((data.riotCooldownUntil - Date.now()) / 60000);
            await lineUtils.replyText(replyToken, `❌ 鎮暴部隊還盯著你，請休息 ${remaining} 分鐘後再嘗試暴動。`);
            return;
        }

        await loadRiotState();
        const now = Date.now();
        
        // 抓取監獄名單
        const snapshot = await db.collection(COLLECTION_NAME).where('jailedUntil', '>', now).get();
        const prisonersMap = new Map();
        snapshot.forEach(doc => {
            const pData = doc.data();
            const pName = pData.displayName || pData.name || '無名氏';
            prisonersMap.set(doc.id, pName);
        });

        // 檢查暴動狀態
        if (!riotState.active || now - riotState.startTime > 3 * 60 * 1000) {
            // 開啟新暴動
            riotState = {
                active: true,
                startTime: now,
                participants: new Set([userId]),
                groupId: groupId
            };
            await saveRiotState();
            
            let otherPrisonersMsg = '';
            const others = Array.from(prisonersMap.keys()).filter(id => id !== userId);
            if (others.length > 0) {
                const otherNames = others.map(id => prisonersMap.get(id)).join('、');
                otherPrisonersMsg = `👀 目前監獄裡的其他獄友有：\n${otherNames}`;
            } else {
                otherPrisonersMsg = `👀 (目前監獄裡只有你一個人，我看是很難成功...)`;
            }

            const header = flexUtils.createHeader('🔥 監獄暴動發起 🔥', '王侯將相，寧有種乎！', '#FFFFFF', '#D32F2F');
            const body = flexUtils.createBox('vertical', [
                flexUtils.createText({ text: `${memberName} 拿著牙刷大喊，發起了監獄暴動！`, size: 'sm', weight: 'bold', wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `距離暴動行動還有 3 分鐘！`, weight: 'bold', color: '#D32F2F', margin: 'md' }),
                flexUtils.createText({ text: `請監獄裡的其他兄弟在限時內輸入「暴動」響應！\n(需要 2 人以上，隊伍總力量越高成功率越大！)`, size: 'xs', color: '#666666', wrap: true, margin: 'sm' }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: otherPrisonersMsg, size: 'xs', color: '#999999', wrap: true, margin: 'md' })
            ], { paddingAll: 'xl', backgroundColor: '#FAFAFA' });
            
            const initiateBubble = flexUtils.createBubble({ size: 'mega', header, body });
            
            if (others.length === 0) {
                await resolveRiot(groupId, replyToken, initiateBubble);
            } else {
                await lineUtils.replyFlex(replyToken, '監獄暴動發起', initiateBubble);
                riotState.timeoutId = setTimeout(() => resolveRiot(groupId), 3 * 60 * 1000);
            }
            return;
        }

        // 加入現有暴動
        if (riotState.participants.has(userId)) {
            await lineUtils.replyText(replyToken, `⚠️ 你已經在暴動隊伍裡了，等時間到！`);
            return;
        }

        riotState.participants.add(userId);
        await saveRiotState();
        
        const remainings = Array.from(prisonersMap.keys()).filter(id => !riotState.participants.has(id));
        const remainNames = remainings.length > 0 ? remainings.map(id => prisonersMap.get(id)).join('、') : '所有獄友都已響應！';

        const header = flexUtils.createHeader('🔥 響應暴動', '隊伍持續壯大中', '#FFFFFF', '#F57C00');
        const body = flexUtils.createBox('vertical', [
            flexUtils.createText({ text: `${memberName} 拿起臉盆，加入了暴動陣線！`, size: 'sm', weight: 'bold', wrap: true }),
            flexUtils.createText({ text: `目前響應人數：${riotState.participants.size} 人`, color: '#F57C00', weight: 'bold', margin: 'md' }),
            flexUtils.createSeparator('md'),
            flexUtils.createText({ text: `👀 尚未響應的獄友：\n${remainNames}`, size: 'xs', color: '#999999', wrap: true, margin: 'md' })
        ], { paddingAll: 'xl', backgroundColor: '#FFF3E0' });
        
        const joinBubble = flexUtils.createBubble({ size: 'mega', header, body });

        if (remainings.length > 0) {
            await lineUtils.replyFlex(replyToken, '響應暴動', joinBubble);
        } else {
            if (riotState.timeoutId) {
                clearTimeout(riotState.timeoutId);
            }
            await resolveRiot(groupId, replyToken, joinBubble);
        }

    } catch (e) {
        console.error('[Jail] handleRiot Error:', e);
    }
}

async function resolveRiot(groupId, replyToken = null, prependMsg = null) {
    const { getFinalPlayerStats } = require('./rpg');
    await loadRiotState();
    if (!riotState.active || (groupId && riotState.groupId !== groupId)) return;
    
    const participants = Array.from(riotState.participants);
    riotState.active = false;
    riotState.participants = new Set();
    riotState.groupId = null;
    await saveRiotState();
    
    if (participants.length === 0) return;

    try {
        // Fetch str is inside try now
        let bubble;
        let totalAtk = 0;
        for (const uid of participants) {
            const stats = await getFinalPlayerStats(uid);
            totalAtk += (stats.final.atk || 0);
        }
        const riotChance = Math.min(80, 10 + Math.floor(totalAtk * 0.5));
        const rand = Math.random() * 100;

        if (participants.length >= 2 && rand < riotChance) {
            // 成功暴動
            const batch = db.batch();
            for (const uid of participants) {
                const ref = db.collection(COLLECTION_NAME).doc(uid);
                batch.update(ref, { jailedUntil: db.FieldValue.delete(), wantedLevel: 1.0 });
            }
            await batch.commit();
            bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader(`🔥🔥🔥 監獄暴動成功`, '', '#FFFFFF', '#E91E63'),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `${participants.length} 名囚犯團結一致，成功推倒了監獄大門！`, size: 'sm', color: '#666666', wrap: true }),
                    flexUtils.createText({ text: `鎮暴部隊根本擋不住這群狂暴的犯人！`, size: 'sm', weight: 'bold', color: '#E91E63', margin: 'sm', wrap: true }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: `參與暴動的所有人集體越獄成功，重獲自由啦！`, size: 'sm', weight: 'bold', color: '#4CAF50', margin: 'md', wrap: true })
                ], { paddingAll: 'xl', backgroundColor: '#FCE4EC' })
            });
        } else {
            // 失敗暴動
            const batch = db.batch();
            const cooldownTime = Date.now() + 10 * 60 * 1000;
            const snaps = await Promise.all(participants.map(uid => db.collection(COLLECTION_NAME).doc(uid).get()));
            
            snaps.forEach((docSnap, i) => {
                const uid = participants[i];
                const ref = db.collection(COLLECTION_NAME).doc(uid);
                const currentJailedUntil = docSnap.exists && docSnap.data().jailedUntil ? docSnap.data().jailedUntil : Date.now();
                const newJailedUntil = Math.max(currentJailedUntil, Date.now()) + (120 * 60 * 1000);

                batch.update(ref, { 
                    riotCooldownUntil: cooldownTime,
                    jailedUntil: newJailedUntil
                });
            });
            await batch.commit();
            bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader(`🚨 監獄暴動失敗`, '', '#FFFFFF', '#B71C1C'),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `暴動行動不幸失敗！，鎮暴部隊輕鬆鎮壓了這場鬧劇！`, size: 'sm', color: '#666666', wrap: true }),
                    flexUtils.createText({ text: `👮 典獄長：「把這幾個帶頭的全部吊起來打！」`, size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'md', wrap: true }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: `參與暴動的所有人被加重刑期，目前剩餘刑期統一增加了 120 分鐘！`, size: 'sm', color: '#333333', margin: 'md', wrap: true })
                ], { paddingAll: 'xl', backgroundColor: '#FFEBEE' })
            });
        }

        // 推播結果
        let messages = [];
        if (prependMsg) {
            if (typeof prependMsg === 'string') {
                messages.push({ type: 'text', text: prependMsg });
            } else {
                messages.push(flexUtils.createFlexMessage('暴動狀態', prependMsg));
            }
        }
        messages.push(flexUtils.createFlexMessage('暴動結果', bubble));

        if (replyToken) {
            await lineUtils.replyToLine(replyToken, messages);
        } else if (groupId) {
            await lineUtils.pushMessage(groupId, messages);
        }
    } catch (e) {
        console.error('[Jail] resolveRiot Error:', e);
    }
}

/**
 * 查詢監獄名單
 */
async function handleJailList(replyToken) {
    try {
        const now = Date.now();
        // 抓取被關押的犯人 (jailedUntil > 現在時間)
        const snapshot = await db.collection(COLLECTION_NAME)
            .where('jailedUntil', '>', now)
            .orderBy('jailedUntil', 'asc')
            .limit(20)
            .get();

        if (snapshot.empty) {
            await lineUtils.replyText(replyToken, '🕊️ 目前天下太平，皇家監獄裡連一隻蚊子都沒有！');
            return;
        }

        const bubbles = [];
        let currentBubbleContents = [];
        
        snapshot.forEach((doc) => {
            const data = doc.data();
            const name = data.displayName || data.name || '未知囚犯';
            const remainingMins = Math.ceil((data.jailedUntil - now) / 60000);
            const crimeRecord = data.crimeRecord || 0;
            const title = getCriminalTitle(crimeRecord);
            const userId = doc.id;

            const row = flexUtils.createBox('horizontal', [
                flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `${title}${name}`, size: 'sm', weight: 'bold', color: '#333333', wrap: true }),
                    flexUtils.createText({ text: `前科: ${crimeRecord} 次 | 剩餘: ${remainingMins} 分`, size: 'xs', color: '#888888' }),
                    ...(data.hasShiv ? [flexUtils.createText({ text: `(偷偷藏了一把銼刀...)`, size: 'xxs', color: '#E91E63' })] : [])
                ], { flex: 2 }),
                flexUtils.createBox('vertical', [
                    flexUtils.createButton({ action: { type: 'postback', label: '保釋', data: `action=confirmBailOther&targetId=${userId}&initiatorId=self`, displayText: `確認保釋` }, style: 'secondary', height: 'sm', color: '#1DB446' }),
                    flexUtils.createButton({ action: { type: 'message', label: '探監', text: `探監 @${name}` }, style: 'link', height: 'sm', color: '#9E9E9E' })
                ], { flex: 1, spacing: 'sm' })
            ], { margin: 'md', spacing: 'sm' });

            currentBubbleContents.push(row);
            currentBubbleContents.push(flexUtils.createSeparator('sm'));

            if (currentBubbleContents.length >= 10) { // 5 items (row+sep)
                bubbles.push(flexUtils.createBubble({
                    size: 'mega',
                    header: flexUtils.createHeader('🚔 皇家監獄名單', '', '#FFFFFF', '#607D8B'),
                    body: flexUtils.createBox('vertical', currentBubbleContents, { paddingAll: 'lg' })
                }));
                currentBubbleContents = [];
            }
        });

        if (currentBubbleContents.length > 0) {
            bubbles.push(flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('🚔 皇家監獄名單', '', '#FFFFFF', '#607D8B'),
                body: flexUtils.createBox('vertical', currentBubbleContents, { paddingAll: 'lg' })
            }));
        }

        const flexMsg = flexUtils.createFlexMessage('監獄名單', flexUtils.createCarousel(bubbles));
        await lineUtils.replyToLine(replyToken, [flexMsg]);
    } catch (e) {
        console.error('[Jail] handleJailList Error:', e);
        await lineUtils.replyText(replyToken, '❌ 查詢監獄名單發生錯誤，可能是資料庫索引尚未建立。');
    }
}

/**
 * 查詢前科排行榜
 */
async function handleJailRank(replyToken) {
    try {
        const snapshot = await db.collection(COLLECTION_NAME)
            .where('crimeRecord', '>', 0)
            .orderBy('crimeRecord', 'desc')
            .limit(10)
            .get();

        if (snapshot.empty) {
            await lineUtils.replyText(replyToken, '🕊️ 目前群組內還沒有任何前科犯！大家都是乖寶寶！');
            return;
        }

        const contents = [];
        let rank = 1;
        snapshot.forEach(doc => {
            const data = doc.data();
            const name = data.displayName || data.name || '未知';
            const crimeRecord = data.crimeRecord || 0;
            
            let emoji = '🏅';
            let color = '#333333';
            if (rank === 1) { emoji = '🥇'; color = '#D4AF37'; }
            if (rank === 2) { emoji = '🥈'; color = '#C0C0C0'; }
            if (rank === 3) { emoji = '🥉'; color = '#CD7F32'; }
            
            const title = getCriminalTitle(crimeRecord);
            
            contents.push(
                flexUtils.createBox('horizontal', [
                    flexUtils.createText({ text: `${emoji} 第${rank}名`, size: 'sm', weight: 'bold', color: color, flex: 1 }),
                    flexUtils.createBox('vertical', [
                        flexUtils.createText({ text: `${title}${name}`, size: 'sm', weight: 'bold', color: '#333333', wrap: true }),
                        flexUtils.createText({ text: `入獄次數: ${crimeRecord} 次`, size: 'xs', color: '#666666' })
                    ], { flex: 2 })
                ], { margin: 'md', alignItems: 'center' })
            );
            contents.push(flexUtils.createSeparator('sm'));
            rank++;
        });

        const bubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader('🏆 前科排行榜', '監獄常客榜單', '#FFFFFF', '#424242'),
            body: flexUtils.createBox('vertical', contents, { paddingAll: 'lg', backgroundColor: '#FAFAFA' })
        });

        await lineUtils.replyFlex(replyToken, '前科排行榜', bubble);
    } catch (e) {
        console.error('[Jail] handleJailRank Error:', e);
        await lineUtils.replyText(replyToken, '❌ 查詢前科排行榜發生錯誤，可能是資料庫索引尚未建立。');
    }
}



/**
 * 賄賂提示
 */
async function handleBribePrompt(replyToken, context) {
    const { userId } = context;

    try {
        const docRef = db.collection(COLLECTION_NAME).doc(userId);
        const doc = await docRef.get();
        if (!doc.exists) {
            await lineUtils.replyText(replyToken, '❌ 找不到您的資料。');
            return;
        }
        
        const data = doc.data();
        if (!data.jailedUntil || Date.now() >= data.jailedUntil) {
            await lineUtils.replyText(replyToken, '❌ 您目前沒有在坐牢，賄賂個頭！');
            return;
        }
    } catch (e) {
        console.error('[Jail] handleBribePrompt Error:', e);
        return;
    }

    const messages = [{
        type: 'text',
        text: `💰 想要用錢解決問題嗎？\n請直接點擊下方選項，或自行輸入「賄賂 [金額]」。\n(每 10萬 = 1% 出獄機率，最高 1000萬 = 100% 成功)`,
        quickReply: {
            items: [
                {
                    type: 'action',
                    action: {
                        type: 'message',
                        label: '10萬 (1%)',
                        text: '賄賂 100000'
                    }
                },
                {
                    type: 'action',
                    action: {
                        type: 'message',
                        label: '100萬 (10%)',
                        text: '賄賂 1000000'
                    }
                },
                {
                    type: 'action',
                    action: {
                        type: 'message',
                        label: '500萬 (50%)',
                        text: '賄賂 5000000'
                    }
                },
                {
                    type: 'action',
                    action: {
                        type: 'message',
                        label: '1000萬 (100%)',
                        text: '賄賂 10000000'
                    }
                }
            ]
        }
    }];
    await lineUtils.replyToLine(replyToken, messages);
}

/**
 * 產生賄賂確認面板
 */
async function handleBribe(replyToken, context, amount) {
    const { userId } = context;

    if (isNaN(amount) || amount <= 0) {
        await lineUtils.replyText(replyToken, '❌ 賄賂金額無效（請輸入大於 0 的有效數字作為賄賂金額，例如：賄賂 500000）。');
        return;
    }

    if (amount > 10000000) {
        amount = 10000000; // 上限 1千萬
    }

    try {
        const docRef = db.collection(COLLECTION_NAME).doc(userId);
        const doc = await docRef.get();
        if (!doc.exists) return;
        
        const data = doc.data();
        if (!data.jailedUntil || Date.now() >= data.jailedUntil) {
            await lineUtils.replyText(replyToken, '❌ 您目前沒有在坐牢，賄賂個頭！');
            return;
        }

        const kuCoin = data.kuCoin || 0;
        const originalAmount = amount;
        let cost = amount;

        // 黑道老大賄賂折扣：三折優惠，堂主：五折優惠
        const { getWantedList, getMafiaRank } = require('./profession');
        const wantedList = await getWantedList();
        const mafiaRank = await getMafiaRank(userId, data, wantedList);
        if (mafiaRank === 'boss') {
            cost = Math.floor(originalAmount * 0.3);
            if (cost < 1) cost = 1;
        } else if (mafiaRank === 'capo') {
            cost = Math.floor(originalAmount * 0.5);
            if (cost < 1) cost = 1;
        }

        if (kuCoin < cost) {
            await lineUtils.replyText(replyToken, `❌ 你的錢包只有 ${kuCoin.toLocaleString()} 哭幣，連賄款都湊不齊！`);
            return;
        }

        const successChance = (originalAmount / 100000).toFixed(1);
        
        const header = flexUtils.createHeader('💼 賄賂確認', '賭一把自由', flexUtils.COLORS.DARK_GRAY);
        const body = flexUtils.createBox('vertical', [
            flexUtils.createText({ text: `打算塞給局長的金額：`, size: 'sm', color: flexUtils.COLORS.GRAY }),
            flexUtils.createText({ text: `${cost.toLocaleString()} 哭幣 ${mafiaRank === 'boss' ? '(🕶️黑道老大3折特惠)' : mafiaRank === 'capo' ? '(🕶️黑幫堂主5折特惠)' : ''}`, weight: 'bold', size: 'lg', color: flexUtils.COLORS.WARNING, margin: 'sm' }),
            flexUtils.createSeparator('md'),
            flexUtils.createText({ text: `預估出獄成功率：${successChance}%`, weight: 'bold', size: 'md', color: flexUtils.COLORS.SUCCESS, margin: 'md' }),
            flexUtils.createText({ text: `(失敗將沒收賄款且繼續服刑)`, size: 'xs', color: flexUtils.COLORS.DANGER, margin: 'sm' })
        ], { paddingAll: 'xl' });
        
        const footer = flexUtils.createBox('horizontal', [
            flexUtils.createButton({ action: { type: 'postback', label: '確認賄賂', data: `action=confirmBribe&targetId=${userId}&amount=${originalAmount}`, displayText: `確認賄賂 ${cost}` }, style: 'primary', color: flexUtils.COLORS.WARNING })
        ], { paddingAll: 'md' });
        
        const flexBubble = flexUtils.createBubble({ size: 'kilo', header, body, footer });
        await lineUtils.replyFlex(replyToken, '賄賂確認', flexBubble);

    } catch (e) {
        console.error('[Jail] handleBribe Error:', e);
    }
}

/**
 * 執行裝備與擲骰子
 */
async function confirmBribe(replyToken, context, amount) {
    const { userId, groupId } = context;

    if (isNaN(amount) || amount <= 0) return;
    if (amount > 10000000) amount = 10000000;

    try {
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);
        
        const result = await db.runTransaction(async (t) => {
            const docRef = db.collection(COLLECTION_NAME).doc(userId);
            const doc = await t.get(docRef);
            
            if (!doc.exists) return { success: false, message: '找不到資料。' };
            
            const data = doc.data();
            if (!data.jailedUntil || Date.now() >= data.jailedUntil) {
                return { success: false, message: '您已經出獄了。' };
            }

            const kuCoin = data.kuCoin || 0;
            
            // 黑道老大賄賂折扣：三折優惠，堂主：五折優惠
            const { getWantedList, getMafiaRank } = require('./profession');
            const wantedList = await getWantedList();
            const mafiaRank = await getMafiaRank(userId, data, wantedList);
            let cost = amount;
            if (mafiaRank === 'boss') {
                cost = Math.floor(amount * 0.3);
                if (cost < 1) cost = 1;
            } else if (mafiaRank === 'capo') {
                cost = Math.floor(amount * 0.5);
                if (cost < 1) cost = 1;
            }

            if (kuCoin < cost) {
                return { success: false, message: `你的錢包餘額不足！` };
            }

            // 扣除打折後的賄款
            t.update(docRef, { kuCoin: db.FieldValue.increment(-cost) });

            // 判定是否成功
            const chance = amount / 100000;
            const roll = Math.random() * 100;
            const isSuccess = roll < chance;

            if (isSuccess) {
                t.update(docRef, {
                    jailedUntil: db.FieldValue.delete(),
                    wantedLevel: 0
                });
                return { success: true, isBribed: true, amount: cost, name: memberName || data.displayName || data.name, newBalance: kuCoin - cost };
            } else {
                return { success: true, isBribed: false, amount: cost, name: memberName || data.displayName || data.name, newBalance: kuCoin - cost };
            }
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        let bubble;
        if (result.isBribed) {
            bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('💼 賄賂成功', '打通關節', '#F57F17', '#FFFDE7'),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `${result.name} 悄悄把一疊鈔票塞進了局長口袋...`, size: 'sm', color: '#666666', wrap: true }),
                    flexUtils.createText({ text: `💸 支出賄款：-${result.amount.toLocaleString()} 哭幣`, size: 'sm', color: '#C62828', weight: 'bold', margin: 'md' }),
                    flexUtils.createText({ text: `💰 結算總資產：${result.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#1A1A1A', margin: 'sm' }),
                    flexUtils.createText({ text: `局長笑得合不攏嘴：「好說好說，都是一場誤會！」`, size: 'sm', weight: 'bold', color: '#F57F17', margin: 'sm', wrap: true }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: `🔓 你的案底已全數清除，通緝值歸零！恭喜重獲自由！`, size: 'sm', weight: 'bold', color: '#2E7D32', margin: 'md', wrap: true })
                ], { paddingAll: 'xl', backgroundColor: '#FFFFFF' })
            });
        } else {
            bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('💀 賄賂失敗', '踢到鐵板', '#37474F', '#ECEFF1'),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `${result.name} 試圖塞錢給局長...`, size: 'sm', color: '#666666', wrap: true }),
                    flexUtils.createText({ text: `💸 沒收賄款：-${result.amount.toLocaleString()} 哭幣`, size: 'sm', color: '#C62828', weight: 'bold', margin: 'md' }),
                    flexUtils.createText({ text: `💰 結算總資產：${result.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#1A1A1A', margin: 'sm' }),
                    flexUtils.createText({ text: `局長拍桌怒斥：「就這點錢也想出來？當我乞丐啊！」`, size: 'sm', weight: 'bold', color: '#C62828', margin: 'sm', wrap: true }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: `❌ 賄款被依法沒收，你只能乖乖回去繼續服刑！`, size: 'sm', weight: 'bold', color: '#333333', margin: 'md', wrap: true })
                ], { paddingAll: 'xl', backgroundColor: '#FFFFFF' })
            });
        }
        await lineUtils.replyFlex(replyToken, '賄賂結果', bubble);

    } catch (e) {
        console.error('[Jail] confirmBribe Error:', e);
        await lineUtils.replyText(replyToken, '❌ 系統發生錯誤。');
    }
}

/**
 * 施壓出獄 (議員專屬)
 */
async function handlePressure(replyToken, context) {
    const { userId, groupId } = context;

    try {
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);
        
        const result = await db.runTransaction(async (t) => {
            const docRef = db.collection(COLLECTION_NAME).doc(userId);
            const doc = await t.get(docRef);
            
            if (!doc.exists) return { success: false, message: '找不到資料。' };
            
            const data = doc.data();
            if (!data.jailedUntil || Date.now() >= data.jailedUntil) {
                return { success: false, message: '你又沒坐牢，施壓個頭？' };
            }

            if (!data.councilorUntil || Date.now() > data.councilorUntil) {
                return { success: false, message: '你以為你是議員嗎？少來這套！' };
            }

            // 兼容舊資料：如果在這次更新前就當選議員，他們不會有這個 token
            let currentToken = data.councilorPressureToken;
            if (currentToken === undefined) {
                currentToken = 1;
            }

            if (currentToken <= 0) {
                return { success: false, message: '你這屆任期的施壓額度已經用完了！' };
            }

            // 扣除額度，釋放
            t.update(docRef, {
                jailedUntil: db.FieldValue.delete(),
                wantedLevel: 0,
                councilorPressureToken: db.FieldValue.increment(-1)
            });

            return { success: true, name: memberName || data.displayName || data.name };
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        const bubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader('☎️ 施壓成功', '特權出獄', '#4A148C', '#EDE7F6'),
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: `【尊貴的市議員】${result.name} 直接打電話給警察局長：`, size: 'sm', color: '#666666', wrap: true }),
                flexUtils.createText({ text: `「局長，聽說我的人被關在你們那？你是不想幹了是不是？」`, size: 'sm', weight: 'bold', color: '#4A148C', margin: 'md', wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `局長嚇得冷汗直流，立刻連聲道歉並親自開門放人！`, size: 'sm', color: '#333333', margin: 'md', wrap: true }),
                flexUtils.createText({ text: `🔓 恭喜議員大搖大擺走出監獄，通緝值已歸零！`, size: 'sm', weight: 'bold', color: '#2E7D32', margin: 'sm', wrap: true })
            ], { paddingAll: 'xl', backgroundColor: '#FFFFFF' })
        });
        await lineUtils.replyFlex(replyToken, '施壓出獄結果', bubble);

    } catch (e) {
        console.error('[Jail] handlePressure Error:', e);
        await lineUtils.replyText(replyToken, '❌ 系統發生錯誤。');
    }
}

const redemption = require('./jail_redemption');

module.exports = {
    getCriminalTitle,
    checkJailStatus,
    handleBail,
    confirmBail,
    handleBailOther,
    confirmBailOther,
    handleBribePrompt,
    handleBribe,
    confirmBribe,
    handleJailbreak,
    handleDropSoap,
    handleLabor,
    handleBlowWarden,
    handleVisit,
    handleRiot,
    handleJailList,
    handleJailRank,
    handlePressure,
    // Redemption
    handleSutra: redemption.handleSutra,
    handlePsychiatric: redemption.handlePsychiatric,
    handleElection: redemption.handleElection,
    handleScapegoat: redemption.handleScapegoat,
    handleDonation: redemption.handleDonation,
    handleLiveStream: redemption.handleLiveStream,
    handleSnitch: redemption.handleSnitch,
    handleEnlist: redemption.handleEnlist,
    handleDischarge: redemption.handleDischarge,
    handleHungerStrike: redemption.handleHungerStrike,
    handleDragDown: redemption.handleDragDown,
    handleMilitaryGame: redemption.handleMilitaryGame,
    handlePension: redemption.handlePension
};
