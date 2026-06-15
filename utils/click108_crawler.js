const axios = require('axios');
const cheerio = require('cheerio');

const SIGN_MAP = {
    '牡羊座': 0, '白羊座': 0, 'aries': 0,
    '金牛座': 1, 'taurus': 1,
    '雙子座': 2, 'gemini': 2,
    '巨蟹座': 3, 'cancer': 3,
    '獅子座': 4, 'leo': 4,
    '處女座': 5, 'virgo': 5,
    '天秤座': 6, '天平座': 6, 'libra': 6,
    '天蠍座': 7, 'scorpio': 7,
    '射手座': 8, '人馬座': 8, 'sagittarius': 8,
    '摩羯座': 9, '山羊座': 9, 'capricorn': 9,
    '水瓶座': 10, 'aquarius': 10,
    '雙魚座': 11, 'pisces': 11
};

const INDEX_TO_NAME = [
    '牡羊座', '金牛座', '雙子座', '巨蟹座', '獅子座', '處女座',
    '天秤座', '天蠍座', '射手座', '摩羯座', '水瓶座', '雙魚座'
];

async function closeBrowser() {
    // No-op for compatibility with old Puppeteer logic in horoscope.js
    return;
}

function getAstroIndex(signName) {
    let cleanSign = signName.trim().toLowerCase();
    for (const [key, val] of Object.entries(SIGN_MAP)) {
        if (cleanSign.includes(key) || cleanSign === key) {
            return val;
        }
    }
    return null;
}

async function fetchSignData(signName, type = 'daily') {
    const astroIdx = getAstroIndex(signName);
    if (astroIdx === null) {
        console.warn(`[Click108] Unknown sign: ${signName}`);
        return null;
    }

    const officialName = INDEX_TO_NAME[astroIdx];
    let url = '';
    
    if (type === 'daily') {
        url = `https://astro.click108.com.tw/daily_0.php?iAstro=${astroIdx}`;
    } else if (type === 'weekly') {
        url = `https://astro.click108.com.tw/weekly_0.php?iType=1&iAstro=${astroIdx}`;
    } else if (type === 'monthly') {
        url = `https://astro.click108.com.tw/monthly_0.php?iType=2&iAstro=${astroIdx}`;
    }

    console.log(`[Click108] Fetching ${type} for ${officialName}: ${url}`);

    try {
        const response = await axios.get(url, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        
        const $ = cheerio.load(response.data);
        const data = {
            content: '',
            luckyNumber: 'N/A',
            luckyColor: 'N/A',
            luckyTime: 'N/A',
            luckySign: 'N/A',
            luckyDirection: 'N/A',
            stars: {}
        };

        const contentWrapper = $('.TODAY_CONTENT');
        if (!contentWrapper.length) {
            return { name: officialName, ...data, url };
        }

        if (type === 'daily') {
            const luckyDivs = $('.TODAY_LUCKY .LUCKY');
            luckyDivs.each((_, div) => {
                const src = $(div).find('img').attr('src') || '';
                const text = $(div).find('h4').text().trim();
                
                if (src.includes('title01')) data.luckyNumber = text;
                if (src.includes('title02')) data.luckyColor = text;
                if (src.includes('title03')) data.luckyDirection = text;
                if (src.includes('title04')) data.luckyTime = text;
                if (src.includes('title05')) data.luckySign = text;
            });
        }

        const pTags = contentWrapper.parent().find('p');
        let paragraphs = [];
        
        pTags.each((_, p) => {
            const text = $(p).text().trim();
            if (text) {
                paragraphs.push(text);
                
                if (text.includes('運勢★')) {
                    let key = 'other';
                    if (text.includes('整體')) key = 'overall';
                    if (text.includes('愛情')) key = 'love';
                    if (text.includes('事業')) key = 'career';
                    if (text.includes('財運')) key = 'wealth';
                    
                    const starCount = (text.match(/★/g) || []).length;
                    data.stars[key] = starCount;
                }
            }
        });

        if (paragraphs.length === 0) {
            data.content = contentWrapper.parent().text().trim();
        } else {
            data.content = paragraphs.join('\n\n');
        }

        return {
            name: officialName,
            ...data,
            url: url
        };

    } catch (e) {
        console.error(`[Click108] Detail Error for ${officialName}: ${e.message}`);
        return null;
    }
}

module.exports = { fetchSignData, closeBrowser };
