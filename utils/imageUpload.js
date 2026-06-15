const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sizeOf = require('image-size');
const logger = require('./logger');

const LINE_CONTENT_API = 'https://api-data.line.me/v2/bot/message';

/**
 * 從 LINE 下載圖片
 */
async function downloadImageFromLine(messageId, lineToken) {
    const url = `${LINE_CONTENT_API}/${messageId}/content`;
    const response = await axios.get(url, {
        headers: {
            'Authorization': `Bearer ${lineToken}`
        },
        responseType: 'arraybuffer',
        timeout: 30000
    });

    return Buffer.from(response.data);
}

/**
 * 儲存圖片，並回傳可存取的公開 URL (改用公開圖床 Catbox 避免 ngrok 攔截)
 */
async function uploadToStorage(buffer, destination) {
    try {
        const FormData = require('form-data');
        const form = new FormData();
        form.append('reqtype', 'fileupload');
        form.append('fileToUpload', buffer, { filename: 'welcome_image.jpg', contentType: 'image/jpeg' });

        const response = await axios.post('https://catbox.moe/user/api.php', form, {
            headers: form.getHeaders(),
            timeout: 30000
        });
        
        const publicUrl = response.data;
        logger.info(`[ImageUpload] Successfully uploaded to Catbox: ${publicUrl}`);
        return publicUrl;
    } catch (error) {
        logger.error('[ImageUpload] Upload error:', error);
        throw error;
    }
}

/**
 * 處理歡迎圖片上傳
 */
async function processWelcomeImage(messageId, groupId, lineToken) {
    try {
        logger.info(`[ImageUpload] Processing welcome image for group ${groupId} (Local)`);

        const imageBuffer = await downloadImageFromLine(messageId, lineToken);

        const MAX_SIZE = 10 * 1024 * 1024;
        if (imageBuffer.length > MAX_SIZE) {
            return { success: false, error: '圖片檔案過大（最大 10MB）' };
        }

        const currentPath = `welcome-images/${groupId}/current.jpg`;

        let aspectRatio = '1:1';
        try {
            const dimensions = sizeOf(imageBuffer);
            if (dimensions && dimensions.width && dimensions.height) {
                aspectRatio = `${Math.round(dimensions.width)}:${Math.round(dimensions.height)}`;
            }
        } catch (e) {
            logger.warn('[ImageUpload] Failed to calculate aspect ratio', e);
        }

        const publicUrl = await uploadToStorage(imageBuffer, currentPath);

        logger.info(`[ImageUpload] Successfully uploaded locally: ${publicUrl}`);
        return { success: true, url: publicUrl, aspectRatio: aspectRatio };
    } catch (error) {
        logger.error('[ImageUpload] Error', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    processWelcomeImage,
    downloadImageFromLine,
    uploadToStorage
};
