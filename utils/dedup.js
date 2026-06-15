const { db, Firestore } = require('./db');
const logger = require('./logger');

const COLLECTION = 'processed_events';

// In-memory cache for fast deduplication on the same instance
// Key: eventId, Value: timestamp
const memoryCache = new Map();
const MEMORY_TTL_MS = 60 * 1000; // 1 minute

// Cleanup memory cache efficiently
setInterval(() => {
    const now = Date.now();
    for (const [key, ts] of memoryCache) {
        if (now - ts > MEMORY_TTL_MS) {
            memoryCache.delete(key);
        }
    }
}, 60 * 1000); // Check every minute

/**
 * 嘗試獲取事件鎖 (Deduplication)
 * 使用混合策略：先查記憶體，再查本機 MongoDB (Atomic Create)
 * 
 * @param {string} eventId Webhook Event ID
 * @returns {Promise<boolean>} true: 獲取鎖成功 (首次處理); false: 事件已存在 (忽略)
 */
async function acquireLock(eventId) {
    if (!eventId) {
        // 如果沒有 ID (舊版事件?)，預設允許通過，但記錄警告
        return true;
    }

    // 1. Memory Check (Fastest)
    if (memoryCache.has(eventId)) {
        logger.info(`[Dedup] Event ${eventId} hit memory cache (Duplicate)`);
        return false;
    }

    try {
        // 2. MongoDB 原子性建立 (Global Lock)
        // 使用 create()，如果文件已存在會拋出 code=6 的錯誤 (模擬 Firestore ALREADY_EXISTS)
        // 這保證了即使多個請求同時處理，也只有一個能成功
        await db.collection(COLLECTION).doc(eventId).create({
            processedAt: Firestore.FieldValue.serverTimestamp(),
            ttl: Date.now() + (5 * 60 * 1000) // 標記時間供參考
        });

        // 鎖定成功，寫入記憶體快取以供後續快速檢查
        memoryCache.set(eventId, Date.now());
        return true;

    } catch (error) {
        if (error.code === 6) { // 6 = ALREADY_EXISTS
            logger.info(`[Dedup] Event ${eventId} hit DB lock (Duplicate)`);
            // 也更新記憶體，減少後續查詢
            memoryCache.set(eventId, Date.now());
            return false;
        }

        // 其他錯誤 (如 DB 連線失敗)，為了不影響服務，預設 "Open" (允許處理)
        // 但這可能會導致重複訊息，不過比不發訊息好
        logger.error(`[Dedup] Error acquiring lock for ${eventId}:`, error);
        return true;
    }
}

module.exports = {
    acquireLock
};
