const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const notificationService = require('../services/notificationService');

/**
 * 抄寫佛經 (洗白前科)
 */
async function handleSutra(replyToken, context) {
    const { userId, groupId } = context;

    try {
        const { db } = require('../utils/db');
        const { getSpamResponse } = require('../utils/spamHandler');
        const COLLECTION_NAME = 'economy_users';
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);
        
        const result = await db.runTransaction(async (t) => {
            const docRef = db.collection(COLLECTION_NAME).doc(userId);
            const doc = await t.get(docRef);
            if (!doc.exists) return { success: false, message: '找不到資料。' };
            const data = doc.data();

            if (data.jailedUntil && Date.now() < data.jailedUntil) {
                const spam = getSpamResponse(data, 'sutra_jailed', '你還在坐牢，無法去寺廟抄寫佛經！');
                t.update(docRef, { spamTracker: spam.newTracker });
                return { success: false, message: spam.message, ignore: spam.ignore };
            }

            // CD 2小時 = 2 * 60 * 60 * 1000
            const cdMs = 2 * 60 * 60 * 1000;
            if (data.sutraCooldownUntil && Date.now() < data.sutraCooldownUntil) {
                const remainingMin = Math.ceil((data.sutraCooldownUntil - Date.now()) / 60000);
                const spam = getSpamResponse(data, 'sutra_cd', `你的手腕還在發炎！請休息 ${remainingMin} 分鐘後再繼續抄寫。`);
                t.update(docRef, { spamTracker: spam.newTracker });
                return { success: false, message: spam.message, ignore: spam.ignore };
            }

            const crimeRecord = data.crimeRecord || 0;
            if (crimeRecord <= 0) {
                return { success: false, message: '你又沒有前科，抄什麼佛經？' };
            }

            t.update(docRef, {
                crimeRecord: crimeRecord - 1,
                sutraCooldownUntil: Date.now() + cdMs
            });

            return { success: true, name: memberName || data.displayName || data.name };
        });

        if (!result.success) {
            if (result.ignore) return;
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        await lineUtils.replyText(replyToken, `📿 【潛心向佛】\n${result.name} 閉關抄寫了兩小時的佛經，法官深受感動！\n\n法官：「此人已具備悔意，尚可教化。」\n你的前科次數減少了 1 次！`);

    } catch (e) {
        console.error('[Jail] handleSutra Error:', e);
        await lineUtils.replyText(replyToken, `❌ 抄寫失敗：${e.message}`);
    }
}


/**
 * 精神鑑定 (賭博洗前科)
 */
async function handlePsychiatric(replyToken, context) {
    const { userId, groupId } = context;

    try {
        const lineUtils = require('../utils/line');
        const { db } = require('../utils/db');
        const COLLECTION_NAME = 'economy_users';
        
        const cost = 5000000; // 500萬
        const cdMs = 24 * 60 * 60 * 1000; // 1天
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);

        const result = await db.runTransaction(async (t) => {
            const docRef = db.collection(COLLECTION_NAME).doc(userId);
            const doc = await t.get(docRef);
            if (!doc.exists) return { success: false, message: '找不到資料。' };
            const data = doc.data();

            if (data.jailedUntil && Date.now() < data.jailedUntil) {
                return { success: false, message: '你還在坐牢，無法去醫院！' };
            }

            if (data.psychiatricCooldownUntil && Date.now() < data.psychiatricCooldownUntil) {
                const remainingMin = Math.ceil((data.psychiatricCooldownUntil - Date.now()) / 60000);
                return { success: false, message: `醫院說你太頻繁掛號了，請等待 ${Math.floor(remainingMin/60)} 小時 ${remainingMin%60} 分鐘後再去！` };
            }

            const kuCoin = data.kuCoin || 0;
            if (kuCoin < cost) {
                return { success: false, message: `掛號費與律師費需要 ${cost.toLocaleString()} 哭幣，你錢不夠！窮人沒資格生病！` };
            }

            const crimeRecord = data.crimeRecord || 0;
            if (crimeRecord <= 0) {
                return { success: false, message: '你沒有前科，不用裝瘋賣傻啦！' };
            }

            const rand = Math.random() * 100;
            let outcome = '';
            let newRecord = crimeRecord;

            if (rand < 10) {
                // 10% 大成功
                outcome = 'great_success';
                t.update(docRef, { crimeRecord: 0, kuCoin: db.FieldValue.increment(-cost), psychiatricCooldownUntil: Date.now() + cdMs });
            } else if (rand < 40) {
                // 30% 普通成功
                outcome = 'success';
                newRecord = Math.max(0, Math.floor(crimeRecord / 2));
                t.update(docRef, { crimeRecord: newRecord, kuCoin: db.FieldValue.increment(-cost), psychiatricCooldownUntil: Date.now() + cdMs });
            } else {
                // 60% 失敗 (被黑吃黑)
                outcome = 'fail';
                t.update(docRef, { kuCoin: db.FieldValue.increment(-cost), psychiatricCooldownUntil: Date.now() + cdMs });
            }

            return { success: true, outcome, cost, name: memberName || data.displayName || data.name };
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        if (result.outcome === 'great_success') {
            await lineUtils.replyText(replyToken, `🩺 【大成功！思覺失調】\n${result.name} 花了 ${result.cost.toLocaleString()} 疏通！\n權威醫師開立了重度精神障礙證明，法官當庭痛哭流涕，認為是社會對不起你！\n\n法官：「無責任能力，當庭釋放！」\n🎉 你的前科全部歸零！`);
        } else if (result.outcome === 'success') {
            await lineUtils.replyText(replyToken, `🏥 【普通成功！輕度障礙】\n${result.name} 花了 ${result.cost.toLocaleString()}！\n醫師認定你有輕度精神障礙，法官決定酌減你的刑責。\n\n你的前科次數直接減半！`);
        } else {
            await lineUtils.replyText(replyToken, `💊 【失敗！裝瘋賣傻】\n${result.name} 繳了 ${result.cost.toLocaleString()} 鑑定費...\n結果醫生一眼看穿你在裝病，不僅沒幫你開證明，還把你的錢全部吞了黑吃黑！\n\n法官勃然大怒！你的前科沒有任何改變，錢也白花了！`);
        }

    } catch (e) {
        console.error('[Jail] handlePsychiatric Error:', e);
        const lineUtils = require('../utils/line');
        await lineUtils.replyText(replyToken, '❌ 精神鑑定失敗。');
    }
}

/**
 * 參選議員 (終極洗白)
 */
async function handleElection(replyToken, context) {
    const { userId, groupId } = context;

    try {
        const lineUtils = require('../utils/line');
        const { db } = require('../utils/db');
        const { getSpamResponse } = require('../utils/spamHandler');
        const COLLECTION_NAME = 'economy_users';
        const cost = 100000000; // 1億
        const cdMs = 24 * 60 * 60 * 1000; // 1天
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);

        const result = await db.runTransaction(async (t) => {
            const docRef = db.collection(COLLECTION_NAME).doc(userId);
            const doc = await t.get(docRef);
            if (!doc.exists) return { success: false, message: '找不到資料。' };
            const data = doc.data();

            if (data.jailedUntil && Date.now() < data.jailedUntil) {
                const spam = getSpamResponse(data, 'election_jailed', '你還在坐牢，無法登記參選！');
                t.update(docRef, { spamTracker: spam.newTracker });
                return { success: false, message: spam.message, ignore: spam.ignore };
            }

            if (data.electionCooldownUntil && Date.now() < data.electionCooldownUntil) {
                const remainingMin = Math.ceil((data.electionCooldownUntil - Date.now()) / 60000);
                const spam = getSpamResponse(data, 'election_cd', `選委會說你太頻繁登記了，請等待 ${Math.floor(remainingMin/60)} 小時 ${remainingMin%60} 分鐘後再來參選！`);
                t.update(docRef, { spamTracker: spam.newTracker });
                return { success: false, message: spam.message, ignore: spam.ignore };
            }

            // 1. 檢查是否已經是市議員
            if (data.councilorUntil && Date.now() < data.councilorUntil) {
                const remainDays = ((data.councilorUntil - Date.now()) / (24 * 60 * 60 * 1000)).toFixed(1);
                return { success: false, message: `您目前已經是現任市議員了，任期還剩餘 ${remainDays} 天，無須重複登記參選！` };
            }

            // 2. 檢查是否是現役軍人
            if (data.militaryUntil && Date.now() < data.militaryUntil) {
                return { success: false, message: `您目前正在軍中服役，無法登記參選議員！請等退伍後再行動。` };
            }

            // 3. 檢查是否是警察
            if (data.isPolice) {
                return { success: false, message: `警察為中立執法人員，禁止參與政治競選！請先「辭職」後再來登記參選。` };
            }

            const kuCoin = data.kuCoin || 0;
            if (kuCoin < cost) {
                return { success: false, message: `參選保證金與競選經費需要 ${cost.toLocaleString()} 哭幣，你錢不夠！` };
            }

            t.update(docRef, {
                kuCoin: db.FieldValue.increment(-cost),
                electionCooldownUntil: Date.now() + cdMs, // 參選CD維持24小時 (但如果在任期內不會需要選)
                crimeRecord: 0,
                wantedLevel: 0,
                councilorUntil: Date.now() + cdMs * 7, // 7天特權 (1週)
                councilorPressureToken: 1,          // 1次施壓額度
                corruptionLevel: db.FieldValue.delete() // 清空舊任期貪污值！
            });

            return { success: true, name: memberName || data.displayName || data.name };
        });

        if (!result.success) {
            if (result.ignore) return;
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        const msg = `🎉🎉🎉 【狂賀當選】 🎉🎉🎉\n${result.name} 豪擲 1 億哭幣，成功當選了本市議員！\n\n黑道洗白的最快方式就是參政！\n藉著政治豁免權，你的【前科】與【通緝值】已經瞬間全部歸零！\n往日恩怨一筆勾銷，大家以後都要尊稱一聲「議員好」！`;
        await lineUtils.replyText(replyToken, msg);

        const { clearProfessionCache } = require('./profession');
        clearProfessionCache(userId);

    } catch (e) {
        console.error('[Jail] handleElection Error:', e);
        const lineUtils = require('../utils/line');
        await lineUtils.replyText(replyToken, `❌ 參選失敗。原因：${e.message || '未知系統錯誤'}`);
    }
}

/**
 * 找替死鬼
 */
async function handleScapegoat(replyToken, context, messageObject) {
    const { userId: fromUserId, groupId } = context;
    const mentionObj = messageObject && messageObject.mention;
    const lineUtils = require('../utils/line');
    
    if (!mentionObj || !mentionObj.mentionees || mentionObj.mentionees.length === 0) {
        await lineUtils.replyText(replyToken, '❌ 請 @標記 你要嫁禍的對象！(費用：目前通緝值百分比 * 50萬)');
        return;
    }

    const targetUserId = mentionObj.mentionees[0].userId;
    if (fromUserId === targetUserId) {
        await lineUtils.replyText(replyToken, '❌ 你要嫁禍給自己？有病嗎？');
        return;
    }

    try {
        const { db } = require('../utils/db');
        const COLLECTION_NAME = 'economy_users';
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

            if (fromData.jailedUntil && Date.now() < fromData.jailedUntil) {
                return { success: false, message: '你還在坐牢，無法在外面找替死鬼！' };
            }

            const wantedLevel = fromData.wantedLevel || 0;
            if (wantedLevel <= 0) {
                return { success: false, message: '你目前沒有通緝值，不需要找替死鬼！' };
            }

            const wantedPercent = Math.floor(wantedLevel * 100);
            const cost = wantedPercent * 500000; // 50萬 per 1%

            const fromCoin = fromData.kuCoin || 0;
            if (fromCoin < cost) {
                return { success: false, message: `你的通緝值高達 ${wantedPercent}%，找替死鬼需要安家費 ${cost.toLocaleString()} 哭幣，你只有 ${fromCoin.toLocaleString()} 哭幣！` };
            }

            const transferWanted = Number((wantedLevel / 2).toFixed(2));
            const fromName = fromMemberName || fromData.displayName || fromData.name;
            const targetName = targetMemberName || targetData.displayName || targetData.name;

            let outcome = '';
            const fromVendettas = fromData.vendettas || {};
            const targetVendettas = targetData.vendettas || {};
            const hasVendetta = fromVendettas[targetUserId] && fromVendettas[targetUserId] > Date.now();

            if (hasVendetta) {
                // 消耗標記，100% 復仇成功
                outcome = 'vendetta';
                delete fromVendettas[targetUserId];
                t.update(fromDocRef, {
                    kuCoin: db.FieldValue.increment(-cost),
                    wantedLevel: 0,
                    vendettas: fromVendettas
                });
                t.update(targetDocRef, {
                    wantedLevel: db.FieldValue.increment(transferWanted)
                });
            } else {
                const rand = Math.random() * 100;
                if (rand < 50) {
                    // 50% 成功，給目標掛上血海深仇標記
                    outcome = 'success';
                    targetVendettas[fromUserId] = Date.now() + 24 * 60 * 60 * 1000; // 24小時
                    t.update(fromDocRef, {
                        kuCoin: db.FieldValue.increment(-cost),
                        wantedLevel: 0
                    });
                    
                    t.update(targetDocRef, {
                        wantedLevel: db.FieldValue.increment(transferWanted),
                        vendettas: targetVendettas
                    });
                } else if (rand < 90) {
                    // 40% 失敗
                    outcome = 'fail';
                    t.update(fromDocRef, {
                        kuCoin: db.FieldValue.increment(-cost)
                    });
                } else {
                    // 10% 踢到鐵板：王牌律師
                    outcome = 'lawyer';
                    const jailDurationMs = 3 * 60 * 60 * 1000; // 3小時
                    const targetWantedLevel = fromData.wantedLevel || 0;
                    const newTargetWantedLevel = Number((targetWantedLevel * 0.5).toFixed(2));
                    t.update(fromDocRef, {
                        kuCoin: db.FieldValue.increment(-cost),
                        wantedLevel: newTargetWantedLevel,
                        jailedUntil: Date.now() + jailDurationMs,
                        crimeRecord: db.FieldValue.increment(1)
                    });

                    t.update(targetDocRef, {
                        kuCoin: db.FieldValue.increment(cost)
                    });
                }
            }

            return { 
                success: true, 
                outcome,
                cost, 
                transferWanted,
                fromName,
                targetName
            };
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        let msg = '';
        if (result.outcome === 'vendetta') {
            msg = `🩸 【血海深仇：極致復仇】\n${result.fromName} 眼中充滿血絲，動用了針對 ${result.targetName} 的【血海深仇】標記！\n\n「你以為你可以全身而退嗎？！」\n\n無視任何防禦與律師，嫁禍 **100% 成功**！\n${result.fromName} 的通緝值全數歸零，而 ${result.targetName} 無情地被扣上了 ${(result.transferWanted * 100).toFixed(0)}% 的通緝值！\n*(復仇標記已消耗)*`;
        } else if (result.outcome === 'success') {
            msg = `🔪 【栽贓嫁禍】\n${result.fromName} 花了天價的安家費 ${result.cost.toLocaleString()} 哭幣，買通小弟去警局自首！\n\n小弟一口咬定幕後黑手就是 ${result.targetName}！\n\n${result.fromName} 的通緝值已全數歸零，倒霉的 ${result.targetName} 增加了 ${(result.transferWanted * 100).toFixed(0)}% 的通緝值！\n\n⚠️ **警告**：被無端嫁禍的 ${result.targetName} 已經對 ${result.fromName} 結下了長達 24 小時的【血海深仇】！隨時可能發動絕對復仇！`;
        } else if (result.outcome === 'fail') {
            msg = `💸 【嫁禍失敗】\n${result.fromName} 花了 ${result.cost.toLocaleString()} 哭幣找替死鬼，結果小弟拿了錢就連夜捲款潛逃！\n\n警察根本不相信你的鬼話！\n你的通緝值沒有改變，錢也白花了！`;
        } else if (result.outcome === 'lawyer') {
            msg = `⚖️ 【踢到鐵板：王牌律師】\n${result.fromName} 試圖栽贓給 ${result.targetName}，卻沒想到對方竟然聘請了頂級「王牌律師」！\n\n律師不僅當庭戳破你的謊言，還反告你誣告罪！\n法官震怒，不僅將安家費 ${result.cost.toLocaleString()} 哭幣作為精神賠償金全數判給了對方，還當庭下令將你收押禁見！\n\n🚨 你增加了一次前科，並被直接送進監獄服刑 3 小時！`;
        }
        
        await lineUtils.replyText(replyToken, msg);

    } catch (e) {
        console.error('[Jail] handleScapegoat Error:', e);
        const lineUtils = require('../utils/line');
        await lineUtils.replyText(replyToken, '❌ 找替死鬼失敗。');
    }
}

/**
 * 公益捐款
 */
async function handleDonation(replyToken, context, amountStr) {
    const { userId, groupId } = context;
    const lineUtils = require('../utils/line');

    let amount = parseInt(amountStr);
    if (isNaN(amount) || amount <= 0) {
        await lineUtils.replyText(replyToken, '❌ 捐款金額無效，請輸入「!公益捐款 [金額]」。每 10 萬哭幣降低 1% 通緝值。');
        return;
    }

    if (amount < 100000) {
        await lineUtils.replyText(replyToken, '❌ 局長的女兒說，低於 10 萬的零錢他們基金會不收啦！');
        return;
    }

    try {
        const { db } = require('../utils/db');
        const COLLECTION_NAME = 'economy_users';
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);
        const result = await db.runTransaction(async (t) => {
            const docRef = db.collection(COLLECTION_NAME).doc(userId);
            const doc = await t.get(docRef);
            if (!doc.exists) return { success: false, message: '找不到資料。' };
            const data = doc.data();

            if (data.jailedUntil && Date.now() < data.jailedUntil) {
                return { success: false, message: '你還在坐牢，請乖乖勞動，不要想著用錢買通！' };
            }

            const wantedLevel = data.wantedLevel || 0;
            if (wantedLevel <= 0) {
                return { success: false, message: '你目前沒有通緝值，不需要捐款洗白！' };
            }

            const kuCoin = data.kuCoin || 0;
            if (kuCoin < amount) {
                return { success: false, message: `你想捐 ${amount.toLocaleString()}，但你只有 ${kuCoin.toLocaleString()} 哭幣。` };
            }

            const reduceWanted = Math.floor(amount / 100000) * 0.01;
            const newWantedLevel = Math.max(0, Number((wantedLevel - reduceWanted).toFixed(2)));
            const actualReduced = Number((wantedLevel - newWantedLevel).toFixed(2));

            t.update(docRef, {
                kuCoin: db.FieldValue.increment(-amount),
                wantedLevel: newWantedLevel
            });

            return { 
                success: true, 
                amount,
                actualReduced,
                newWantedLevel,
                name: memberName || data.displayName || data.name
            };
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        const msg = `💸 【公益捐款】\n${result.name} 向警察局長岳母經營的基金會捐款了 ${result.amount.toLocaleString()} 哭幣！\n\n局長大讚你是社會楷模！\n你的通緝值下降了 ${(result.actualReduced * 100).toFixed(0)}%！(目前通緝值：${(result.newWantedLevel * 100).toFixed(0)}%)`;
        await lineUtils.replyText(replyToken, msg);

    } catch (e) {
        console.error('[Jail] handleDonation Error:', e);
        const lineUtils = require('../utils/line');
        await lineUtils.replyText(replyToken, '❌ 捐款失敗。');
    }
}


/**
 * 開直播哭訴
 */
async function handleLiveStream(replyToken, context) {
    const { userId, groupId } = context;
    const lineUtils = require('../utils/line');
    try {
        const { db } = require('../utils/db');
        const { getSpamResponse } = require('../utils/spamHandler');
        const COLLECTION_NAME = 'economy_users';
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);
        
        const result = await db.runTransaction(async (t) => {
            const docRef = db.collection(COLLECTION_NAME).doc(userId);
            const doc = await t.get(docRef);
            if (!doc.exists) return { success: false, message: '找不到資料。' };
            const data = doc.data();

            if (data.jailedUntil && Date.now() < data.jailedUntil) {
                const spam = getSpamResponse(data, 'live_jailed', '你還在坐牢，典獄長沒收了你的手機！');
                t.update(docRef, { spamTracker: spam.newTracker });
                return { success: false, message: spam.message, ignore: spam.ignore };
            }

            // CD 12小時
            const cdMs = 12 * 60 * 60 * 1000;
            if (data.liveStreamCooldownUntil && Date.now() < data.liveStreamCooldownUntil) {
                const remainingMin = Math.ceil((data.liveStreamCooldownUntil - Date.now()) / 60000);
                const spam = getSpamResponse(data, 'live_cd', `你的帳號還在被平台降觸及！請等待 ${Math.floor(remainingMin/60)} 小時 ${remainingMin%60} 分鐘後再開台。`);
                t.update(docRef, { spamTracker: spam.newTracker });
                return { success: false, message: spam.message, ignore: spam.ignore };
            }

            const wantedLevel = data.wantedLevel || 0;
            if (wantedLevel <= 0) {
                return { success: false, message: '你目前沒有通緝值，開直播也沒有人要同情你！' };
            }

            // 取得幸運值
            const { getFinalPlayerStats } = require('./rpg');
            const stats = await getFinalPlayerStats(userId);
            const luk = stats.final.luk || 0;

            const rand = Math.random() * 100;
            let outcome = '';
            let donation = 0;
            let newWantedLevel = wantedLevel;

            if (rand < 50) {
                // 50% 成功
                outcome = 'success';
                newWantedLevel = Number((wantedLevel / 2).toFixed(2));
                // 基礎 10萬 ~ 100萬，幸運值加成 (每 1 LUK + 1%)
                const baseMin = 100000;
                const baseMax = 1000000;
                const baseDonation = Math.floor(Math.random() * (baseMax - baseMin + 1)) + baseMin;
                donation = Math.floor(baseDonation * (1 + luk * 0.01));

                t.update(docRef, {
                    wantedLevel: newWantedLevel,
                    kuCoin: db.FieldValue.increment(donation),
                    liveStreamCooldownUntil: Date.now() + cdMs
                });
            } else if (rand < 80) {
                // 30% 失敗
                outcome = 'fail';
                // 給一個短時間的懲罰：禁止賭博 10 分鐘
                t.update(docRef, {
                    liveStreamCooldownUntil: Date.now() + cdMs,
                    banUntil: Date.now() + 10 * 60 * 1000 // 獨立一個禁言狀態
                });
            } else {
                // 20% 翻車
                outcome = 'arrest';
                const currentWanted = data.wantedLevel || 0;
                newWantedLevel = Number((currentWanted * 0.5).toFixed(2));
                const jailDurationMs = 2 * 60 * 60 * 1000; // 2小時
                t.update(docRef, {
                    wantedLevel: newWantedLevel,
                    liveStreamCooldownUntil: Date.now() + cdMs,
                    jailedUntil: Date.now() + jailDurationMs,
                    crimeRecord: db.FieldValue.increment(1)
                });
            }

            return { 
                success: true, 
                outcome, 
                donation, 
                newWantedLevel,
                name: memberName || data.displayName || data.name
            };
        });

        if (!result.success) {
            if (result.ignore) return;
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        let msg = '';
        if (result.outcome === 'success') {
            msg = `📹 【開直播哭訴】\n${result.name} 在直播中聲淚俱下，痛批是這個社會逼你犯罪的！\n\n粉絲深受感動，不僅你的通緝值降至 ${(result.newWantedLevel * 100).toFixed(0)}%，\n還收到了 ${result.donation.toLocaleString()} 哭幣的抖內金！`;
        } else if (result.outcome === 'fail') {
            msg = `🔥 【直播大翻車】\n${result.name} 直播哭到一半，不小心笑場還忘記關麥克風！\n\n全網炎上！你的通緝值沒有減少，並且被平台禁言，10 分鐘內無法進行任何賭博與搶劫！`;
        } else if (result.outcome === 'arrest') {
            msg = `🚓 【直播查水表】\n${result.name} 正在直播中大談自己的心路歷程，突然門鈴響了...\n\n「砰！」警察直接破門而入把你壓制在地！\n觀眾全都看傻了眼！\n\n🚨 你增加了一次前科，並被直接送進監獄服刑 2 小時！`;
        }

        await lineUtils.replyText(replyToken, msg);
    } catch (e) {
        console.error('[Jail] handleLiveStream Error:', e);
        const lineUtils = require('../utils/line');
        await lineUtils.replyText(replyToken, '❌ 開直播失敗。');
    }
}

/**
 * 拖下水
 */
async function handleDragDown(replyToken, context, messageObject) {
    const { userId: fromUserId, groupId } = context;
    const mentionObj = messageObject && messageObject.mention;
    const lineUtils = require('../utils/line');
    
    if (!mentionObj || !mentionObj.mentionees || mentionObj.mentionees.length === 0) {
        await lineUtils.replyText(replyToken, '❌ 請 @標記 你要拖下水的對象！');
        return;
    }

    const targetUserId = mentionObj.mentionees[0].userId;
    if (fromUserId === targetUserId) {
        await lineUtils.replyText(replyToken, '❌ 你要拖自己下水？你已經在水裡了！');
        return;
    }

    try {
        const { db } = require('../utils/db');
        const COLLECTION_NAME = 'economy_users';
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

            if (!fromData.jailedUntil || Date.now() >= fromData.jailedUntil) {
                return { success: false, message: '你又沒坐牢，拖什麼下水？' };
            }

            const fromVendettas = fromData.vendettas || {};
            const hasVendetta = fromVendettas[targetUserId] && fromVendettas[targetUserId] > Date.now();

            if (!hasVendetta) {
                return { success: false, message: '你對他並沒有【血海深仇】的標記，無法強行拖他下水！' };
            }

            const remainingMs = fromData.jailedUntil - Date.now();
            
            // 消耗標記
            delete fromVendettas[targetUserId];
            t.update(fromDocRef, { vendettas: fromVendettas });

            // 目標入獄
            const targetJailedUntil = targetData.jailedUntil && targetData.jailedUntil > Date.now() 
                ? targetData.jailedUntil + remainingMs 
                : Date.now() + remainingMs;

            const targetWantedLevel = targetData.wantedLevel || 0;
            const newTargetWantedLevel = Number((targetWantedLevel * 0.5).toFixed(2));
            t.update(targetDocRef, {
                jailedUntil: targetJailedUntil,
                wantedLevel: newTargetWantedLevel,
                jailbreakCooldownUntil: db.FieldValue.delete(),
                crimeRecord: db.FieldValue.increment(1)
            });

            return { 
                success: true, 
                fromName: fromMemberName || fromData.displayName || fromData.name,
                targetName: targetMemberName || targetData.displayName || targetData.name,
                penaltyMins: Math.ceil(remainingMs / 60000)
            };
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        const msg = `💀 【同歸於盡：拖下水】\n${result.fromName} 在監獄中雙眼充滿血絲，動用了對 ${result.targetName} 的【血海深仇】標記！\n\n「我都進來了，你也別想跑！！！」\n\n一隻滿是泥濘的手從地底伸出，直接將在外面逍遙的 ${result.targetName} 強行拖入了監獄！\n\n🚨 ${result.targetName} 增加了 1 次前科，並被強加了等同於對方的刑期 (${result.penaltyMins} 分鐘)！\n*(復仇標記已消耗)*`;
        await lineUtils.replyText(replyToken, msg);

    } catch (e) {
        console.error('[Jail] handleDragDown Error:', e);
        const lineUtils = require('../utils/line');
        await lineUtils.replyText(replyToken, '❌ 拖下水失敗。');
    }
}

/**
 * 轉當污點證人
 */
async function handleSnitch(replyToken, context, messageObject) {
    const { userId: fromUserId, groupId } = context;
    const mentionObj = messageObject && messageObject.mention;
    const lineUtils = require('../utils/line');
    
    if (!mentionObj || !mentionObj.mentionees || mentionObj.mentionees.length === 0) {
        await lineUtils.replyText(replyToken, '❌ 請 @標記 你要出賣的對象！');
        return;
    }

    const targetUserId = mentionObj.mentionees[0].userId;
    if (fromUserId === targetUserId) {
        await lineUtils.replyText(replyToken, '❌ 你要出賣你自己？有病嗎？');
        return;
    }

    try {
        const { db } = require('../utils/db');
        const COLLECTION_NAME = 'economy_users';
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

            if (fromData.jailedUntil && Date.now() < fromData.jailedUntil) {
                return { success: false, message: '你還在坐牢，無法當污點證人！' };
            }

            const wantedLevel = fromData.wantedLevel || 0;
            if (wantedLevel <= 0) {
                return { success: false, message: '你目前沒有通緝值，警察不想理你！' };
            }

            // CD 24小時
            const cdMs = 24 * 60 * 60 * 1000;
            if (fromData.snitchCooldownUntil && Date.now() < fromData.snitchCooldownUntil) {
                const remainingMin = Math.ceil((fromData.snitchCooldownUntil - Date.now()) / 60000);
                return { success: false, message: `警察局說你太常來亂報案了！請等待 ${Math.floor(remainingMin/60)} 小時 ${remainingMin%60} 分鐘後再來。` };
            }

            const snitchUntil = Date.now() + 24 * 60 * 60 * 1000; // 24小時被當作抓耙子

            t.update(fromDocRef, {
                wantedLevel: 0,
                snitchCooldownUntil: Date.now() + cdMs,
                snitchUntil: snitchUntil
            });
            
            t.update(targetDocRef, {
                wantedLevel: db.FieldValue.increment(0.1) // 固定增加 10% 通緝
            });

            return { 
                success: true, 
                fromName: fromMemberName || fromData.displayName || fromData.name,
                targetName: targetMemberName || targetData.displayName || targetData.name
            };
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        const msg = `🐍 【轉當污點證人】\n${result.fromName} 向警方主動投案，並提供了 ${result.targetName} 的犯罪證據！\n\n警察大悅，${result.fromName} 的通緝值全數清零！\n${result.targetName} 被無端牽連，通緝值增加了 10%！\n\n⚠️ ${result.fromName} 獲得了【抓耙子】標籤！\n在接下來的 24 小時內，黑道會對你嚴加防範，你的搶劫成功率將大跌 20%！`;
        await lineUtils.replyText(replyToken, msg);

    } catch (e) {
        console.error('[Jail] handleSnitch Error:', e);
        const lineUtils = require('../utils/line');
        await lineUtils.replyText(replyToken, '❌ 污點證人行動失敗。');
    }
}

const MILITARY_RANKS = [
    { name: '二兵', salary: 100000, pension: 0 },
    { name: '一兵', salary: 200000, pension: 0 },
    { name: '上兵', salary: 300000, pension: 0 },
    { name: '下士', salary: 500000, pension: 0 },
    { name: '中士', salary: 700000, pension: 0 },
    { name: '上士', salary: 1000000, pension: 0 },
    { name: '士官長', salary: 1500000, pension: 0 },
    { name: '少尉', salary: 2000000, pension: 0 },
    { name: '中尉', salary: 2500000, pension: 0 },
    { name: '上尉', salary: 3000000, pension: 0 },
    { name: '少校', salary: 4000000, pension: 500000 },
    { name: '中校', salary: 5000000, pension: 1000000 },
    { name: '上校', salary: 6000000, pension: 2000000 },
    { name: '少將', salary: 8000000, pension: 3000000 },
    { name: '中將', salary: 10000000, pension: 5000000 },
    { name: '上將', salary: 15000000, pension: 10000000 }
];

function getMilitaryRankInfo(enlistCount) {
    const idx = Math.min(enlistCount || 0, MILITARY_RANKS.length - 1);
    return MILITARY_RANKS[idx];
}

/**
 * 簽下去當志願役
 */
async function handleEnlist(replyToken, context) {
    const { userId, groupId } = context;
    const lineUtils = require('../utils/line');
    
    try {
        const { db } = require('../utils/db');
        const COLLECTION_NAME = 'economy_users';
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);
        
        const result = await db.runTransaction(async (t) => {
            const docRef = db.collection(COLLECTION_NAME).doc(userId);
            const doc = await t.get(docRef);
            if (!doc.exists) return { success: false, message: '找不到資料。' };
            const data = doc.data();

            if (data.jailedUntil && Date.now() < data.jailedUntil) {
                return { success: false, message: '你還在坐牢，國軍不收受刑人！' };
            }

            if (data.militaryUntil && Date.now() < data.militaryUntil) {
                return { success: false, message: '你已經在當兵了，還想簽幾次？' };
            }

            const wantedLevel = data.wantedLevel || 0;
            if (wantedLevel <= 0) {
                return { success: false, message: '你目前沒有通緝值，不需要躲到軍隊裡！' };
            }

            // 服役 12 小時
            const serveTime = 12 * 60 * 60 * 1000;
            const currentCount = data.militaryEnlistCount || 0;
            const newCount = currentCount + 1;

            t.update(docRef, {
                wantedLevel: 0,
                militaryUntil: Date.now() + serveTime,
                militaryEnlistCount: newCount,
                militaryGroupId: groupId
            });

            return { success: true, name: memberName || data.displayName || data.name, newCount };
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        const rankInfo = getMilitaryRankInfo(result.newCount - 1); // index is count - 1
        let extraMsg = '';
        if (result.newCount === 1) {
            extraMsg = '這是你第一次入伍，目前階級：【二兵】！';
        } else {
            extraMsg = `恭喜晉升！你目前的階級來到了：【${rankInfo.name}】！`;
        }

        const msg = `🪖 【簽下去：志願役】\n${result.name} 走投無路，決定投入國軍的懷抱！\n\n部隊大門為你敞開，你的通緝值瞬間歸零！\n${extraMsg}\n\n⚠️ 注意：你將進入長達 12 小時的「營區管制期」。期間內絕對禁止使用賭場與搶劫指令！時間到系統會自動讓你退伍領錢！`;
        await lineUtils.replyText(replyToken, msg);

    } catch (e) {
        console.error('[Jail] handleEnlist Error:', e);
        await lineUtils.replyText(replyToken, '❌ 簽下去失敗。');
    }
}

/**
 * 退伍領薪水 (舊版手動，保留為防呆)
 */
async function handleDischarge(replyToken, context) {
    const { userId, groupId } = context;
    const lineUtils = require('../utils/line');
    
    try {
        const { db } = require('../utils/db');
        const COLLECTION_NAME = 'economy_users';
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);
        
        const result = await db.runTransaction(async (t) => {
            const docRef = db.collection(COLLECTION_NAME).doc(userId);
            const doc = await t.get(docRef);
            if (!doc.exists) return { success: false, message: '找不到資料。' };
            const data = doc.data();

            if (!data.militaryUntil) {
                return { success: false, message: '你又沒有當兵，退什麼伍？' };
            }

            if (Date.now() < data.militaryUntil) {
                const remainMs = data.militaryUntil - Date.now();
                const remainHrs = Math.floor(remainMs / 3600000);
                const remainMins = Math.ceil((remainMs % 3600000) / 60000);
                return { success: false, message: `長官說你還沒役滿！離退伍還有 ${remainHrs} 小時 ${remainMins} 分鐘。` };
            }

            const count = data.militaryEnlistCount || 1;
            const rankInfo = getMilitaryRankInfo(count - 1);
            const salary = rankInfo.salary;

            t.update(docRef, {
                militaryUntil: db.FieldValue.delete(),
                kuCoin: db.FieldValue.increment(salary)
            });

            return { success: true, salary, name: memberName || data.displayName || data.name, rankName: rankInfo.name };
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        await lineUtils.replyText(replyToken, `🎉 【榮譽退伍】\n${result.name} 終於拿到退伍令，正式回歸社會！\n\n階級：${result.rankName}\n國家發放了 ${result.salary.toLocaleString()} 哭幣的退伍金給你！`);

    } catch (e) {
        console.error('[Jail] handleDischarge Error:', e);
        await lineUtils.replyText(replyToken, '❌ 退伍失敗。');
    }
}

/**
 * 背景被動退伍檢查
 */
async function checkAndDischargeMilitary() {
    const { db } = require('../utils/db');
    const lineUtils = require('../utils/line');
    const COLLECTION_NAME = 'economy_users';
    const now = Date.now();

    try {
        const snapshot = await db.collection(COLLECTION_NAME)
            .where('militaryUntil', '<=', now)
            .get();

        if (snapshot.empty) return;

        const batch = db.batch();
        const dischargeMessages = [];

        for (const doc of snapshot.docs) {
            const data = doc.data();
            const count = data.militaryEnlistCount || 1;
            const rankInfo = getMilitaryRankInfo(count - 1);
            const salary = rankInfo.salary;
            const name = data.displayName || data.name || '無名氏';
            const targetGroupId = data.militaryGroupId; // 若有存入伍時的群組

            batch.update(doc.ref, {
                militaryUntil: db.FieldValue.delete(),
                kuCoin: db.FieldValue.increment(salary)
            });

            if (targetGroupId) {
                const msg = `🎉 【榮譽退伍通知】\n${name} 役期屆滿，正式回歸社會！\n\n🎖️ 階級：${rankInfo.name}\n💰 國家核發退伍金：${salary.toLocaleString()} 哭幣\n\n感謝長官為國辛勞！`;
                dischargeMessages.push({ groupId: targetGroupId, text: msg });
            }
        }

        await batch.commit();

        for (const msgData of dischargeMessages) {
            try {
                await notificationService.queueNotification(msgData.groupId, [{ type: 'text', text: msgData.text }]);
            } catch (e) {
                console.error(`[Military] Failed to queue discharge message to ${msgData.groupId}:`, e.message);
            }
        }

    } catch (e) {
        console.error('[Military] checkAndDischargeMilitary Error:', e);
    }
}

/**
 * 絕食抗議
 */
async function handleHungerStrike(replyToken, context) {
    const { userId, groupId } = context;
    const lineUtils = require('../utils/line');
    
    try {
        const { db } = require('../utils/db');
        const COLLECTION_NAME = 'economy_users';
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);
        
        const result = await db.runTransaction(async (t) => {
            const docRef = db.collection(COLLECTION_NAME).doc(userId);
            const doc = await t.get(docRef);
            if (!doc.exists) return { success: false, message: '找不到資料。' };
            const data = doc.data();

            if (data.jailedUntil && Date.now() < data.jailedUntil) {
                return { success: false, message: '你還在坐牢，典獄長不吃你這套！' };
            }

            if (data.hungerStrikeStart) {
                return { success: false, message: '你已經在絕食中了！不要偷吃東西！' };
            }

            const wantedLevel = data.wantedLevel || 0;
            if (wantedLevel <= 0) {
                return { success: false, message: '你目前沒有通緝值，絕食給誰看？' };
            }

            t.update(docRef, {
                hungerStrikeStart: Date.now()
            });

            return { success: true, name: memberName || data.displayName || data.name };
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        const msg = `🚑 【絕食抗議】\n${result.name} 宣布展開無限期絕食，抗議司法不公！\n\n⚠️ 注意：你必須在接下來的 3 小時內，【完全不能使用任何賭場與搶劫指令】，才能成功逼迫警方妥協消除通緝。\n只要偷打一次指令，就會被判定為「偷吃巧克力」而破功！`;
        await lineUtils.replyText(replyToken, msg);

    } catch (e) {
        console.error('[Jail] handleHungerStrike Error:', e);
        await lineUtils.replyText(replyToken, '❌ 絕食失敗。');
    }
}

/**
 * 全域攔截檢查 (用於 Router)
 * 檢查並攔截 當兵、禁言、絕食 等狀態
 * @returns { blocked: boolean, message?: string }
 */
async function checkStatusBlock(context, feature = null) {
    const { userId } = context;
    try {
        const { db } = require('../utils/db');
        const COLLECTION_NAME = 'economy_users';
        const docRef = db.collection(COLLECTION_NAME).doc(userId);
        
        // 使用一般的 get，避免影響主邏輯的 transaction
        const doc = await docRef.get();
        if (!doc.exists) return { blocked: false };
        const data = doc.data();
        let shouldUpdate = false;
        let updates = {};
        let blocked = false;
        let replyMsg = '';

        // 1. 檢查禁言狀態 (開直播翻車)
        if (data.banUntil && Date.now() < data.banUntil) {
            const remainMins = Math.ceil((data.banUntil - Date.now()) / 60000);
            return { blocked: true, message: `🔥 你因為直播大翻車被平台禁言中！請等待 ${remainMins} 分鐘後再行動。` };
        } else if (data.banUntil && Date.now() >= data.banUntil) {
            shouldUpdate = true;
            updates.banUntil = db.FieldValue.delete();
        }

        // 2. 檢查當兵狀態
        if (data.militaryUntil) {
            const allowedMilitaryCommands = /^(?:每日簽到|簽到|領哭幣|領錢|退伍|除草|拔草|掃地|出公差|站夜哨|裝病逃操|裝病|打靶測驗|打靶|高裝檢|漢光演習|領終身俸|狀態|屬性|我的屬性|我的狀態|冷卻|查冷卻|我的冷卻|冷卻時間)$/i;
            const msgText = (context.message || '').trim().replace(/^[!/！]/, '');
            const isAllowed = allowedMilitaryCommands.test(msgText) || feature === 'casino';
            
            if (!isAllowed) {
                if (Date.now() < data.militaryUntil) {
                    return { blocked: true, message: '🪖 班長看著你，你敢在營區玩手機？請乖乖等退伍！(輸入 !退伍 查看時間)' };
                } else {
                    return { blocked: true, message: '🪖 你的役期已經滿了，請先輸入「!退伍」領取退伍金才能恢復自由之身！' };
                }
            }
        }

        // 3. 檢查絕食狀態
        if (data.hungerStrikeStart) {
            const passedMs = Date.now() - data.hungerStrikeStart;
            const requiredMs = 3 * 60 * 60 * 1000; // 3小時

            if (passedMs >= requiredMs) {
                // 絕食成功
                shouldUpdate = true;
                updates.hungerStrikeStart = db.FieldValue.delete();
                updates.wantedLevel = 0;
                const lineUtils = require('../utils/line');
                // 非同步發送成功訊息
                lineUtils.replyText(context.replyToken, `🚑 【絕食成功】\n警方怕你死在路邊惹麻煩，決定銷案！你的通緝值全數歸零！`).catch(()=>console.log);
                // 不阻擋當次指令，讓他順利玩
                blocked = true; // 還是阻擋這次，讓他先看成功訊息，因為 replyToken 只能用一次
                replyMsg = ''; // 空字串代表不需額外回覆，上面已經回覆了
            } else {
                // 絕食破功
                shouldUpdate = true;
                updates.hungerStrikeStart = db.FieldValue.delete();
                const remainMs = requiredMs - passedMs;
                const remainHrs = Math.floor(remainMs / 3600000);
                const remainMins = Math.ceil((remainMs % 3600000) / 60000);
                blocked = true;
                replyMsg = `🍫 【絕食破功】\n你受不了飢餓偷偷躲在棉被吃巧克力被抓包！\n只差 ${remainHrs} 小時 ${remainMins} 分鐘就成功了，真可惜。絕食抗議正式宣告破功！`;
            }
        }

        if (shouldUpdate) {
            await docRef.update(updates);
        }

        if (blocked && replyMsg) {
            return { blocked: true, message: replyMsg };
        } else if (blocked && !replyMsg) {
            // 已由內部發送訊息
            return { blocked: true, message: null }; 
        }

        return { blocked: false };
    } catch (e) {
        console.error('[Jail] checkStatusBlock Error:', e);
        return { blocked: false };
    }
}




const GAMES = {
    '出公差': {
        cd: 10, title: '🏃 出公差',
        outcomes: [
            { chance: 0.2, type: '大勝', timeChange: -5, text: '被營長稱讚，心情大好！' },
            { chance: 0.3, type: '小勝', timeChange: -2, text: '順利買完便當，提早回寢室！' },
            { chance: 0.2, type: '平局', timeChange: 0, text: '正常跑完腿，無事發生。' },
            { chance: 0.2, type: '小敗', timeChange: 2, text: '買錯飲料被班長罰站！' },
            { chance: 0.1, type: '大敗', timeChange: 12, text: '偷跑去營站打茫被抓包！' }
        ]
    },
    '拔草': {
        cd: 30, title: '🌿 拔草',
        outcomes: [
            { chance: 0.15, type: '大勝', timeChange: -20, text: '掃到連長的私房錢，連長高興放你榮譽假！' },
            { chance: 0.35, type: '小勝', timeChange: -5, text: '提早拔完在樹下乘涼！' },
            { chance: 0.25, type: '平局', timeChange: 0, text: '默默把落葉掃乾淨。' },
            { chance: 0.20, type: '小敗', timeChange: 10, text: '拔不乾淨被罰重拔！' },
            { chance: 0.05, type: '大敗', timeChange: 55, text: '把營長的盆栽拔光被幹飛！' }
        ]
    },
    '掃地': {
        cd: 30, title: '🧹 掃地',
        outcomes: [
            { chance: 0.15, type: '大勝', timeChange: -20, text: '掃到連長的私房錢，連長高興放你榮譽假！' },
            { chance: 0.35, type: '小勝', timeChange: -5, text: '提早掃完在樹下乘涼！' },
            { chance: 0.25, type: '平局', timeChange: 0, text: '默默把落葉掃乾淨。' },
            { chance: 0.20, type: '小敗', timeChange: 10, text: '掃不乾淨被罰重掃！' },
            { chance: 0.05, type: '大敗', timeChange: 55, text: '把營長的盆栽掃破被幹飛！' }
        ]
    },
    '站夜哨': {
        cd: 60, title: '🦉 站夜哨',
        outcomes: [
            { chance: 0.2, type: '大勝', timeChange: -40, text: '機警抓到督導官，營長記嘉獎！' },
            { chance: 0.3, type: '小勝', timeChange: -10, text: '平安下哨，順利補休！' },
            { chance: 0.2, type: '平局', timeChange: 0, text: '整晚餵蚊子，無事發生。' },
            { chance: 0.2, type: '小敗', timeChange: 25, text: '服裝不整被查哨官念！' },
            { chance: 0.1, type: '大敗', timeChange: 60, text: '站哨打瞌睡連槍都掉了，直接禁足！' }
        ]
    },
    '裝病逃操': {
        cd: 120, title: '🤒 裝病逃操',
        outcomes: [
            { chance: 0.15, type: '大勝', timeChange: -90, text: '成功轉診到外面醫院爽半天！' },
            { chance: 0.35, type: '小勝', timeChange: -20, text: '拿到全休單在寢室睡覺！' },
            { chance: 0.2, type: '平局', timeChange: 0, text: '醫官只給你普拿疼，乖乖回部隊操課。' },
            { chance: 0.2, type: '小敗', timeChange: 30, text: '被發現裝死，罰舉槍罰站！' },
            { chance: 0.1, type: '大敗', timeChange: 145, text: '裝死被營長抓包，直接送禁閉室！' }
        ]
    },
    '裝病': {
        cd: 120, title: '🤒 裝病',
        outcomes: [
            { chance: 0.15, type: '大勝', timeChange: -90, text: '成功轉診到外面醫院爽半天！' },
            { chance: 0.35, type: '小勝', timeChange: -20, text: '拿到全休單在寢室睡覺！' },
            { chance: 0.2, type: '平局', timeChange: 0, text: '醫官只給你普拿疼，乖乖回部隊操課。' },
            { chance: 0.2, type: '小敗', timeChange: 30, text: '被發現裝死，罰舉槍罰站！' },
            { chance: 0.1, type: '大敗', timeChange: 145, text: '裝死被營長抓包，直接送禁閉室！' }
        ]
    },
    '打靶測驗': {
        cd: 360, title: '🎯 打靶測驗',
        outcomes: [
            { chance: 0.1, type: '大勝', timeChange: -300, text: '神槍手滿靶，連長直接放提早假！' },
            { chance: 0.4, type: '小勝', timeChange: -60, text: '及格過關，回寢室休息！' },
            { chance: 0.2, type: '平局', timeChange: 0, text: '勉強及格，沒獎沒罰。' },
            { chance: 0.2, type: '小敗', timeChange: 120, text: '脫靶被留下來瘋狂擦槍！' },
            { chance: 0.1, type: '大敗', timeChange: 300, text: '打中別人的靶，全連被你拖累洞八！' }
        ]
    },
    '打靶': {
        cd: 360, title: '🎯 打靶',
        outcomes: [
            { chance: 0.1, type: '大勝', timeChange: -300, text: '神槍手滿靶，連長直接放提早假！' },
            { chance: 0.4, type: '小勝', timeChange: -60, text: '及格過關，回寢室休息！' },
            { chance: 0.2, type: '平局', timeChange: 0, text: '勉強及格，沒獎沒罰。' },
            { chance: 0.2, type: '小敗', timeChange: 120, text: '脫靶被留下來瘋狂擦槍！' },
            { chance: 0.1, type: '大敗', timeChange: 300, text: '打中別人的靶，全連被你拖累洞八！' }
        ]
    },
    '高裝檢': {
        cd: 720, title: '🛡️ 高裝檢',
        outcomes: [
            { chance: 0.1, type: '大勝', timeChange: -600, text: '完美藏妥多餘料件，獲頒榮譽狀！' },
            { chance: 0.3, type: '小勝', timeChange: -120, text: '順利過關，連長請喝飲料！' },
            { chance: 0.3, type: '平局', timeChange: 0, text: '驚險過關，嚇出一身冷汗。' },
            { chance: 0.2, type: '小敗', timeChange: 180, text: '裝備有缺失，被留下來寫檢討報告！' },
            { chance: 0.1, type: '大敗', timeChange: 600, text: '戰車整台不見，連長被幹飛，你被無限期禁足！' }
        ]
    },
    '漢光演習': {
        cd: 1440, title: '⚔️ 漢光演習',
        outcomes: [
            { chance: 0.05, type: '大勝', timeChange: 'SPECIAL', text: '表現神勇獲三軍統帥頒發特赦令！直接光榮退伍跳階！' },
            { chance: 0.25, type: '小勝', timeChange: -360, text: '成功殲滅敵軍，營長嘉獎！' },
            { chance: 0.3, type: '平局', timeChange: 0, text: '累死人的演習終於結束。' },
            { chance: 0.3, type: '小敗', timeChange: 180, text: '演習中打瞌睡被長官念！' },
            { chance: 0.1, type: '大敗', timeChange: 'SPECIAL_FAIL', text: '誤射雄風飛彈打中漁船,勒令退伍,軍階-1！' }
        ]
    }
};

async function handleMilitaryGame(replyToken, context, gameType) {
    const { userId, groupId } = context;
    const { db } = require('../utils/db');
    const lineUtils = require('../utils/line');
    const flexUtils = require('../utils/flex');
    const memberName = await lineUtils.getGroupMemberName(groupId, userId);
    
    try {
        const game = GAMES[gameType];
        if (!game) return;

        let resultData = null;
        const COLLECTION_NAME = 'economy_users';
        await db.runTransaction(async (t) => {
            const docRef = db.collection(COLLECTION_NAME).doc(userId);
            const doc = await t.get(docRef);
            if (!doc.exists) return;
            const data = doc.data();
            const now = Date.now();

            if (!data.militaryUntil) {
                resultData = { error: 'not_military' };
                return;
            }

            if (now >= data.militaryUntil) {
                resultData = { error: 'time_up' };
                return;
            }

            const cdKey = `lastMilitary_${gameType}`;
            const cdMs = game.cd * 60 * 1000;
            const lastTime = data[cdKey] || 0;
            if (now - lastTime < cdMs) {
                resultData = { error: 'cooldown', lastTime, cdMs };
                return;
            }

            const rand = Math.random();
            let cumulative = 0;
            let selectedOutcome = null;

            for (const outcome of game.outcomes) {
                cumulative += outcome.chance;
                if (rand < cumulative) {
                    selectedOutcome = outcome;
                    break;
                }
            }
            if (!selectedOutcome) selectedOutcome = game.outcomes[game.outcomes.length - 1];

            const currentCount = data.militaryEnlistCount || 1;
            const updates = { [cdKey]: now };
            let discharged = false;
            let newRankName = '';
            let newUntil = data.militaryUntil;
            let color = '#AAAAAA';
            let title = `【${selectedOutcome.type}】`;

            if (selectedOutcome.type === '大勝' || selectedOutcome.type === '小勝') color = '#4CAF50';
            else if (selectedOutcome.type === '小敗' || selectedOutcome.type === '大敗') color = '#F44336';

            if (selectedOutcome.timeChange === 'SPECIAL') {
                // 漢光特獎：直接退伍，階級 +1
                updates.militaryUntil = db.FieldValue.delete();
                updates.militaryEnlistCount = currentCount + 1;
                
                const rankInfo = getMilitaryRankInfo(currentCount); // currentCount corresponds to +1 index (0-based)
                newRankName = rankInfo.name;
                updates.kuCoin = db.FieldValue.increment(rankInfo.salary);
                discharged = true;
            } else if (selectedOutcome.timeChange === 'SPECIAL_FAIL') {
                // 漢光大敗：誤射飛彈，強制退伍，階級 -1
                updates.militaryUntil = db.FieldValue.delete();
                const nextCount = Math.max(1, currentCount - 1);
                updates.militaryEnlistCount = nextCount;
                
                const rankInfo = getMilitaryRankInfo(nextCount - 1);
                newRankName = rankInfo.name;
                // No salary for being kicked out, or maybe base salary?
                discharged = true;
                title = '💥 【嚴重事故】';
            } else {
                newUntil = data.militaryUntil + (selectedOutcome.timeChange * 60 * 1000);
                if (newUntil <= now) {
                    // 退伍
                    updates.militaryUntil = db.FieldValue.delete();
                    const rankInfo = getMilitaryRankInfo(currentCount - 1);
                    newRankName = rankInfo.name;
                    updates.kuCoin = db.FieldValue.increment(rankInfo.salary);
                    discharged = true;
                } else {
                    updates.militaryUntil = newUntil;
                }
            }

            t.update(docRef, updates);

            resultData = {
                gameTitle: game.title,
                outcome: selectedOutcome,
                discharged,
                newUntil,
                newRankName,
                now,
                title,
                color,
                cdMs
            };
        });

        if (!resultData) return;

        if (resultData.error === 'not_military') {
            await lineUtils.replyText(replyToken, '❌ 你又不是軍人，跑來營區幹嘛？（請先使用「入伍」指令）');
            return;
        }

        if (resultData.error === 'time_up') {
            await lineUtils.replyText(replyToken, '🪖 你的役期已經滿了，請先去辦理「!退伍」手續，不要再白做工了！');
            return;
        }

        if (resultData.error === 'cooldown') {
            const remainMs = resultData.cdMs - (Date.now() - resultData.lastTime);
            const remainMins = Math.ceil(remainMs / 60000);
            await lineUtils.replyText(replyToken, `⏳ 班長：「你給我站好！休息時間還沒到！」\n(請等待 ${remainMins} 分鐘後再執行此動作)`);
            return;
        }

        let bodyContents = [
            flexUtils.createText({ text: resultData.outcome.text, size: 'sm', color: '#FFFFFF', wrap: true }),
            flexUtils.createSeparator('md')
        ];

        if (resultData.discharged) {
            bodyContents.push(flexUtils.createText({ text: `🎉 已達成退伍條件！`, size: 'sm', weight: 'bold', color: '#FFD700', margin: 'md' }));
            if (resultData.outcome.timeChange === 'SPECIAL') {
                bodyContents.push(flexUtils.createText({ text: `🎖️ 破格晉升：${resultData.newRankName}`, size: 'sm', weight: 'bold', color: '#00BCD4' }));
            } else if (resultData.outcome.timeChange === 'SPECIAL_FAIL') {
                bodyContents.push(flexUtils.createText({ text: `💀 降階勒退：${resultData.newRankName}`, size: 'sm', weight: 'bold', color: '#F44336' }));
            } else {
                bodyContents.push(flexUtils.createText({ text: `🎖️ 結算軍階：${resultData.newRankName}`, size: 'sm', weight: 'bold', color: '#00BCD4' }));
            }
        } else {
            const diff = resultData.outcome.timeChange;
            const diffText = diff > 0 ? `+${diff} 分鐘` : diff < 0 ? `${diff} 分鐘` : `無增減`;
            
            bodyContents.push(flexUtils.createText({ text: `⏱️ 役期變動：${diffText}`, size: 'sm', weight: 'bold', color: resultData.color, margin: 'md' }));
            
            const nextTimeStr = new Date(resultData.newUntil).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
            bodyContents.push(flexUtils.createText({ text: `📅 預計退伍時間：\n${nextTimeStr}`, size: 'xs', color: '#CCCCCC', wrap: true, margin: 'sm' }));
            
            const nextCdStr = new Date(resultData.now + resultData.cdMs).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
            bodyContents.push(flexUtils.createText({ text: `⏳ 冷卻時間：${resultData.cdMs / 60000} 分鐘\n（${nextCdStr} 後可再發動）`, size: 'xxs', color: '#888888', wrap: true, margin: 'sm' }));
        }

        const flexBubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader(resultData.gameTitle, `【國軍】${memberName} ${resultData.title}`, '#1A1A1A', resultData.color),
            body: flexUtils.createBox('vertical', bodyContents, { backgroundColor: '#1A1A1A', paddingAll: 'xl' })
        });

        await lineUtils.replyFlex(replyToken, resultData.gameTitle, flexBubble);

    } catch (e) {
        console.error('[Military] handleMilitaryGame Error:', e);
        await lineUtils.replyText(replyToken, '❌ 執行軍中小遊戲發生錯誤。');
    }
}

async function handleBatchMilitaryGames(replyToken, context) {
    const { userId, groupId } = context;
    const { db } = require('../utils/db');
    const lineUtils = require('../utils/line');
    const flexUtils = require('../utils/flex');
    const memberName = await lineUtils.getGroupMemberName(groupId, userId);
    
    try {
        let results = [];
        let discharged = false;
        let newRankName = '';
        const uniqueGames = ['出公差', '拔草', '掃地', '站夜哨', '裝病', '打靶', '高裝檢', '漢光演習'];
        const COLLECTION_NAME = 'economy_users';

        await db.runTransaction(async (t) => {
            const docRef = db.collection(COLLECTION_NAME).doc(userId);
            const doc = await t.get(docRef);
            if (!doc.exists) return;
            const data = doc.data();
            const now = Date.now();

            if (!data.militaryUntil) {
                results.push({ error: 'not_military' });
                return;
            }

            if (now >= data.militaryUntil) {
                results.push({ error: 'time_up' });
                return;
            }

            let updates = {};
            let currentUntil = data.militaryUntil;
            const currentCount = data.militaryEnlistCount || 1;
            let currentKuCoin = data.kuCoin || 0;
            let totalKuCoinDiff = 0;

            for (const gameType of uniqueGames) {
                if (discharged) break; // 若已退伍則不再執行後續勤務
                
                const game = GAMES[gameType];
                const cdKey = `lastMilitary_${gameType}`;
                const cdMs = game.cd * 60 * 1000;
                const lastTime = data[cdKey] || 0;
                
                if (now - lastTime < cdMs) continue; // 冷卻中跳過

                const rand = Math.random();
                let cumulative = 0;
                let selectedOutcome = null;

                for (const outcome of game.outcomes) {
                    cumulative += outcome.chance;
                    if (rand < cumulative) {
                        selectedOutcome = outcome;
                        break;
                    }
                }
                if (!selectedOutcome) selectedOutcome = game.outcomes[game.outcomes.length - 1];

                updates[cdKey] = now;
                
                let title = `【${selectedOutcome.type}】`;
                let diffText = '';
                
                if (selectedOutcome.timeChange === 'SPECIAL') {
                    updates.militaryUntil = db.FieldValue.delete();
                    updates.militaryEnlistCount = currentCount + 1;
                    const rankInfo = getMilitaryRankInfo(currentCount); 
                    newRankName = rankInfo.name;
                    updates.kuCoin = db.FieldValue.increment((updates.kuCoin ? updates.kuCoin.operand : 0) + rankInfo.salary);
                    discharged = true;
                    title = '🎖️ 【破格晉升】';
                    diffText = '特赦退伍';
                } else if (selectedOutcome.timeChange === 'SPECIAL_FAIL') {
                    updates.militaryUntil = db.FieldValue.delete();
                    const nextCount = Math.max(1, currentCount - 1);
                    updates.militaryEnlistCount = nextCount;
                    const rankInfo = getMilitaryRankInfo(nextCount - 1);
                    newRankName = rankInfo.name;
                    discharged = true;
                    title = '💥 【嚴重事故】';
                    diffText = '降階勒退';
                } else {
                    currentUntil = currentUntil + (selectedOutcome.timeChange * 60 * 1000);
                    const diff = selectedOutcome.timeChange;
                    diffText = diff > 0 ? `+${diff} 分鐘` : diff < 0 ? `${diff} 分鐘` : `無增減`;
                    
                    if (currentUntil <= now) {
                        updates.militaryUntil = db.FieldValue.delete();
                        const rankInfo = getMilitaryRankInfo(currentCount - 1);
                        newRankName = rankInfo.name;
                        updates.kuCoin = db.FieldValue.increment((updates.kuCoin ? updates.kuCoin.operand : 0) + rankInfo.salary);
                        discharged = true;
                        diffText = '屆滿退伍';
                    } else {
                        updates.militaryUntil = currentUntil;
                    }
                }
                
                let color = '#AAAAAA';
                if (selectedOutcome.type === '大勝' || selectedOutcome.type === '小勝') color = '#4CAF50';
                else if (selectedOutcome.type === '小敗' || selectedOutcome.type === '大敗') color = '#F44336';

                results.push({
                    gameType: game.title,
                    text: selectedOutcome.text,
                    title,
                    diffText,
                    color
                });
            }

            if (Object.keys(updates).length > 0) {
                t.update(docRef, updates);
            }
        });

        if (results.length > 0 && results[0].error === 'not_military') {
            await lineUtils.replyText(replyToken, '❌ 你又不是軍人，跑來營區幹嘛？（請先使用「入伍」指令）');
            return;
        }

        if (results.length > 0 && results[0].error === 'time_up') {
            await lineUtils.replyText(replyToken, '🪖 你的役期已經滿了，請先去辦理「!退伍」手續，不要再白做工了！');
            return;
        }

        if (results.length === 0) {
            await lineUtils.replyText(replyToken, '⏳ 報告班長！目前所有的勤務都在冷卻中，請稍後再來一鍵執行！');
            return;
        }

        const bodyContents = [];
        results.forEach((res, index) => {
            bodyContents.push(flexUtils.createBox('horizontal', [
                flexUtils.createText({ text: res.gameType, size: 'xs', weight: 'bold', color: '#BBBBBB', flex: 2 }),
                flexUtils.createText({ text: res.text, size: 'xs', color: res.color, flex: 5, wrap: true }),
                flexUtils.createText({ text: res.diffText, size: 'xxs', weight: 'bold', color: res.color, flex: 2, align: 'end' })
            ], { margin: 'sm' }));
            
            if (index < results.length - 1) {
                bodyContents.push(flexUtils.createSeparator('sm'));
            }
        });

        if (discharged) {
            bodyContents.push(flexUtils.createSeparator('md'));
            bodyContents.push(flexUtils.createText({ text: `🎉 已達成退伍條件！\n結算軍階：${newRankName}`, size: 'sm', weight: 'bold', color: '#FFD700', margin: 'md', wrap: true }));
        }

        const flexBubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader('🚀 一鍵出操報告', `【國軍】${memberName}`, '#1A1A1A', '#2196F3'),
            body: flexUtils.createBox('vertical', bodyContents, { backgroundColor: '#1A1A1A', paddingAll: 'xl' })
        });

        await lineUtils.replyFlex(replyToken, '一鍵出操報告', flexBubble);

    } catch (e) {
        console.error('[Military] handleBatchMilitaryGames Error:', e);
        await lineUtils.replyText(replyToken, '❌ 執行一鍵勤務發生錯誤。');
    }
}

async function handlePension(replyToken, context) {
    const { userId, groupId } = context;
    const { db } = require('../utils/db');
    const lineUtils = require('../utils/line');
    const flexUtils = require('../utils/flex');
    const memberName = await lineUtils.getGroupMemberName(groupId, userId);
    
    try {
        let resultData = null;
        const COLLECTION_NAME = 'economy_users';
        await db.runTransaction(async (t) => {
            const docRef = db.collection(COLLECTION_NAME).doc(userId);
            const doc = await t.get(docRef);
            if (!doc.exists) return;
            const data = doc.data();
            const now = Date.now();

            if (data.militaryUntil && now < data.militaryUntil) {
                resultData = { error: 'still_serving' };
                return;
            }

            const currentCount = data.militaryEnlistCount || 0;
            if (currentCount === 0) {
                resultData = { error: 'never_served' };
                return;
            }

            const rankInfo = getMilitaryRankInfo(currentCount - 1);
            if (!rankInfo.pension || rankInfo.pension <= 0) {
                resultData = { error: 'no_pension', rankName: rankInfo.name };
                return;
            }

            const cdKey = 'lastPensionTime';
            const cdMs = 24 * 60 * 60 * 1000;
            const lastTime = data[cdKey] || 0;
            if (now - lastTime < cdMs) {
                resultData = { error: 'cooldown', lastTime, cdMs };
                return;
            }

            t.update(docRef, {
                [cdKey]: now,
                kuCoin: db.FieldValue.increment(rankInfo.pension)
            });

            resultData = {
                success: true,
                pension: rankInfo.pension,
                rankName: rankInfo.name,
                newBalance: (data.kuCoin || 0) + rankInfo.pension,
                now
            };
        });

        if (!resultData) return;
        if (resultData.error === 'still_serving') {
            await lineUtils.replyText(replyToken, '❌ 報告！你還在服役中，必須先退伍才能領取終身俸！');
            return;
        }
        if (resultData.error === 'never_served') {
            await lineUtils.replyText(replyToken, '❌ 報告！你連一天兵都沒當過，沒有資格領取終身俸！');
            return;
        }
        if (resultData.error === 'no_pension') {
            await lineUtils.replyText(replyToken, `❌ 報告！你目前的退伍階級為【${resultData.rankName}】，未達將校級別，國家不予發放終身俸！`);
            return;
        }
        if (resultData.error === 'cooldown') {
            const remainHrs = Math.ceil((resultData.cdMs - (Date.now() - resultData.lastTime)) / 3600000);
            await lineUtils.replyText(replyToken, `⏳ 報告！你今天已經領過終身俸了，請等待 ${remainHrs} 小時後再來！`);
            return;
        }

        const bodyContents = [
            flexUtils.createText({ text: `「感謝您過去為國辛勞！這是國家給您的退休慰問金。」`, size: 'sm', color: '#FFFFFF', wrap: true }),
            flexUtils.createSeparator('md'),
            flexUtils.createText({ text: `💰 獲得終身俸：${resultData.pension.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#FFD700', margin: 'md' }),
            flexUtils.createText({ text: `🏦 結算總資產：${resultData.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#4CAF50', margin: 'sm' }),
            flexUtils.createSeparator('md'),
            flexUtils.createText({ text: `⏳ 領取冷卻：24 小時`, size: 'xs', color: '#888888', margin: 'md' })
        ];

        const flexBubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader('📜 領取終身俸', `【退伍${resultData.rankName}】${memberName}`, '#1A1A1A', '#2196F3'),
            body: flexUtils.createBox('vertical', bodyContents, { backgroundColor: '#1A1A1A', paddingAll: 'xl' })
        });

        await lineUtils.replyFlex(replyToken, '領取終身俸', flexBubble);

    } catch (e) {
        console.error('[Military] handlePension Error:', e);
        await lineUtils.replyText(replyToken, '❌ 領取終身俸發生錯誤。');
    }
}

module.exports = {
    handleMilitaryGame,
    handlePension,
    handleLiveStream,
    handleSnitch,
    handleEnlist,
    handleDischarge,
    handleHungerStrike,
    checkStatusBlock,
    handleSutra,
    handlePsychiatric,
    handleElection,
    handleScapegoat,
    handleDonation,
    handleDragDown,
    checkAndDischargeMilitary,
    getMilitaryRankInfo,
    handleBatchMilitaryGames
};
