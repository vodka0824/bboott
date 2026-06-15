const { db } = require('../utils/db');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const memoryCache = require('../utils/memoryCache');
const { getWantedList, getProfessionTitle, getMafiaRank } = require('../handlers/profession');
const { getFinalPlayerStats } = require('../handlers/rpg');
const economyHandler = require('../handlers/economy');

const COLLECTION_NAME = 'economy_users';

async function handleOfferBribe(replyToken, context) {
    const { userId, groupId } = context;
    const params = new URLSearchParams(context.postbackData || '');
    const targetId = params.get('targetId');
    const jailMins = parseInt(params.get('jailMins') || '0');
    const reward = parseInt(params.get('reward') || '0');

    if (!targetId) {
        await lineUtils.replyText(replyToken, '❌ 無效的收賄操作（無法解析目標犯人的 ID，此收賄操作連結可能已過期）。');
        return;
    }

    try {
        const policeName = await lineUtils.getGroupMemberName(groupId, userId);
        const targetName = await lineUtils.getGroupMemberName(groupId, targetId);

        const result = await db.runTransaction(async (t) => {
            const policeRef = db.collection(COLLECTION_NAME).doc(userId);
            const targetRef = db.collection(COLLECTION_NAME).doc(targetId);
            const [policeDoc, targetDoc] = await Promise.all([t.get(policeRef), t.get(targetRef)]);

            if (!policeDoc.exists) return { success: false, message: '找不到您的資料。' };
            const policeData = policeDoc.data();

            if (!policeData.isPolice) return { success: false, message: '你已經不是警察了！' };

            // 目標必須還在獄中
            if (!targetDoc.exists) return { success: false, message: '找不到目標資料。' };
            const targetData = targetDoc.data();
            if (!targetData.jailedUntil || Date.now() >= targetData.jailedUntil) {
                return { success: false, message: '犯人已經出獄了，沒辦法收賄放人！' };
            }

            // 20% 被廉政公署查獲
            if (Math.random() < 0.20) {
                const confiscated = policeData.kuCoin || 0;
                const policeWantedLevel = policeData.wantedLevel || 0;
                const newPoliceWantedLevel = Number((policeWantedLevel * 0.5).toFixed(2));
                t.update(policeRef, {
                    isPolice: db.FieldValue.delete(),
                    kuCoin: 0,
                    crimeRecord: db.FieldValue.increment(1),
                    jailedUntil: Date.now() + 24 * 60 * 60 * 1000,
                    jailbreakCooldownUntil: db.FieldValue.delete(),
                    wantedLevel: newPoliceWantedLevel
                });
                clearWantedListCache();
                return { success: true, caught: true, policeName, targetName, confiscated, newBalance: 0 };
            }

            // 收賄成功
            const bribeAmount = reward * 2;
            t.update(policeRef, { kuCoin: db.FieldValue.increment(bribeAmount) });
            t.update(targetRef, {
                jailedUntil: db.FieldValue.delete(),
                wantedLevel: 0
            });

            const newBalance = (policeData.kuCoin || 0) + bribeAmount;
            return { success: true, caught: false, policeName, targetName, bribeAmount, newBalance };
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        if (result.caught) {
            // 廉政公署查獲
            clearProfessionCache(userId);

            const bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('🔍 廉政公署查獲', '貪污被抓', '#FFFFFF', '#B71C1C'),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `${result.policeName} 正準備私下收錢放走 ${result.targetName}...`, size: 'sm', color: '#666666', wrap: true }),
                    flexUtils.createText({ text: `突然一群穿西裝的廉政公署探員從暗處衝出！「不要動！你涉嫌貪污收賄！」`, size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'md', wrap: true }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: `👮 ${result.policeName} 遭到開除警籍！`, size: 'sm', color: '#FF0000', weight: 'bold', margin: 'md' }),
                    flexUtils.createText({ text: `💸 所有財產 ${result.confiscated.toLocaleString()} 哭幣被沒收！`, size: 'sm', color: '#FF0000', weight: 'bold' }),
                    flexUtils.createText({ text: `🔒 收押入獄 24 小時，前科 +1！`, size: 'sm', color: '#FF0000', weight: 'bold' }),
                    flexUtils.createText({ text: `🏦 結算總資產：${result.newBalance.toLocaleString()} 哭幣`, size: 'sm', color: '#FF0000', weight: 'bold', margin: 'sm' })
                ], { paddingAll: 'xl', backgroundColor: '#FFEBEE' })
            });

            await lineUtils.replyFlex(replyToken, '廉政公署查獲', bubble);

        } else {
            // 收賄成功
            clearProfessionCache(targetId);

            const bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('💰 黑白掛勾', '暗中交易', '#FFFFFF', '#333333'),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `${result.policeName} 環顧四周，確認沒人注意後，壓低聲音說：`, size: 'sm', color: '#666666', wrap: true }),
                    flexUtils.createText({ text: `「兄弟，識相的話，這件事就當沒發生過...」`, size: 'sm', weight: 'bold', color: '#FFD700', margin: 'md', wrap: true }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: `🔓 ${result.targetName} 被悄悄放走了，通緝值歸零！`, size: 'sm', color: '#333333', margin: 'md', wrap: true }),
                    flexUtils.createText({ text: `💰 收賄所得：${result.bribeAmount.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#4CAF50', margin: 'sm' }),
                    flexUtils.createText({ text: `🏦 結算總資產：${result.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#1976D2', margin: 'sm' }),
                    flexUtils.createText({ text: `⚠️ 小心廉政公署盯上你...`, size: 'xxs', color: '#FF9800', margin: 'md' })
                ], { paddingAll: 'xl', backgroundColor: '#FAFAFA' })
            });

            await lineUtils.replyFlex(replyToken, '黑白掛勾', bubble);
        }

    } catch (e) {
        console.error('[Police] handleOfferBribe Error:', e);
        await lineUtils.replyText(replyToken, '❌ 收賄過程發生錯誤。');
    }
}

async function handleAssassinatePolice(replyToken, context, messageObject) {
    const { userId, groupId } = context;
    const mentionObj = messageObject && messageObject.mention;

    if (!mentionObj || !mentionObj.mentionees || mentionObj.mentionees.length === 0) {
        await lineUtils.replyText(replyToken, '❌ 請 @標記 你要暗殺的警察！\n用法：暗殺警察 @警察');
        return;
    }

    const targetUserId = mentionObj.mentionees[0].userId;
    if (!targetUserId) {
        await lineUtils.replyText(replyToken, '❌ 無法取得對方資料。');
        return;
    }

    try {
        const bossName = await lineUtils.getGroupMemberName(groupId, userId);
        const targetName = await lineUtils.getGroupMemberName(groupId, targetUserId);
        const bossStats = await getFinalPlayerStats(userId);
        const targetStats = await getFinalPlayerStats(targetUserId);

        const result = await db.runTransaction(async (t) => {
            const bossRef = db.collection(COLLECTION_NAME).doc(userId);
            const targetRef = db.collection(COLLECTION_NAME).doc(targetUserId);
            const [bossDoc, targetDoc] = await Promise.all([t.get(bossRef), t.get(targetRef)]);

            if (!bossDoc.exists) return { success: false, message: '找不到您的資料。' };
            if (!targetDoc.exists) return { success: false, message: '找不到目標的資料。' };

            const bossData = bossDoc.data();
            const targetData = targetDoc.data();
            const now = Date.now();

            // 檢查是否為黑道老大
            const { getMafiaBoss } = require('../handlers/profession');
            const mafiaBoss = await getMafiaBoss();
            if (!mafiaBoss || mafiaBoss.userId !== userId) {
                return { success: false, message: '你不是【黑道老大】，沒有足夠勢力發起暗殺！' };
            }

            if (!targetData.isPolice) return { success: false, message: `${targetName} 不是警察，不能使用暗殺警察指令！` };

            if (targetData.jailedUntil && now < targetData.jailedUntil) {
                return { success: false, message: `${targetName} 已經在醫院或監獄裡了，不需要暗殺！` };
            }

            const cost = 100000000; // 1億暗殺費
            if ((bossData.kuCoin || 0) < cost) {
                return { success: false, message: `❌ 發起暗殺需要耗資 ${cost.toLocaleString()} 哭幣來買通殺手與打點黑道，你的餘額不足！` };
            }

            // 先扣除暗殺費用
            t.update(bossRef, { kuCoin: db.FieldValue.increment(-cost) });

            // 戰鬥力判定
            const bossPower = bossStats.final.combatPower;
            const policePower = targetStats.final.combatPower + 20; // 警察加成
            const successRate = Math.min(0.8, Math.max(0.2, 0.5 + (bossPower - policePower) / 200));

            if (Math.random() < successRate) {
                // 暗殺成功
                const targetKuCoin = targetData.kuCoin || 0;
                let stolenAmount = 0;
                if (targetKuCoin > 0) {
                    stolenAmount = Math.floor(targetKuCoin * 0.2); // 搶走警察 20% 財產
                }

                t.update(targetRef, {
                    isPolice: db.FieldValue.delete(),
                    jailedUntil: now + 12 * 60 * 60 * 1000, // 重傷住院 12 小時
                    kuCoin: db.FieldValue.increment(-stolenAmount)
                });

                if (stolenAmount > 0) {
                    t.update(bossRef, { kuCoin: db.FieldValue.increment(stolenAmount) });
                }

                clearProfessionCache(targetUserId);
                const newBalance = (bossData.kuCoin || 0) - cost + stolenAmount;

                return {
                    success: true, assassinated: true,
                    bossName, targetName,
                    stolenAmount, cost, newBalance
                };
            } else {
                // 暗殺失敗，黑道老大被捕
                const jailMins = 24 * 60; // 關 24 小時
                const jailedUntil = now + jailMins * 60 * 1000;

                const bossWantedLevel = bossData.wantedLevel || 0;
                const newBossWantedLevel = Number((bossWantedLevel * 0.5).toFixed(2));
                t.update(bossRef, {
                    jailedUntil,
                    jailbreakCooldownUntil: db.FieldValue.delete(),
                    crimeRecord: db.FieldValue.increment(1),
                    wantedLevel: newBossWantedLevel
                });

                clearWantedListCache();

                const newBalance = (bossData.kuCoin || 0) - cost;

                return {
                    success: true, assassinated: false,
                    bossName, targetName,
                    jailMins, cost, newBalance
                };
            }
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        if (result.assassinated) {
            const bodyContents = [
                flexUtils.createText({ text: `🔫 【黑道老大】${result.bossName} 發動了針對警察的暗殺行動！`, size: 'sm', weight: 'bold', color: '#D32F2F', wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `「砰！砰！砰！」\n黑道殺手在暗巷中伏擊了 ${result.targetName}！`, size: 'sm', color: '#333333', margin: 'md', wrap: true }),
                flexUtils.createText({ text: `🚨 警察身受重傷，被送往加護病房 (需休養 12 小時)，並被警政署【強制退伍】！`, size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'md', wrap: true }),
                flexUtils.createText({ text: `💸 黑道老大搜刮了警察身上的 ${result.stolenAmount.toLocaleString()} 哭幣！`, size: 'sm', weight: 'bold', color: '#FF9800', margin: 'sm', wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `(本次暗殺成本：-${result.cost.toLocaleString()})`, size: 'xs', color: '#666666', margin: 'sm' }),
                flexUtils.createText({ text: `💰 結算總資產：${result.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#1A1A1A', margin: 'sm' })
            ];

            const bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('💀 暗殺成功', '黑道隻手遮天', '#FFFFFF', '#1A1A1A'),
                body: flexUtils.createBox('vertical', bodyContents, { paddingAll: 'xl', backgroundColor: '#FAFAFA' })
            });

            await lineUtils.replyFlex(replyToken, '暗殺成功', bubble);
        } else {
            const bodyContents = [
                flexUtils.createText({ text: `🔫 【黑道老大】${result.bossName} 發動了暗殺行動，但行動徹底失敗！`, size: 'sm', weight: 'bold', color: '#1976D2', wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `👮 ${result.targetName} 早有防備，在一陣激烈槍戰後，當場反制並逮捕了黑道老大！`, size: 'sm', color: '#333333', margin: 'md', wrap: true }),
                flexUtils.createText({ text: `🔒 黑道老大落網！被重判入獄 ${result.jailMins / 60} 小時！`, size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'md', wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `(本次暗殺成本：-${result.cost.toLocaleString()} 且全數打水漂)`, size: 'xs', color: '#666666', margin: 'sm' }),
                flexUtils.createText({ text: `💰 結算總資產：${result.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#1A1A1A', margin: 'sm' })
            ];

            const bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('🚨 暗殺失敗', '正義終將伸張', '#FFFFFF', '#1976D2'),
                body: flexUtils.createBox('vertical', bodyContents, { paddingAll: 'xl', backgroundColor: '#FAFAFA' })
            });

            await lineUtils.replyFlex(replyToken, '暗殺失敗', bubble);
        }

    } catch (e) {
        console.error('[Police] handleAssassinatePolice Error:', e);
        await lineUtils.replyText(replyToken, '❌ 暗殺行動過程發生錯誤。');
    }
}

module.exports = {
    handleOfferBribe,
    handleAssassinatePolice
};
