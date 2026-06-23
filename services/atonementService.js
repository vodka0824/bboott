const { db } = require('../utils/db');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const memoryCache = require('../utils/memoryCache');
const { getSpamResponse } = require('../utils/spamHandler');
const COLLECTION_NAME = 'economy_users';

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
                return { success: false, message: '你還在坐牢，無法去精神鑑定！' };
            }

            if (data.psychiatricCooldownUntil && Date.now() < data.psychiatricCooldownUntil) {
                const remainingMin = Math.ceil((data.psychiatricCooldownUntil - Date.now()) / 60000);
                return { success: false, message: `鑑定中心說你太頻繁掛號了，請等待 ${Math.floor(remainingMin/60)} 小時 ${remainingMin%60} 分鐘後再去！` };
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
            const enlistCount = data.militaryEnlistCount || 1;
            const rankIndex = enlistCount - 1;
            
            let allowedMilitaryCommands = /^(?:每日簽到|簽到|領哭幣|領錢|退伍|除草|拔草|掃地|出公差|站夜哨|裝病逃操|裝病|打靶測驗|打靶|高裝檢|漢光演習|領終身俸|狀態|屬性|我的屬性|我的狀態|冷卻|查冷卻|我的冷卻|冷卻時間)$/i;
            
            if (rankIndex >= 18) { // 四星上將 或 五星上將
                allowedMilitaryCommands = /^(?:每日簽到|簽到|領哭幣|領錢|退伍|領終身俸|狀態|屬性|我的屬性|我的狀態|冷卻|查冷卻|我的冷卻|冷卻時間|發動戰爭|研發軍火)$/i;
            } else if (rankIndex >= 15) { // 上將、二星、三星
                allowedMilitaryCommands = /^(?:每日簽到|簽到|領哭幣|領錢|退伍|高裝檢|漢光演習|領終身俸|狀態|屬性|我的屬性|我的狀態|冷卻|查冷卻|我的冷卻|冷卻時間)$/i;
            }

            const msgText = (context.message || '').trim().replace(/^[!/！]/, '');
            const isAllowed = allowedMilitaryCommands.test(msgText) || feature === 'casino';
            
            if (!isAllowed) {
                if (Date.now() < data.militaryUntil) {
                    if (rankIndex >= 15) {
                        return { blocked: true, message: null };
                    }
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

module.exports = {
    handleHungerStrike,
    handleSutra,
    handlePsychiatric,
    checkStatusBlock
};
