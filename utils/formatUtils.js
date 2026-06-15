/**
 * 通用格式化工具
 */

/**
 * 格式化貨幣數量
 * @param {number} coins 
 * @returns {string} 格式化後的字串 (例如: 1.2億, 5萬, 1,000)
 */
function formatCoins(coins) {
    if (coins === undefined || coins === null) return '0';
    const abs = Math.abs(coins);
    const prefix = coins < 0 ? '-' : '';
    if (abs >= 100000000) {
        return `${prefix}${(abs / 100000000).toFixed(1)}億`;
    }
    if (abs >= 10000) {
        return `${prefix}${(abs / 10000).toFixed(0)}萬`;
    }
    return `${prefix}${abs.toLocaleString()}`;
}

/**
 * 清理名稱 (移除稱號與賭狗標記)
 * @param {string} name 
 * @returns {string} 
 */
function cleanName(name) {
    if (!name) return '';
    return name.replace(/\[.*?\]/g, '').replace(/\(出賣靈魂的賭狗\)/g, '').trim();
}

/**
 * 取得職業名稱
 * @param {object} user 
 * @param {string} title 
 * @param {string} mafiaBossId 
 * @returns {string}
 */
function getProfessionName(user, title, mafiaBossId = null) {
    if (mafiaBossId && user.id === mafiaBossId) return '黑道老大';
    if (!title) return '一般市民';
    const clean = title.replace(/[\[\]]/g, '').replace(/\(出賣靈魂的賭狗\)/g, '').trim();
    return clean || '一般市民';
}

/**
 * 取得職業後綴
 * @param {object} user 
 * @param {string} mafiaBossId 
 * @returns {string}
 */
function getProfessionSuffix(user, mafiaBossId = null) {
    const now = Date.now();
    if (user.isMafia) {
        if (mafiaBossId && user.id === mafiaBossId) return '[黑道老大]';
        if ((user.crimeRecord || 0) >= 11) return '[黑幫堂主]';
        if ((user.crimeRecord || 0) >= 3) return '[黑道小弟]';
        return '[黑道泊車小弟]';
    }
    if (user.councilorUntil && now < user.councilorUntil) return '[市議員]';
    if (user.militaryUntil && now < user.militaryUntil) return '[軍人]';
    if (user.isPolice) return '[警察]';
    return '';
}

/**
 * 解析自然語言下注金額
 * @param {string} amtStr 
 * @param {string} userId 
 * @returns {Promise<string>}
 */
async function resolveBetAmount(amtStr, userId) {
    if (!amtStr) return '10';
    if (/^(歐印|all\s*in|梭哈)$/i.test(amtStr.trim())) {
        const { db } = require('./db');
        const userDoc = await db.collection('economy_users').doc(userId).get();
        if (userDoc.exists) {
            const data = userDoc.data();
            const available = (data.emergencyAid || 0) + Math.max(0, data.kuCoin || 0);
            return available.toString();
        }
        return '0';
    }
    
    let parsed = amtStr.replace(/,/g, '');
    parsed = parsed.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    
    const suffix = parsed.replace(/[0-9.]/g, '').toLowerCase();
    let num = parseFloat(parsed.replace(/[^0-9.]/g, ''));
    if (isNaN(num)) return '0';

    if (suffix.includes('k') || suffix.includes('千')) num *= 1000;
    else if (suffix.includes('w') || suffix.includes('萬')) num *= 10000;
    else if (suffix.includes('億')) num *= 100000000;
    else if (suffix.includes('兆')) num *= 1000000000000;
    else if (suffix.includes('百')) num *= 100;

    return Math.floor(num).toString();
}

module.exports = {
    formatCoins,
    cleanName,
    getProfessionName,
    getProfessionSuffix,
    resolveBetAmount
};
