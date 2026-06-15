/**
 * Rate Limiting 工具模組
 * 防止 API 濫用和 DOS 攻擊
 */

const logger = require('./logger');

// 記憶體儲存（生產環境建議使用 Redis）
const rateLimitStore = new Map();

// 清理過期記錄的間隔
const CLEANUP_INTERVAL = 60000; // 1 分鐘

/**
 * 檢查速率限制
 * @param {string} userId - 用戶 ID
 * @param {string} action - 行為類型
 * @param {number} limit - 時間窗口內的最大請求數
 * @param {number} window - 時間窗口（毫秒）
 * @returns {boolean} - true: 允許, false: 超過限制
 */
function checkRateLimit(userId, action, limit = 10, window = 60000) {
    const key = `${userId}:${action}`;
    const now = Date.now();

    // 取得用戶的請求記錄
    let userActions = rateLimitStore.get(key) || [];

    // 清除過期的記錄
    userActions = userActions.filter(timestamp => now - timestamp < window);

    // 檢查是否超過限制
    if (userActions.length >= limit) {
        logger.warn(`Rate limit exceeded`, {
            userId,
            action,
            count: userActions.length,
            limit
        });
        return false;
    }

    // 記錄這次請求
    userActions.push(now);
    rateLimitStore.set(key, userActions);

    return true;
}

/**
 * 取得用戶的剩餘配額
 */
function getRemainingQuota(userId, action, limit = 10, window = 60000) {
    const key = `${userId}:${action}`;
    const now = Date.now();

    let userActions = rateLimitStore.get(key) || [];
    userActions = userActions.filter(timestamp => now - timestamp < window);

    return Math.max(0, limit - userActions.length);
}

/**
 * 重置用戶的速率限制（管理員功能）
 */
function resetRateLimit(userId, action = null) {
    if (action) {
        const key = `${userId}:${action}`;
        rateLimitStore.delete(key);
        logger.info(`Rate limit reset for ${userId}:${action}`);
    } else {
        // 重置該用戶所有的限制
        for (const key of rateLimitStore.keys()) {
            if (key.startsWith(`${userId}:`)) {
                rateLimitStore.delete(key);
            }
        }
        logger.info(`All rate limits reset for ${userId}`);
    }
}

/**
 * 定期清理過期記錄
 */
function startCleanup() {
    setInterval(() => {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, timestamps] of rateLimitStore.entries()) {
            const validTimestamps = timestamps.filter(t => now - t < 3600000); // 保留 1 小時內的

            if (validTimestamps.length === 0) {
                rateLimitStore.delete(key);
                cleaned++;
            } else if (validTimestamps.length < timestamps.length) {
                rateLimitStore.set(key, validTimestamps);
            }
        }

        if (cleaned > 0) {
            logger.debug(`Rate limit cleanup: removed ${cleaned} expired entries`);
        }
    }, CLEANUP_INTERVAL);
}

// 啟動清理任務
startCleanup();

// 預設限制配置
const RATE_LIMITS = {
    // 爬蟲功能 - 防止過度爬取
    crawler: { limit: 5, window: 60000 },      // 每分鐘 5 次
    oil: { limit: 3, window: 60000 },          // 油價每分鐘 3 次
    news: { limit: 5, window: 60000 },         // 新聞每分鐘 5 次
    movie: { limit: 3, window: 60000 },        // 電影每分鐘 3 次

    // AI 功能 - API 配額保護
    ai: { limit: 10, window: 60000 },          // 每分鐘 10 次
    gemini: { limit: 10, window: 60000 },

    // 查詢功能
    horoscope: { limit: 10, window: 60000 },   // 運勢每分鐘 10 次
    weather: { limit: 10, window: 60000 },     // 天氣每分鐘 10 次
    restaurant: { limit: 5, window: 60000 },   // 餐廳每分鐘 5 次

    // 圖片功能 - 防止濫用
    image: { limit: 10, window: 60000 },       // 圖片每分鐘 10 次

    // 遊戲功能
    slot: { limit: 1, window: 60000 },         // 拉霸每人每分鐘 1 次

    // 賭場遊戲冷卻 (每 30 秒 1 次)
    casino_slot:     { limit: 1, window: 30000 },
    casino_dice:     { limit: 1, window: 30000 },
    casino_blackjack:{ limit: 1, window: 30000 },
    casino_baccarat: { limit: 1, window: 30000 },
    casino_horse:    { limit: 1, window: 30000 },
    casino_roulette: { limit: 1, window: 30000 },
    casino_vipwheel: { limit: 1, window: 30000 },
    casino_lottery:  { limit: 1, window: 30000 },
    casino_enchant:  { limit: 1, window: 30000 },

    // 管理功能
    admin: { limit: 20, window: 60000 },       // 管理指令每分鐘 20 次

    // 全局限制
    global: { limit: 30, window: 60000 }       // 總計每分鐘 30 次指令
};

/**
 * 檢查預設限制
 */
function checkLimit(userId, actionType) {
    const config = RATE_LIMITS[actionType] || RATE_LIMITS.global;
    return checkRateLimit(userId, actionType, config.limit, config.window);
}

/**
 * 取得冷卻剩餘秒數（用於向玩家提示）
 * @param {string} userId
 * @param {string} gameKey - 例如 'casino_slot'
 * @returns {number} 剩餘秒數，0 表示可以操作
 */
function getCooldownRemaining(userId, gameKey) {
    const config = RATE_LIMITS[gameKey];
    if (!config) return 0;

    const key = `${userId}:${gameKey}`;
    const now = Date.now();
    const userActions = (rateLimitStore.get(key) || []).filter(t => now - t < config.window);

    if (userActions.length >= config.limit && userActions.length > 0) {
        const oldestInWindow = userActions[0]; // 修復 W-15: 最舊的時間戳在索引 0
        const remaining = Math.ceil((config.window - (now - oldestInWindow)) / 1000);
        return Math.max(0, remaining);
    }
    return 0;
}

module.exports = {
    checkRateLimit,
    getRemainingQuota,
    resetRateLimit,
    checkLimit,
    getCooldownRemaining,
    RATE_LIMITS
};
