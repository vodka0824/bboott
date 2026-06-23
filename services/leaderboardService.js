const { db } = require('../utils/db');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const authUtils = require('../utils/auth');
const { ADMIN_USER_ID } = require('../config/constants');
const { getSpamResponse } = require('../utils/spamHandler');
const memoryCache = require('../utils/memoryCache');

const COIN_NAME = '哭幣';
const COLLECTION_NAME = 'economy_users';

/**
 * 取得用戶經濟檔案，若無則建立預設值
 * 注意: name 必須從外部傳入，不在 Transaction 內呼叫 LINE API
 */
async function getUserProfile(t, userId, name = '未知用戶') {
    const docRef = db.collection(COLLECTION_NAME).doc(userId);
    const doc = await t.get(docRef);
    let data;
    if (!doc.exists) {
        data = {
            kuCoin: 0,
            lastCheckIn: 0,
            consecutiveDays: 0,
            name: name
        };
        t.set(docRef, data);
    } else {
        data = doc.data();
        // Auto-heal corrupted names (e.g. groupId accidentally saved as name, or '未知用戶' when we have a real name)
        if (name !== '未知用戶' && (!data.name || data.name === '未知用戶' || (data.name.startsWith('C') && data.name.length === 33))) {
            data.name = name;
            t.update(docRef, { name: name });
        }
    }
    return { docRef, data };
}

const TITLES = [
    { name: '家徒四壁', max: 10 },
    { name: '赤貧', max: 109 },
    { name: '清寒', max: 1099 },
    { name: '普通', max: 10999 },
    { name: '小康', max: 109999 },
    { name: '小富', max: 1099999 },
    { name: '中富', max: 10999999 },
    { name: '大富翁', max: 109999999 },
    { name: '富可敵國', max: 1099999999 },
    { name: '比爾蓋天', max: Infinity }
];

const MOCKING_MESSAGES = [
    // 原有 12 條
    "笑死，這點錢也敢出來混？",
    "窮鬼退散！",
    "連這點哭幣都沒有，你還是回家洗洗睡吧！",
    "你是不是沒錢吃飯了？",
    "快去乞討吧！",
    "錢包比臉還乾淨，可憐哪！",
    "窮到只剩下骨氣了嗎？",
    "這點錢連根毛都買不起！",
    "打腫臉充胖子？先看看自己的餘額吧！",
    "沒錢就不要學人家玩！",
    "看了你的餘額，我都為你感到心酸。",
    "你這點餘額，連當韭菜都不夠格！",
    // 擴增毒舌詞條
    "你這點錢連給我塞牙縫都不夠，滾！",
    "沒錢還敢來裝闊？去資源回收吧你！",
    "你的存款跟你的智商一樣，都是零。",
    "要不要我丟兩個銅板給你搭車回家？",
    "看你這副窮酸樣，連路邊的野狗都比你有錢。",
    "不要丟人現眼了，你根本不配待在這裡。",
    "你全家人的資產加起來有超過三位數嗎？",
    "沒錢就少說話，沒人想聽窮鬼開口。",
    "看來你連呼吸的資格都要買不起了。",
    "這麼窮還想學人賭？我看你是想睡公園了！",
    "要不要我借你個紙箱？今晚風有點大喔。",
    "別人的錢包叫錢包，你的錢包根本是洋蔥，打開就想哭。",
    "這點餘額你好意思點開看？我都替你感到丟臉。",
    "連渣都不剩，你的人生是不是也這麼悲慘？",
    "你這財力，我看連買塊豆腐撞死都不夠錢。",
    "你的錢去哪了？哦對了，你本來就沒錢。",
    "我如果是你，早就羞愧得鑽進地洞裡了。",
    "你這餘額，說你是乞丐都還侮辱了乞丐。",
    "窮病是絕症，看來你已經病入膏肓了。",
    "這麼窮，你平常是不是都吃空氣配開水？",
    "看你沒錢的樣子，我今天心情突然好多了。",
    "不要再按了，再按也按不出錢來啦，蠢貨！",
    "你是不是以為這裡有慈善機構？抱歉，滾！",
    "笑死，輸到脫褲子了還敢來？",
    "沒錢就去賣血啦，來這裡浪費我時間！",
    "你的餘額就是一個完美的圓，什麼都沒有的 O。"
];

function getTitleInfo(coins) {
    for (let i = 0; i < TITLES.length; i++) {
        if (coins <= TITLES[i].max) {
            const nextName = TITLES[i+1] ? TITLES[i+1].name : null;
            const diff = TITLES[i].max !== Infinity ? TITLES[i].max + 1 - coins : 0;
            return {
                name: TITLES[i].name,
                nextName: nextName,
                diff: diff
            };
        }
    }
    return { name: '家徒四壁', nextName: '赤貧', diff: 11 };
}

function createEmptyLeaderboardBubble(title, message, headerBgStart, headerBgEnd, titleColor) {
    return {
        type: 'bubble',
        size: 'mega',
        header: {
            type: 'box',
            layout: 'vertical',
            paddingAll: '16px',
            background: {
                type: 'linearGradient',
                angle: '0deg',
                startColor: headerBgStart,
                endColor: headerBgEnd
            },
            contents: [
                { type: 'text', text: title, weight: 'bold', size: 'lg', color: titleColor, align: 'center' }
            ]
        },
        body: flexUtils.createBox('vertical', [
            flexUtils.createText({ text: message, size: 'md', color: '#555555', align: 'center', margin: 'md', wrap: true })
        ], { paddingAll: 'xl', backgroundColor: flexUtils.COLORS.BG_MAIN })
    };
}

const { formatCoins, cleanName, getProfessionName, getProfessionSuffix } = require('../utils/formatUtils');
module.exports = {
  MOCKING_MESSAGES,
  TITLES,
  getTitleInfo,
  createEmptyLeaderboardBubble
};
