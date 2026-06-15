const fs = require('fs');
const path = 'c:/Users/USER/.gemini/antigravity/scratch/lineBot/handlers/jail_redemption.js';
let content = fs.readFileSync(path, 'utf8');

const newFunctions = `
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
                const spam = getSpamResponse(data, 'live_cd', \`你的帳號還在被平台降觸及！請等待 \${Math.floor(remainingMin/60)} 小時 \${remainingMin%60} 分鐘後再開台。\`);
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
                newWantedLevel = 0;
                const jailDurationMs = 2 * 60 * 60 * 1000; // 2小時
                t.update(docRef, {
                    wantedLevel: 0,
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
            await lineUtils.replyText(replyToken, \`❌ \${result.message}\`);
            return;
        }

        let msg = '';
        if (result.outcome === 'success') {
            msg = \`📹 【開直播哭訴】\\n\${result.name} 在直播中聲淚俱下，痛批是這個社會逼你犯罪的！\\n\\n粉絲深受感動，不僅你的通緝值降至 \${(result.newWantedLevel * 100).toFixed(0)}%，\\n還收到了 \${result.donation.toLocaleString()} 哭幣的抖內金！\`;
        } else if (result.outcome === 'fail') {
            msg = \`🔥 【直播大翻車】\\n\${result.name} 直播哭到一半，不小心笑場還忘記關麥克風！\\n\\n全網炎上！你的通緝值沒有減少，並且被平台禁言，10 分鐘內無法進行任何賭博與搶劫！\`;
        } else if (result.outcome === 'arrest') {
            msg = \`🚓 【直播查水表】\\n\${result.name} 正在直播中大談自己的心路歷程，突然門鈴響了...\\n\\n「砰！」警察直接破門而入把你壓制在地！\\n觀眾全都看傻了眼！\\n\\n🚨 你增加了一次前科，並被直接送進監獄服刑 2 小時！\`;
        }

        await lineUtils.replyText(replyToken, msg);
    } catch (e) {
        console.error('[Jail] handleLiveStream Error:', e);
        const lineUtils = require('../utils/line');
        await lineUtils.replyText(replyToken, '❌ 開直播失敗。');
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
                return { success: false, message: \`警察局說你太常來亂報案了！請等待 \${Math.floor(remainingMin/60)} 小時 \${remainingMin%60} 分鐘後再來。\` };
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
            await lineUtils.replyText(replyToken, \`❌ \${result.message}\`);
            return;
        }

        const msg = \`🐍 【轉當污點證人】\\n\${result.fromName} 向警方主動投案，並提供了 \${result.targetName} 的犯罪證據！\\n\\n警察大悅，\${result.fromName} 的通緝值全數清零！\\n\${result.targetName} 被無端牽連，通緝值增加了 10%！\\n\\n⚠️ \${result.fromName} 獲得了【抓耙子】標籤！\\n在接下來的 24 小時內，黑道會對你嚴加防範，你的搶劫成功率將大跌 20%！\`;
        await lineUtils.replyText(replyToken, msg);

    } catch (e) {
        console.error('[Jail] handleSnitch Error:', e);
        const lineUtils = require('../utils/line');
        await lineUtils.replyText(replyToken, '❌ 污點證人行動失敗。');
    }
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

            t.update(docRef, {
                wantedLevel: 0,
                militaryUntil: Date.now() + serveTime
            });

            return { success: true, name: memberName || data.displayName || data.name };
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, \`❌ \${result.message}\`);
            return;
        }

        const msg = \`🪖 【簽下去：志願役】\\n\${result.name} 走投無路，決定投入國軍的懷抱！\\n\\n部隊大門為你敞開，黑白兩道都拿你沒轍！\\n你的通緝值瞬間歸零！\\n\\n⚠️ 注意：你將進入長達 12 小時的「營區管制期」。期間內絕對禁止使用任何賭場與搶劫指令！等退伍後才能重出江湖！\`;
        await lineUtils.replyText(replyToken, msg);

    } catch (e) {
        console.error('[Jail] handleEnlist Error:', e);
        await lineUtils.replyText(replyToken, '❌ 簽下去失敗。');
    }
}

/**
 * 退伍領薪水
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
                return { success: false, message: \`長官說你還沒役滿！離退伍還有 \${remainHrs} 小時 \${remainMins} 分鐘。\` };
            }

            // 退伍金
            const salary = 100000;

            t.update(docRef, {
                militaryUntil: db.FieldValue.delete(),
                kuCoin: db.FieldValue.increment(salary)
            });

            return { success: true, salary, name: memberName || data.displayName || data.name };
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, \`❌ \${result.message}\`);
            return;
        }

        await lineUtils.replyText(replyToken, \`🎉 【榮譽退伍】\\n\${result.name} 終於拿到退伍令，正式回歸社會！\\n\\n國家發放了 \${result.salary.toLocaleString()} 哭幣的微薄退伍金給你！\`);

    } catch (e) {
        console.error('[Jail] handleDischarge Error:', e);
        await lineUtils.replyText(replyToken, '❌ 退伍失敗。');
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
            await lineUtils.replyText(replyToken, \`❌ \${result.message}\`);
            return;
        }

        const msg = \`🚑 【絕食抗議】\\n\${result.name} 宣布展開無限期絕食，抗議司法不公！\\n\\n⚠️ 注意：你必須在接下來的 3 小時內，【完全不能使用任何賭場與搶劫指令】，才能成功逼迫警方妥協消除通緝。\\n只要偷打一次指令，就會被判定為「偷吃巧克力」而破功！\`;
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
async function checkStatusBlock(context) {
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
            return { blocked: true, message: \`🔥 你因為直播大翻車被平台禁言中！請等待 \${remainMins} 分鐘後再行動。\` };
        } else if (data.banUntil && Date.now() >= data.banUntil) {
            shouldUpdate = true;
            updates.banUntil = db.FieldValue.delete();
        }

        // 2. 檢查當兵狀態
        if (data.militaryUntil) {
            if (Date.now() < data.militaryUntil) {
                return { blocked: true, message: '🪖 班長看著你，你敢在營區玩手機？請乖乖等退伍！(輸入 !退伍 查看時間)' };
            } else {
                // 已經滿了，但還沒領退伍金，提示他領退伍金
                return { blocked: true, message: '🪖 你的役期已經滿了，請先輸入「!退伍」領取退伍金才能恢復自由之身！' };
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
                lineUtils.replyText(context.replyToken, \`🚑 【絕食成功】\\n警方怕你死在路邊惹麻煩，決定銷案！你的通緝值全數歸零！\`).catch(()=>console.log);
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
                replyMsg = \`🍫 【絕食破功】\\n你受不了飢餓偷偷躲在棉被吃巧克力被抓包！\\n只差 \${remainHrs} 小時 \${remainMins} 分鐘就成功了，真可惜。絕食抗議正式宣告破功！\`;
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
`;

content = content.replace('module.exports = {', newFunctions + '\nmodule.exports = {\n    handleLiveStream,\n    handleSnitch,\n    handleEnlist,\n    handleDischarge,\n    handleHungerStrike,\n    checkStatusBlock,');
fs.writeFileSync('c:/Users/USER/.gemini/antigravity/scratch/lineBot/patch_jail.js', content);
