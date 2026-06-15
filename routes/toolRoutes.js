const rateLimit = require('../utils/rateLimit');
const { KEYWORD_MAP } = require('../config/constants');

module.exports = function (router, handlers) {
    const {
        currencyHandler, todoHandler, restaurantHandler,
        weatherHandler, tcatHandler, crawlerHandler,
        horoscopeHandler, taigiHandler, aiHandler,
        gameHandler, driveHandler, funHandler, leaderboardHandler, lineUtils
    } = handlers;

    // === 即時匯率 ===
    router.register('即時匯率', async (ctx) => {
        await currencyHandler.handleRatesQuery(ctx.replyToken);
    }, { feature: 'currency', needAuth: true, keywords: ['即時匯率'] });

    router.register(/^匯率\s*(\d+\.?\d*)\s*([A-Za-z]{3})$/, async (ctx, match) => {
        await currencyHandler.handleConversion(ctx.replyToken, parseFloat(match[1]), match[2].toUpperCase());
    }, { feature: 'currency', needAuth: true, keywords: ['匯率'] });

    router.register((msg) => Object.keys(currencyHandler.QUICK_COMMANDS).some(key => msg.startsWith(key)), 
    async (ctx, match) => {
        const msg = match[0];
        const key = Object.keys(currencyHandler.QUICK_COMMANDS).find(k => msg.startsWith(k));
        const amount = parseFloat(msg.slice(key.length).trim());
        if (!isNaN(amount) && amount > 0) {
            await currencyHandler.handleConversion(ctx.replyToken, amount, currencyHandler.QUICK_COMMANDS[key]);
        }
    }, { feature: 'currency', needAuth: true });

    router.register(/^買(?!樂透|卷軸|木劍|武卷|防卷|飾品卷|武|防|飾品|武器|盾牌|翅膀|手套|項鍊|裝備)([A-Za-z\u4e00-\u9fa5]+)\s*(\d+)$/, async (ctx, match) => {
        const currencyName = match[1];
        const currencyCode = currencyHandler.QUICK_COMMANDS[currencyName] || currencyName;
        await currencyHandler.handleBuyForeign(ctx.replyToken, Number(match[2]), currencyCode);
    }, { feature: 'currency', needAuth: true, keywords: ['買'] });

    // === 物流與爬蟲 (Delivery & Crawlers) ===
    router.register(/^(?:查詢)?黑貓\s*(\d+)$/, async (ctx, match) => {
        await tcatHandler.handleTcatQuery(ctx.replyToken, match[1]);
    }, { isGroupOnly: true, needAuth: true, feature: 'delivery', keywords: ['黑貓'] });

    router.register('油價', async (ctx) => {
        if (!rateLimit.checkLimit(ctx.userId, 'oil')) {
            await lineUtils.replyText(ctx.replyToken, '⏱️ 油價查詢過於頻繁，請稍後再試');
            return;
        }
        const oilData = await crawlerHandler.crawlOilPrice();
        if (!oilData) {
            await lineUtils.replyText(ctx.replyToken, '❌ 目前無法取得油價資訊');
            return;
        }
        const flex = crawlerHandler.buildCrawlerOilFlex(oilData);
        await lineUtils.replyFlex(ctx.replyToken, '本週油價', flex);
    }, { isGroupOnly: true, needAuth: true, feature: 'oil', keywords: ['油價'] });

    router.register('電影', async (ctx) => {
        if (!rateLimit.checkLimit(ctx.userId, 'movie')) {
            await lineUtils.replyText(ctx.replyToken, '⏱️ 電影查詢過於頻繁，請稍後再試'); return;
        }
        const items = await crawlerHandler.crawlNewMovies();
        if (!items) {
            await lineUtils.replyText(ctx.replyToken, '❌ 目前無法取得電影資訊'); return;
        }
        await lineUtils.replyFlex(ctx.replyToken, '近期上映電影', crawlerHandler.buildContentCarousel('近期電影', items));
    }, { isGroupOnly: true, needAuth: true, feature: 'movie', keywords: ['電影'] });

    router.register('蘋果新聞', async (ctx) => {
        if (!rateLimit.checkLimit(ctx.userId, 'news')) { await lineUtils.replyText(ctx.replyToken, '⏱️ 新聞查詢過於頻繁'); return; }
        const items = await crawlerHandler.crawlAppleNews();
        if (!items) return await lineUtils.replyText(ctx.replyToken, '❌ 目前無法取得新聞');
        await lineUtils.replyFlex(ctx.replyToken, '蘋果即時新聞', crawlerHandler.buildContentCarousel('蘋果新聞', items));
    }, { isGroupOnly: true, needAuth: true, feature: 'news', keywords: ['蘋果新聞'] });

    router.register('科技新聞', async (ctx) => {
        if (!rateLimit.checkLimit(ctx.userId, 'news')) { await lineUtils.replyText(ctx.replyToken, '⏱️ 新聞查詢過於頻繁'); return; }
        const items = await crawlerHandler.crawlTechNews();
        if (!items) return await lineUtils.replyText(ctx.replyToken, '❌ 目前無法取得新聞');
        await lineUtils.replyFlex(ctx.replyToken, '科技新報', crawlerHandler.buildContentCarousel('科技新聞', items));
    }, { isGroupOnly: true, needAuth: true, feature: 'news', keywords: ['科技新聞'] });

    router.register(/^(PTT|PTT熱門|熱門廢文)$/i, async (ctx) => {
        if (!rateLimit.checkLimit(ctx.userId, 'news')) { await lineUtils.replyText(ctx.replyToken, '⏱️ PTT查詢過於頻繁'); return; }
        const items = await crawlerHandler.crawlPttHot();
        if (!items) return await lineUtils.replyText(ctx.replyToken, '❌ 目前無法取得PTT熱門文章');
        await lineUtils.replyFlex(ctx.replyToken, 'PTT熱門', crawlerHandler.buildContentCarousel('PTT熱門', items));
    }, { isGroupOnly: true, needAuth: true, feature: 'news', keywords: ['PTT', '熱門', 'ptt'] });

    // === 天氣與星座 (Weather & Horoscope) ===
    router.register(/^(牡羊|白羊|金牛|雙子|巨蟹|獅子|處女|天秤|天平|天蠍|射手|人馬|摩羯|山羊|水瓶|雙魚)座?\s*(今日|本週|本月)?$/, async (ctx, match) => {
        let sign = match[1] + '座';
        let type = match[2] || '今日';
        let typeMap = { '今日': 'daily', '本週': 'weekly', '本月': 'monthly' };
        await horoscopeHandler.handleHoroscope(ctx.replyToken, sign, typeMap[type], ctx.userId, ctx.groupId);
    }, { isGroupOnly: false, needAuth: true, feature: 'horoscope', keywords: ['羊', '牛', '子', '蟹', '獅', '女', '秤', '平', '蠍', '手', '馬', '羯', '瓶', '魚', '座'] });

    router.register(/^天氣\s+(.+)$/, async (ctx, match) => {
        await weatherHandler.handleWeather(ctx.replyToken, match[1]);
    }, { isGroupOnly: true, needAuth: true, feature: 'weather', keywords: ['天氣'] });

    router.register(/^空氣\s+(.+)$/, async (ctx, match) => {
        await weatherHandler.handleAirQuality(ctx.replyToken, match[1]);
    }, { isGroupOnly: true, needAuth: true, feature: 'weather', keywords: ['空氣'] });

    // === 待辦事項與餐廳 (Todo & Restaurant) ===
    router.register(/^待辦(\s+.*)?$/, async (ctx, match) => {
        await todoHandler.handleTodoCommand(ctx.replyToken, ctx.groupId, ctx.userId, match[0]);
    }, { needAuth: true, feature: 'todo', keywords: ['待辦'] });

    router.register(/^抽(\s+.*)?$/, async (ctx, match) => {
        await todoHandler.handleTodoCommand(ctx.replyToken, ctx.groupId, ctx.userId, match[0]);
    }, { needAuth: true, feature: 'todo', keywords: ['抽'] });

    router.register(/^完成\s+(\d+)$/, async (ctx, match) => {
        await todoHandler.handleTodoCommand(ctx.replyToken, ctx.groupId, ctx.userId, match[0]);
    }, { needAuth: true, feature: 'todo', keywords: ['完成'] });

    router.register(/^刪除\s+(\d+)$/, async (ctx, match) => {
        await todoHandler.handleTodoCommand(ctx.replyToken, ctx.groupId, ctx.userId, match[0]);
    }, { needAuth: true, feature: 'todo', keywords: ['刪除'] });

    router.register(/^吃什麼(\s+(.+))?$/, async (ctx, match) => {
        await restaurantHandler.handleEatCommand(ctx.replyToken, ctx.groupId, ctx.userId, match[2]);
    }, { isGroupOnly: true, needAuth: true, feature: 'restaurant', keywords: ['吃什麼'] });

    router.register(/^新增餐廳\s+(.+)$/, async (ctx, match) => {
        await restaurantHandler.handleAddRestaurant(ctx.replyToken, ctx.groupId, ctx.userId, match[1]);
    }, { isGroupOnly: true, needAuth: true, feature: 'restaurant', keywords: ['新增餐廳'] });

    router.register(/^刪除餐廳\s+(.+)$/, async (ctx, match) => {
        await restaurantHandler.handleRemoveRestaurant(ctx.replyToken, ctx.groupId, ctx.userId, match[1]);
    }, { isGroupOnly: true, needAuth: true, feature: 'restaurant', keywords: ['刪除餐廳'] });

    router.register('餐廳清單', async (ctx) => {
        await restaurantHandler.handleListRestaurants(ctx.replyToken, ctx.groupId);
    }, { isGroupOnly: true, needAuth: true, feature: 'restaurant', keywords: ['餐廳清單'] });

    // === AI 與娛樂 (AI & Fun) ===
    router.register(/^講台語(\s+.*)?$/, async (ctx, match) => {
        await taigiHandler.handleTaigi(ctx.replyToken, match[0]);
    }, { isGroupOnly: true, needAuth: false, feature: 'taigi', keywords: ['講台語'] });

    router.register(/^(?:工具人|@?小寶|@?機器人)\s+(.+)$/i, async (ctx, match) => {
        if (!rateLimit.checkLimit(ctx.userId, 'ai')) {
            await lineUtils.replyText(ctx.replyToken, '⏱️ AI 服務使用太頻繁囉，請等一分鐘再試！'); return;
        }
        const text = await aiHandler.getAIReply(match[1], ctx.userId);
        await lineUtils.replyText(ctx.replyToken, text);
    }, { feature: 'ai', isGroupOnly: true, needAuth: false, keywords: ['工具人', '小寶', '機器人'] });

    router.register(/^幫我選\s+(.+)$/, async (ctx, match) => {
        const options = match[1].split(/\s+/).filter(o => o.trim());
        if (options.length < 2) {
            await lineUtils.replyText(ctx.replyToken, '❌ 請提供至少 2 個選項');
        } else {
            const selected = options[Math.floor(Math.random() * options.length)];
            await lineUtils.replyText(ctx.replyToken, `🎯 幫你選好了：${selected}`);
        }
    }, { feature: 'ai', isGroupOnly: true, needAuth: false, keywords: ['幫我選'] });

    router.register(/^(剪刀|石頭|布)$/, async (ctx, match) => {
        await gameHandler.handleRPS(ctx.replyToken, match[0]);
    }, { feature: 'game', isGroupOnly: true, needAuth: false, keywords: ['剪刀', '石頭', '布'] });

    router.register('查詢圖庫', async (ctx) => {
        await driveHandler.handleCheckDriveStats(ctx.replyToken);
    }, { isGroupOnly: true, needAuth: true, feature: 'game', keywords: ['查詢圖庫'] });

    router.register(/^狂標(\s+(\d+))?/, async (ctx, match) => {
        await funHandler.handleTagBlast(ctx, match);
    }, { isGroupOnly: true, needAuth: true, feature: 'voice', keywords: ['狂標'] });

    router.register(/^(今晚看什麼|番號推薦)$/, async (ctx) => {
        const jav = await crawlerHandler.getRandomJav();
        if (jav) await lineUtils.replyText(ctx.replyToken, `🎬 ${jav.番号} ${jav.名称}\n💖 ${jav.收藏人数}人收藏`);
        else await lineUtils.replyText(ctx.replyToken, '❌ 無結果');
    }, { isGroupOnly: true, needAuth: true, feature: 'game', keywords: ['今晚看什麼', '番號推薦'] });

    router.register('排行榜', async (ctx) => {
        await leaderboardHandler.handleLeaderboard(ctx.replyToken, ctx.groupId, ctx.userId);
    }, { isGroupOnly: true, needAuth: true, feature: 'leaderboard', keywords: ['排行榜'] });

    router.register('我的排名', async (ctx) => {
        await leaderboardHandler.handleMyRank(ctx.replyToken, ctx.groupId, ctx.userId);
    }, { isGroupOnly: true, needAuth: true, feature: 'leaderboard', keywords: ['我的排名'] });

    // Catch-All
    router.register((msg) => true, async (ctx, match) => {
        const mentions = ctx.messageObject?.mention?.mentionees;
        if (mentions && mentions.length > 0 && ctx.botUserId) {
            const isBotMentioned = mentions.some(m => m.userId === ctx.botUserId);
            if (isBotMentioned) {
                let queryText = ctx.message.replace(/@\S+/g, '').trim();
                if (queryText) {
                    if (!rateLimit.checkLimit(ctx.userId, 'ai')) {
                        await lineUtils.replyText(ctx.replyToken, '⏱️ AI 服務使用太頻繁囉，請等一分鐘再試！'); return true;
                    }
                    const text = await aiHandler.getAIReply(queryText, ctx.userId);
                    await lineUtils.replyText(ctx.replyToken, text);
                    return true;
                }
            }
        }
        return false;
    }, { isGroupOnly: true, needAuth: true, feature: 'ai' });

    router.register((msg) => !!KEYWORD_MAP[msg], async (ctx, match) => {
        const msg = match[0];
        const url = await driveHandler.getRandomDriveImage(KEYWORD_MAP[msg]);
        if (url) {
            await lineUtils.replyToLine(ctx.replyToken, [{ type: 'image', originalContentUrl: url, previewImageUrl: url }]);
            if (ctx.isGroup && ctx.isAuthorizedGroup) {
                leaderboardHandler.recordImageUsage(ctx.groupId, ctx.userId, msg).catch(() => { });
            }
        } else {
            await lineUtils.replyText(ctx.replyToken, '🔄 圖庫資料更新中，請 10 秒後再試');
        }
    }, { isGroupOnly: true, needAuth: true, feature: 'game' });
};
