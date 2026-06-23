const { Firestore } = require('@google-cloud/firestore');
const { db } = require('../utils/db');
const COLLECTION_NAME = 'economy_users';
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const authUtils = require('../utils/auth');

function getSpamResponse(userData, action, msg) {
    const spamLimit = 3;
    let trackers = userData.spamTracker || {};
    let count = (trackers[action] || 0) + 1;
    trackers[action] = count;
    
    if (count > spamLimit) {
        return { ignore: false, triggerPenalty: true, message: `🚨 【警告】你已連續洗頻 ${action} 指令超過 ${spamLimit} 次！將受到懲罰！`, newTracker: trackers };
    }
    if (count === spamLimit) {
        return { ignore: false, triggerPenalty: false, message: msg + `\n(再洗頻一次將受到嚴厲懲罰！)`, newTracker: trackers };
    }
    return { ignore: false, triggerPenalty: false, message: msg, newTracker: trackers };
}


function calculateBailAmount(crimeRecord, kuCoin) {
    return 50000 + (crimeRecord * 500000) + Math.floor(kuCoin * 0.15);
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
        const { getWantedList, getMafiaRank } = require('../handlers/profession');
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
            const { getWantedList, getMafiaRank } = require('../handlers/profession');
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

module.exports = {
    calculateBailAmount,
    handleBail,
    confirmBail,
    handleBailOther,
    confirmBailOther,
    handleBribePrompt,
    handleBribe,
    confirmBribe
};
