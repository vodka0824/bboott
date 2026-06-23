const flexUtils = require('../utils/flex');
/**
 * 爬蟲功能模組
 */
const axios = require('axios');
const cheerio = require('cheerio');
const OpenCC = require('opencc-js');
const memoryCache = require('../utils/memoryCache');
const { CRAWLER_URLS } = require('../config/constants');

// 簡體轉繁體
const converter = OpenCC.Converter({ from: 'cn', to: 'tw' });
const s2tw = (text) => converter(text);

// === 油價查詢 (Flex Message 版) ===
async function crawlOilPrice() {
    const cacheKey = 'crawler_oil';
    const cached = memoryCache.get(cacheKey);
    if (cached) return cached;

    try {
        const res = await axios.get(CRAWLER_URLS.OIL_PRICE, { timeout: 10000 });
        const $ = cheerio.load(res.data);

        // 所有價格都在 #cpc li 裡面，前4個是中油，後4個是台塑
        const allPrices = [];
        $('#cpc li').each((i, el) => {
            const text = $(el).text().trim();
            const match = text.match(/^(\d{2}|柴油)[油價]*[:：]?\s*([\d.]+)/);
            if (match) {
                allPrices.push({
                    type: match[1],
                    price: parseFloat(match[2])
                });
            }
        });

        const cpcPrices = {};
        const fpcPrices = {};

        allPrices.slice(0, 4).forEach(p => {
            cpcPrices[p.type] = p.price;
        });
        allPrices.slice(4, 8).forEach(p => {
            fpcPrices[p.type] = p.price;
        });

        // 解析調價預測
        const predictionText = $('#gas-price').text().trim();
        const predMatch = predictionText.match(/([漲跌])\s*([\d.]+)/);
        const prediction = predMatch ? {
            direction: predMatch[1],
            amount: parseFloat(predMatch[2])
        } : null;

        const forecastRaw = $('#gas-price').text().replace(/\s+/g, ' ').trim();

        const result = {
            cpc: cpcPrices,
            fpc: fpcPrices,
            prediction,
            forecast: forecastRaw,
            timestamp: new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })
        };

        memoryCache.set(cacheKey, result, 4 * 60 * 60); // 4 Hours
        return result;
    } catch (error) {
        console.error('油價爬蟲錯誤:', error);
        return null;
    }
}

// 油價 Flex Message 建構
function buildCrawlerOilFlex(data) {
    if (!data) {
        return { type: 'text', text: '❌ 無法取得油價資訊，請稍後再試' };
    }

    const priceRow = (label, cpcPrice, fpcPrice) => ({
        type: "box",
        layout: "horizontal",
        contents: [
            { type: "text", text: label, size: "sm", color: "#555555", flex: 3 },
            { type: "text", text: cpcPrice ? `$${cpcPrice}` : '-', size: "sm", align: "end", flex: 2, weight: "bold" },
            { type: "text", text: fpcPrice ? `$${fpcPrice}` : '-', size: "sm", align: "end", flex: 2, color: flexUtils.COLORS.TEXT_MUTED }
        ],
        margin: "md"
    });

    const isUp = data.prediction?.direction === '漲';
    const isDown = data.prediction?.direction === '跌';
    const trendColor = isUp ? '#FF334B' : (isDown ? '#00B900' : flexUtils.COLORS.TEXT_MUTED);
    const trendIcon = isUp ? '📈' : (isDown ? '📉' : '➖');

    const predText = data.prediction
        ? `${trendIcon} ${data.prediction.direction} ${data.prediction.amount || 0}`
        : '維持不變';

    return {
        type: "bubble",
        size: "kilo",
        header: {
            type: "box",
            layout: "vertical",
            contents: [
                { type: "text", text: "⛽ 本週油價", weight: "bold", size: "xl", color: flexUtils.COLORS.TEXT_MAIN },
                {
                    type: "box",
                    layout: "horizontal",
                    contents: [
                        { type: "text", text: "下週預測", size: "xs", color: flexUtils.COLORS.TEXT_MAIN, flex: 1, gravity: "center" },
                        { type: "text", text: predText, size: "md", color: flexUtils.COLORS.TEXT_MAIN, weight: "bold", flex: 3, gravity: "center", align: "end" }
                    ],
                    margin: "md"
                }
            ],
            backgroundColor: isUp ? "#FF334B" : "#27AE60", // Red background if price rising (Alert), Green if stable/drop
            paddingAll: "20px"
        },
        body: {
            type: "box",
            layout: "vertical",
            contents: [
                // Header
                {
                    type: "box",
                    layout: "horizontal",
                    contents: [
                        { type: "text", text: "油品", size: "xs", color: flexUtils.COLORS.TEXT_SUB, flex: 3 },
                        { type: "text", text: "中油", size: "xs", color: flexUtils.COLORS.TEXT_SUB, align: "end", flex: 2 },
                        { type: "text", text: "台塑", size: "xs", color: flexUtils.COLORS.TEXT_SUB, align: "end", flex: 2 }
                    ]
                },
                { type: "separator", margin: "sm" },
                priceRow("92 無鉛", data.cpc['92'], data.fpc['92']),
                priceRow("95 無鉛", data.cpc['95'], data.fpc['95']),
                priceRow("98 無鉛", data.cpc['98'], data.fpc['98']),
                priceRow("超級柴油", data.cpc['柴油'], data.fpc['柴油'])
            ],
            paddingAll: "20px"
        },
        footer: {
            type: "box",
            layout: "vertical",
            contents: [
                { type: "text", text: data.forecast || '暫無預測資訊', size: "xs", color: flexUtils.COLORS.TEXT_MUTED, wrap: true },
                { type: "text", text: `更新: ${data.timestamp}`, size: "xxs", color: flexUtils.COLORS.TEXT_SUB, align: "end", margin: "sm" }
            ],
            paddingAll: "15px",
            backgroundColor: flexUtils.COLORS.TEXT_SUB
        }
    };
}


// === 近期電影 ===
async function crawlNewMovies() {
    const cacheKey = 'crawler_movies_v2'; // New key for object structure
    const cached = memoryCache.get(cacheKey);
    if (cached) return cached;

    try {
        const res = await axios.get(CRAWLER_URLS.NEW_MOVIE);
        const $ = cheerio.load(res.data);

        const movies = [];
        // Try to get images if possible. Structure might vary.
        // Assuming structure: article div a ... 
        // NOTE: AtMovies structure is complex. Let's do a best effort or use placeholder.
        // If we can't find image, use a generic "Cinema" icon image.
        const PLACEHOLDER_IMG = 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500&q=80';

        $('article div a').slice(0, 5).each((i, elem) => {
            const title = $(elem).text().trim();
            const link = 'https://www.atmovies.com.tw' + $(elem).attr('href');

            // Try to find image nearby or inside? 
            // In simplified crawl, we might not get it easily.
            // Let's use placeholder for now to ensure robustness, or try to find simple img tag.
            // $(elem).find('img').attr('src') ...

            if (title) {
                movies.push({
                    title,
                    link,
                    img: PLACEHOLDER_IMG // Placeholder for now
                });
            }
        });

        if (movies.length === 0) return null;

        memoryCache.set(cacheKey, movies, 60 * 60); // 1 Hour
        return movies;
    } catch (error) {
        console.error('電影爬蟲錯誤:', error);
        return null;
    }
}

// === 蘋果新聞 ===
async function crawlAppleNews() {
    const cacheKey = 'crawler_apple_v2';
    const cached = memoryCache.get(cacheKey);
    if (cached) return cached;

    try {
        const res = await axios.get(CRAWLER_URLS.APPLE_NEWS);
        const $ = cheerio.load(res.data);

        const news = [];
        const PLACEHOLDER_IMG = 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=500&q=80';

        $('#main-content > div.post-hot.stories-container > article > div > div:nth-child(1) > h3 > a').slice(0, 5).each((i, elem) => {
            const title = $(elem).text().trim();
            let link = $(elem).attr('href');
            if (link && !link.startsWith('http')) {
                link = 'https://tw.nextapple.com' + link;
            }

            // Try to find image in previous sibling or parent? 
            // Often image is in a separate div. 
            // For now, consistent placeholder is better than broken image.

            if (title && link) {
                news.push({ title, link, img: PLACEHOLDER_IMG });
            }
        });

        if (news.length === 0) return null;

        memoryCache.set(cacheKey, news, 10 * 60);
        return news;
    } catch (error) {
        console.error('蘋果新聞爬蟲錯誤:', error);
        return null;
    }
}

// === 科技新聞 ===
async function crawlTechNews() {
    const cacheKey = 'crawler_tech_v2';
    const cached = memoryCache.get(cacheKey);
    if (cached) return cached;

    try {
        const res = await axios.get(CRAWLER_URLS.TECH_NEWS);
        const $ = cheerio.load(res.data);

        const news = [];
        const PLACEHOLDER_IMG = 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=500&q=80';
        const articlePattern = /\/\d{4}\/\d{2}\/\d{2}\/[^/]+\/?$/;

        $('a').each((i, elem) => {
            if (news.length >= 5) return false;

            const href = $(elem).attr('href') || '';
            const title = $(elem).text().trim();

            if (articlePattern.test(href) && title && title.length > 10) {
                let link = href;
                if (!link.startsWith('http')) {
                    link = 'https://technews.tw' + link;
                }
                if (!news.some(n => n.link === link)) {
                    news.push({ title, link, img: PLACEHOLDER_IMG });
                }
            }
        });

        if (news.length === 0) return null;

        memoryCache.set(cacheKey, news, 10 * 60);
        return news;
    } catch (error) {
        console.error('科技新聞爬蟲錯誤:', error);
        return null;
    }
}

// === PTT 熱門廢文 ===
async function crawlPttHot() {
    const cacheKey = 'crawler_ptt_v2';
    const cached = memoryCache.get(cacheKey);
    if (cached) return cached;

    try {
        const res = await axios.get(CRAWLER_URLS.PTT_HOT);
        const $ = cheerio.load(res.data);

        const posts = [];
        const PLACEHOLDER_IMG = 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=500&q=80'; // PTT style

        $('a').each((i, elem) => {
            if (posts.length >= 5) return false;

            const href = $(elem).attr('href') || '';
            const title = $(elem).text().trim();

            if (href.includes('/b/PttHot/') && title && title.length > 5) {
                let link = href;
                if (link.startsWith('/')) {
                    link = 'https://disp.cc' + link;
                }
                if (!posts.some(p => p.link === link)) {
                    posts.push({ title, link, img: PLACEHOLDER_IMG });
                }
            }
        });

        if (posts.length === 0) return null;

        memoryCache.set(cacheKey, posts, 10 * 60); // 10 Mins
        return posts;
    } catch (error) {
        console.error('PTT 熱門爬蟲錯誤:', error);
        return null;
    }
}

// === Generic Content Flex Builder ===
function buildContentCarousel(title, items, fallbackText = '無資料') {
    if (!items || items.length === 0) {
        return { type: 'text', text: fallbackText };
    }

    const bubbles = items.map(item => ({
        type: "bubble",
        size: "kilo",
        hero: {
            type: "image",
            url: item.img,
            size: "full",
            aspectRatio: "20:13",
            aspectMode: "cover",
            action: { type: "uri", uri: item.link }
        },
        body: {
            type: "box",
            layout: "vertical",
            contents: [
                {
                    type: "text",
                    text: item.title,
                    weight: "bold",
                    size: "md",
                    wrap: true,
                    maxLines: 2,
                    action: { type: "uri", uri: item.link }
                },
                {
                    type: "text",
                    text: "點擊閱讀詳情 ➜",
                    size: "xxs",
                    color: "#999999",
                    margin: "md",
                    action: { type: "uri", uri: item.link }
                }
            ],
            paddingAll: "15px"
        }
    }));

    return {
        type: 'carousel',
        contents: bubbles
    };
}

// === 番號推薦 ===
async function getRandomJav() {
    const cacheKey = 'crawler_jav_all';

    // Check Cache first
    let allData = memoryCache.get(cacheKey);

    try {
        if (!allData) {
            const res = await axios.get(CRAWLER_URLS.JAV_RECOMMEND, { timeout: 10000 });
            allData = res.data;
            memoryCache.set(cacheKey, allData, 15 * 60); // 15 Mins
        }

        const items = allData['全部分类'] || [];
        if (items.length === 0) return null;

        const random = items[Math.floor(Math.random() * items.length)];
        return {
            番号: random['番号'] || '-',
            名称: s2tw(random['名称'] || '-'),
            演员: s2tw(random['演员'] || '-'),
            收藏人数: random['收藏人数'] || 0
        };
    } catch (error) {
        console.error('番號推薦錯誤:', error);
        return null;
    }
}

module.exports = {
    crawlOilPrice,
    buildCrawlerOilFlex,
    crawlNewMovies,
    crawlAppleNews,
    crawlTechNews,
    crawlPttHot,
    buildContentCarousel, // Export new builder
    getRandomJav
};
