/**
 * LINE API 工具函數
 */
const axios = require('axios');
const { CHANNEL_ACCESS_TOKEN } = require('../config/constants');
const logger = require('./logger');
const memoryCache = require('./memoryCache');
const notificationService = require('../services/notificationService');

// === 被動推播管理器 ===
const tokenToGroupId = new Map();

function registerReplyToken(replyToken, groupId) {
    if (groupId) {
        tokenToGroupId.set(replyToken, groupId);
        // 設定 60 秒後自動清除，防止記憶體洩漏
        setTimeout(() => {
            tokenToGroupId.delete(replyToken);
        }, 60000);
    }
}

async function addPendingMessage(groupId, messages) {
    if (!groupId || !messages || messages.length === 0) return;
    await notificationService.queueNotification(groupId, messages);
}

async function flushPendingMessages(replyToken, groupId) {
    if (!groupId) return false;
    const queue = await notificationService.fetchAndClearNotifications(groupId);
    if (queue && queue.length > 0) {
        // 透過 replyToLine 發送空陣列，它會自動將 pending messages 合併進去
        // 由於 replyToLine 會再 fetch 一次，為了避免重複讀取空，我們直接將讀取到的傳給它
        await replyToLine(replyToken, queue);
        return true; // 回覆 token 已被消耗
    }
    return false;
}

/**
 * 發送訊息到 LINE
 */
async function replyToLine(replyToken, messages) {
    let finalMessages = [...(messages || [])];
    const groupId = tokenToGroupId.get(replyToken);
    
    // 如果有註冊的群組，且該群組有待發送的被動推播訊息，則合併發送
    if (groupId) {
        const queue = await notificationService.fetchAndClearNotifications(groupId);
        if (queue && queue.length > 0) {
            // 將當下的回覆放在最前面，確保指令回應不被過多的待推播訊息擠掉
            finalMessages = finalMessages.concat(queue);
        }
    }
    
    // 使用後清除 mapping
    tokenToGroupId.delete(replyToken);
    
    if (finalMessages.length === 0) return; // 無訊息可發送

    // LINE 限制一次最多發送 5 則訊息，超過的塞回 pending 序列
    if (finalMessages.length > 5) {
        const extra = finalMessages.slice(5);
        finalMessages = finalMessages.slice(0, 5);
        if (groupId) {
            addPendingMessage(groupId, extra);
        }
    }

    try {
        await axios.post('https://api.line.me/v2/bot/message/reply', {
            replyToken,
            messages: finalMessages
        }, {
            headers: { 'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}` }
        });
    } catch (error) {
        logger.error('[LINE] Reply failed', error);
        if (error.response && error.response.data) {
            // CRITICAL: Log detailed LINE API error message
            console.error('[LINE API Error Details]:', error.response.data.message || 'Unknown error');
            if (error.response.data.details) {
                console.error('[LINE API Error Details Array]:', JSON.stringify(error.response.data.details, null, 2));
            }
            logger.debug('[LINE] API error details', {
                data: error.response.data.message || 'Unknown error',
                details: error.response.data.details,
                payloadTypes: messages.map(m => m.type)
            });
        }
        throw error;
    }
}

/**
 * 發送文字訊息
 */
async function replyText(replyToken, text, quickReply = null) {
    const msg = { type: 'text', text };
    if (quickReply) msg.quickReply = quickReply;
    await replyToLine(replyToken, [msg]);
}

/**
 * 發送 Flex 訊息
 */
async function replyFlex(replyToken, alt, flex, extraMessages = [], quickReply = null) {
    if (!replyToken) return;
    
    // 智慧防破版：確保所有 Bubble 都有明確的背景色（避免在深色模式下變成黑底黑字）
    function injectBackground(obj) {
        if (!obj || typeof obj !== 'object') return;
        if (Array.isArray(obj)) {
            obj.forEach(injectBackground);
        } else {
            if (obj.type === 'bubble' && obj.body && obj.body.type === 'box' && !obj.body.backgroundColor) {
                const flexUtils = require('./flex');
                obj.body.backgroundColor = flexUtils.COLORS.BG_MAIN;
            }
            for (const key of Object.keys(obj)) {
                if (typeof obj[key] === 'object') {
                    injectBackground(obj[key]);
                }
            }
        }
    }
    injectBackground(flex);

    try {
        const msg = { type: 'flex', altText: alt, contents: flex };
        if (quickReply) msg.quickReply = quickReply;
        await replyToLine(replyToken, [msg, ...extraMessages]);
    } catch (error) {
        // ✅ 詳細記錄 LINE API 錯誤
        const errorDetails = error.response?.data?.details;
        if (errorDetails) {
            console.error('[LINE API Error Details Array]:', JSON.stringify(errorDetails, null, 2));
        }
        logger.error('[LINE API Error Details]:', {
            message: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data?.message || 'Unknown error',
            details: errorDetails
        });
        throw error;
    }
}

/**
 * 取得群組成員名稱
 */
/**
 * 取得群組/房間成員資料 (完整 Profile)
 */
async function getGroupMemberProfile(groupId, userId) {
    if (!groupId) return { displayName: '成員', pictureUrl: null };
    
    const cacheKey = `profile:group:${groupId}:${userId}`;
    const cacheResult = memoryCache.get(cacheKey, true);
    
    const fetchProfile = async () => {
        try {
            const type = groupId.startsWith('R') ? 'room' : 'group';
            const url = `https://api.line.me/v2/bot/${type}/${groupId}/member/${userId}`;
            const response = await axios.get(url, { 
                headers: { 'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}` },
                timeout: 10000 // 10秒 timeout 防止卡死
            });
            memoryCache.set(cacheKey, response.data, 300);
            return response.data;
        } catch (error) {
            if (!error.response || error.response.status !== 404) {
                logger.error(`[LINE] Failed to get member profile`, { groupId, userId, error: error.message });
            }
            return { displayName: '成員', pictureUrl: null };
        }
    };

    if (cacheResult) {
        if (!cacheResult.isStale) return cacheResult.value;
        // Background refresh
        fetchProfile();
        return cacheResult.value;
    }

    return await fetchProfile();
}

/**
 * 取得群組/房間成員名稱
 */
async function getGroupMemberName(groupId, userId) {
    let profile = null;
    if (groupId) {
        profile = await getGroupMemberProfile(groupId, userId);
        // 如果群組 API 失敗 (回傳 '成員')，嘗試使用個人 API
        if (profile && profile.displayName === '成員') {
            const fallbackProfile = await getProfile(userId);
            if (fallbackProfile && fallbackProfile.displayName !== '冒險者') {
                profile = fallbackProfile;
            }
        }
    } else {
        profile = await getProfile(userId);
    }
    let displayName = (profile && profile.displayName) ? profile.displayName : '成員';
    return displayName;
}

/**
 * 取得使用者個人資料 (Bot 個人頻道內的稱呼)
 * 注意：只有加機器人好友的使用者才能抓取到資料
 */
async function getProfile(userId) {
    let profile = { displayName: '冒險者' };
    
    const cacheKey = `profile:user:${userId}`;
    const cacheResult = memoryCache.get(cacheKey, true);
    
    const fetchProfile = async () => {
        try {
            const url = `https://api.line.me/v2/bot/profile/${userId}`;
            const response = await axios.get(url, { 
                headers: { 'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}` },
                timeout: 10000 // 10秒 timeout 防止卡死
            });
            return response.data;
        } catch (error) {
            logger.error(`[LINE] Failed to get user profile`, { userId, error: error.message });
            return { displayName: '冒險者' };
        }
    };

    if (cacheResult) {
        if (!cacheResult.isStale) return cacheResult.value;
        
        // Background refresh
        (async () => {
            const newProfile = await fetchProfile();
            try {
                const atonementHandler = require('../handlers/atonement');
                if (await atonementHandler.checkDevilContract(userId)) {
                    newProfile.displayName = (newProfile.displayName || '冒險者') + '(出賣靈魂的賭狗)';
                }
            } catch (e) {}
            memoryCache.set(cacheKey, newProfile, 300);
        })();
        
        return cacheResult.value;
    }

    profile = await fetchProfile();

    try {
        const atonementHandler = require('../handlers/atonement');
        if (await atonementHandler.checkDevilContract(userId)) {
            profile.displayName = (profile.displayName || '冒險者') + '(出賣靈魂的賭狗)';
        }
    } catch (error) {
        logger.error('[LINE] Failed to append devil contract title to profile', error);
    }
    
    memoryCache.set(cacheKey, profile, 300); // 5分鐘 TTL
    return profile;
}

/**
 * 主動推播訊息到 LINE
 */
async function pushMessage(to, messages) {
    logger.error('[LINE] pushMessage is FORBIDDEN. Please use notificationService.queueNotification instead.');
    throw new Error('嚴禁使用 LINE 的 pushMessage API，請使用被動回覆機制');
}

/**
 * 主動推播 Flex 訊息
 */
async function pushFlex(to, alt, flex) {
    await pushMessage(to, [{ type: 'flex', altText: alt, contents: flex }]);
}

/**
 * 顯示載入動畫（LINE Messaging API 2024新功能）
 * 只支援一對一聊天，群組聊天會自動忽略
 * 
 * @param {string} userId - 用戶 ID
 * @param {number} seconds - 載入秒數 (5-60秒)
 */
async function showLoadingAnimation(userId, seconds = 10) {
    if (!userId) return;

    // 限制秒數範圍
    if (seconds < 5) seconds = 5;
    if (seconds > 60) seconds = 60;

    try {
        await axios.post(
            'https://api.line.me/v2/bot/chat/loading/start',
            {
                chatId: userId,
                loadingSeconds: seconds
            },
            {
                headers: {
                    'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        logger.debug(`[Loading] Animation shown for ${seconds}s`);
    } catch (error) {
        // 載入動畫失敗不影響主功能，只記錄警告
        logger.warn('[Loading] Failed to show animation', {
            error: error.message
        });
    }
}

module.exports = {
    replyToLine,
    replyText,
    replyFlex,
    getGroupMemberName,
    getGroupMemberProfile,
    pushMessage,
    pushFlex,
    showLoadingAnimation,
    getProfile, // Export new function
    addPendingMessage,
    flushPendingMessages,
    registerReplyToken
};
