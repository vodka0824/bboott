/**
 * LINE Bot 常數設定
 */

// === 環境變數 ===
const CHANNEL_ACCESS_TOKEN = process.env.LINE_TOKEN || process.env.CHANNEL_ACCESS_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_KEY;
const GROQ_API_KEY = process.env.GROQ_KEY;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID;
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
// CWA 中央氣象署 API (需申請: https://opendata.cwa.gov.tw/user/authkey)
const CWA_API_KEY = process.env.CWA_API_KEY || '';
const CWA_API_HOST = 'https://opendata.cwa.gov.tw/api';

// MOENV 環境部 API (空氣品質) - 需在環境變數設定
const MOENV_API_KEY = process.env.MOENV_API_KEY || '';

// MongoDB 設定
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'linebot';

// 本地 URL 設定
const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';



// === 爬蟲來源網址 ===
const CRAWLER_URLS = {
    OIL_PRICE: 'https://gas.goodlife.tw/',
    NEW_MOVIE: 'https://www.atmovies.com.tw/movie/new/',
    APPLE_NEWS: 'https://tw.nextapple.com/',
    TECH_NEWS: 'https://technews.tw/',
    PTT_HOT: 'https://disp.cc/b/PttHot',
    JAV_RECOMMEND: 'https://limbopro.com/tools/jwksm/ori.json'
};

// === 圖片資料夾對應 ===
const KEYWORD_MAP = {
    '奶子': '1LMsRVf6GVQOx2IRavpMRQFhMv6oC2fnv',
    '美尻': '1kM3evcph4-RVKFkBi0_MnaFyADexFkl8',
    '絕對領域': '1o5BLLto3eyZCQ3SypjU5tSYydWIzrsFx',
    '黑絲': '1lt4iw90AX9H44XXZJNuIbNRZzkkU9_E8',
    '白絲': '1aiUXVCtd5MQob3dKOVOq02t1BAxE6_Ju',
    'JK': '1rHiRf5utamTc3Vld_sUK2fmBMYgxLNSl'
};

// === 快取時間設定 ===
const CACHE_DURATION = {
    DRIVE: 1 * 60 * 1000,         // 1 分鐘
    GROUP: 5 * 60 * 1000,         // 5 分鐘
    ADMIN: 5 * 60 * 1000,         // 5 分鐘
    TODO: 5 * 60 * 1000,          // 5 分鐘
    RESTAURANT: 5 * 60 * 1000,    // 5 分鐘
    JAV: 60 * 60 * 1000           // 1 小時
};

// === 兵役階級設定 ===
const MILITARY_RANKS = [
    { name: '二兵', salary: 100000, pension: 0 },
    { name: '一兵', salary: 200000, pension: 0 },
    { name: '上兵', salary: 300000, pension: 0 },
    { name: '下士', salary: 500000, pension: 0 },
    { name: '中士', salary: 700000, pension: 0 },
    { name: '上士', salary: 1000000, pension: 0 },
    { name: '士官長', salary: 1500000, pension: 0 },
    { name: '少尉', salary: 2000000, pension: 0 },
    { name: '中尉', salary: 2500000, pension: 0 },
    { name: '上尉', salary: 3000000, pension: 0 },
    { name: '少校', salary: 4000000, pension: 500000 },
    { name: '中校', salary: 5000000, pension: 1000000 },
    { name: '上校', salary: 6000000, pension: 2000000 },
    { name: '少將', salary: 8000000, pension: 3000000 },
    { name: '中將', salary: 10000000, pension: 5000000 },
    { name: '上將', salary: 15000000, pension: 10000000 },
    { name: '一星上將', salary: 20000000, pension: 15000000 },
    { name: '三星上將', salary: 30000000, pension: 20000000 },
    { name: '四星上將', salary: 50000000, pension: 30000000 },
    { name: '五星上將', salary: 100000000, pension: 50000000 }
];

/**
 * 驗證必要的環境變數
 */
function validateEnvironment() {
    const required = {
        'CHANNEL_ACCESS_TOKEN': CHANNEL_ACCESS_TOKEN,
        'ADMIN_USER_ID': ADMIN_USER_ID,
        'MONGODB_URI': MONGODB_URI,
        'BASE_URL': BASE_URL
    };

    const missing = [];
    for (const [name, value] of Object.entries(required)) {
        if (!value) {
            missing.push(name);
        }
    }

    if (missing.length > 0) {
        console.error('❌ 缺少必要的環境變數：', missing.join(', '));
        console.error('請在 .env 檔案中設定這些變數');
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    console.log('✅ 環境變數驗證通過');
}

// 啟動時驗證環境變數
validateEnvironment();

module.exports = {
    CHANNEL_ACCESS_TOKEN,
    GEMINI_API_KEY,
    GROQ_API_KEY,
    ADMIN_USER_ID,
    GOOGLE_PLACES_API_KEY,
    CWA_API_KEY,
    CWA_API_HOST,
    MOENV_API_KEY,
    MONGODB_URI,
    MONGODB_DB_NAME,
    BASE_URL,
    CRAWLER_URLS,
    KEYWORD_MAP,
    CACHE_DURATION,
    MILITARY_RANKS
};
