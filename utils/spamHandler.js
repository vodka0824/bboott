const MOCKING_REPLIES = [
    "你是文盲還是失憶？說了不行就是不行！",
    "你的腦袋是裝飾品嗎？再按一次試試看啊！",
    "可悲的傢伙，連中文字都看不懂了？",
    "我就靜靜看著你像個白痴一樣重複按。",
    "你是聽不懂人話嗎？滾！",
    "再吵我直接把你封鎖，懂？",
    "你是不是沒事幹？去找個正經工作好嗎！",
    "不要逼我罵髒話，給我適可而止！",
    "可憐啊，只能在這裡像個跳樑小丑一樣洗頻。",
    "你是不是以為一直按就會有奇蹟？笑死人。"
];

/**
 * 防洗頻檢查機制 (針對每個指令獨立計數)
 * @param {Object} data - Firebase user data
 * @param {string} commandKey - 指令的獨立識別碼 (例如 'beg', 'checkin', 'rob', 'confess')
 * @param {string} baseMessage - 第一次觸發時的正常提示訊息
 * @returns {Object} { newTracker, ignore, message }
 */
function getSpamResponse(data, commandKey, baseMessage, options = {}) {
    const { maxWarnings = 2 } = options;
    const now = new Date();
    const todayStr = now.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
    
    let tracker = data.spamTracker || {};
    let cmdTracker = tracker[commandKey] || { date: '', count: 0 };
    
    // 如果日期不同，代表重置，視為第一次觸發
    if (cmdTracker.date !== todayStr) {
        cmdTracker = { date: todayStr, count: 1 };
        tracker[commandKey] = cmdTracker;
        return { newTracker: tracker, ignore: false, message: baseMessage, triggerPenalty: false };
    }
    
    // 同日重複觸發
    cmdTracker.count += 1;
    tracker[commandKey] = cmdTracker;
    
    if (cmdTracker.count <= maxWarnings) {
        // 第二次觸發 (或是允許警告的次數內)：隨機嘲諷
        const mock = MOCKING_REPLIES[Math.floor(Math.random() * MOCKING_REPLIES.length)];
        return { newTracker: tracker, ignore: false, message: `⚠️ ${mock}\n(${baseMessage})`, triggerPenalty: false };
    } else {
        // 第三次以上：無視並可觸發懲罰
        return { newTracker: tracker, ignore: true, message: null, triggerPenalty: true };
    }
}

module.exports = { getSpamResponse, MOCKING_REPLIES };
