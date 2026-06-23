const { db } = require('../utils/db');

/**
 * 佇列推播訊息到資料庫
 * @param {string} targetId groupId 或 userId
 * @param {Array|Object} messages LINE 訊息陣列或單一物件
 */
async function queueNotification(targetId, messages) {
    if (!targetId || !messages) return;
    
    // 統一轉為陣列
    const msgArray = Array.isArray(messages) ? messages : [messages];
    if (msgArray.length === 0) return;

    try {
        await db.runTransaction(async (t) => {
            const notifRef = db.collection('pending_notifications').doc(targetId);
            const doc = await t.get(notifRef);
            
            if (doc.exists) {
                const existingQueue = doc.data().queue || [];
                // 限制最大佇列長度，避免無限堆疊，取最新 20 則
                const newQueue = [...existingQueue, ...msgArray].slice(-20);
                t.update(notifRef, { queue: newQueue, updatedAt: Date.now() });
            } else {
                t.set(notifRef, { queue: msgArray, createdAt: Date.now(), updatedAt: Date.now() });
            }
        });
    } catch (e) {
        console.error('[NotificationService] Failed to queue notification:', e);
    }
}

/**
 * 取得並清空目標的待辦推播訊息
 * @param {string} targetId groupId 或 userId
 * @returns {Promise<Array>} 訊息陣列
 */
async function fetchAndClearNotifications(targetId) {
    if (!targetId) return [];
    
    try {
        return await db.runTransaction(async (t) => {
            const notifRef = db.collection('pending_notifications').doc(targetId);
            const doc = await t.get(notifRef);
            
            if (doc.exists) {
                const queue = doc.data().queue || [];
                if (queue.length > 0) {
                    t.delete(notifRef);
                    return queue;
                }
            }
            return [];
        });
    } catch (e) {
        console.error('[NotificationService] Failed to fetch notifications:', e);
        return [];
    }
}

module.exports = {
    queueNotification,
    fetchAndClearNotifications
};
