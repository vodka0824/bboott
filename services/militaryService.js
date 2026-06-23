const { db } = require('../utils/db');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const memoryCache = require('../utils/memoryCache');
const notificationService = require('../services/notificationService');
const { getSpamResponse } = require('../utils/spamHandler');
const { MILITARY_RANKS } = require('../config/constants');
const COLLECTION_NAME = 'economy_users';

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

            if (data.isPolice) {
                return { success: false, message: '你是現任警察，不得同時服兵役！' };
            }

            if (data.councilorUntil && Date.now() < data.councilorUntil) {
                return { success: false, message: '你是現任市議員，國軍無法徵召你！' };
            }

            if (data.isMafia) {
                return { success: false, message: '你是黑幫份子，國軍不收！請先「斷手指」退出黑社會！' };
            }

            if (data.profession === 'monk') {
                return { success: false, message: '出家人慈悲為懷，不得參與殺戮軍旅！請先還俗！' };
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

async function handleMilitaryChore(replyToken, context) {
    const { userId, message } = context;
    const msgText = (message || '').trim().replace(/^[!/！]/, '');
    const { db } = require('../utils/db');
    const lineUtils = require('../utils/line');
    
    const docRef = db.collection('economy_users').doc(userId);
    const doc = await docRef.get();
    if (!doc.exists) return;
    const data = doc.data();

    if (!data.militaryUntil) {
        await lineUtils.replyText(replyToken, '❌ 你又不是軍人，跑來營區幹嘛？（請先入伍才能執行軍中勤務）');
        return;
    }

    if (Date.now() >= data.militaryUntil) {
        await lineUtils.replyText(replyToken, '🪖 你的役期已經滿了，請先去辦理「!退伍」手續，不要再白做工了！');
        return;
    }

    const now = Date.now();
    const lastChore = data.lastMilitaryChore || 0;
    if (now - lastChore < 3 * 60 * 1000) {
        const remainMins = Math.ceil((3 * 60 * 1000 - (now - lastChore)) / 1000 / 60);
        await lineUtils.replyText(replyToken, `⏳ 班長：「你給我站好！休息時間還沒到！」\n(請等待 ${remainMins} 分鐘後再出公差)`);
        return;
    }

    const isMow = msgText === '除草' || msgText === '拔草';
    const isSweep = msgText === '掃地';
    const isErrand = msgText === '出公差';

    let rewards = 0;
    let text = '';
    const rand = Math.random();

    if (isMow) {
        if (rand < 0.2) {
            text = '🌿 你在拔草的時候發現了一個藏著私房錢的破罐子！(獲得 500 哭幣)';
            rewards = 500;
        } else if (rand < 0.3) {
            text = '🌿 你拔草拔到班長種的盆栽，被罰站了...(沒有獎勵)';
        } else {
            text = '🌿 你在大太陽下努力拔草，整個中山室的草皮都被你拔光了！班長很滿意！(獲得 100 哭幣)';
            rewards = 100;
        }
    } else if (isSweep) {
        if (rand < 0.2) {
            text = '🧹 你掃地的時候不小心把連長的茶杯打破了！(扣 200 哭幣)';
            rewards = -200;
        } else if (rand < 0.3) {
            text = '🧹 你掃地掃得很乾淨，連長心情大好賞了你零用錢！(獲得 300 哭幣)';
            rewards = 300;
        } else {
            text = '🧹 你默默地把落葉掃乾淨，雖然無聊但至少有乖乖做事。(獲得 100 哭幣)';
            rewards = 100;
        }
    } else if (isErrand) {
        if (rand < 0.1) {
            text = '🏃 你被派去幫營長買便當，結果把找的零錢據為己有了！(獲得 800 哭幣)';
            rewards = 800;
        } else if (rand < 0.4) {
            text = '🏃 假裝出公差，其實躲在廁所抽菸被抓包！(扣 300 哭幣)';
            rewards = -300;
        } else {
            text = '🏃 你幫福利社阿姨搬了兩箱飲料，阿姨塞了點跑腿費給你。(獲得 150 哭幣)';
            rewards = 150;
        }
    }

    await docRef.set({
        kuCoin: db.FieldValue.increment(rewards),
        lastMilitaryChore: now
    }, { merge: true });

    await lineUtils.replyText(replyToken, text);
}

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

function getMilitaryRankInfo(enlistCount) {
    const idx = Math.min(enlistCount || 0, MILITARY_RANKS.length - 1);
    return MILITARY_RANKS[idx];
}

module.exports = {
    handleEnlist,
    handleDischarge,
    handleMilitaryChore,
    checkAndDischargeMilitary,
    getMilitaryRankInfo
};
