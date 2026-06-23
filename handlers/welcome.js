const { db, Firestore } = require('../utils/db');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const logger = require('../utils/logger');

// Default Configuration
const DEFAULT_WELCOME_IMAGE = 'https://lh3.googleusercontent.com/d/1tr-E-LWk8RGysi2QS4yaT2krh_usjFNc';
const DEFAULT_WELCOME_TEXT = '歡迎加入我們！請先查看記事本的版規喔～';

const WELCOME_IMAGES = [
    'https://lh3.googleusercontent.com/d/1tr-E-LWk8RGysi2QS4yaT2krh_usjFNc',
    'https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?fit=crop&w=1000&q=80&fm=jpg',
    'https://images.unsplash.com/photo-1511632765486-a01980e01a18?fit=crop&w=1000&q=80&fm=jpg',
    'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?fit=crop&w=1000&q=80&fm=jpg'
];

/**
 * 驗證圖片 URL 是否有效
 */
function isValidImageUrl(url) {
    if (!url || typeof url !== 'string') return false;

    // 必須是 HTTPS（LINE 要求）
    if (!url.startsWith('https://')) return false;

    // 基本長度檢查
    if (url.length > 2000) return false;

    // 檢查是否為圖片檔案（常見格式）或已知圖床
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const knownHosts = ['unsplash.com', 'imgur.com', 'googleusercontent.com', 'placeholder.com', 'dummyimage.com'];

    const hasImageExt = imageExtensions.some(ext => url.toLowerCase().includes(ext));
    const hasKnownHost = knownHosts.some(host => url.includes(host));
    const hasQueryParam = url.includes('?'); // Query 參數通常表示動態圖片

    return hasImageExt || hasKnownHost || hasQueryParam;
}

/**
 * 取得群組歡迎設定
 */
async function getWelcomeConfig(groupId) {
    try {
        const doc = await db.collection('groups').doc(groupId).get();
        if (!doc.exists) return null;
        return doc.data().welcomeConfig || null;
    } catch (error) {
        console.error('Error fetching welcome config:', error);
        return null;
    }
}

/**
 * 設定歡迎詞
 */
async function setWelcomeText(groupId, text, userId) {
    if (!text) return { success: false, message: '❌ 請輸入歡迎詞內容' };

    // 使用 Dot Notation 更新，避免 MongoDB $set 將整個 welcomeConfig 覆寫而遺失圖片
    await db.collection('groups').doc(groupId).set({
        'welcomeConfig.text': text,
        'welcomeConfig.updatedAt': Firestore.FieldValue.serverTimestamp(),
        'welcomeConfig.updatedBy': userId
    }, { merge: true });

    return { success: true, message: '✅ 歡迎詞已更新！' };
}

/**
 * 將像素寬高轉換為 LINE 支援的標準比例
 * LINE 支援：20:13, 1:1, 3:4, 9:16, 1:2 等
 */
function normalizeAspectRatio(rawRatio) {
    if (!rawRatio || typeof rawRatio !== 'string') return '20:13';
    const parts = rawRatio.split(':');
    if (parts.length !== 2) return '20:13';
    const w = parseInt(parts[0], 10);
    const h = parseInt(parts[1], 10);
    if (!w || !h) return '20:13';
    const ratio = w / h;
    // 映射到最接近的 LINE 標準比例
    if (ratio >= 2.0)  return '20:9';   // 橫寬圖
    if (ratio >= 1.5)  return '20:13';  // 16:9 類似橫屏
    if (ratio >= 1.1)  return '4:3';    // 一般橫屏
    if (ratio >= 0.9)  return '1:1';    // 正方
    if (ratio >= 0.7)  return '3:4';    // 輕度直屏
    if (ratio >= 0.5)  return '9:16';   // 奇携直屏
    return '1:2';                        // 極長直屏
}

/**
 * 設定歡迎圖(僅支援上傳圖片)
 */
async function setWelcomeImage(groupId, url, userId, aspectRatio = '1:1') {
    // URL Check
    if (!url.startsWith('http')) {
        return { success: false, message: '❌ 請輸入有效的圖片網址 (http/https)' };
    }

    try {
        // 使用 Dot Notation 更新，避免覆寫歡迎詞
        await db.collection('groups').doc(groupId).set({
            'welcomeConfig.imageUrl': url,
            'welcomeConfig.aspectRatio': aspectRatio,
            'welcomeConfig.updatedAt': Firestore.FieldValue.serverTimestamp(),
            'welcomeConfig.updatedBy': userId
        }, { merge: true });

        return { success: true, message: '✅ 歡迎圖已更新!' };
    } catch (error) {
        logger.error('[Welcome] Failed to set welcome image:', {
            groupId,
            error: error.message
        });
        return { success: false, message: '❌ 更新失敗,請稍後再試' };
    }
}

/**
 * 建構歡迎 Flex Message
 */
async function buildWelcomeFlex(memberProfile, config) {
    const displayName = memberProfile.displayName || '新朋友';
    // Use via.placeholder.com for better compatibility
    let pictureUrl = memberProfile.pictureUrl || 'https://via.placeholder.com/200x200/cccccc/ffffff.png?text=User';

    const welcomeText = (config?.text || DEFAULT_WELCOME_TEXT).replace('{user}', displayName);
    let heroUrl = config?.imageUrl || DEFAULT_WELCOME_IMAGE;
    // 將原始的像素寬高比例轉換為 LINE 支援的標準比例
    const heroAspectRatio = normalizeAspectRatio(config?.aspectRatio);

    // ✅ 更加安全的 Hero URL 替換與驗證
    if (heroUrl && heroUrl.includes('/public/')) {
        const urlParts = heroUrl.split('/public/');
        if (urlParts.length === 2) {
            let baseUrl = process.env.BASE_URL || '';
            if (baseUrl && !baseUrl.startsWith('https://')) {
                // 自動將 http 升級為 https (滿足 LINE 要求)
                if (baseUrl.startsWith('http://')) {
                    baseUrl = baseUrl.replace('http://', 'https://');
                } else {
                    baseUrl = `https://${baseUrl}`;
                }
            }
            
            // 本地開發與空 baseUrl 防禦性 Fallback，避免傳送無效 URL 給 LINE 導致破圖
            if (!baseUrl || baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')) {
                logger.warn(`[Welcome] Local base URL detected or missing. Falling back to default welcome image.`);
                heroUrl = DEFAULT_WELCOME_IMAGE;
            } else {
                heroUrl = `${baseUrl}/public/${urlParts[1]}`;
            }
        }
    }

    // ✅ 嚴格驗證 Hero URL 與快取處理
    if (!isValidImageUrl(heroUrl)) {
        logger.warn(`[Welcome] Invalid hero URL: ${heroUrl}, using default`);
        heroUrl = DEFAULT_WELCOME_IMAGE;
    } else {
        // 加上時間戳以避免 LINE 快取 (如果 URL 已經有參數則用 &，否則用 ?)
        const separator = heroUrl.includes('?') ? '&' : '?';
        heroUrl = `${heroUrl}${separator}_t=${Date.now()}`;
    }

    // ✅ 驗證 Profile Picture URL
    if (!isValidImageUrl(pictureUrl)) {
        logger.warn(`[Welcome] Invalid profile picture URL, using placeholder`);
        pictureUrl = 'https://via.placeholder.com/200x200/cccccc/ffffff.png?text=User';
    }

    return flexUtils.createBubble({
        size: 'kilo',
        hero: {
            type: "image",
            url: heroUrl,
            size: "full",
            aspectRatio: heroAspectRatio,
            aspectMode: "cover"
        },
        body: {
            type: "box",
            layout: "vertical",
            contents: [
                {
                    type: "box",
                    layout: "horizontal",
                    contents: [
                        {
                            type: "box",
                            layout: "vertical",
                            contents: [
                                {
                                    type: "image",
                                    url: pictureUrl,
                                    size: "40px",
                                    aspectMode: "cover",
                                    aspectRatio: "1:1",
                                    flex: 0
                                }
                            ],
                            cornerRadius: "xxl",
                            width: "40px",
                            height: "40px",
                            flex: 0
                        },
                        {
                            type: "box",
                            layout: "vertical",
                            contents: [
                                { type: 'text', text: `Hi, ${displayName}`, weight: 'bold', size: 'md', color: flexUtils.COLORS.TEXT_MAIN, wrap: true },
                                { type: 'text', text: welcomeText, size: 'xs', color: flexUtils.COLORS.TEXT_SUB, margin: 'xs', wrap: true }
                            ],
                            margin: "md",
                            flex: 1
                        }
                    ],
                    alignItems: "center"
                }
            ],
            paddingAll: "12px",
            backgroundColor: flexUtils.COLORS.BG_CARD
        }
    });
}

const dedup = require('../utils/dedup');

/**
 * 處理成員加入事件
 */
async function handleMemberJoined(event) {
    const { replyToken, source, webhookEventId, timestamp } = event;

    // Safety check for source
    if (!source || !source.groupId) {
        logger.warn('[Welcome] Event missing source or groupId', { event });
        return;
    }
    const { groupId } = source;

    // 取得新成員資訊
    const newMembers = event.joined?.members || [];
    if (newMembers.length === 0) return;

    const firstUserId = newMembers[0].userId || 'unknown';
    
    // 1. Deduplication (Critical for avoiding double welcome)
    // 利用 webhookEventId 或組合鍵，並將時間戳四捨五入到 10 秒級別，防止 LINE 重試蹯版
    const timeWindow = Math.floor((timestamp || Date.now()) / 10000); // 10 秒時間窗口
    const deduplicationId = webhookEventId || `join_${groupId}_${firstUserId}_${timeWindow}`;

    const isLockAcquired = await dedup.acquireLock(deduplicationId);
    if (!isLockAcquired) {
        logger.warn(`[Welcome] Duplicate event ignored: ${deduplicationId}`);
        return;
    }

    logger.info(`[Welcome] Member joined event detected in group: ${groupId}`);
    logger.info(`[Welcome] Processing ${newMembers.length} new members`);

    try {
        // Fetch group config once
        const config = await getWelcomeConfig(groupId);
        logger.debug(`[Welcome] Config for ${groupId}:`, config);

        // Check if enabled
        if (config && config.enabled === false) {
            logger.info(`[Welcome] Welcome message disabled for group ${groupId}`);
            return;
        }

        // Optimize: Fetch all profiles in parallel
        // 之前的 `for ... await` 是序列執行，若成員多或 API 慢會導致逾時重試
        const bubblePromises = newMembers.map(async (member) => {
            try {
                let profile = { displayName: '新成員' };
                if (member.userId) {
                    try {
                        profile = await lineUtils.getGroupMemberProfile(groupId, member.userId);
                    } catch (e) {
                        logger.warn(`[Welcome] Failed to fetch profile for user ${member.userId}: ${e.message}`);
                    }
                }
                return buildWelcomeFlex(profile, config);
            } catch (e) {
                logger.error('[Welcome] Error building welcome bubble:', e);
                return null;
            }
        });

        const results = await Promise.all(bubblePromises);
        const bubbles = results.filter(b => b !== null);


        if (bubbles.length > 0) {
            logger.info(`[Welcome] Sending ${bubbles.length} welcome bubbles`);
            if (bubbles.length === 1) {
                try {
                    const flex = bubbles[0];

                    // ✅ 嚴格驗證 Flex 結構
                    if (!flex || !flex.type || flex.type !== 'bubble') {
                        throw new Error('Invalid Flex structure: not a bubble');
                    }

                    await lineUtils.replyFlex(replyToken, '歡迎新成員！', flex);
                    logger.info('[Welcome] Single Flex message sent successfully');
                } catch (flexError) {
                    logger.error('[Welcome] Flex reply failed:', {
                        error: flexError.message,
                        stack: flexError.stack?.substring(0, 200),
                        flexPreview: JSON.stringify(bubbles[0]).substring(0, 300)
                    });

                    // ✅ 降級策略 1：發送歡迎圖 + 文字
                    try {
                        const profile = newMembers[0].userId
                            ? await lineUtils.getGroupMemberProfile(groupId, newMembers[0].userId).catch(() => ({ displayName: '新朋友' }))
                            : { displayName: '新朋友' };

                        const welcomeText = (config?.text || DEFAULT_WELCOME_TEXT).replace('{user}', profile.displayName || '新朋友');

                        // 選擇圖片
                        let heroUrl = config?.imageUrl || DEFAULT_WELCOME_IMAGE;
                        if (heroUrl === 'RANDOM') {
                            heroUrl = WELCOME_IMAGES[Math.floor(Math.random() * WELCOME_IMAGES.length)];
                        }
                        if (!isValidImageUrl(heroUrl)) {
                            heroUrl = DEFAULT_WELCOME_IMAGE;
                        }

                        await lineUtils.replyToLine(replyToken, [
                            { type: 'image', originalContentUrl: heroUrl, previewImageUrl: heroUrl },
                            { type: 'text', text: `🌟 ${welcomeText}` }
                        ]);

                        logger.info('[Welcome] Fallback to image + text succeeded');
                    } catch (fallbackError) {
                        logger.error('[Welcome] Fallback also failed:', fallbackError);
                        // ✅ 最終降級：純文字
                        const simpleText = (config?.text || DEFAULT_WELCOME_TEXT).replace('{user}', '新朋友');
                        await lineUtils.replyText(replyToken, `🌟 ${simpleText}`);
                        logger.info('[Welcome] Final fallback to text succeeded');
                    }
                }
            } else {
                try {
                    await lineUtils.replyFlex(replyToken, '歡迎新成員！', { type: 'carousel', contents: bubbles });
                } catch (carouselError) {
                    logger.warn('[Welcome] Carousel reply failed', carouselError);
                    await lineUtils.replyText(replyToken, '歡迎新成員加入！');
                }
            }
            logger.info('[Welcome] Message sent successfully');
        } else {
            logger.warn('[Welcome] No bubbles generated');
        }
    } catch (error) {
        logger.error('[Welcome] Critical error in handleMemberJoined:', error);
    }
}

/**
 * 發送測試歡迎訊息
 */
async function sendTestWelcome(replyToken, groupId, userId) {
    try {
        const config = await getWelcomeConfig(groupId);
        logger.info(`[Welcome] Test config loaded for group ${groupId}:`, config);

        // 嘗試獲取用戶資料，失敗則使用預設值
        let profile = {
            displayName: '測試用戶',
            pictureUrl: 'https://via.placeholder.com/200x200/cccccc/ffffff.png?text=User'
        };

        try {
            profile = await lineUtils.getGroupMemberProfile(groupId, userId);
            logger.info(`[Welcome] Got user profile: ${profile.displayName}`);
        } catch (error) {
            logger.warn('[Welcome] Failed to get user profile, using fallback:', error.message);
        }

        logger.info('[Welcome] Building test welcome flex...');
        const bubble = await buildWelcomeFlex(profile, config);

        logger.info('[Welcome] Sending test welcome flex...');
        logger.info('[Welcome] Flex JSON:', JSON.stringify(bubble, null, 2));
        await lineUtils.replyFlex(replyToken, '測試歡迎卡', bubble);

        logger.info('[Welcome] Test welcome sent successfully');
    } catch (error) {
        logger.error('[Welcome] Test welcome error:', {
            error: error.message,
            stack: error.stack?.substring(0, 500),
            response: error.response?.data
        });
        // Token 已消耗，不再嘗試回覆
        throw error;
    }
}

module.exports = {
    setWelcomeText,
    setWelcomeImage,
    handleMemberJoined,
    sendTestWelcome
};
