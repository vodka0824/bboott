const { Firestore } = require('@google-cloud/firestore');
const { db } = require('../utils/db');
const COLLECTION_NAME = 'economy_users';
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const authUtils = require('../utils/auth');
const economyHandler = require('../handlers/economy');
const professionHandler = require('../handlers/profession');
const rpgHandler = require('../handlers/rpg');
const { getFinalPlayerStats } = require('./rpgCombatStatService');

/**
 * 檢查政風室查辦 (Internal Affairs)
 */
async function checkInternalAffairs(t, policeRef, policeData, now) {
    const corruption = policeData.policeCorruption || 0;
    if (corruption <= 0) return { caught: false };

    const auditChance = corruption * 0.005;
    if (Math.random() < auditChance) {
        const confiscated = policeData.kuCoin || 0;
        t.update(policeRef, {
            isPolice: db.FieldValue.delete(),
            kuCoin: 0,
            policeMerit: db.FieldValue.delete(),
            policeCorruption: db.FieldValue.delete(),
            jailedUntil: now + 24 * 60 * 60 * 1000,
            jailbreakCooldownUntil: db.FieldValue.delete(),
            crimeRecord: db.FieldValue.increment(1)
        });
        return { caught: true, confiscated };
    }
    return { caught: false };
}

/**
 * 產生政風室查辦的 Flex Message
 */
function createInternalAffairsBubble(policeName, confiscated) {
    return flexUtils.createBubble({
        size: 'mega',
        header: flexUtils.createHeader('🚨 廉政公署/政風室查辦', '重大貪瀆', flexUtils.COLORS.BG_MAIN, '#B71C1C'),
        body: flexUtils.createBox('vertical', [
            flexUtils.createText({ text: `【政風室快訊】警界爆發重大貪瀆案！警官 ${policeName} 遭檢調搜索...`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, wrap: true }),
            flexUtils.createText({ text: `「你的帳戶資金來源不明，我們懷疑你涉嫌貪污收賄！」`, size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'md', wrap: true }),
            flexUtils.createSeparator('md'),
            flexUtils.createText({ text: `👮 強制革職，永久失去警察身分！`, size: 'sm', color: '#FF0000', weight: 'bold', margin: 'md' }),
            flexUtils.createText({ text: `💸 沒收 100% 財產 (${confiscated.toLocaleString()} 哭幣) 充公！`, size: 'sm', color: '#FF0000', weight: 'bold' }),
            flexUtils.createText({ text: `🔒 收押入獄 24 小時！`, size: 'sm', color: '#FF0000', weight: 'bold' })
        ], { paddingAll: 'xl', backgroundColor: '#FFEBEE' })
    });
}

/**
 * 報考警察
 */

/**
 * 合法逮捕 (限黑道)
 */
async function handleArrest(replyToken, context, messageObject) {
    const { userId, groupId } = context;
    const mentionObj = messageObject && messageObject.mention;

    if (!mentionObj || !mentionObj.mentionees || mentionObj.mentionees.length === 0) {
        await lineUtils.replyText(replyToken, '❌ 請 @標記 你要逮捕的黑幫對象！\n用法：逮捕 @玩家');
        return;
    }

    const targetUserId = mentionObj.mentionees[0].userId;
    if (!targetUserId) {
        await lineUtils.replyText(replyToken, '❌ 無法取得對方資料。');
        return;
    }

    if (targetUserId === userId) {
        await lineUtils.replyText(replyToken, '❌ 你不能逮捕自己，這不是行為藝術！');
        return;
    }

    try {
        const policeName = await lineUtils.getGroupMemberName(groupId, userId);
        const targetName = await lineUtils.getGroupMemberName(groupId, targetUserId);
        const policeStats = await getFinalPlayerStats(userId);
        const targetStats = await getFinalPlayerStats(targetUserId);

        const result = await db.runTransaction(async (t) => {
            const policeRef = db.collection(COLLECTION_NAME).doc(userId);
            const targetRef = db.collection(COLLECTION_NAME).doc(targetUserId);
            const [policeDoc, targetDoc] = await Promise.all([t.get(policeRef), t.get(targetRef)]);

            if (!policeDoc.exists) return { success: false, message: '找不到您的資料。' };
            if (!targetDoc.exists) return { success: false, message: '找不到目標的資料。' };

            const policeData = policeDoc.data();
            const targetData = targetDoc.data();
            const now = Date.now();

            if (!policeData.isPolice) return { success: false, message: '你不是警察，不能使用逮捕指令！' };

            const isChief = (await professionHandler.getPoliceChief())?.userId === userId;
            const merit = policeData.policeMerit || 0;
            const cooldownMins = isChief ? 60 : (merit >= 100 ? 84 : 120);
            const successRateBonus = merit >= 100 ? 0.15 : 0;

            if (policeData.lastArrest && (now - policeData.lastArrest) < cooldownMins * 60 * 1000) {
                const remainMins = Math.ceil((policeData.lastArrest + cooldownMins * 60 * 1000 - now) / 60000);
                return { success: false, message: `⏳ 巡邏冷卻中，還需要 ${remainMins} 分鐘才能再次執勤！` };
            }

            if (!targetData.isMafia) {
                return { success: false, message: `❌ 逮捕行動只能針對【黑幫成員】發動！若目標是平民，請使用「臨檢」；若是議員請使用「貪污起訴」。` };
            }

            const targetWanted = targetData.wantedLevel || 0;
            if (targetWanted <= 0) {
                return { success: false, message: `${targetName} 目前身上沒有通緝值，不能隨便抓人！` };
            }

            if (targetData.jailedUntil && now < targetData.jailedUntil) {
                return { success: false, message: `${targetName} 已經在監獄裡了，不用重複逮捕！` };
            }

            // 政風室查辦
            const iaResult = await checkInternalAffairs(t, policeRef, policeData, now);
            if (iaResult.caught) {
                return { success: true, caught: true, policeName, confiscated: iaResult.confiscated };
            }

            const maintenanceFee = Math.max(1000000, Math.floor((policeData.kuCoin || 0) * 0.01));
            if ((policeData.kuCoin || 0) < maintenanceFee) {
                t.update(policeRef, { isPolice: db.FieldValue.delete() });
                return { success: false, reason: 'fired_broke', message: `❌ 逮捕失敗！\n你連裝備保養費都付不出來。\n警政署認為你不適任，已將你【強制革職】！` };
            }

            let policeKuCoinChange = -maintenanceFee;

            const wantedList = await professionHandler.getWantedList();
            const targetMafiaRank = await professionHandler.getMafiaRank(targetUserId, targetData, wantedList);
            let isTargetMafiaBoss = targetMafiaRank === 'boss';

            const wantedBonus = Math.min(0.25, (targetWanted * 100) * 0.003);
            const crimeResist = Math.min(30, (targetData.crimeRecord || 0) * 2);

            const policePower = (policeStats.final.atk || 0) + (policeStats.final.eva || 0) + 20;
            const targetEva = Math.max(0, (targetStats.final.eva || 0) - 30);
            const targetPower = (targetStats.final.atk || 0) + targetEva + crimeResist;
            
            let successRate = Math.min(0.95, Math.max(0.3, 0.5 + (policePower - targetPower) / 200 + wantedBonus + successRateBonus));

            if (Math.random() < successRate) {
                // 因公殉職風險 (8%)
                if (Math.random() < 0.08) {
                    const medicalFee = Math.floor((policeData.kuCoin || 0) * 0.2);
                    t.update(policeRef, {
                        isPolice: db.FieldValue.delete(),
                        kuCoin: db.FieldValue.increment(policeKuCoinChange - medicalFee),
                        jailedUntil: now + 12 * 60 * 60 * 1000,
                        lastArrest: now,
                        policeMerit: db.FieldValue.increment(-15)
                    });
                    const newBalance = (policeData.kuCoin || 0) + policeKuCoinChange - medicalFee;
                    return {
                        success: false, reason: 'kia',
                        message: `🚨 【因公殉職】\n你在逮捕 ${targetName} 時，遭到對方火力壓制身受重傷！\n你被送進加護病房 (休養 12 小時)，並支付了 ${medicalFee.toLocaleString()} 醫療費。\n警政署已將你【強制退伍】！\n🏦 結算總資產：${newBalance.toLocaleString()} 哭幣`
                    };
                }

                // 逮捕成功
                let jailMins = Math.max(30, Math.floor(targetWanted * 60));
                if (targetMafiaRank === 'boss') jailMins = Math.floor(jailMins * 2.0);
                else if (targetMafiaRank === 'capo') jailMins = Math.floor(jailMins * 1.5);
                else if (targetMafiaRank === 'thug') jailMins = Math.floor(jailMins * 1.2);

                const jailedUntil = now + jailMins * 60 * 1000;
                const newTargetWantedLevel = Number((targetWanted * 0.5).toFixed(2));
                
                t.update(targetRef, {
                    jailedUntil,
                    jailbreakCooldownUntil: db.FieldValue.delete(),
                    crimeRecord: db.FieldValue.increment(1),
                    wantedLevel: newTargetWantedLevel
                });

                const basePay = 2000000;
                const bounty = (targetData.crimeRecord || 0) * 5000000;
                const totalWantedBonus = Math.floor((basePay + bounty) * (1 + targetWanted * 0.5));
                const reward = basePay + bounty + totalWantedBonus;
                policeKuCoinChange += reward;

                let meritGain = 10;
                if (targetMafiaRank === 'boss') meritGain = 50;
                else if (targetMafiaRank === 'capo') meritGain = 20;

                t.update(policeRef, { 
                    kuCoin: db.FieldValue.increment(policeKuCoinChange),
                    policeMerit: db.FieldValue.increment(meritGain),
                    lastArrest: now
                });

                professionHandler.clearWantedListCache();
                const newBalance = (policeData.kuCoin || 0) + policeKuCoinChange;

                return {
                    success: true, arrested: true, caught: false,
                    policeName, targetName, targetUserId,
                    jailMins, reward, targetWanted,
                    isTargetMafiaBoss, cost: maintenanceFee, newBalance, meritGain
                };
            } else {
                // 逮捕失敗
                t.update(policeRef, {
                    kuCoin: db.FieldValue.increment(policeKuCoinChange),
                    policeMerit: db.FieldValue.increment(-15),
                    lastArrest: now
                });
                const newBalance = (policeData.kuCoin || 0) + policeKuCoinChange;
                return {
                    success: true, arrested: false, caught: false,
                    policeName, targetName, cost: maintenanceFee, newBalance
                };
            }
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        if (result.caught) {
            const bubble = createInternalAffairsBubble(result.policeName, result.confiscated);
            
        await lineUtils.replyFlex(replyToken, '政風室查獲', bubble);
            professionHandler.clearProfessionCache(userId);
            return;
        }

        if (result.arrested) {
            const bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('🚨 逮捕成功', '正義執行', flexUtils.COLORS.BG_MAIN, '#4CAF50'),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `👮 ${result.policeName} 對黑道成員 ${result.targetName} 發動了逮捕行動！`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, wrap: true }),
                    flexUtils.createText({ text: `「雙手放在我看得到的地方！你被捕了！」`, size: 'sm', weight: 'bold', color: '#1976D2', margin: 'md', wrap: true }),
                    ...(result.isTargetMafiaBoss ? [flexUtils.createText({ text: `🕶️ 【黑道老大落網】刑期加倍！`, size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'sm' })] : []),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: `🔒 ${result.targetName} 被收押入獄 ${result.jailMins} 分鐘！`, size: 'sm', color: '#333333', margin: 'md', wrap: true }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: `🔧 裝備保養費：-${(result.cost || 0).toLocaleString()} 哭幣`, size: 'xs', color: '#E91E63', margin: 'sm', wrap: true }),
                    flexUtils.createText({ text: `💰 績效獎金 + 懸賞金：${result.reward.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#4CAF50', margin: 'md' }),
                    flexUtils.createText({ text: `📈 獲得績效點數：+${result.meritGain}`, size: 'sm', weight: 'bold', color: '#1976D2', margin: 'sm' }),
                    flexUtils.createText({ text: `🏦 結算總資產：${result.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#1976D2', margin: 'sm' })
                ], { paddingAll: 'xl', backgroundColor: '#FAFAFA' })
            });

            
        await lineUtils.replyFlex(replyToken, '逮捕成功', bubble);
            professionHandler.clearProfessionCache(result.targetUserId);
        } else {
            const failActs = [
                `${result.targetName} 身手矯健，一記後空翻就翻過了圍牆消失在暗巷中！`,
                `${result.targetName} 丟出一顆煙霧彈，等煙散去時人已經不見了！`,
                `黑幫火力太猛，你只能找掩護看著 ${result.targetName} 逃跑！`
            ];
            const bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('❌ 逮捕失敗', '', flexUtils.COLORS.BG_MAIN, '#B71C1C'),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `${result.policeName} 試圖逮捕 ${result.targetName}...`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, wrap: true }),
                    flexUtils.createText({ text: failActs[Math.floor(Math.random() * failActs.length)], size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'md', wrap: true }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: `犯人成功逃脫了！績效值 -15！`, size: 'xs', color: flexUtils.COLORS.TEXT_MUTED, margin: 'md', wrap: true })
                ], { paddingAll: 'xl', backgroundColor: '#FFEBEE' })
            });
            
        await lineUtils.replyFlex(replyToken, '逮捕失敗', bubble);
        }
    } catch (e) {
        console.error('[Police] handleArrest Error:', e);
        await lineUtils.replyText(replyToken, '❌ 逮捕過程發生錯誤。');
    }
}

/**
 * 快速逮捕 (通緝名單 postback)
 */

/**
 * 快速逮捕 (通緝名單 postback)
 */
async function handleQuickArrest(replyToken, context) {
    const params = new URLSearchParams(context.postbackData || '');
    const targetUserId = params.get('targetId');
    if (!targetUserId) {
        await lineUtils.replyText(replyToken, '❌ 無效的逮捕目標。');
        return;
    }
    const fakeMessageObject = { mention: { mentionees: [{ userId: targetUserId }] } };
    await handleArrest(replyToken, context, fakeMessageObject);
}

/**
 * 貪污起訴 (限議員)
 */

/**
 * 貪污起訴 (限議員)
 */
async function handleIndict(replyToken, context, messageObject) {
    const { userId, groupId } = context;
    const mentionObj = messageObject && messageObject.mention;

    if (!mentionObj || !mentionObj.mentionees || mentionObj.mentionees.length === 0) {
        await lineUtils.replyText(replyToken, '❌ 請 @標記 你要起訴的市議員！\n用法：貪污起訴 @玩家');
        return;
    }

    const targetUserId = mentionObj.mentionees[0].userId;
    if (targetUserId === userId) {
        await lineUtils.replyText(replyToken, '❌ 不能起訴自己！');
        return;
    }

    try {
        const policeName = await lineUtils.getGroupMemberName(groupId, userId);
        const targetName = await lineUtils.getGroupMemberName(groupId, targetUserId);

        const result = await db.runTransaction(async (t) => {
            const policeRef = db.collection(COLLECTION_NAME).doc(userId);
            const targetRef = db.collection(COLLECTION_NAME).doc(targetUserId);
            const [policeDoc, targetDoc] = await Promise.all([t.get(policeRef), t.get(targetRef)]);

            if (!policeDoc.exists) return { success: false, message: '找不到您的資料。' };
            if (!targetDoc.exists) return { success: false, message: '找不到目標的資料。' };

            const policeData = policeDoc.data();
            const targetData = targetDoc.data();
            const now = Date.now();

            if (!policeData.isPolice) return { success: false, message: '你不是警察！' };

            // 檢查是否為市議員
            const isTargetCouncilor = targetData.councilorUntil && now < targetData.councilorUntil;
            if (!isTargetCouncilor) {
                return { success: false, message: `❌ 貪污起訴只能對【市議員】發動！` };
            }

            const targetCorruption = targetData.corruptionLevel || 0;
            if (targetCorruption <= 0) {
                return { success: false, message: `${targetName} 是一名清白的議員，無從起訴！` };
            }

            // 政風室查辦
            const iaResult = await checkInternalAffairs(t, policeRef, policeData, now);
            if (iaResult.caught) {
                return { success: true, caught: true, policeName, confiscated: iaResult.confiscated };
            }

            // 成功率 = 議員貪污值
            let successRate = targetCorruption;
            if (Math.random() < successRate) {
                const jailMins = Math.max(120, Math.floor(targetCorruption * 1000));
                const jailedUntil = now + jailMins * 60 * 1000;
                
                const targetKuCoin = targetData.kuCoin || 0;
                let reward = 0;
                let newTargetKuCoin = targetKuCoin;
                if (targetKuCoin > 0) {
                    const lostAmount = Math.floor(targetKuCoin * 0.6);
                    reward = Math.floor(targetKuCoin * 0.3);
                    newTargetKuCoin = targetKuCoin - lostAmount;
                }

                t.update(targetRef, {
                    jailedUntil,
                    jailbreakCooldownUntil: db.FieldValue.delete(),
                    crimeRecord: db.FieldValue.increment(1),
                    councilorUntil: db.FieldValue.delete(),
                    corruptionLevel: db.FieldValue.delete(),
                    kuCoin: newTargetKuCoin
                });

                t.update(policeRef, { 
                    kuCoin: db.FieldValue.increment(reward),
                    policeMerit: db.FieldValue.increment(30),
                    lastArrest: now
                });

                const newBalance = (policeData.kuCoin || 0) + reward;

                return {
                    success: true, arrested: true, caught: false,
                    policeName, targetName, jailMins, reward,
                    newBalance, meritGain: 30
                };
            } else {
                // 起訴失敗：誣告成立，警察自己被關 12 小時
                t.update(policeRef, {
                    isPolice: db.FieldValue.delete(),
                    jailedUntil: now + 12 * 60 * 60 * 1000,
                    crimeRecord: db.FieldValue.increment(1),
                    policeMerit: db.FieldValue.delete(),
                    policeCorruption: db.FieldValue.delete(),
                    lastArrest: now
                });
                return { success: true, arrested: false, caught: false, policeName, targetName };
            }
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        if (result.caught) {
            const bubble = createInternalAffairsBubble(result.policeName, result.confiscated);
            
        await lineUtils.replyFlex(replyToken, '政風室查獲', bubble);
            professionHandler.clearProfessionCache(userId);
            return;
        }

        if (result.arrested) {
            const bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('⚖️ 貪污起訴成功', '正義執行', flexUtils.COLORS.BG_MAIN, '#E91E63'),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `👮 ${result.policeName} 成功向地檢署起訴了議員 ${result.targetName}！`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, wrap: true }),
                    flexUtils.createText({ text: `檢調單位查獲洗錢與藏匿賄款的關鍵事證！`, size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'md', wrap: true }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: `💥 議員資格當場褫奪！`, size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'sm' }),
                    flexUtils.createText({ text: `💸 沒收並扣押該議員 60% 財產！`, size: 'sm', weight: 'bold', color: '#D32F2F' }),
                    flexUtils.createText({ text: `🔒 ${result.targetName} 被收押禁見 ${result.jailMins} 分鐘！`, size: 'sm', color: '#333333', margin: 'md', wrap: true }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: `💰 警察績效獎金：+${result.reward.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#4CAF50', margin: 'md' }),
                    flexUtils.createText({ text: `📈 獲得績效點數：+${result.meritGain}`, size: 'sm', weight: 'bold', color: '#1976D2', margin: 'sm' }),
                    flexUtils.createText({ text: `🏦 結算總資產：${result.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#1976D2', margin: 'sm' })
                ], { paddingAll: 'xl', backgroundColor: '#FCE4EC' })
            });
            
        await lineUtils.replyFlex(replyToken, '貪污起訴成功', bubble);
            professionHandler.clearProfessionCache(targetUserId);
        } else {
            const bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('❌ 起訴遭駁回', '誣告成立', flexUtils.COLORS.BG_MAIN, '#B71C1C'),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `👮 ${result.policeName} 指控 ${result.targetName} 議員貪污並意圖逮捕...`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, wrap: true }),
                    flexUtils.createText({ text: `「這是蓄意抹黑！我要告你誣告！」議員召開記者會強烈譴責，地檢署認定查無實證。`, size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'md', wrap: true }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: `👮 誣告成立，你當場被強制撤職！`, size: 'sm', color: '#FF0000', weight: 'bold', margin: 'md' }),
                    flexUtils.createText({ text: `🔒 即刻收押入獄 12 小時，前科 + 1！`, size: 'sm', color: '#FF0000', weight: 'bold' })
                ], { paddingAll: 'xl', backgroundColor: '#FFEBEE' })
            });
            
        await lineUtils.replyFlex(replyToken, '起訴失敗', bubble);
            professionHandler.clearProfessionCache(userId);
        }
    } catch (e) {
        console.error('[Police] handleIndict Error:', e);
        await lineUtils.replyText(replyToken, '❌ 起訴過程發生錯誤。');
    }
}

/**
 * 臨檢 (限平民，1小時冷卻)
 */

/**
 * 臨檢 (限平民，1小時冷卻)
 */
async function handleFrisk(replyToken, context, messageObject) {
    const { userId, groupId } = context;
    const mentionObj = messageObject && messageObject.mention;

    if (!mentionObj || !mentionObj.mentionees || mentionObj.mentionees.length === 0) {
        await lineUtils.replyText(replyToken, '❌ 請 @標記 你要臨檢的對象！\n用法：臨檢 @玩家');
        return;
    }

    const targetUserId = mentionObj.mentionees[0].userId;
    if (targetUserId === userId) return lineUtils.replyText(replyToken, '❌ 不能臨檢自己！');

    try {
        const policeName = await lineUtils.getGroupMemberName(groupId, userId);
        const targetName = await lineUtils.getGroupMemberName(groupId, targetUserId);

        const result = await db.runTransaction(async (t) => {
            const policeRef = db.collection(COLLECTION_NAME).doc(userId);
            const targetRef = db.collection(COLLECTION_NAME).doc(targetUserId);
            const [policeDoc, targetDoc] = await Promise.all([t.get(policeRef), t.get(targetRef)]);

            if (!policeDoc.exists || !policeDoc.data().isPolice) return { success: false, message: '你不是警察！' };
            if (!targetDoc.exists) return { success: false, message: '找不到目標的資料。' };

            const policeData = policeDoc.data();
            const targetData = targetDoc.data();
            const now = Date.now();

            if (policeData.lastFrisk && (now - policeData.lastFrisk) < 60 * 60 * 1000) {
                const remainMins = Math.ceil((policeData.lastFrisk + 60 * 60 * 1000 - now) / 60000);
                return { success: false, message: `⏳ 臨檢冷卻中，還需要 ${remainMins} 分鐘！` };
            }

            if (targetData.councilorUntil && now < targetData.councilorUntil) {
                return { success: false, message: `❌ 你不能臨檢市議員！議員擁有豁免權。` };
            }
            if (targetData.isPolice) {
                return { success: false, message: `❌ 不能臨檢同僚！` };
            }

            // 政風室查辦
            const iaResult = await checkInternalAffairs(t, policeRef, policeData, now);
            if (iaResult.caught) {
                return { success: true, caught: true, policeName, confiscated: iaResult.confiscated };
            }

            const targetWanted = targetData.wantedLevel || 0;
            if (targetWanted > 0) {
                // 有通緝值，開罰 5%，警察賺 50%
                const targetKuCoin = targetData.kuCoin || 0;
                let fine = 0;
                let reward = 0;
                if (targetKuCoin > 0) {
                    fine = Math.floor(targetKuCoin * 0.05);
                    reward = Math.floor(fine * 0.5);
                }

                const newWantedLevel = Number(Math.max(0, targetWanted * 0.8).toFixed(2));
                const reducedWanted = Number((targetWanted - newWantedLevel).toFixed(2));

                t.update(targetRef, { 
                    kuCoin: Math.max(0, targetKuCoin - fine),
                    wantedLevel: newWantedLevel
                });
                t.update(policeRef, {
                    kuCoin: db.FieldValue.increment(reward),
                    policeCorruption: db.FieldValue.increment(5),
                    lastFrisk: now
                });
                
                const newBalance = (policeData.kuCoin || 0) + reward;
                return { success: true, caught: false, isGuilty: true, fine, reward, newBalance, policeName, targetName, reducedWanted };
            } else {
                // 清白市民，警察遭客訴
                const compensation = Math.floor((policeData.kuCoin || 0) * 0.05);
                t.update(policeRef, {
                    kuCoin: db.FieldValue.increment(-compensation),
                    policeMerit: db.FieldValue.increment(-20),
                    lastFrisk: now
                });
                t.update(targetRef, { kuCoin: db.FieldValue.increment(compensation) });

                const newBalance = (policeData.kuCoin || 0) - compensation;
                return { success: true, caught: false, isGuilty: false, compensation, newBalance, policeName, targetName };
            }
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        if (result.caught) {
            const bubble = createInternalAffairsBubble(result.policeName, result.confiscated);
            
        await lineUtils.replyFlex(replyToken, '政風室查獲', bubble);
            professionHandler.clearProfessionCache(userId);
            return;
        }

        if (result.isGuilty) {
            const bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('🔦 臨檢查獲', '開出罰單', flexUtils.COLORS.BG_MAIN, flexUtils.COLORS.SECONDARY),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `👮 ${result.policeName} 攔下了 ${result.targetName} 進行盤查！`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, wrap: true }),
                    flexUtils.createText({ text: `「證件拿出來！你身上怎麼有違禁品？當場開罰！」`, size: 'sm', weight: 'bold', color: '#E65100', margin: 'md', wrap: true }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: `💸 ${result.targetName} 被強制繳交了 ${result.fine.toLocaleString()} 罰金！`, size: 'sm', color: '#333333', margin: 'md', wrap: true }),
                    flexUtils.createText({ text: `🔓 通緝值因此消除了 ${Math.floor(result.reducedWanted * 100)}%！`, size: 'sm', color: '#333333', margin: 'sm', wrap: true }),
                    flexUtils.createText({ text: `💰 警察私下抽成：+${result.reward.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#4CAF50', margin: 'sm' }),
                    flexUtils.createText({ text: `⚠️ 貪污值增加了 +5！`, size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'sm' }),
                    flexUtils.createText({ text: `🏦 結算總資產：${result.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#1976D2', margin: 'sm' })
                ], { paddingAll: 'xl', backgroundColor: '#FFF3E0' })
            });
            
        await lineUtils.replyFlex(replyToken, '臨檢開罰', bubble);
        } else {
            const bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('❌ 臨檢客訴', '查無違法', flexUtils.COLORS.BG_MAIN, '#607D8B'),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `👮 ${result.policeName} 對 ${result.targetName} 強制搜身...`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, wrap: true }),
                    flexUtils.createText({ text: `「你憑什麼搜我！我要打 1999 投訴你擾民！」`, size: 'sm', weight: 'bold', color: '#37474F', margin: 'md', wrap: true }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: `📉 警察遭到申誡，績效值 -20！`, size: 'sm', color: '#D32F2F', weight: 'bold', margin: 'md' }),
                    flexUtils.createText({ text: `💸 賠償市民精神損失：-${result.compensation.toLocaleString()} 哭幣`, size: 'sm', color: '#D32F2F', weight: 'bold' }),
                    flexUtils.createText({ text: `🏦 結算總資產：${result.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#1976D2', margin: 'sm' })
                ], { paddingAll: 'xl', backgroundColor: '#ECEFF1' })
            });
            
        await lineUtils.replyFlex(replyToken, '臨檢客訴', bubble);
        }

    } catch (e) {
        console.error('[Police] handleFrisk Error:', e);
        await lineUtils.replyText(replyToken, '❌ 臨檢過程發生錯誤。');
    }
}

/**
 * 吃案 (收賄，無冷卻，限黑道)
 */

/**
 * 攻堅 (局長專屬，24小時冷卻)
 */
async function handleRaid(replyToken, context) {
    const { userId, groupId } = context;

    try {
        const policeName = await lineUtils.getGroupMemberName(groupId, userId);
        
        const result = await db.runTransaction(async (t) => {
            const policeRef = db.collection(COLLECTION_NAME).doc(userId);
            const policeDoc = await t.get(policeRef);
            if (!policeDoc.exists || !policeDoc.data().isPolice) return { success: false, message: '你不是警察！' };

            const policeData = policeDoc.data();
            const now = Date.now();

            const isChief = (await professionHandler.getPoliceChief())?.userId === userId;
            if (!isChief) {
                return { success: false, message: '❌ 只有【警察局長】有權力發動大規模攻堅！' };
            }

            if (policeData.lastRaid && (now - policeData.lastRaid) < 24 * 60 * 60 * 1000) {
                const remainMins = Math.ceil((policeData.lastRaid + 24 * 60 * 60 * 1000 - now) / 60000);
                const hrs = Math.floor(remainMins / 60);
                const mins = remainMins % 60;
                return { success: false, message: `⏳ 攻堅行動冷卻中，還需要 ${hrs} 小時 ${mins} 分鐘才能再次集結警力！` };
            }

            const mafiaBossInfo = await require('../handlers/profession').getMafiaBoss();
            if (!mafiaBossInfo) {
                return { success: false, message: '目前全服沒有黑道老大，無從攻堅！' };
            }
            const bossId = mafiaBossInfo.userId;
            const targetName = mafiaBossInfo.name;

            const targetRef = db.collection(COLLECTION_NAME).doc(bossId);
            const targetDoc = await t.get(targetRef);
            if (!targetDoc.exists) return { success: false, message: '找不到黑道老大資料。' };

            const targetData = targetDoc.data();
            if (targetData.jailedUntil && now < targetData.jailedUntil) {
                return { success: false, message: `黑道老大 ${targetName} 已經在監獄裡了，不用浪費警力！` };
            }

            // 政風室查辦
            const iaResult = await checkInternalAffairs(t, policeRef, policeData, now);
            if (iaResult.caught) {
                return { success: true, caught: true, policeName, confiscated: iaResult.confiscated };
            }

            // 40% 絕對成功率
            if (Math.random() < 0.40) {
                // 成功
                const targetKuCoin = targetData.kuCoin || 0;
                const confiscate = Math.floor(targetKuCoin * 0.5);
                const reward = Math.floor(confiscate * 0.5); // 局長拿 50% 充公的錢
                
                t.update(targetRef, {
                    jailedUntil: now + 24 * 60 * 60 * 1000,
                    kuCoin: Math.max(0, targetKuCoin - confiscate),
                    wantedLevel: 0
                });

                t.update(policeRef, {
                    kuCoin: db.FieldValue.increment(reward),
                    policeMerit: db.FieldValue.increment(100),
                    lastRaid: now
                });
                
                const newBalance = (policeData.kuCoin || 0) + reward;
                return { success: true, won: true, caught: false, policeName, targetName, reward, newBalance };
            } else {
                // 失敗：引咎辭職，住院12小時
                t.update(policeRef, {
                    isPolice: db.FieldValue.delete(),
                    jailedUntil: now + 12 * 60 * 60 * 1000,
                    policeMerit: db.FieldValue.delete(),
                    policeCorruption: db.FieldValue.delete(),
                    lastRaid: now
                });
                return { success: true, won: false, caught: false, policeName, targetName };
            }
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        if (result.caught) {
            const bubble = createInternalAffairsBubble(result.policeName, result.confiscated);
            
        await lineUtils.replyFlex(replyToken, '政風室查獲', bubble);
            professionHandler.clearProfessionCache(userId);
            return;
        }

        if (result.won) {
            const bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('🚁 霹靂攻堅成功', '正義鐵拳', flexUtils.COLORS.BG_MAIN, '#1976D2'),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `警政署下達紅色通緝令，${result.policeName} 局長親自率領特勤隊，從直升機空降突襲黑幫總部！`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, wrap: true }),
                    flexUtils.createText({ text: `「不准動！全部趴下！」`, size: 'sm', weight: 'bold', color: '#1976D2', margin: 'md', wrap: true }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: `💥 黑道老大 ${result.targetName} 被強勢壓制，收押禁見 24 小時！`, size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'md', wrap: true }),
                    flexUtils.createText({ text: `💸 警方查扣黑幫 50% 總資產！`, size: 'sm', weight: 'bold', color: '#D32F2F' }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: `💰 局長破案獎金：+${result.reward.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#4CAF50', margin: 'md' }),
                    flexUtils.createText({ text: `🏦 結算總資產：${result.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#1976D2', margin: 'sm' })
                ], { paddingAll: 'xl', backgroundColor: '#E3F2FD' })
            });
            
        await lineUtils.replyFlex(replyToken, '攻堅成功', bubble);
            professionHandler.clearWantedListCache();
        } else {
            const bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('❌ 攻堅失敗', '慘遭擊退', flexUtils.COLORS.BG_MAIN, '#B71C1C'),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `${result.policeName} 局長發起攻堅，卻遭遇黑幫預先埋伏的重火力反擊！`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, wrap: true }),
                    flexUtils.createText({ text: `「撤退！快撤退！」`, size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'md', wrap: true }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: `📉 攻堅行動全軍覆沒，${result.policeName} 局長身受重傷！`, size: 'sm', color: '#FF0000', weight: 'bold', margin: 'md', wrap: true }),
                    flexUtils.createText({ text: `🏥 住院休養 12 小時`, size: 'sm', color: '#FF0000', weight: 'bold' }),
                    flexUtils.createText({ text: `👮 警政署震怒，局長被迫【引咎辭職】！`, size: 'sm', color: '#FF0000', weight: 'bold' })
                ], { paddingAll: 'xl', backgroundColor: '#FFEBEE' })
            });
            
        await lineUtils.replyFlex(replyToken, '攻堅失敗', bubble);
            professionHandler.clearProfessionCache(userId);
        }
    } catch (e) {
        console.error('[Police] handleRaid Error:', e);
        await lineUtils.replyText(replyToken, '❌ 攻堅過程發生錯誤。');
    }
}



module.exports = {
    checkInternalAffairs,
    createInternalAffairsBubble,
    handleArrest,
    handleQuickArrest,
    handleIndict,
    handleFrisk,
    handleRaid
};
