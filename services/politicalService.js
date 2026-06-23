const { db } = require('../utils/db');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const memoryCache = require('../utils/memoryCache');
const { getSpamResponse } = require('../utils/spamHandler');
const COLLECTION_NAME = 'economy_users';

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
            const { getFinalPlayerStats } = require('../handlers/rpg');
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

            // 4. 檢查是否是出家人
            if (data.profession === 'monk') {
                return { success: false, message: `出家人六根清淨，不得參與世俗政治！請先還俗再來登記參選。` };
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
                corruptionLevel: db.FieldValue.delete(), // 清空舊任期貪污值！
                isMafia: db.FieldValue.delete() // 自動脫離黑社會
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

        const { clearProfessionCache } = require('../handlers/profession');
        clearProfessionCache(userId);

    } catch (e) {
        console.error('[Jail] handleElection Error:', e);
        const lineUtils = require('../utils/line');
        await lineUtils.replyText(replyToken, `❌ 參選失敗。原因：${e.message || '未知系統錯誤'}`);
    }
}

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

module.exports = {
    handleLiveStream,
    handleSnitch,
    handleDragDown,
    handleScapegoat,
    handleElection,
    handleDonation
};
