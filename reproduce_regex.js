const SIGNS = [
    '牡羊', '金牛', '雙子', '巨蟹', '獅子', '處女', '天秤', '天蠍', '射手', '摩羯', '水瓶', '雙魚',
    '白羊', '天平', '人馬', '山羊',
    '牡羊座', '金牛座', '雙子座', '巨蟹座', '獅子座', '處女座', '天秤座', '天蠍座', '射手座', '摩羯座', '水瓶座', '雙魚座'
];

try {
    const regexString = `^(${SIGNS.join('|')})(\\s+(今日|本週|本周|本月))?$`;
    console.log("Regex String:", regexString);
    const signRegex = new RegExp(regexString);
    console.log("Regex created successfully:", signRegex);
} catch (error) {
    console.error("Error creating regex:", error);
}
