const { db } = require('../utils/db');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const memoryCache = require('../utils/memoryCache');
const { getWantedList, getProfessionTitle, getMafiaRank } = require('../handlers/profession');
const { getFinalPlayerStats } = require('../handlers/rpg');
const economyHandler = require('../handlers/economy');

const COLLECTION_NAME = 'economy_users';

async function handleArrest(replyToken, context, messageObject) {
    const { userId, groupId } = context;
    const mentionObj = messageObject && messageObject.mention;

    if (!mentionObj || !mentionObj.mentionees || mentionObj.mentionees.length === 0) {
        await lineUtils.replyText(replyToken, '❌ 請 @標記 你要逮捕的對象！\n用法：逮捕 @玩家');
        return;
    }

    const targetUserId = mentionObj.mentionees[0].userId;
    if (!targetUserId) {
        await lineUtils.replyText(replyToken, '❌ 無法取得對方資料（可能未加機器人好友）。');
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

            // 2 小時冷卻
            if (policeData.lastArrest && (now - policeData.lastArrest) < 2 * 60 * 60 * 1000) {
                const remainMins = Math.ceil((policeData.lastArrest + 2 * 60 * 60 * 1000 - now) / 60000);
                return { success: false, message: `⏳ 巡邏冷卻中，還需要 ${remainMins} 分鐘才能再次執勤！` };
            }

            const isTargetCouncilor = targetData.councilorUntil && now < targetData.councilorUntil;
            const targetWanted = targetData.wantedLevel || 0;
            const targetCorruption = targetData.corruptionLevel || 0;

            if (isTargetCouncilor) {
                if (targetWanted <= 0 && targetCorruption <= 0) {
                    return { success: false, message: `${targetName} 沒有通緝值也沒有貪污，是清白的議員，不能隨便抓人！` };
                }
            } else {
                if (targetWanted <= 0) {
                    return { success: false, message: `${targetName} 身上沒有通緝值，是清白的市民，不能隨便抓人！` };
                }
            }

            // 目標已在獄中
            if (targetData.jailedUntil && now < targetData.jailedUntil) {
                return { success: false, message: `${targetName} 已經在監獄裡了，不用重複逮捕！` };
            }

            // 方案C：裝備保養費
            const maintenanceFee = Math.max(1000000, Math.floor((policeData.kuCoin || 0) * 0.01));
            if ((policeData.kuCoin || 0) < maintenanceFee) {
                t.update(policeRef, { isPolice: db.FieldValue.delete() });
                return { success: false, reason: 'fired_broke', message: `❌ 逮捕失敗！\n你連 ${maintenanceFee.toLocaleString()} 哭幣的警用裝備保養費都付不出來，裝備老舊無法出勤。\n警政署認為你不適任，已將你【強制革職】！` };
            }

            let policeKuCoinChange = -maintenanceFee;

            // 成功率判定
            let successRate = 0;
            let arrestType = 'normal'; // 'normal' 或 'corruption'

            if (isTargetCouncilor && targetWanted <= 0 && targetCorruption > 0) {
                arrestType = 'corruption';
                successRate = targetCorruption; // 成功率 = 議員的貪污值
            } else {
                // 通緝值加成：每 10% 通緝值增加 3% 逮捕成功率，上限 25% (0.25)
                const wantedBonus = Math.min(0.25, (targetWanted * 100) * 0.003);
                // 前科抵抗：老練罪犯反抗，每次前科 +2 戰鬥力，上限 30
                const targetCrimeRecord = targetData.crimeRecord || 0;
                const crimeResist = Math.min(30, targetCrimeRecord * 2);

                const policePower = (policeStats.final.atk || 0) + (policeStats.final.eva || 0) + 20; // 警察加成 +20
                const targetEva = Math.max(0, (targetStats.final.eva || 0) - 30); // 警察受過專業訓練，無視目標 30% 迴避率
                const targetPower = (targetStats.final.atk || 0) + targetEva + crimeResist;
                
                successRate = Math.min(0.95, Math.max(0.3, 0.5 + (policePower - targetPower) / 200 + wantedBonus));
            }

            if (Math.random() < successRate) {
                // 方案A：因公殉職風險 (8% 機率)
                if (Math.random() < 0.08) {
                    const medicalFee = Math.floor((policeData.kuCoin || 0) * 0.2); // 20% 醫療費
                    const jailedUntil = now + 12 * 60 * 60 * 1000;
                    t.update(policeRef, {
                        isPolice: db.FieldValue.delete(),
                        kuCoin: db.FieldValue.increment(policeKuCoinChange - medicalFee),
                        jailedUntil: jailedUntil,
                        lastArrest: now
                    });
                    const newBalance = (policeData.kuCoin || 0) + policeKuCoinChange - medicalFee;
                    return {
                        success: false, reason: 'kia',
                        message: `🚨 【因公殉職】\n你在逮捕 ${targetName} 時，遭到對方火力壓制身受重傷！\n你被送進加護病房 (需休養 12 小時)，並支付了 ${medicalFee.toLocaleString()} 哭幣醫療費。\n警政署已將你【強制退伍】！\n🏦 結算總資產：${newBalance.toLocaleString()} 哭幣`
                    };
                }

                // 逮捕成功
                if (arrestType === 'corruption') {
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

                    const targetWantedLevel = targetData.wantedLevel || 0;
                    const newTargetWantedLevel = Number((targetWantedLevel * 0.5).toFixed(2));
                    const targetUpdates = {
                        jailedUntil,
                        jailbreakCooldownUntil: db.FieldValue.delete(),
                        crimeRecord: db.FieldValue.increment(1),
                        wantedLevel: newTargetWantedLevel,
                        councilorUntil: db.FieldValue.delete(), // 失去議員資格
                        corruptionLevel: db.FieldValue.delete(), // 貪污值重置
                        kuCoin: newTargetKuCoin
                    };
                    t.update(targetRef, targetUpdates);

                    // 其中 30% 給警察當獎金
                    if (reward > 0) {
                        policeKuCoinChange += reward;
                    }

                    t.update(policeRef, { 
                        kuCoin: db.FieldValue.increment(policeKuCoinChange),
                        lastArrest: now
                    });

                    clearWantedListCache();
                    const newBalance = (policeData.kuCoin || 0) + policeKuCoinChange;

                    return {
                        success: true, arrested: true,
                        policeName, targetName, targetUserId,
                        jailMins, reward, targetWanted,
                        isTargetMafiaBoss: false, lostCouncilor: true, lostMilitary: false, umbrella: false,
                        arrestType, targetCorruption, cost: maintenanceFee, newBalance
                    };
                } else {
                    let jailMins = Math.max(30, Math.floor(targetWanted * 60));

                    // 黑幫刑期加重 (小弟 1.2倍 / 堂主 1.5倍 / 老大 2.0倍)
                    const { getWantedList, getMafiaRank } = require('../handlers/profession');
                    const wantedList = await getWantedList();
                    const targetMafiaRank = await getMafiaRank(targetUserId, targetData, wantedList);
                    let isTargetMafiaBoss = false;
                    
                    if (targetMafiaRank === 'boss') {
                        jailMins = Math.floor(jailMins * 2.0);
                        isTargetMafiaBoss = true;
                    } else if (targetMafiaRank === 'capo') {
                        jailMins = Math.floor(jailMins * 1.5);
                    } else if (targetMafiaRank === 'thug') {
                        jailMins = Math.floor(jailMins * 1.2);
                    }

                    const jailedUntil = now + jailMins * 60 * 1000;

                    // 議員保護傘檢查
                    let lostCouncilor = false;
                    let umbrella = false;

                    const targetWantedLevel = targetData.wantedLevel || 0;
                    const newTargetWantedLevel = Number((targetWantedLevel * 0.5).toFixed(2));
                    const targetUpdates = {
                        jailedUntil,
                        jailbreakCooldownUntil: db.FieldValue.delete(),
                        crimeRecord: db.FieldValue.increment(1),
                        wantedLevel: newTargetWantedLevel
                    };

                    if (isTargetCouncilor) {
                        if (Math.random() < 0.25) {
                            umbrella = true;
                            // 保護傘觸發 - 不入獄但通緝歸零
                            delete targetUpdates.jailedUntil;
                            delete targetUpdates.jailbreakCooldownUntil;
                            delete targetUpdates.crimeRecord;
                        } else {
                            targetUpdates.councilorUntil = db.FieldValue.delete();
                            const targetKuCoin = targetData.kuCoin || 0;
                            if (targetKuCoin > 0) {
                                targetUpdates.kuCoin = Math.floor(targetKuCoin * 0.5);
                            }
                            targetUpdates.corruptionLevel = db.FieldValue.delete();
                            lostCouncilor = true;
                        }
                    }

                    // 軍人退伍檢查
                    const isTargetMilitary = targetData.militaryUntil && now < targetData.militaryUntil;
                    let lostMilitary = false;
                    if (isTargetMilitary && !umbrella) {
                        targetUpdates.militaryUntil = db.FieldValue.delete();
                        targetUpdates.militaryGroupId = db.FieldValue.delete();
                        lostMilitary = true;
                    }

                    t.update(targetRef, targetUpdates);

                    // 計算獎金
                    const basePay = 2000000;
                    const bounty = (targetData.crimeRecord || 0) * 5000000;
                    const wantedBonus = Math.floor((basePay + bounty) * (1 + targetWanted * 0.5));
                    const reward = basePay + bounty + wantedBonus;

                    policeKuCoinChange += reward;
                    t.update(policeRef, { 
                        kuCoin: db.FieldValue.increment(policeKuCoinChange),
                        lastArrest: now
                    });

                    clearWantedListCache();
                    const newBalance = (policeData.kuCoin || 0) + policeKuCoinChange;

                    return {
                        success: true, arrested: true,
                        policeName, targetName, targetUserId,
                        jailMins, reward, targetWanted,
                        isTargetMafiaBoss, lostCouncilor, lostMilitary, umbrella,
                        arrestType, cost: maintenanceFee, newBalance
                    };
                }
            } else {
                // 逮捕失敗
                if (arrestType === 'corruption') {
                    // 警察指控失敗：革職並入獄 12 小時，前科 + 1
                    const policeWantedLevel = policeData.wantedLevel || 0;
                    const newPoliceWantedLevel = Number((policeWantedLevel * 0.5).toFixed(2));
                    t.update(policeRef, {
                        isPolice: db.FieldValue.delete(),
                        jailedUntil: now + 12 * 60 * 60 * 1000,
                        jailbreakCooldownUntil: db.FieldValue.delete(),
                        crimeRecord: db.FieldValue.increment(1),
                        wantedLevel: newPoliceWantedLevel,
                        kuCoin: db.FieldValue.increment(policeKuCoinChange),
                        lastArrest: now
                    });

                    const newBalance = (policeData.kuCoin || 0) + policeKuCoinChange;
                    return {
                        success: true, arrested: false,
                        policeName, targetName, targetUserId,
                        arrestType, newBalance
                    };
                } else {
                    t.update(policeRef, {
                        kuCoin: db.FieldValue.increment(policeKuCoinChange),
                        lastArrest: now
                    });
                    const newBalance = (policeData.kuCoin || 0) + policeKuCoinChange;
                    return {
                        success: true, arrested: false,
                        policeName, targetName,
                        arrestType, cost: maintenanceFee, newBalance
                    };
                }
            }
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        if (result.arrested) {
            const bodyContents = [
                flexUtils.createText({ text: `👮 ${result.policeName} 對 ${result.targetName} 發動了合法逮捕行動！`, size: 'sm', color: '#666666', wrap: true })
            ];

            if (result.arrestType === 'corruption') {
                bodyContents.push(flexUtils.createText({ text: `⚖️ 【貪污罪起訴成功】`, size: 'sm', weight: 'bold', color: '#E91E63', margin: 'md', wrap: true }));
                bodyContents.push(flexUtils.createText({ text: `檢調單位查獲洗錢與藏匿賄款的關鍵事證！`, size: 'xs', color: '#555555', margin: 'sm', wrap: true }));
                bodyContents.push(flexUtils.createText({ text: `💥 議員資格當場褫奪！`, size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'sm' }));
                bodyContents.push(flexUtils.createText({ text: `💸 沒收並扣押該議員 60% 財產！`, size: 'sm', weight: 'bold', color: '#D32F2F' }));
                bodyContents.push(flexUtils.createSeparator('md'));
                bodyContents.push(flexUtils.createText({ text: `🔒 ${result.targetName} 被收押禁見 ${result.jailMins} 分鐘！`, size: 'sm', color: '#333333', margin: 'md', wrap: true }));
                bodyContents.push(flexUtils.createSeparator('md'));
                bodyContents.push(flexUtils.createText({ text: `🔧 裝備保養費：-${(result.cost || 0).toLocaleString()} 哭幣`, size: 'xs', color: '#E91E63', margin: 'sm', wrap: true }));
                bodyContents.push(flexUtils.createText({ text: `💰 警察績效獎金 (30% 財產分成)：\n${result.reward.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#4CAF50', margin: 'md', wrap: true }));
            } else {
                if (result.umbrella) {
                    bodyContents.push(flexUtils.createText({ text: `🏛️ 【司法保護傘】地檢署來電：「因缺乏關鍵證據，不予起訴！」`, size: 'sm', weight: 'bold', color: '#673AB7', margin: 'md', wrap: true }));
                    bodyContents.push(flexUtils.createText({ text: `議員大搖大擺地離開了，但通緝值已被清除。`, size: 'xs', color: '#333333', margin: 'sm', wrap: true }));
                } else {
                    bodyContents.push(flexUtils.createText({ text: `「雙手放在我看得到的地方！你被捕了！」`, size: 'sm', weight: 'bold', color: '#1976D2', margin: 'md', wrap: true }));
                    if (result.isTargetMafiaBoss) {
                        bodyContents.push(flexUtils.createText({ text: `🕶️ 【黑道老大落網】刑期加倍！`, size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'sm' }));
                    }
                    if (result.lostCouncilor) {
                        bodyContents.push(flexUtils.createText({ text: `💥 議員資格遭到褫奪！並扣押 50% 財產！`, size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'sm' }));
                    }
                    if (result.lostMilitary) {
                        bodyContents.push(flexUtils.createText({ text: `🪖 遭勒令退伍，取消軍人身分！`, size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'sm' }));
                    }
                    bodyContents.push(flexUtils.createSeparator('md'));
                    bodyContents.push(flexUtils.createText({ text: `🔒 ${result.targetName} 被收押入獄 ${result.jailMins} 分鐘！`, size: 'sm', color: '#333333', margin: 'md', wrap: true }));
                }
                bodyContents.push(flexUtils.createSeparator('md'));
                bodyContents.push(flexUtils.createText({ text: `🔧 裝備保養費：-${(result.cost || 0).toLocaleString()} 哭幣`, size: 'xs', color: '#E91E63', margin: 'sm', wrap: true }));
                bodyContents.push(flexUtils.createText({ text: `💰 績效獎金 + 懸賞金：${result.reward.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#4CAF50', margin: 'md' }));
                bodyContents.push(flexUtils.createText({ text: `🏦 結算總資產：${result.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#1976D2', margin: 'sm' }));
                bodyContents.push(flexUtils.createSeparator('md'));
                bodyContents.push(flexUtils.createText({
                    text: `⏳ 執法冷卻：2 小時\n（可於 ${new Date(Date.now() + 2 * 60 * 60 * 1000).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })} 後再次逮捕）`,
                    size: 'xxs', color: '#888888', align: 'center', margin: 'md', wrap: true
                }));
            }

            const bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('🚨 逮捕成功', '正義執行', '#FFFFFF', '#4CAF50'),
                body: flexUtils.createBox('vertical', bodyContents, { paddingAll: 'xl', backgroundColor: '#FAFAFA' })
            });

            // 如果成功逮捕且非保護傘、非貪污逮捕，才加入收賄按鈕
            if (!result.umbrella && result.arrestType !== 'corruption') {
                bubble.footer = flexUtils.createBox('vertical', [
                    flexUtils.createButton({
                        action: {
                            type: 'postback',
                            label: '💰 私下收賄（放走犯人）',
                            data: `action=offerBribe&targetId=${result.targetUserId}&jailMins=${result.jailMins}&reward=${result.reward}`
                        },
                        style: 'primary',
                        color: '#333333',
                        height: 'sm'
                    })
                ], { paddingAll: 'md' });
            }

            await lineUtils.replyFlex(replyToken, '逮捕成功', bubble);
            clearProfessionCache(result.targetUserId);

        } else {
            if (result.arrestType === 'corruption') {
                const bubble = flexUtils.createBubble({
                    size: 'mega',
                    header: flexUtils.createHeader('❌ 逮捕失敗', '起訴遭駁回', '#FFFFFF', '#B71C1C'),
                    body: flexUtils.createBox('vertical', [
                        flexUtils.createText({ text: `👮 ${result.policeName} 指控 ${result.targetName} 議員貪污並意圖逮捕...`, size: 'sm', color: '#666666', wrap: true }),
                        flexUtils.createText({ text: `「這是蓄意抹黑！我要告你誣告！」議員召開記者會強烈譴責，地檢署認定查無實證。`, size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'md', wrap: true }),
                        flexUtils.createSeparator('md'),
                        flexUtils.createText({ text: `👮 ${result.policeName} 誣告成立，當場撤職！`, size: 'sm', color: '#FF0000', weight: 'bold', margin: 'md' }),
                        flexUtils.createText({ text: `🔒 即刻收押入獄 12 小時，前科 + 1！`, size: 'sm', color: '#FF0000', weight: 'bold' })
                    ], { paddingAll: 'xl', backgroundColor: '#FFEBEE' })
                });

                await lineUtils.replyFlex(replyToken, '指控失敗', bubble);
                clearProfessionCache(userId);
            } else {
                const failActs = [
                    `${result.targetName} 身手矯健，一記後空翻就翻過了圍牆消失在暗巷中！`,
                    `${result.targetName} 丟出一顆煙霧彈，等煙散去時人已經不見了！`,
                    `${result.targetName} 大喊「看！是UFO！」趁你抬頭時拔腿狂奔！`,
                    `${result.targetName} 鑽進下水道，你堂堂警察不可能跟著跳下去吧？`
                ];
                const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

                const bubble = flexUtils.createBubble({
                    size: 'mega',
                    header: flexUtils.createHeader('❌ 逮捕失敗', '', '#FFFFFF', '#B71C1C'),
                    body: flexUtils.createBox('vertical', [
                        flexUtils.createText({ text: `${result.policeName} 試圖逮捕 ${result.targetName}...`, size: 'sm', color: '#666666', wrap: true }),
                        flexUtils.createText({ text: pick(failActs), size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'md', wrap: true }),
                        flexUtils.createSeparator('md'),
                        flexUtils.createText({ text: `犯人成功逃脫了！下次加強訓練再來吧！`, size: 'xs', color: '#888888', margin: 'md', wrap: true })
                    ], { paddingAll: 'xl', backgroundColor: '#FFEBEE' })
                });

                await lineUtils.replyFlex(replyToken, '逮捕失敗', bubble);
            }
        }

    } catch (e) {
        console.error('[Police] handleArrest Error:', e);
        await lineUtils.replyText(replyToken, '❌ 逮捕過程發生錯誤。');
    }
}

async function handleQuickArrest(replyToken, context) {
    const { userId, groupId } = context;
    const params = new URLSearchParams(context.postbackData || '');
    const targetUserId = params.get('targetId');

    if (!targetUserId) {
        await lineUtils.replyText(replyToken, '❌ 無效的逮捕目標（無法解析目標玩家的 ID，可能該按鈕已過期，請重新發送「通緝榜」）。');
        return;
    }

    // 組裝一個假的 messageObject 來複用 handleArrest
    const fakeMessageObject = {
        mention: {
            mentionees: [{ userId: targetUserId }]
        }
    };

    await handleArrest(replyToken, context, fakeMessageObject);
}

module.exports = {
    handleArrest,
    handleQuickArrest
};
