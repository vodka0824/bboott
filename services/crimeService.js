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

async function addWantedLevel(userId) {
    if (userId === ADMIN_USER_ID) return 0; // 管理員不增加通緝值

    try {
        return await db.runTransaction(async (t) => {
            const docRef = db.collection(COLLECTION_NAME).doc(userId);
            const doc = await t.get(docRef);
            if (!doc.exists) return 0; // 若無資料則忽略
            
            const data = doc.data();
            const currentWanted = data.wantedLevel || 0;
            const newWanted = parseFloat((currentWanted + 0.001).toFixed(4));
            
            t.update(docRef, { wantedLevel: newWanted });
            return newWanted;
        });
    } catch (e) {
        console.error('[Economy] addWantedLevel Error:', e);
        return 0;
    }
}

async function queryWantedLevel(replyToken, groupId, userId) {
    try {
        const { ADMIN_USER_ID } = require('../config/constants');
        const lineUtils = require('../utils/line');
        const flexUtils = require('../utils/flex');
        
        if (userId === ADMIN_USER_ID) {
            await lineUtils.replyText(replyToken, '🕴️ 老闆好！您在警局的紀錄是一片空白，隨時可以準備從後門逃跑！');
            return;
        }

        const docRef = db.collection(COLLECTION_NAME).doc(userId);
        const doc = await docRef.get();
        const wantedLevel = doc.exists ? (doc.data().wantedLevel || 0) : 0;
        const wantedPercent = (wantedLevel * 100).toFixed(1);

        let warningStr = '目前非常安全，繼續開心玩吧！';
        let color = '#00FF00';
        if (wantedLevel >= 0.01) {
            warningStr = '警方已經注意到了，請小心行事。';
            color = flexUtils.COLORS.PRIMARY;
        }
        if (wantedLevel >= 0.03) {
            warningStr = '你已經上了警方的黑名單！隨時可能被抓。';
            color = '#FF8C00';
        }
        if (wantedLevel >= 0.05) {
            warningStr = '🚨 極度危險！警方隨時準備破門而入！';
            color = '#FF0000';
        }
        if (wantedLevel >= 1.0) {
            warningStr = '💀 全國頭號通緝犯！只要你在場，警察「必定」攻堅，且「只會」抓你！';
            color = '#8B0000';
        }

        const bubble = flexUtils.createBubble({
            size: 'kilo',
            header: flexUtils.createHeader('🚨 個人通緝狀態', '', '#C62828', '#FFEBEE'),
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: `${wantedPercent}%`, size: 'xxl', weight: 'bold', color: color, align: 'center', margin: 'md' }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: warningStr, size: 'sm', color: '#555555', align: 'center', wrap: true, margin: 'md' })
            ], { backgroundColor: flexUtils.COLORS.BG_MAIN, paddingAll: 'xl' })
        });

        await lineUtils.replyFlex(replyToken, '個人通緝狀態', bubble);

    } catch (e) {
        console.error('[Economy] queryWantedLevel Error:', e);
    }
}

async function showWantedLeaderboard(replyToken, groupId) {
    await showCombinedWantedAndJailRank(replyToken, groupId);
}

async function showCombinedWantedAndJailRank(replyToken, groupId) {
    try {
        const lineUtils = require('../utils/line');
        const flexUtils = require('../utils/flex');
        const { getWantedList, getProfessionTitle } = require('../handlers/profession');

        // 平行查詢通緝榜（最多 50 名）與前科榜（最多 50 名）
        const fetchLimit = groupId ? 50 : 10;
        const [wantedListAll, criminalSnapshot] = await Promise.all([
            getWantedList(), 
            db.collection(COLLECTION_NAME)
                .where('crimeRecord', '>', 0)
                .orderBy('crimeRecord', 'desc')
                .limit(fetchLimit)
                .get()
        ]);

        const filterGroupMembers = async (list) => {
            if (!groupId) return list.slice(0, 10);
            const valid = [];
            for (const item of list) {
                try {
                    const profile = await lineUtils.getGroupMemberProfile(groupId, item.userId || item.id);
                    if (profile.inGroup === false) continue;
                    valid.push(item);
                    if (valid.length >= 10) break;
                } catch (e) {
                    // skip
                }
            }
            return valid;
        };

        const wantedList = await filterGroupMembers(wantedListAll);
        const criminalDocsAll = criminalSnapshot.empty ? [] : criminalSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const criminalDocs = await filterGroupMembers(criminalDocsAll);

        const cleanName = (name) => {
            if (!name) return '';
            return name.replace(/\[.*?\]/g, '').replace(/\(出賣靈魂的賭狗\)/g, '').trim();
        };

        const formatCoins = (coins) => {
            if (coins === undefined || coins === null) return '💵 0';
            if (coins >= 100000000) {
                return `💵 ${(coins / 100000000).toFixed(2)}億`;
            }
            if (coins >= 10000) {
                return `💵 ${(coins / 10000).toFixed(0)}萬`;
            }
            return `💵 ${coins.toLocaleString()}`;
        };

        const parseProfession = (title) => {
            if (!title) return '一般市民';
            const clean = title.replace(/[\[\]]/g, '').replace(/\(出賣靈魂的賭狗\)/g, '').trim();
            return clean || '一般市民';
        };

        const createRow = (rankStr, rankColor, displayName, professionName, coinsStr, valStr, labelStr, valColor) => {
            return {
                type: 'box',
                layout: 'horizontal',
                alignItems: 'center',
                margin: 'md',
                contents: [
                    {
                        type: 'text',
                        text: rankStr,
                        size: 'sm',
                        weight: 'bold',
                        color: rankColor,
                        flex: 2,
                        align: 'center'
                    },
                    {
                        type: 'box',
                        layout: 'vertical',
                        flex: 7,
                        contents: [
                            {
                                type: 'text',
                                text: displayName,
                                size: 'sm',
                                weight: 'bold',
                                color: '#212121',
                                wrap: true
                            },
                            {
                                type: 'box',
                                layout: 'horizontal',
                                alignItems: 'center',
                                margin: 'xs',
                                spacing: 'md',
                                contents: [
                                    {
                                        type: 'box',
                                        layout: 'vertical',
                                        backgroundColor: flexUtils.COLORS.TEXT_SUB,
                                        cornerRadius: 'md',
                                        paddingStart: '6px',
                                        paddingEnd: '6px',
                                        paddingTop: '2px',
                                        paddingBottom: '2px',
                                        contents: [
                                            {
                                                type: 'text',
                                                text: professionName,
                                                size: 'xxs',
                                                color: '#FEFEFE',
                                                weight: 'bold'
                                            }
                                        ]
                                    },
                                    {
                                        type: 'text',
                                        text: coinsStr,
                                        size: 'xxs',
                                        color: '#2E7D32',
                                        weight: 'bold'
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        type: 'box',
                        layout: 'vertical',
                        flex: 3,
                        alignItems: 'flex-end',
                        contents: [
                            {
                                type: 'text',
                                text: valStr,
                                size: 'sm',
                                weight: 'bold',
                                color: valColor
                            },
                            {
                                type: 'text',
                                text: labelStr,
                                size: 'xxs',
                                color: '#9E9E9E',
                                margin: 'xs'
                            }
                        ]
                    }
                ]
            };
        };

        // ================= 1. 建立通緝榜 Bubble =================
        let wantedBubble;
        if (!wantedList || wantedList.length === 0) {
            wantedBubble = flexUtils.createBubble({
                size: 'mega',
                header: {
                    type: 'box',
                    layout: 'vertical',
                    paddingAll: '16px',
                    background: {
                        type: 'linearGradient',
                        angle: '0deg',
                        startColor: '#FFEBEB',
                        endColor: '#FCE4E4'
                    },
                    contents: [
                        { type: 'text', text: '🚨 頭號通緝犯榜單', weight: 'bold', size: 'lg', color: '#D32F2F', align: 'center' },
                        { type: 'text', text: 'WANTED LIST • 槍擊要犯', size: 'xxs', color: '#B71C1C', align: 'center', margin: 'xs', weight: 'bold' }
                    ]
                },
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: '🕊️ 目前沒有任何通緝犯，大家都是奉公守法的好公民！', size: 'md', color: '#555555', align: 'center', margin: 'md', wrap: true })
                ], { paddingAll: 'xl', backgroundColor: '#F7F7F7' })
            });
        } else {
            const contents = [];
            
            for (let i = 0; i < wantedList.length; i++) {
                const item = wantedList[i];
                let rankStr = `${i + 1}.`;
                let rankColor = flexUtils.COLORS.TEXT_SUB;
                if (i === 0) { rankStr = '🥇'; rankColor = '#D4AF37'; }
                else if (i === 1) { rankStr = '🥈'; rankColor = '#C0C0C0'; }
                else if (i === 2) { rankStr = '🥉'; rankColor = '#CD7F32'; }

                const wPercent = (item.wantedLevel * 100).toFixed(1) + '%';
                
                const professionTitle = await getProfessionTitle(item.userId);
                const professionName = parseProfession(professionTitle);
                const displayName = cleanName(item.name);
                const coinsStr = formatCoins(item.kuCoin);

                contents.push(createRow(
                    rankStr, 
                    rankColor, 
                    displayName, 
                    professionName, 
                    coinsStr, 
                    wPercent, 
                    '通緝值', 
                    '#D32F2F'
                ));
                
                if (i < wantedList.length - 1) {
                    contents.push(flexUtils.createSeparator('sm', flexUtils.COLORS.TEXT_SUB));
                }
            }

            wantedBubble = {
                type: 'bubble',
                size: 'mega',
                header: {
                    type: 'box',
                    layout: 'vertical',
                    paddingAll: '16px',
                    background: {
                        type: 'linearGradient',
                        angle: '0deg',
                        startColor: '#FFEBEB',
                        endColor: '#FCE4E4'
                    },
                    contents: [
                        { type: 'text', text: '🚨 頭號通緝犯榜單', weight: 'bold', size: 'lg', color: '#D32F2F', align: 'center' },
                        { type: 'text', text: 'WANTED LIST • 槍擊要犯', size: 'xxs', color: '#B71C1C', align: 'center', margin: 'xs', weight: 'bold' }
                    ]
                },
                body: {
                    type: 'box',
                    layout: 'vertical',
                    contents: contents,
                    paddingAll: 'lg',
                    backgroundColor: '#F7F7F7'
                }
            };
        }

        let criminalBubble;
        if (criminalDocs.length === 0) {
            criminalBubble = flexUtils.createBubble({
                size: 'mega',
                header: {
                    type: 'box',
                    layout: 'vertical',
                    paddingAll: '16px',
                    background: {
                        type: 'linearGradient',
                        angle: '0deg',
                        startColor: '#E0F2F1',
                        endColor: '#B2DFDB'
                    },
                    contents: [
                        { type: 'text', text: '🏆 前科排行榜', weight: 'bold', size: 'lg', color: '#00796B', align: 'center' },
                        { type: 'text', text: 'JAIL RECORD • 監獄常客', size: 'xxs', color: '#004D40', align: 'center', margin: 'xs', weight: 'bold' }
                    ]
                },
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: '🕊️ 目前群組內還沒有任何前科犯！大家都是乖寶寶！', size: 'md', color: '#555555', align: 'center', margin: 'md', wrap: true })
                ], { paddingAll: 'xl', backgroundColor: '#F7F7F7' })
            });
        } else {
            const contents = [];
            
            for (let i = 0; i < criminalDocs.length; i++) {
                const data = criminalDocs[i];
                const userId = data.id || data.userId;
                let rankStr = `${i + 1}.`;
                let rankColor = flexUtils.COLORS.TEXT_SUB;
                if (i === 0) { rankStr = '🥇'; rankColor = '#D4AF37'; }
                else if (i === 1) { rankStr = '🥈'; rankColor = '#C0C0C0'; }
                else if (i === 2) { rankStr = '🥉'; rankColor = '#CD7F32'; }

                const crimeRecord = data.crimeRecord || 0;
                
                const professionTitle = await getProfessionTitle(userId);
                const professionName = parseProfession(professionTitle);
                
                const { getCriminalTitle } = require('../handlers/jail');
                const crimeTitle = getCriminalTitle(crimeRecord);
                const displayName = crimeTitle + cleanName(data.displayName || data.name || '未知');
                
                const coinsStr = formatCoins(data.kuCoin);

                contents.push(createRow(
                    rankStr, 
                    rankColor, 
                    displayName, 
                    professionName, 
                    coinsStr, 
                    `${crimeRecord} 次`, 
                    '前科', 
                    '#00796B'
                ));
                
                if (i < criminalDocs.length - 1) {
                    contents.push(flexUtils.createSeparator('sm', flexUtils.COLORS.TEXT_SUB));
                }
            }

            criminalBubble = {
                type: 'bubble',
                size: 'mega',
                header: {
                    type: 'box',
                    layout: 'vertical',
                    paddingAll: '16px',
                    background: {
                        type: 'linearGradient',
                        angle: '0deg',
                        startColor: '#E0F2F1',
                        endColor: '#B2DFDB'
                    },
                    contents: [
                        { type: 'text', text: '🏆 前科排行榜', weight: 'bold', size: 'lg', color: '#00796B', align: 'center' },
                        { type: 'text', text: 'JAIL RECORD • 監獄常客', size: 'xxs', color: '#004D40', align: 'center', margin: 'xs', weight: 'bold' }
                    ]
                },
                body: {
                    type: 'box',
                    layout: 'vertical',
                    contents: contents,
                    paddingAll: 'lg',
                    backgroundColor: '#F7F7F7'
                }
            };
        }

        // ================= 3. 合併 Carousel 發送 =================
        const flexMsg = {
            type: 'flex',
            altText: '🚨 社會治安榜單 (通緝犯 / 前科犯)',
            contents: {
                type: 'carousel',
                contents: [wantedBubble, criminalBubble]
            }
        };

        await lineUtils.replyToLine(replyToken, [flexMsg]);

    } catch (e) {
        console.error('[Economy] showCombinedWantedAndJailRank Error:', e);
        await lineUtils.replyText(replyToken, '❌ 查詢排行榜時發生錯誤。');
    }
}

async function showCriminalList(replyToken, context) {
    const { userId, groupId } = context;
    try {
        const { getWantedList, getMafiaBoss } = require('../handlers/profession');
        const allTopList = await getWantedList();
        
        const filterGroupMembers = async (list) => {
            if (!groupId) return list.slice(0, 10);
            const valid = [];
            for (const item of list) {
                try {
                    const profile = await lineUtils.getGroupMemberProfile(groupId, item.userId || item.id);
                    if (profile.inGroup === false) continue;
                    valid.push(item);
                    if (valid.length >= 10) break;
                } catch (e) {
                    // skip
                }
            }
            return valid;
        };

        const topList = await filterGroupMembers(allTopList);

        if (!topList || topList.length === 0) {
            await lineUtils.replyText(replyToken, '💭 目前沒有任何有前科紀錄的犯罪者，天下太平！');
            return;
        }

        // 檢查呼叫者是否為警察
        const callerDoc = await db.collection(COLLECTION_NAME).doc(userId).get();
        const isPolice = callerDoc.exists && callerDoc.data().isPolice;

        const mafiaBoss = await getMafiaBoss();
        const mafiaBossId = mafiaBoss ? mafiaBoss.userId : null;

        const contents = [
            flexUtils.createText({ text: '🕶️ 槍擊要犯通緝名單', weight: 'bold', size: 'xl', color: '#FF4500', align: 'center' }),
            flexUtils.createText({ text: '依通緝值排序，最高且具黑幫身份者為【黑道老大】', size: 'xxs', color: flexUtils.COLORS.TEXT_SUB, align: 'center', margin: 'sm' }),
            flexUtils.createSeparator('md')
        ];

        topList.forEach((entry, i) => {
            const rank = i + 1;
            let rankStr = `${rank}.`;
            let rankColor = flexUtils.COLORS.TEXT_MAIN;
            let namePrefix = '';
            
            const isBoss = mafiaBossId && entry.userId === mafiaBossId;

            if (isBoss) {
                rankStr = '👑';
                rankColor = flexUtils.COLORS.PRIMARY;
                namePrefix = '【黑道老大】';
            } else {
                if (rank === 1) { rankStr = '🥇'; rankColor = flexUtils.COLORS.PRIMARY; }
                else if (rank === 2) { rankStr = '🥈'; rankColor = '#C0C0C0'; }
                else if (rank === 3) { rankStr = '🥉'; rankColor = '#CD7F32'; }
            }

            const cleanName = entry.name.replace(/\[.*?\]/g, '').trim();
            const bounty = entry.crimeRecord * 5000000;
            const wantedPct = (entry.wantedLevel * 100).toFixed(1) + '%';

            contents.push(flexUtils.createBox('vertical', [
                flexUtils.createBox('horizontal', [
                    flexUtils.createText({ text: rankStr, size: 'md', color: rankColor, flex: 1, weight: 'bold' }),
                    flexUtils.createText({ text: `${namePrefix}${cleanName}`, size: 'md', color: flexUtils.COLORS.TEXT_MAIN, flex: 8, wrap: true, weight: isBoss ? 'bold' : 'regular' })
                ], { alignItems: 'center' }),
                flexUtils.createBox('horizontal', [
                    flexUtils.createText({ text: `前科：${entry.crimeRecord} 次`, size: 'xs', color: flexUtils.COLORS.SECONDARY, flex: 1 }),
                    flexUtils.createText({ text: `通緝值：${wantedPct}`, size: 'xs', color: '#FF4500', flex: 1, align: 'end' })
                ], { margin: 'sm' }),
                flexUtils.createBox('horizontal', [
                    flexUtils.createText({ text: `💰 懸賞：${bounty.toLocaleString()} 哭幣`, size: 'xs', color: flexUtils.COLORS.PRIMARY, flex: 1 })
                ], { margin: 'xs' })
            ], { margin: 'lg' }));
        });

        const bubble = flexUtils.createBubble({
            size: 'mega',
            body: flexUtils.createBox('vertical', contents, { backgroundColor: flexUtils.COLORS.BG_CARD, paddingAll: 'xl' })
        });

        // 如果是警察，加入快速逮捕按鈕
        if (isPolice) {
            const footerButtons = topList.slice(0, 3).map(entry => {
                const cleanName = entry.name.replace(/\[.*?\]/g, '').trim();
                return flexUtils.createButton({
                    action: {
                        type: 'postback',
                        label: `🚔 逮捕 ${cleanName.substring(0, 12)}`,
                        data: `action=quickArrest&targetId=${entry.userId}`,
                        displayText: `逮捕 ${cleanName}`
                    },
                    style: 'primary',
                    color: '#D32F2F',
                    height: 'sm',
                    margin: 'sm'
                });
            });

            bubble.footer = flexUtils.createBox('vertical', footerButtons, {
                paddingAll: 'md',
                backgroundColor: '#2A2A2A'
            });
        }

        await lineUtils.replyFlex(replyToken, '通緝名單', bubble);

    } catch (e) {
        console.error('[Economy] showCriminalList Error:', e);
        await lineUtils.replyText(replyToken, '❌ 查詢通緝名單時發生錯誤。');
    }
}

async function handleRigBidding(replyToken, context) {
    const { userId, groupId } = context;
    const { db } = require('../utils/db');
    const lineUtils = require('../utils/line');
    const flexUtils = require('../utils/flex');

    try {
        const docRef = db.collection(COLLECTION_NAME).doc(userId);
        
        let resultData = null;
        await db.runTransaction(async (t) => {
            const doc = await t.get(docRef);
            if (!doc.exists) return;

            const data = doc.data();
            const now = Date.now();

            if (!data.councilorUntil || now >= data.councilorUntil) {
                resultData = { error: 'not_councilor' };
                return;
            }

            const cdKey = 'lastRigBid';
            const cdMs = 12 * 60 * 60 * 1000; // 12 小時
            const lastTime = data[cdKey] || 0;
            if (now - lastTime < cdMs) {
                resultData = { error: 'cooldown', lastTime, cdMs };
                return;
            }

            const rand = Math.random();
            let isSuccess = false;
            let isSuper = false;
            let lostCouncilor = false;
            let rewards = 0;
            let title = '';
            let desc = '';
            let color = '';

            if (rand < 0.4) {
                // 一般成功 40%
                isSuccess = true;
                rewards = Math.floor(Math.random() * 30000000) + 30000000; // 3000萬 ~ 6000萬
                title = '💰 圍標成功';
                desc = '你透過各種白手套運作，順利拿下了市府的公有停車場 BOT 案！';
                color = '#4CAF50';
            } else if (rand < 0.7) {
                // 巨大成功 30%
                isSuccess = true;
                isSuper = true;
                rewards = Math.floor(Math.random() * 100000000) + 150000000; // 1.5億 ~ 2.5億
                title = '💎 世紀大案得標';
                desc = '太神啦！你完美打通所有關節，獨攬了捷運聯合開發案的超級大工程，準備數錢數到手軟！';
                color = flexUtils.COLORS.PRIMARY;
            } else {
                // 東窗事發 30%
                lostCouncilor = true;
                title = '🚨 東窗事發！';
                desc = '你的白手套在喝醉時把事情全抖了出來，檢調單位直接持搜索票衝進你的辦公室！';
                color = '#FF0000';
                rewards = -Math.floor((data.kuCoin || 0) * 0.3); // 扣 30% 財產
                if (rewards > -100000000 && (data.kuCoin || 0) >= 100000000) {
                    rewards = -100000000; // 最少扣 1 億
                }
            }

            const updates = { [cdKey]: now };
            let isUmbrella = false;

            if (isSuccess) {
                updates.kuCoin = db.FieldValue.increment(rewards);
                updates.corruptionLevel = db.FieldValue.increment(0.10);
            } else {
                updates.kuCoin = db.FieldValue.increment(rewards);
                if (Math.random() < 0.25) {
                    isUmbrella = true;
                    lostCouncilor = false; // 保住資格
                    updates.corruptionLevel = db.FieldValue.increment(0.10);
                } else {
                    updates.councilorUntil = db.FieldValue.delete(); // 剝奪議員資格
                    updates.crimeRecord = db.FieldValue.increment(1);
                    updates.jailedUntil = now + 12 * 60 * 60 * 1000; // 關 12 小時
                    updates.wantedLevel = 0;
                    updates.jailbreakCooldownUntil = db.FieldValue.delete();
                    updates.corruptionLevel = db.FieldValue.delete(); // 被捕則清除
                }
            }

            t.update(docRef, updates);

            const oldBalance = data.kuCoin || 0;
            const newBalance = oldBalance + rewards;

            resultData = {
                isSuccess,
                isSuper,
                lostCouncilor,
                rewards,
                title,
                desc,
                color,
                isUmbrella,
                newBalance,
                now,
                corruptionLevel: (data.corruptionLevel || 0) + 0.10,
                name: data.name
            };
        });

        if (!resultData) return;
        if (resultData.error === 'not_councilor') {
            await lineUtils.replyText(replyToken, '❌ 你又不是市議員，連標單都拿不到還想圍標？');
            return;
        }
        if (resultData.error === 'cooldown') {
            const remain = Math.ceil((resultData.cdMs - (Date.now() - resultData.lastTime)) / 60000);
            const hrs = Math.floor(remain / 60);
            const mins = remain % 60;
            await lineUtils.replyText(replyToken, `⏳ 最近才剛標下一件大工程，風聲很緊！請等待 ${hrs}時 ${mins}分 後再行動。`);
            return;
        }

        const memberName = await lineUtils.getGroupMemberName(groupId, userId).catch(() => resultData.name || '議員');

        let corruptionStr = '';
        if (resultData.isSuccess || resultData.isUmbrella) {
            corruptionStr = (resultData.corruptionLevel * 100).toFixed(0) + '%';
        }

        let bodyContents = [
            flexUtils.createText({ text: resultData.desc, size: 'sm', color: flexUtils.COLORS.TEXT_MAIN, wrap: true }),
            flexUtils.createSeparator('md')
        ];

        if (resultData.isSuccess) {
            bodyContents.push(flexUtils.createText({ text: `💸 獲得暴利：${resultData.rewards.toLocaleString()} 哭幣`, size: 'sm', color: flexUtils.COLORS.PRIMARY, weight: 'bold', margin: 'md' }));
            bodyContents.push(flexUtils.createText({ text: `💰 目前貪污值：${corruptionStr}`, size: 'xs', color: '#E91E63', margin: 'sm' }));
        } else {
            bodyContents.push(flexUtils.createText({ text: `💸 財產遭扣押：${Math.abs(resultData.rewards).toLocaleString()} 哭幣`, size: 'sm', color: '#FF0000', weight: 'bold', margin: 'md' }));
            if (resultData.isUmbrella) {
                bodyContents.push(flexUtils.createText({ text: `🏛️ 【司法保護傘】因缺乏關鍵證據，地檢署對您不予起訴！您免除了牢獄之災並保住資格！`, size: 'sm', color: '#673AB7', weight: 'bold', wrap: true }));
                bodyContents.push(flexUtils.createText({ text: `💰 目前貪污值：${corruptionStr}`, size: 'xs', color: '#E91E63', margin: 'sm' }));
            } else {
                bodyContents.push(flexUtils.createText({ text: `💥 當場遭到褫奪公權，喪失議員資格！`, size: 'sm', color: '#FF0000', weight: 'bold' }));
                bodyContents.push(flexUtils.createText({ text: `🚓 收押禁見入獄 12 小時，前科 + 1！`, size: 'sm', color: '#FF0000', weight: 'bold' }));
            }
        }

        // 加上結算後的總資產
        bodyContents.push(flexUtils.createText({ text: `💰 結算總資產：${resultData.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: flexUtils.COLORS.PRIMARY, margin: 'md' }));

        // 加上冷卻提示
        const nextTimeStr = new Date(resultData.now + 12 * 60 * 60 * 1000).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
        bodyContents.push(flexUtils.createText({ text: `⏳ 冷卻時間：12 小時\n（可於 ${nextTimeStr} 後再次圍標）`, size: 'xs', color: flexUtils.COLORS.TEXT_SUB, wrap: true, margin: 'sm' }));

        const flexBubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader(resultData.title, `【市議員】${memberName}`, flexUtils.COLORS.BG_CARD, resultData.color),
            body: flexUtils.createBox('vertical', bodyContents, { backgroundColor: flexUtils.COLORS.BG_CARD, paddingAll: 'xl' })
        });

        // 發送結果
        await lineUtils.replyFlex(replyToken, resultData.isSuccess ? '議員圍標成功！' : '議員貪污遭逮！', flexBubble);

    } catch (e) {
        console.error('[Economy] handleRigBidding Error:', e);
        const lineUtils = require('../utils/line');
        await lineUtils.replyText(replyToken, '❌ 執行發生錯誤。');
    }
}

async function handleEmbezzle(replyToken, context) {
    const { userId, groupId } = context;
    const { db } = require('../utils/db');
    const lineUtils = require('../utils/line');
    const flexUtils = require('../utils/flex');

    try {
        const docRef = db.collection(COLLECTION_NAME).doc(userId);
        
        let resultData = null;
        await db.runTransaction(async (t) => {
            const doc = await t.get(docRef);
            if (!doc.exists) return;

            const data = doc.data();
            const now = Date.now();

            if (!data.councilorUntil || now >= data.councilorUntil) {
                resultData = { error: 'not_councilor' };
                return;
            }

            const cdKey = 'lastEmbezzle';
            const cdMs = 2 * 60 * 60 * 1000; // 2 小時
            const lastTime = data[cdKey] || 0;
            if (now - lastTime < cdMs) {
                resultData = { error: 'cooldown', lastTime, cdMs };
                return;
            }

            // 隱藏機率判定 (每日重置)
            const dateStr = new Date(now + 8 * 60 * 60 * 1000).toISOString().split('T')[0];
            let embezzleRisk = data.embezzleRisk || { date: dateStr, rate: 0 };
            if (embezzleRisk.date !== dateStr) {
                embezzleRisk = { date: dateStr, rate: 0 }; // 隔日重置
            }

            const currentRisk = embezzleRisk.rate;
            const rand = Math.random();

            if (rand < currentRisk) {
                // 爆雷！
                let isUmbrella = false;
                const updates = { [cdKey]: now };

                if (Math.random() < 0.25) {
                    isUmbrella = true;
                    // 觸發保護傘免死
                    updates.corruptionLevel = db.FieldValue.increment(0.03);
                } else {
                    updates.councilorUntil = db.FieldValue.delete();
                    updates.crimeRecord = db.FieldValue.increment(1);
                    updates.jailedUntil = now + 12 * 60 * 60 * 1000;
                    updates.wantedLevel = 0;
                    updates.jailbreakCooldownUntil = db.FieldValue.delete();
                    updates.corruptionLevel = db.FieldValue.delete();
                }

                t.update(docRef, updates);

                resultData = {
                    outcome: 'fail',
                    isUmbrella,
                    now,
                    corruptionLevel: (data.corruptionLevel || 0) + 0.03,
                    name: data.name,
                    newBalance: data.kuCoin || 0
                };
                return;
            }

            // 成功領取
            const rewards = Math.floor(Math.random() * 2000000) + 1000000; // 100萬 ~ 300萬
            embezzleRisk.rate += 0.05; // 每次增加 5% 風險

            t.update(docRef, {
                kuCoin: db.FieldValue.increment(rewards),
                embezzleRisk: embezzleRisk,
                corruptionLevel: db.FieldValue.increment(0.03),
                [cdKey]: now
            });

            const newBalance = (data.kuCoin || 0) + rewards;

            resultData = {
                outcome: 'success',
                rewards,
                embezzleRisk,
                now,
                corruptionLevel: (data.corruptionLevel || 0) + 0.03,
                name: data.name,
                newBalance
            };
        });

        if (!resultData) return;
        if (resultData.error === 'not_councilor') {
            await lineUtils.replyText(replyToken, '❌ 你不是議員，沒辦法報帳請領助理費！');
            return;
        }
        if (resultData.error === 'cooldown') {
            const remain = Math.ceil((resultData.cdMs - (Date.now() - resultData.lastTime)) / 60000);
            const hrs = Math.floor(remain / 60);
            const mins = remain % 60;
            await lineUtils.replyText(replyToken, `⏳ 會計說這個月的額度剛報完，請等待 ${hrs}時 ${mins}分 後再來！`);
            return;
        }

        const memberName = await lineUtils.getGroupMemberName(groupId, userId).catch(() => resultData.name || '議員');
        const nextTimeStr = new Date(resultData.now + 2 * 60 * 60 * 1000).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });

        if (resultData.outcome === 'fail') {
            let corruptionStr = '';
            if (resultData.isUmbrella) {
                corruptionStr = (resultData.corruptionLevel * 100).toFixed(0) + '%';
            }

            let bodyContents = [
                flexUtils.createText({ text: '調查局接獲檢舉，查出你長期利用人頭詐領助理費中飽私囊！', size: 'sm', color: flexUtils.COLORS.TEXT_MAIN, wrap: true }),
                flexUtils.createSeparator('md')
            ];

            if (resultData.isUmbrella) {
                bodyContents.push(flexUtils.createText({ text: `🏛️ 【司法保護傘】因缺乏關鍵證據，地檢署對您不予起訴！您免除了牢獄之災並保住資格！`, size: 'sm', color: '#673AB7', weight: 'bold', margin: 'md', wrap: true }));
                bodyContents.push(flexUtils.createText({ text: `💰 目前貪污值：${corruptionStr}`, size: 'xs', color: '#E91E63', margin: 'sm' }));
            } else {
                bodyContents.push(flexUtils.createText({ text: `💥 當場遭到褫奪公權，喪失議員資格！`, size: 'sm', color: '#FF0000', weight: 'bold', margin: 'md' }));
                bodyContents.push(flexUtils.createText({ text: `🚓 收押禁見入獄 12 小時，前科 + 1！`, size: 'sm', color: '#FF0000', weight: 'bold' }));
            }

            // 加上結算後的總資產
            bodyContents.push(flexUtils.createText({ text: `💰 結算總資產：${resultData.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: flexUtils.COLORS.PRIMARY, margin: 'md' }));

            // 加上冷卻提示
            bodyContents.push(flexUtils.createText({ text: `⏳ 冷卻時間：2 小時\n（可於 ${nextTimeStr} 後再次詐領）`, size: 'xs', color: flexUtils.COLORS.TEXT_SUB, wrap: true, margin: 'sm' }));

            const flexBubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('🚨 詐領助理費遭法辦', `【市議員】${memberName}`, flexUtils.COLORS.BG_CARD, '#FF0000'),
                body: flexUtils.createBox('vertical', bodyContents, { backgroundColor: flexUtils.COLORS.BG_CARD, paddingAll: 'xl' })
            });

            await lineUtils.replyFlex(replyToken, '議員詐領助理費遭法辦！', flexBubble);
        } else {
            const corruptionStr = (resultData.corruptionLevel * 100).toFixed(0) + '%';

            let bodyContents = [
                flexUtils.createText({ text: '你順利利用親戚當人頭報帳，把市府的公款洗進自己的口袋裡。', size: 'sm', color: flexUtils.COLORS.TEXT_MAIN, wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `💸 獲得公款：${resultData.rewards.toLocaleString()} 哭幣`, size: 'sm', color: '#4CAF50', weight: 'bold', margin: 'md' }),
                flexUtils.createText({ text: `💰 目前貪污值：${corruptionStr}`, size: 'xs', color: '#E91E63', margin: 'sm' }),
                flexUtils.createText({ text: `⚠️ (檢調盯上你的風險已提升至 ${Math.round(resultData.embezzleRisk.rate * 100)}%)`, size: 'xs', color: flexUtils.COLORS.TEXT_SUB, wrap: true, margin: 'sm' }),
                flexUtils.createText({ text: `💰 結算總資產：${resultData.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: flexUtils.COLORS.PRIMARY, margin: 'md' }),
                flexUtils.createText({ text: `⏳ 冷卻時間：2 小時\n（可於 ${nextTimeStr} 後再次詐領）`, size: 'xs', color: flexUtils.COLORS.TEXT_SUB, wrap: true, margin: 'sm' })
            ];

            const flexBubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('📜 詐領助理費', `【市議員】${memberName}`, flexUtils.COLORS.BG_CARD, '#8BC34A'),
                body: flexUtils.createBox('vertical', bodyContents, { backgroundColor: flexUtils.COLORS.BG_CARD, paddingAll: 'xl' })
            });

            await lineUtils.replyFlex(replyToken, '議員成功詐領助理費！', flexBubble);
        }

    } catch (e) {
        console.error('[Economy] handleEmbezzle Error:', e);
        const lineUtils = require('../utils/line');
        await lineUtils.replyText(replyToken, '❌ 執行發生錯誤。');
    }
}


module.exports = {
  addWantedLevel,
  queryWantedLevel,
  showWantedLeaderboard,
  showCombinedWantedAndJailRank,
  showCriminalList,
  handleRigBidding,
  handleEmbezzle
};
