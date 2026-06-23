/**
 * 多人賭桌指令解析器 (Bet & Action Parser)
 */

/**
 * 判斷是否為「補牌 / 要牌 / 發牌」動作
 */
function isHitCommand(str) {
    if (!str) return false;
    const cleanStr = str.trim().toLowerCase();
    const hitKeywords = ['hit', 'h', '補', '補牌', '要', '要牌', '抽', '抽牌', '加牌', '再一張', '+', '繼續', '發牌', '發'];
    return hitKeywords.includes(cleanStr);
}

/**
 * 判斷是否為「停牌 / 過牌」動作
 */
function isStandCommand(str) {
    if (!str) return false;
    const cleanStr = str.trim().toLowerCase();
    const standKeywords = ['stand', 'p', 'pass', '停', '停牌', '過', '過牌', '不', '不要', '不補', '不要牌', '不拿牌', '-', '夠了', '放棄'];
    return standKeywords.includes(cleanStr);
}

/**
 * 判斷是否為「雙倍下注」動作
 */
function isDoubleDownCommand(str) {
    if (!str) return false;
    const cleanStr = str.trim().toLowerCase();
    const doubleKeywords = ['double', 'x2', '雙倍', '加倍', '雙倍下注'];
    return doubleKeywords.includes(cleanStr);
}

/**
 * 判斷是否為「投降」動作
 */
function isSurrenderCommand(str) {
    if (!str) return false;
    const cleanStr = str.trim().toLowerCase();
    const surrenderKeywords = ['surrender', 'ff', '投降', '認輸'];
    return surrenderKeywords.includes(cleanStr);
}

/**
 * 解析相對或絕對的下注金額
 * 支援: 1w, 5k, +100, -100, 一半, 歐印
 * @param {string} amtStr 
 * @param {string} userId 
 * @returns {Promise<{ amount: number, isRelative: boolean, relativeSign: number }>}
 */
async function parseBetAmountExtended(amtStr, userId) {
    if (!amtStr) return { amount: 10, isRelative: false, relativeSign: 1 };
    
    let cleanStr = amtStr.trim().toLowerCase();
    
    let isRelative = false;
    let relativeSign = 1;

    if (cleanStr.startsWith('+')) {
        isRelative = true;
        relativeSign = 1;
        cleanStr = cleanStr.substring(1).trim();
    } else if (cleanStr.startsWith('-')) {
        isRelative = true;
        relativeSign = -1;
        cleanStr = cleanStr.substring(1).trim();
    }

    // 支援「一半」
    if (cleanStr === '一半' || cleanStr === '1/2' || cleanStr === 'half') {
        const { db } = require('./db');
        const userDoc = await db.collection('economy_users').doc(userId).get();
        if (userDoc.exists) {
            const data = userDoc.data();
            const available = (data.emergencyAid || 0) + Math.max(0, data.kuCoin || 0);
            return { amount: Math.floor(available / 2), isRelative, relativeSign };
        }
        return { amount: 0, isRelative, relativeSign };
    }

    const { resolveBetAmount } = require('./formatUtils');
    const resolvedAmtStr = await resolveBetAmount(cleanStr, userId);
    const amount = parseInt(resolvedAmtStr, 10);

    return { amount: isNaN(amount) ? 0 : amount, isRelative, relativeSign };
}

module.exports = {
    isHitCommand,
    isStandCommand,
    isDoubleDownCommand,
    isSurrenderCommand,
    parseBetAmountExtended
};
