/**
 * 統一錯誤處理模組
 * 
 * 安全原則：
 * - 使用者只看到通用的友善訊息，不暴露任何技術細節
 * - 完整的錯誤堆疊只推送給管理員私訊，以及寫入伺服器日誌
 */
const { ADMIN_USER_ID } = require('../config/constants');
const lineUtils = require('./line');
const logger = require('./logger');
const notificationService = require('../services/notificationService');

/**
 * 處理錯誤
 * @param {Error} error 錯誤物件
 * @param {Object} context 上下文 (包含 replyToken, groupId, userId, etc.)
 */
async function handleError(error, context) {
    // 1. 記錄完整錯誤到伺服器日誌（僅後端可見）
    logger.error('[System Error]', {
        message: error.message,
        stack: error.stack,
        context: {
            userId: context?.userId,
            groupId: context?.groupId,
            command: context?.message
        }
    });

    const { replyToken, groupId, userId, message } = context || {};

    // 2. 建構詳細錯誤回報訊息
    let detailMessage = {
        type: 'text'
    };

    const errorLocation = error.stack ? error.stack.split('\n')[1]?.trim() : 'N/A';
    const reportBody = [
        `🚨 系統錯誤通報`,
        `━━━━━━━━━━━━━`,
        `👤 使用者：${userId || 'Unknown'}`,
        `💬 指令：${message || 'N/A'}`,
        `🔴 錯誤：${error.message}`,
        `📁 位置：${errorLocation}`
    ].join('\n');

    // 如果是群組，且設定了管理員 ID，則加上 TAG
    if (ADMIN_USER_ID && groupId) {
        const tagText = '@管理員 ';
        detailMessage.text = tagText + reportBody;
        detailMessage.mention = {
            mentionees: [
                {
                    index: 0,
                    length: tagText.length,
                    userId: ADMIN_USER_ID
                }
            ]
        };
    } else {
        detailMessage.text = reportBody;
    }

    // 3. 發送錯誤通報（優先使用 replyToken 回覆，若失敗或沒有則使用 pushMessage）
    // 如果錯誤本身就是來自 LINE API 的 400 (Invalid reply token) 或 429 (Rate Limit)，
    // 代表推播也會失敗或造成二次困擾，因此直接跳過推播
    const isLineApiError = error.message && (error.message.includes('400') || error.message.includes('429') || error.message.includes('Invalid reply token'));

    if (isLineApiError) {
        logger.warn('[ErrorHandler] 錯誤為 LINE API 限制或 Token 失效，放棄向使用者傳送錯誤通知');
        return;
    }

    if (replyToken) {
        try {
            await lineUtils.replyToLine(replyToken, [detailMessage]);
        } catch (replyError) {
            logger.error('[ErrorHandler] Reply failed, attempting queue to group/user', { error: replyError.message });
            // 回覆失敗（例如 replyToken 已過期），改用佇列推播
            if (groupId) {
                notificationService.queueNotification(groupId, [detailMessage]);
            } else if (userId) {
                notificationService.queueNotification(userId, [detailMessage]);
            }
        }
    } else {
        // 沒有 replyToken，直接使用佇列推播
        if (groupId) {
            notificationService.queueNotification(groupId, [detailMessage]);
        } else if (userId) {
            notificationService.queueNotification(userId, [detailMessage]);
        }
    }
}

module.exports = {
    handleError
};
