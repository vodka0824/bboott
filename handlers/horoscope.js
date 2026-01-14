const axios = require('axios');
const lineUtils = require('../utils/line');
const { db } = require('../utils/firestore');
const memoryCache = require('../utils/memoryCache');
const CosmoCrawler = require('../utils/cosmo_crawler_puppeteer'); // Use Puppeteer Version

// Helper to get Taiwan Date (YYYY-MM-DD)
function getTaiwanDate() {
    const d = new Date();
    d.setUTCHours(d.getUTCHours() + 8);
    return d.toISOString().split('T')[0];
}

// Reverse Mapping for display
const INDEX_TO_NAME = [
    '牡羊座', '金牛座', '雙子座', '巨蟹座', '獅子座', '處女座',
    '天秤座', '天蠍座', '射手座', '摩羯座', '水瓶座', '雙魚座'
];

/**
 * Get Horoscope (Memory Cache + Puppeteer Crawler)
 */
async function getHoroscope(signName, type = 'daily') {
    const TODAY_KEY = getTaiwanDate();
    const cacheKey = `horoscope_${signName}_${type}_${TODAY_KEY}`;

    // 1. Memory Cache
    const memCached = memoryCache.get(cacheKey);
    if (memCached && memCached.name) {
        console.log(`[Horoscope] Memory Cache HIT: ${cacheKey}`);
        return memCached;
    }

    // 2. Real-time Crawl (Cosmo with Puppeteer)
    console.log(`[Horoscope] Cache MISS, crawling with Puppeteer: ${cacheKey}`);
    try {
        const data = await CosmoCrawler.fetchSignData(signName);

        if (!data || !data.name) {
            throw new Error('Crawled data is invalid');
        }

        // Add date/type for Flex builder
        data.date = TODAY_KEY;
        data.type = type;

        // Cache 12 hours (Puppeteer is distinctively slow, caching is crucial)
        memoryCache.set(cacheKey, data, 43200);
        console.log(`[Horoscope] Cached to Memory: ${cacheKey}`);

        return data;
    } catch (crawlError) {
        console.error(`[Horoscope] Crawl failed for ${signName}:`, crawlError.message);
        throw new Error(`無法取得 ${signName} 的運勢資料`);
    }
}

/**
 * Prefetch All (Optimized for Puppeteer)
 * Puppeteer is heavy, so we process strictly sequentially to avoid OOM
 */
async function prefetchAll(type = 'daily') {
    const results = { success: 0, failed: 0 };
    console.log(`[Prefetch] Starting Puppeteer fetch for 12 signs...`);

    // Warm up Hub Link Cache first
    try {
        await getHoroscope('牡羊座');
    } catch (e) {
        console.warn('[Prefetch] Warmup failed, continuing...');
    }

    // Sequential Loop
    for (const signName of INDEX_TO_NAME) {
        try {
            console.log(`[Prefetch] Processing ${signName}...`);
            await getHoroscope(signName); // This will cache it
            results.success++;
            // Small delay to let browser breathe
            await new Promise(r => setTimeout(r, 1000));
        } catch (e) {
            console.error(`[Prefetch] Failed ${signName}: ${e.message}`);
            results.failed++;
        }
    }

    // Explicitly close browser after batch job to free memory
    await CosmoCrawler.closeBrowser();

    console.log(`[Prefetch] Done. Success: ${results.success}, Failed: ${results.failed}`);
    return results;
}

/**
 * Build Horoscope Flex Message (Rich Version)
 */
function buildHoroscopeFlex(data, type = 'daily') {
    const flexUtils = require('../utils/flex');
    const { COLORS } = flexUtils;

    // Helper to generate stars
    const createStars = (count) => {
        const stars = [];
        for (let i = 0; i < 5; i++) {
            stars.push({
                type: 'icon',
                url: i < count ? 'https://scdn.line-apps.com/n/channel_devcenter/img/fx/review_gold_star_28.png' : 'https://scdn.line-apps.com/n/channel_devcenter/img/fx/review_gray_star_28.png',
                size: 'xs'
            });
        }
        return stars;
    };

    const bodyContents = [];

    // 1. Main Short Comment
    if (data.content) {
        bodyContents.push(flexUtils.createBox('vertical', [
            flexUtils.createText({
                text: data.content,
                size: 'sm',
                color: COLORS.DARK_GRAY,
                wrap: true,
                lineSpacing: '5px'
            })
        ], {
            backgroundColor: COLORS.LIGHT_GRAY,
            cornerRadius: '8px',
            paddingAll: '12px',
            margin: 'md'
        }));
    }

    // 2. Lucky Grid (Now with Color and Direction!)
    const luckyRows = [];

    // Row 1: Number & Color
    luckyRows.push(flexUtils.createBox('horizontal', [
        flexUtils.createText({ text: `🔢 數字: ${data.luckyNumber || '-'}`, size: 'xs', color: COLORS.WARNING, flex: 1 }),
        flexUtils.createText({ text: `🎨 顏色: ${data.luckyColor || '-'}`, size: 'xs', color: COLORS.PRIMARY, flex: 1 })
    ], { margin: 'sm' }));

    // Row 2: Time & Sign
    luckyRows.push(flexUtils.createBox('horizontal', [
        flexUtils.createText({ text: `⏰ 吉時: ${data.luckyTime || '-'}`, size: 'xs', color: '#C2185B', flex: 1 }),
        flexUtils.createText({ text: `✨ 星座: ${data.luckySign || '-'}`, size: 'xs', color: '#7B1FA2', flex: 1 })
    ], { margin: 'sm' }));

    // Row 3: Direction (if available)
    if (data.luckyDirection) {
        luckyRows.push(flexUtils.createBox('horizontal', [
            flexUtils.createText({ text: `🧭 方位: ${data.luckyDirection}`, size: 'xs', color: COLORS.SUCCESS, flex: 1 })
        ], { margin: 'sm' }));
    }

    bodyContents.push(flexUtils.createSeparator('md'));
    bodyContents.push(flexUtils.createText({ text: '運勢指標', size: 'xs', weight: 'bold', color: '#999999', margin: 'md' }));
    bodyContents.push(flexUtils.createBox('vertical', luckyRows, { margin: 'sm' }));

    // 3. Star Ratings (Restored!)
    if (data.stars && Object.keys(data.stars).length > 0) {
        bodyContents.push(flexUtils.createSeparator('md'));

        const starBox = [];
        const map = [
            { key: 'overall', label: '整體' },
            { key: 'love', label: '愛情' },
            { key: 'career', label: '事業' },
            { key: 'wealth', label: '財運' }
        ];

        map.forEach(m => {
            if (data.stars[m.key] !== undefined) {
                // Flatten structure: Baseline Box containing [Label, ...Stars]
                // This avoids invalid nesting and ensures proper alignment
                const stars = createStars(data.stars[m.key]);

                // Add margin to the first star for spacing
                if (stars.length > 0) {
                    stars[0].margin = 'md';
                }

                starBox.push(flexUtils.createBox('horizontal', [
                    // Label wrapped in a Box to allow fixed width
                    flexUtils.createBox('vertical', [
                        flexUtils.createText({ text: m.label, size: 'xs', color: '#555555' })
                    ], { width: '40px', flex: 0 }),
                    ...stars
                ], { margin: 'xs', alignItems: 'center' }));
            }
        });

        if (starBox.length > 0) {
            bodyContents.push(flexUtils.createBox('vertical', starBox, { margin: 'md' }));
        }
    }

    // Footer
    bodyContents.push(flexUtils.createSeparator('lg'));
    bodyContents.push(flexUtils.createBox('horizontal', [
        flexUtils.createText({ text: 'Source: Cosmopolitan (TW)', size: 'xxs', color: '#CCCCCC', align: 'end' })
    ], { margin: 'sm' }));

    const HOROSCOPE_COLOR = '#D81B60';
    const header = flexUtils.createHeader(`🔮 ${data.name} 今日運勢`, data.date, HOROSCOPE_COLOR);
    return flexUtils.createBubble({ size: 'mega', header: header, body: flexUtils.createBox('vertical', bodyContents, { paddingAll: '15px' }) });
}

/**
 * Handle Horoscope Command
 */
async function handleHoroscope(replyToken, signName, type = 'daily', userId, groupId) {
    try {
        const data = await getHoroscope(signName, type);

        if (!data) {
            await lineUtils.replyText(replyToken, '❌ 找不到此星座，請輸入正確的星座名稱');
            return;
        }

        const flex = buildHoroscopeFlex(data, type);
        const altText = `🔮 ${data.name}今日運勢`;
        await lineUtils.replyFlex(replyToken, altText, flex);

        if (groupId) {
            const leaderboardHandler = require('./leaderboard');
            leaderboardHandler.recordMessage(groupId, userId).catch(() => { });
        }
    } catch (error) {
        console.error('[Horoscope] Error:', error);
        await lineUtils.replyText(replyToken, '❌ 運勢查詢失敗，請稍後再試');
    }
}

module.exports = {
    handleHoroscope,
    prefetchAll,
    getHoroscope,
    buildHoroscopeFlex
};
