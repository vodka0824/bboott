const { Firestore } = require('@google-cloud/firestore');
const { db } = require('../utils/db');
const COLLECTION_NAME = 'economy_users';
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const authUtils = require('../utils/auth');
const notificationService = require('../services/notificationService');

function getSpamResponse(userData, action, msg) {
    const spamLimit = 3;
    let trackers = userData.spamTracker || {};
    let count = (trackers[action] || 0) + 1;
    trackers[action] = count;
    
    if (count > spamLimit) {
        return { ignore: false, triggerPenalty: true, message: `🚨 【警告】你已連續洗頻 ${action} 指令超過 ${spamLimit} 次！將受到懲罰！`, newTracker: trackers };
    }
    if (count === spamLimit) {
        return { ignore: false, triggerPenalty: false, message: msg + `
(再洗頻一次將受到嚴厲懲罰！)`, newTracker: trackers };
    }
    return { ignore: false, triggerPenalty: false, message: msg, newTracker: trackers };
}

async function handleJailbreak(replyToken, context) {
    const { userId, groupId } = context;

    try {
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);
        
        // 獲取玩家 LUK
        const { getFinalPlayerStats } = require('../handlers/rpg');
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
            const { getWantedList, getMafiaRank } = require('../handlers/profession');
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
            const shivMsg = result.usedShiv ? `
(使用了偷藏的【銼刀】，不費吹灰之力鋸開了鐵窗！)` : '';
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
                    flexUtils.createText({ text: `您的刑期增加 60 分鐘！
目前剩餘刑期：${remainingMins} 分鐘。`, size: 'sm', color: '#333333', margin: 'md', wrap: true }),
                    flexUtils.createText({ text: `⏳ 冷卻時間：10 分鐘
（可於 ${new Date(Date.now() + 10 * 60 * 1000).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })} 後再次越獄）`, size: 'xs', color: '#B71C1C', margin: 'md', wrap: true })
                ], { paddingAll: 'xl', backgroundColor: '#FFEBEE' })
            });
            await lineUtils.replyFlex(replyToken, '越獄失敗', bubble);
        }

    } catch (e) {
        console.error('[Jail] handleJailbreak Error:', e);
        await lineUtils.replyText(replyToken, '❌ 越獄行動發生意外，請稍後再試。');
    }
}

async function confirmJailbreak(replyToken, context) {
    const { userId, groupId } = context;

    try {
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);
        
        // 獲取玩家 LUK & EVA
        const { getFinalPlayerStats } = require('../handlers/rpg');
        const stats = await getFinalPlayerStats(userId);
        
        const result = await db.runTransaction(async (t) => {
            const docRef = db.collection(COLLECTION_NAME).doc(userId);
            const doc = await t.get(docRef);
            
            if (!doc.exists) {
                return { success: false, message: '找不到您的資料。' };
            }
            
            const data = doc.data();
            if (!data.jailedUntil || Date.now() >= data.jailedUntil) {
                return { success: false, message: '你又沒坐牢，越什麼獄？想進來嗎？' };
            }

            if (data.jailbreakCooldownUntil && Date.now() < data.jailbreakCooldownUntil) {
                const remaining = Math.ceil((data.jailbreakCooldownUntil - Date.now()) / 60000);
                return { success: false, message: `你才剛被獄警毒打一頓，腿還在發抖！請休息 ${remaining} 分鐘後再嘗試越獄。` };
            }

            const rand = Math.random() * 100;
            
            // 越獄成功基礎機率 5% + (EVA * 1.0625)%
            const eva = stats.final.eva || 0;
            let finalChance = 5 + (eva * 1.0625);

            // 黑道監獄地頭蛇加成
            const { getWantedList, getMafiaRank } = require('../handlers/profession');
            const wantedList = await getWantedList();
            const mafiaRank = await getMafiaRank(userId, data, wantedList);
            
            if (mafiaRank === 'boss') {
                finalChance += 20;
            } else if (mafiaRank === 'capo') {
                finalChance += 10;
            } else if (mafiaRank === 'enforcer') {
                finalChance += 5;
            }

            let isSuccess = rand < finalChance; 
            let usedShiv = false;
            
            if (data.hasShiv) {
                isSuccess = true;
                usedShiv = true;
            }

            if (isSuccess) {
                // 計算通緝值影響 (方案D)
                const remainingMins = Math.ceil((data.jailedUntil - Date.now()) / 60000);
                const currentWanted = data.wantedLevel || 0;
                const wantedAdd = remainingMins / 300;
                let newWantedLevel = currentWanted + wantedAdd;
                if (newWantedLevel > 1.0) newWantedLevel = 1.0;

                const updateData = { jailedUntil: db.FieldValue.delete(), wantedLevel: newWantedLevel };
                if (usedShiv) updateData.hasShiv = db.FieldValue.delete();
                t.update(docRef, updateData);
                return { success: true, jailbreak: true, usedShiv, newWantedLevel, name: memberName || data.displayName || data.name };
            } else {
                // 失敗
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
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        if (result.jailbreak) {
            const shivMsg = result.usedShiv ? `\
(使用了偷藏的【銼刀】，不費吹灰之力鋸開了鐵窗！)` : '';
            const wantedPercent = (result.newWantedLevel * 100).toFixed(1);
            
            let wantedWarning = result.newWantedLevel >= 1.0 
                ? `🚨 警告：你已成為全國頭號通緝犯 (通緝值 ${wantedPercent}%)！警方將全面追緝！`
                : (result.newWantedLevel >= 0.5 
                    ? `⚠️ 警告：你的通緝值上升至 ${wantedPercent}%，黑道護體已開啟，但警方正在追緝你！`
                    : `📋 通緝值上升至 ${wantedPercent}%，保持低調！`);

            const bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader(`🏃‍♂️💨 越獄成功`, '', flexUtils.COLORS.BG_MAIN, '#4CAF50'),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `${result.name} 趁著警衛打瞌睡，成功翻過高牆逃出去了！重獲自由！${shivMsg}`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, wrap: true }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: wantedWarning, size: 'xs', weight: 'bold', color: '#D32F2F', margin: 'md', wrap: true })
                ], { paddingAll: 'xl', backgroundColor: '#FAFAFA' })
            });
            
            const quickReply = {
                items: [
                    { type: 'action', action: { type: 'message', label: '⛓️ 勞改', text: '勞改' } },
                    { type: 'action', action: { type: 'message', label: '🤝 保釋', text: '保釋金' } },
                    { type: 'action', action: { type: 'message', label: '🚪 越獄', text: '越獄' } }
                ]
            };
            await lineUtils.replyFlex(replyToken, '越獄成功', bubble, [], quickReply);
        } else {
            const remainingMins = Math.ceil((result.newJailedUntil - Date.now()) / 60000);
            const bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader(`🚨 越獄失敗`, '', flexUtils.COLORS.BG_MAIN, '#B71C1C'),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `警報聲大作！${result.name} 卡在通風管被警衛抓個正著！`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, wrap: true }),
                    flexUtils.createText({ text: `👮 獄警：「還敢逃？把你打到腿斷掉！」`, size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'md', wrap: true }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: `您的刑期增加 60 分鐘！\
目前剩餘刑期：${remainingMins} 分鐘。`, size: 'sm', color: '#333333', margin: 'md', wrap: true }),
                    flexUtils.createText({ text: `⏳ 冷卻時間：10 分鐘\
（可於 ${new Date(Date.now() + 10 * 60 * 1000).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })} 後再次越獄）`, size: 'xs', color: '#B71C1C', margin: 'md', wrap: true })
                ], { paddingAll: 'xl', backgroundColor: '#FFEBEE' })
            });
            
            const quickReply = {
                items: [
                    { type: 'action', action: { type: 'message', label: '⛓️ 勞改', text: '勞改' } },
                    { type: 'action', action: { type: 'message', label: '🤝 保釋', text: '保釋金' } },
                    { type: 'action', action: { type: 'message', label: '🚪 越獄', text: '越獄' } }
                ]
            };
            await lineUtils.replyFlex(replyToken, '越獄失敗', bubble, [], quickReply);
        }

    } catch (e) {
        console.error('[Jail] confirmJailbreak Error:', e);
        await lineUtils.replyText(replyToken, '❌ 越獄行動發生意外，請稍後再試。');
    }
}

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
                otherPrisonersMsg = `👀 目前監獄裡的其他獄友有：
${otherNames}`;
            } else {
                otherPrisonersMsg = `👀 (目前監獄裡只有你一個人，我看是很難成功...)`;
            }

            const header = flexUtils.createHeader('🔥 監獄暴動發起 🔥', '王侯將相，寧有種乎！', '#FFFFFF', '#D32F2F');
            const body = flexUtils.createBox('vertical', [
                flexUtils.createText({ text: `${memberName} 拿著牙刷大喊，發起了監獄暴動！`, size: 'sm', weight: 'bold', wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `距離暴動行動還有 3 分鐘！`, weight: 'bold', color: '#D32F2F', margin: 'md' }),
                flexUtils.createText({ text: `請監獄裡的其他兄弟在限時內輸入「暴動」響應！
(需要 2 人以上，隊伍總力量越高成功率越大！)`, size: 'xs', color: '#666666', wrap: true, margin: 'sm' }),
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
            flexUtils.createText({ text: `👀 尚未響應的獄友：
${remainNames}`, size: 'xs', color: '#999999', wrap: true, margin: 'md' })
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
    const { getFinalPlayerStats } = require('../handlers/rpg');
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
            await notificationService.queueNotification(groupId, messages);
        }
    } catch (e) {
        console.error('[Jail] resolveRiot Error:', e);
    }
}

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

module.exports = {
    handleJailbreak,
    confirmJailbreak,
    loadRiotState,
    saveRiotState,
    handleRiot,
    resolveRiot,
    handlePressure
};