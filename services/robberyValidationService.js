const { db } = require('../utils/db');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const { ADMIN_USER_ID } = require('../config/constants');
const { getSpamResponse } = require('../utils/spamHandler');
const { getFinalPlayerStats } = require('../handlers/rpg');
const { getWantedList, getMafiaRank, applyWantedDecay, applyBossBetrayal, getBossBetrayalFlex, getMafiaBoss } = require('../handlers/profession');
const economyHandler = require('../handlers/economy');

const COLLECTION_NAME = 'economy_users';

const sp = (n) => parseInt(n || 0, 10);
const eqSp = (eq) => eq ? Object.values(eq).reduce((sum, item) => sum + (item?.sp || 0), 0) : 0;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

async function getUserProfile(t, userId, name = '未知用戶') {
    const docRef = db.collection(COLLECTION_NAME).doc(userId);
    const doc = await t.get(docRef);
    let data;
    if (!doc.exists) {
        data = {
            kuCoin: 0,
            lastCheckIn: 0,
            consecutiveDays: 0,
            name: name
        };
        t.set(docRef, data);
    } else {
        data = doc.data();
    }
    return { docRef, data };
}

async function validateRobTarget(replyToken, fromUserId, targetUserId) {
    if (fromUserId === targetUserId) {
        await lineUtils.replyText(replyToken, '❌ 你有病嗎？搶劫自己幹嘛？');
        return false;
    }
    return true;
}

module.exports = {
    getUserProfile,
    validateRobTarget
};
