/**
 * 空氣品質 (AQI) 工具模組
 */
const axios = require('axios');
const logger = require('./logger');

// 環保署 API
const { MOENV_API_KEY } = require('../config/constants');

// Memory Cache
let aqiCache = {
    data: null,
    lastUpdated: 0
};

const CACHE_DURATION = 3600 * 1000; // 1小時

/**
 * 抓取全台 AQI 資料
 */
async function fetchAQI() {
    const now = Date.now();

    // Check Cache
    if (aqiCache.data && (now - aqiCache.lastUpdated < CACHE_DURATION)) {
        return aqiCache.data;
    }

    try {
        logger.info('[AQI] Fetching new data from MOENV API...');
        const url = `https://data.moenv.gov.tw/api/v2/aqx_p_432?api_key=${MOENV_API_KEY}&limit=1000&sort=ImportDate desc&format=JSON`;
        const res = await axios.get(url);

        if (res.data && Array.isArray(res.data.records)) {
            aqiCache.data = res.data.records;
            aqiCache.lastUpdated = now;
            return res.data.records;
        } else if (res.data && Array.isArray(res.data)) {
            aqiCache.data = res.data;
            aqiCache.lastUpdated = now;
            return res.data;
        } else {
            logger.error('[AQI] API response format error');
            return [];
        }
    } catch (e) {
        logger.error('[AQI] Fetch Error', e);
        return [];
    }
}

/**
 * 取得指定縣市的 AQI 摘要 (用於天氣預報整合)
 * 回傳該縣市 AQI 最差 (Max) 的數值與測站
 */
async function getCityAQISummary(county) {
    const records = await fetchAQI();
    if (!records || records.length === 0) return null;

    // Filter by county (Note: MOENV uses '臺北市', '臺中市' etc.)
    // We expect 'county' input to match MOENV format (from CITY_MAP in weather.js already handled this)
    const cityRecords = records.filter(r => r.county === county);

    if (cityRecords.length === 0) return null;

    // Find Max AQI
    let maxRecord = null;
    let maxVal = -1;

    cityRecords.forEach(r => {
        const val = parseInt(r.aqi);
        if (!isNaN(val) && val > maxVal) {
            maxVal = val;
            maxRecord = r;
        }
    });

    return maxRecord;
}

/**
 * 取得指定縣市的所有測站詳情 (用於詳細查詢)
 */
async function getCityDetails(county) {
    const records = await fetchAQI();
    if (!records || records.length === 0) return [];

    return records.filter(r => r.county === county);
}

module.exports = {
    fetchAQI,
    getCityAQISummary,
    getCityDetails
};
