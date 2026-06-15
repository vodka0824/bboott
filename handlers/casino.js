const { db } = require('../utils/db');
const lineUtils = require('../utils/line');
const authUtils = require('../utils/auth');

const CASINO_CONFIG_COLLECTION = 'system_config';
const CASINO_CONFIG_DOC = 'casino';

async function getCasinoConfig() {
    const doc = await db.collection(CASINO_CONFIG_COLLECTION).doc(CASINO_CONFIG_DOC).get();
    if (doc.exists) {
        return doc.data();
    }
    return { enabled: true, designatedGroupId: null };
}

async function setCasinoConfig(config) {
    await db.collection(CASINO_CONFIG_COLLECTION).doc(CASINO_CONFIG_DOC).set(config, { merge: true });
}

async function checkAccess(groupId) {
    const config = await getCasinoConfig();
    
    if (!config.enabled) {
        return { allowed: false, message: '🛑 哭霸娛樂城目前大門緊閉，明天請早。' };
    }

    if (config.designatedGroupId && config.designatedGroupId !== groupId) {
        return { allowed: false, message: '👮 此群組非指定合法哭霸娛樂城，禁止進行非法聚賭。' };
    }

    return { allowed: true };
}

async function bindCasino(replyToken, groupId, userId) {
    if (!(await authUtils.isAdmin(userId))) {
        await lineUtils.replyText(replyToken, '❌ 權限不足，只有管理員能執行此操作。');
        return;
    }
    await setCasinoConfig({ designatedGroupId: groupId });
    await lineUtils.replyText(replyToken, '✅ 已將此群組設為全服唯一的「哭霸娛樂城」。其他群組的賭博功能已失效。');
}

async function openCasino(replyToken, userId) {
    if (!(await authUtils.isAdmin(userId))) {
        await lineUtils.replyText(replyToken, '❌ 權限不足，只有管理員能執行此操作。');
        return;
    }
    await setCasinoConfig({ enabled: true });
    await lineUtils.replyText(replyToken, '🎰 哭霸娛樂城大門已開啟，歡迎各路乾爹送錢！');
}

async function closeCasino(replyToken, userId) {
    if (!(await authUtils.isAdmin(userId))) {
        await lineUtils.replyText(replyToken, '❌ 權限不足，只有管理員能執行此操作。');
        return;
    }
    await setCasinoConfig({ enabled: false });
    await lineUtils.replyText(replyToken, '🛑 哭霸娛樂城已關閉，正在清算帳目。所有賭博活動暫停。');
}

module.exports = {
    getCasinoConfig,
    setCasinoConfig,
    checkAccess,
    bindCasino,
    openCasino,
    closeCasino
};
