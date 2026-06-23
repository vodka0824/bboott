/**
 * 匯率查詢與換算模組
 */
const axios = require('axios');
const cheerio = require('cheerio');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const { COLORS } = flexUtils;

// 台銀匯率網頁
const BOT_RATE_URL = 'https://rate.bot.com.tw/xrt/all/day';

// 常用幣別
const CURRENCY_MAP = {
    'USD': { name: '美金', symbol: '$' },
    'JPY': { name: '日圓', symbol: '¥' },
    'EUR': { name: '歐元', symbol: '€' },
    'CNY': { name: '人民幣', symbol: '¥' },
    'HKD': { name: '港幣', symbol: '$' },
    'GBP': { name: '英鎊', symbol: '£' },
    'AUD': { name: '澳幣', symbol: '$' },
    'KRW': { name: '韓元', symbol: '₩' },
    'SGD': { name: '新加坡幣', symbol: '$' },
    'THB': { name: '泰銖', symbol: '฿' }
};

// 快捷指令對照
const QUICK_COMMANDS = {
    '美金': 'USD',
    '日圓': 'JPY',
    '日幣': 'JPY',
    '歐元': 'EUR',
    '人民幣': 'CNY',
    '港幣': 'HKD',
    '英鎊': 'GBP',
    '澳幣': 'AUD',
    '韓元': 'KRW',
    '新幣': 'SGD',
    '泰銖': 'THB'
};

// 快取
let rateCache = null;
let cacheTime = 0;
const CACHE_DURATION = 60 * 60 * 1000; // 1 小時

/**
 * 爬取台銀匯率
 */
async function fetchRates() {
    // 檢查快取
    if (rateCache && Date.now() - cacheTime < CACHE_DURATION) {
        return rateCache;
    }

    try {
        const res = await axios.get(BOT_RATE_URL, { timeout: 10000 });
        const $ = cheerio.load(res.data);

        const rates = {};
        let updateTime = '';

        // 取得更新時間
        const timeText = $('span.time').text() || '';
        const timeMatch = timeText.match(/\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}/);
        if (timeMatch) updateTime = timeMatch[0];

        // 解析匯率表格
        $('table.table tbody tr').each((i, row) => {
            const cells = $(row).find('td');
            if (cells.length >= 5) {
                const currencyCell = $(cells[0]).text().trim();
                // 從貨幣名稱提取代碼 (如 "美金 (USD)")
                const codeMatch = currencyCell.match(/\(([A-Z]{3})\)/);
                if (codeMatch) {
                    const code = codeMatch[1];
                    rates[code] = {
                        cashBuy: parseFloat($(cells[1]).text().trim()) || 0,
                        cashSell: parseFloat($(cells[2]).text().trim()) || 0,
                        spotBuy: parseFloat($(cells[3]).text().trim()) || 0,
                        spotSell: parseFloat($(cells[4]).text().trim()) || 0
                    };
                }
            }
        });

        rateCache = { rates, updateTime };
        cacheTime = Date.now();
        return rateCache;
    } catch (error) {
        console.error('[匯率] 爬取失敗:', error.message);
        return null;
    }
}

/**
 * 建構即時匯率 Flex Message
 */
// 建構即時匯率 Flex Message
function buildCurrencyFlex(data) {
    if (!data || !data.rates) {
        return flexUtils.createText({ text: '❌ 無法取得匯率資訊' });
    }

    const topCurrencies = ['USD', 'JPY', 'EUR', 'CNY', 'HKD', 'KRW'];

    const rows = topCurrencies.map(code => {
        const rate = data.rates[code];
        const info = CURRENCY_MAP[code] || { name: code };
        if (!rate) return null;

        return flexUtils.createBox('horizontal', [
            flexUtils.createText({ text: `${info.name}`, size: 'sm', flex: 3, weight: 'bold', color: COLORS.DARK_GRAY }),
            flexUtils.createText({ text: `${rate.spotBuy || '-'}`, size: 'sm', flex: 2, align: 'end', color: COLORS.DARK_GRAY }),
            flexUtils.createText({ text: `${rate.spotSell || '-'}`, size: 'sm', flex: 2, align: 'end', color: COLORS.DANGER })
        ], { margin: 'md' });
    }).filter(Boolean);

    const header = flexUtils.createHeader('💱 即時匯率', `台銀 ${data.updateTime || ''}`, COLORS.PRIMARY);

    return flexUtils.createBubble({
        size: 'kilo',
        header,
        body: flexUtils.createBox('vertical', [
            flexUtils.createBox('horizontal', [
                flexUtils.createText({ text: '幣別', size: 'xs', color: COLORS.GRAY, flex: 3 }),
                flexUtils.createText({ text: '買入', size: 'xs', color: COLORS.GRAY, flex: 2, align: 'end' }),
                flexUtils.createText({ text: '賣出', size: 'xs', color: COLORS.GRAY, flex: 2, align: 'end' })
            ]),
            flexUtils.createSeparator('sm'),
            ...rows
        ], { backgroundColor: flexUtils.COLORS.BG_MAIN, paddingAll: '12px'  })
    });
}

/**
 * 處理即時匯率查詢
 */
async function handleRatesQuery(replyToken) {
    const data = await fetchRates();
    const flex = buildCurrencyFlex(data);
    await lineUtils.replyFlex(replyToken, '即時匯率', flex);
}

/**
 * 處理匯率換算
 */
async function handleConversion(replyToken, amount, currencyCode) {
    const data = await fetchRates();

    if (!data || !data.rates) {
        await lineUtils.replyText(replyToken, '❌ 無法取得匯率資訊');
        return;
    }

    const code = currencyCode.toUpperCase();
    const rate = data.rates[code];

    if (!rate) {
        await lineUtils.replyText(replyToken, `❌ 不支援的幣別: ${code}`);
        return;
    }

    const info = CURRENCY_MAP[code] || { name: code, symbol: '' };
    const twdAmount = Math.round(amount * rate.spotSell);

    const header = flexUtils.createHeader('💱 匯率換算', '', COLORS.PRIMARY);
    const bubble = flexUtils.createBubble({
        size: 'kilo',
        header,
        body: flexUtils.createBox('vertical', [
            flexUtils.createText({ text: `${amount.toLocaleString()} ${info.name}`, size: 'xl', weight: 'bold', align: 'center', color: COLORS.DARK_GRAY }),
            flexUtils.createText({ text: '⬇️', align: 'center', margin: 'md', color: COLORS.GRAY }),
            flexUtils.createText({ text: `${twdAmount.toLocaleString()} 台幣`, size: 'xl', weight: 'bold', color: COLORS.DANGER, align: 'center' }),
            flexUtils.createSeparator('lg'),
            flexUtils.createBox('horizontal', [
                flexUtils.createText({ text: '即期賣出匯率', size: 'xs', color: COLORS.GRAY }),
                flexUtils.createText({ text: `${rate.spotSell}`, size: 'xs', color: COLORS.GRAY, align: 'end' })
            ], { margin: 'md' })
        ], { backgroundColor: flexUtils.COLORS.BG_MAIN, paddingAll: '15px'  })
    });

    await lineUtils.replyFlex(replyToken, '匯率換算', bubble);
}

/**
 * 處理台幣買外幣換算
 */
async function handleBuyForeign(replyToken, twdAmount, currencyCode) {
    const data = await fetchRates();

    if (!data || !data.rates) {
        await lineUtils.replyText(replyToken, '❌ 無法取得匯率資訊');
        return;
    }

    const code = currencyCode.toUpperCase();
    const rate = data.rates[code];

    if (!rate || !rate.spotSell) {
        await lineUtils.replyText(replyToken, `❌ 不支援的幣別: ${code}`);
        return;
    }

    const info = CURRENCY_MAP[code] || { name: code, symbol: '' };
    // 買外幣使用銀行「賣出」匯率
    const foreignAmount = Math.round((twdAmount / rate.spotSell) * 100) / 100;

    const header = flexUtils.createHeader('💱 台幣買外幣', '', COLORS.SUCCESS);
    const bubble = flexUtils.createBubble({
        size: 'kilo',
        header,
        body: flexUtils.createBox('vertical', [
            flexUtils.createText({ text: `${twdAmount.toLocaleString()} 台幣`, size: 'xl', weight: 'bold', align: 'center', color: COLORS.DARK_GRAY }),
            flexUtils.createText({ text: '⬇️', align: 'center', margin: 'md', color: COLORS.GRAY }),
            flexUtils.createText({ text: `${foreignAmount.toLocaleString()} ${info.name}`, size: 'xl', weight: 'bold', color: COLORS.SUCCESS, align: 'center' }),
            flexUtils.createSeparator('lg'),
            flexUtils.createBox('horizontal', [
                flexUtils.createText({ text: '即期賣出匯率', size: 'xs', color: COLORS.GRAY }),
                flexUtils.createText({ text: `${rate.spotSell}`, size: 'xs', color: COLORS.GRAY, align: 'end' })
            ], { margin: 'md' })
        ], { backgroundColor: flexUtils.COLORS.BG_MAIN, paddingAll: '15px'  })
    });

    await lineUtils.replyFlex(replyToken, '匯率換算', bubble);
}

module.exports = {
    fetchRates,
    handleRatesQuery,
    handleConversion,
    handleBuyForeign,
    QUICK_COMMANDS
};
