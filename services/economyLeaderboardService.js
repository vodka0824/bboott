const { db } = require('../utils/db');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const memoryCache = require('../utils/memoryCache');

const COLLECTION_NAME = 'economy_users';

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
        ], { paddingAll: 'xl', backgroundColor: flexUtils.COLORS.BG_MAIN }) // Dark theme to match the rest of the dark bubbles
    };
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

async function showAllLeaderboards(replyToken, groupId) {
    try {
        const adminId = process.env.ADMIN_USER_ID;
        const cacheKey = groupId ? `leaderboard:all:${groupId}` : 'leaderboard:all:global';
        let flexMsg = memoryCache.get(cacheKey);

        if (!flexMsg) {
            const { getMafiaBoss, getProfessionTitle } = require('../handlers/profession');
            const mafiaBoss = await getMafiaBoss();
            const mafiaBossId = mafiaBoss ? mafiaBoss.userId : null;
            const now = Date.now();

            const getProfessionName = (user, title) => {
                if (user.id === mafiaBossId) return '黑道老大';
                if (user.isMafia) {
                    const wl = user.wantedLevel || 0;
                    const cr = user.crimeRecord || 0;
                    const score = (wl * 100) + (cr * 5);
                    if (score >= 60) return '黑幫堂主';
                    if (score >= 20) return '黑道打手';
                    return '泊車小弟';
                }
                if (!title) return '一般市民';
                const clean = title.replace(/[\[\]]/g, '').replace(/\(出賣靈魂的賭狗\)/g, '').trim();
                return clean || '一般市民';
            };

            const cleanName = (name) => {
                if (!name) return '';
                return name.replace(/\[.*?\]/g, '').replace(/\(出賣靈魂的賭狗\)/g, '').trim();
            };

            const formatCoins = (coins) => {
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
            };

            const createLeaderboardRow = (rankStr, rankColor, displayName, professionName, subText, subTextColor, valStr, labelStr, valColor, isTop3) => {
                const padding = isTop3 ? '12px' : '8px';
                
                const box = {
                    type: 'box',
                    layout: 'horizontal',
                    alignItems: 'center',
                    paddingAll: padding,
                    cornerRadius: 'lg',
                    margin: 'sm',
                    contents: [
                        {
                            type: 'box',
                            layout: 'vertical',
                            flex: 2,
                            alignItems: 'center',
                            justifyContent: 'center',
                            contents: [
                                {
                                    type: 'text',
                                    text: rankStr,
                                    size: isTop3 ? 'xl' : 'lg',
                                    weight: 'bold',
                                    color: rankColor,
                                    align: 'center'
                                }
                            ]
                        },
                        {
                            type: 'box',
                            layout: 'vertical',
                            flex: 6,
                            contents: [
                                {
                                    type: 'text',
                                    text: displayName,
                                    size: 'sm',
                                    weight: 'bold',
                                    color: flexUtils.COLORS.TEXT_MAIN,
                                    wrap: true
                                },
                                {
                                    type: 'box',
                                    layout: 'horizontal',
                                    alignItems: 'center',
                                    margin: 'xs',
                                    spacing: 'sm',
                                    contents: [
                                        {
                                            type: 'box',
                                            layout: 'vertical',
                                            backgroundColor: flexUtils.COLORS.BG_CARD,
                                            cornerRadius: 'sm',
                                            paddingStart: '6px',
                                            paddingEnd: '6px',
                                            paddingTop: '2px',
                                            paddingBottom: '2px',
                                            contents: [
                                                {
                                                    type: 'text',
                                                    text: professionName,
                                                    size: 'xxs',
                                                    color: flexUtils.COLORS.TEXT_SUB,
                                                    weight: 'bold'
                                                }
                                            ]
                                        },
                                        {
                                            type: 'text',
                                            text: subText,
                                            size: 'xxs',
                                            color: subTextColor,
                                            weight: 'bold'
                                        }
                                    ]
                                }
                            ]
                        },
                        {
                            type: 'box',
                            layout: 'vertical',
                            flex: 4,
                            alignItems: 'flex-end',
                            justifyContent: 'center',
                            contents: [
                                {
                                    type: 'text',
                                    text: valStr,
                                    size: 'md',
                                    weight: 'bold',
                                    color: valColor
                                },
                                {
                                    type: 'text',
                                    text: labelStr,
                                    size: 'xxs',
                                    color: flexUtils.COLORS.TEXT_SUB,
                                    margin: 'xs'
                                }
                            ]
                        }
                    ]
                };

                if (isTop3) {
                    box.backgroundColor = flexUtils.COLORS.BG_CARD;
                }
                return box;
            };

            // W-06: 平行查詢三種排行榜資料，因為需要過濾群組成員，先抓取較多筆數 (例如 50 筆)
            const fetchLimit = groupId ? 50 : 15;
            const [wealthSnapshot, gamblerSnapshot, debtSnapshot] = await Promise.all([
                db.collection(COLLECTION_NAME).orderBy('kuCoin', 'desc').limit(fetchLimit).get(),
                db.collection(COLLECTION_NAME).orderBy('totalBetAmount', 'desc').limit(fetchLimit).get(),
                db.collection(COLLECTION_NAME).where('kuCoin', '<', 0).orderBy('kuCoin', 'asc').limit(fetchLimit).get()
            ]);

            // 過濾群組成員的輔助函數
            const filterGroupMembers = async (snapshot, isGambler = false) => {
                if (snapshot.empty) return [];
                const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(u => u.id !== adminId && (!isGambler || u.totalBetAmount > 0));
                
                if (!groupId) return docs.slice(0, 10);
                
                const validUsers = [];
                for (const user of docs) {
                    try {
                        const profile = await lineUtils.getGroupMemberProfile(groupId, user.id);
                        if (profile.inGroup === false) continue;
                        validUsers.push(user);
                        if (validUsers.length >= 10) break;
                    } catch (err) {
                        // error from api
                    }
                }
                return validUsers;
            };

            // ================= 財富榜 =================
            let wealthBubble;
            const topUsers = await filterGroupMembers(wealthSnapshot);
            if (topUsers.length === 0) {
                wealthBubble = createEmptyLeaderboardBubble('🏆 財富排行榜 (Top 10)', '目前沒有任何人擁有哭幣。', flexUtils.COLORS.BG_CARD, flexUtils.COLORS.BG_CARD, flexUtils.COLORS.PRIMARY);
            } else {
                const contents = [];
                
                for (let i = 0; i < topUsers.length; i++) {
                    const user = topUsers[i];
                    let rankStr = `${i + 1}.`;
                    let rankColor = flexUtils.COLORS.TEXT_MUTED;
                    if (i === 0) { rankStr = '🥇'; rankColor = flexUtils.COLORS.PRIMARY; }
                    else if (i === 1) { rankStr = '🥈'; rankColor = '#C0C0C0'; }
                    else if (i === 2) { rankStr = '🥉'; rankColor = '#CD7F32'; }

                    const titleInfo = getTitleInfo(user.kuCoin || 0);
                    const formattedCoin = formatCoins(user.kuCoin || 0);
                    const professionTitle = await getProfessionTitle(user.id);
                    const professionName = getProfessionName(user, professionTitle);
                    const displayName = cleanName(user.displayName || user.name || '未知用戶');

                    contents.push(createLeaderboardRow(
                        rankStr,
                        rankColor,
                        displayName,
                        professionName,
                        `「${titleInfo.name}」`,
                        '#CE93D8', 
                        formattedCoin,
                        '資產',
                        flexUtils.COLORS.PRIMARY, 
                        i < 3
                    ));

                    if (i < topUsers.length - 1) {
                        contents.push(flexUtils.createSeparator('sm', flexUtils.COLORS.BG_CARD));
                    }
                }

                wealthBubble = {
                    type: 'bubble',
                    size: 'mega',
                    header: {
                        type: 'box',
                        layout: 'vertical',
                        paddingAll: '16px',
                        background: {
                            type: 'linearGradient',
                            angle: '0deg',
                            startColor: flexUtils.COLORS.BG_CARD,
                            endColor: flexUtils.COLORS.BG_CARD
                        },
                        contents: [
                            { type: 'text', text: '🏆 財富排行榜 (Top 10)', weight: 'bold', size: 'xl', color: flexUtils.COLORS.PRIMARY, align: 'center' },
                            { type: 'text', text: 'WEALTH RANK • 社會富豪', size: 'xxs', color: '#F39C12', align: 'center', margin: 'sm', weight: 'bold' }
                        ]
                    },
                    body: {
                        type: 'box',
                        layout: 'vertical',
                        contents: contents,
                        paddingAll: 'lg',
                        backgroundColor: flexUtils.COLORS.BG_MAIN
                    }
                };
            }

            // ================= 賭狗榜 =================
            let gamblerBubble;
            const gamblerUsers = await filterGroupMembers(gamblerSnapshot, true);
            
            if (gamblerUsers.length === 0) {
                gamblerBubble = createEmptyLeaderboardBubble('🎲 賭狗排行榜 (Top 10)', '目前還沒有人參與過任何賭博。', flexUtils.COLORS.BG_CARD, flexUtils.COLORS.BG_CARD, '#FF2E63');
            } else {
                const contents = [];

                for (let i = 0; i < gamblerUsers.length; i++) {
                    const user = gamblerUsers[i];
                    let rankStr = `${i + 1}.`;
                    let rankColor = flexUtils.COLORS.TEXT_MUTED;
                    if (i === 0) { rankStr = '🥇'; rankColor = flexUtils.COLORS.PRIMARY; }
                    else if (i === 1) { rankStr = '🥈'; rankColor = '#C0C0C0'; }
                    else if (i === 2) { rankStr = '🥉'; rankColor = '#CD7F32'; }

                    const formattedCoin = formatCoins(user.totalBetAmount || 0);
                    const professionTitle = await getProfessionTitle(user.id);
                    const professionName = getProfessionName(user, professionTitle);
                    const displayName = cleanName(user.displayName || user.name || '未知用戶');

                    contents.push(createLeaderboardRow(
                        rankStr,
                        rankColor,
                        displayName,
                        professionName,
                        `${user.gambleCount || 0} 次賭博`,
                        flexUtils.COLORS.TEXT_SUB,
                        formattedCoin,
                        '總投注',
                        '#FF2E63',
                        i < 3
                    ));

                    if (i < gamblerUsers.length - 1) {
                        contents.push(flexUtils.createSeparator('sm', flexUtils.COLORS.BG_CARD));
                    }
                }

                gamblerBubble = {
                    type: 'bubble',
                    size: 'mega',
                    header: {
                        type: 'box',
                        layout: 'vertical',
                        paddingAll: '16px',
                        background: {
                            type: 'linearGradient',
                            angle: '0deg',
                            startColor: flexUtils.COLORS.BG_CARD,
                            endColor: flexUtils.COLORS.BG_CARD
                        },
                        contents: [
                            { type: 'text', text: '🎲 賭狗排行榜 (Top 10)', weight: 'bold', size: 'xl', color: '#FF2E63', align: 'center' },
                            { type: 'text', text: 'GAMBLER RANK • 歷史總投注', size: 'xxs', color: '#E91E63', align: 'center', margin: 'sm', weight: 'bold' }
                        ]
                    },
                    body: {
                        type: 'box',
                        layout: 'vertical',
                        contents: contents,
                        paddingAll: 'lg',
                        backgroundColor: flexUtils.COLORS.BG_MAIN
                    }
                };
            }

            // ================= 債務榜 =================
            let debtBubble;
            const debtUsers = await filterGroupMembers(debtSnapshot);
            
            if (debtUsers.length === 0) {
                debtBubble = createEmptyLeaderboardBubble('💸 跑路債務榜 (Top 10)', '🎉 目前沒有任何人負債！大家都很富有！', flexUtils.COLORS.BG_CARD, flexUtils.COLORS.BG_CARD, '#00E676');
            } else {
                const contents = [];

                for (let i = 0; i < debtUsers.length; i++) {
                    const user = debtUsers[i];
                    let rankStr = `${i + 1}.`;
                    let rankColor = flexUtils.COLORS.TEXT_MUTED;
                    if (i === 0) { rankStr = '💀'; rankColor = '#FF5252'; }
                    else if (i === 1) { rankStr = '🩸'; rankColor = '#FF8A80'; }
                    else if (i === 2) { rankStr = '🤕'; rankColor = '#FFCDD2'; }

                    const formattedCoin = formatCoins(Math.abs(user.kuCoin || 0));
                    const professionTitle = await getProfessionTitle(user.id);
                    const professionName = getProfessionName(user, professionTitle);
                    const displayName = cleanName(user.displayName || user.name || '未知帳戶');

                    contents.push(createLeaderboardRow(
                        rankStr,
                        rankColor,
                        displayName,
                        professionName,
                        '跑路中',
                        '#E91E63',
                        '-' + formattedCoin,
                        '負債金額',
                        '#D32F2F',
                        i < 3
                    ));

                    if (i < debtUsers.length - 1) {
                        contents.push(flexUtils.createSeparator('sm', flexUtils.COLORS.BG_CARD));
                    }
                }

                debtBubble = {
                    type: 'bubble',
                    size: 'mega',
                    header: {
                        type: 'box',
                        layout: 'vertical',
                        paddingAll: '16px',
                        background: {
                            type: 'linearGradient',
                            angle: '0deg',
                            startColor: flexUtils.COLORS.BG_CARD,
                            endColor: flexUtils.COLORS.BG_CARD
                        },
                        contents: [
                            { type: 'text', text: '💸 跑路債務榜 (Top 10)', weight: 'bold', size: 'xl', color: '#FF5252', align: 'center' },
                            { type: 'text', text: 'DEBT RANK • 社會底層', size: 'xxs', color: '#D32F2F', align: 'center', margin: 'sm', weight: 'bold' }
                        ]
                    },
                    body: {
                        type: 'box',
                        layout: 'vertical',
                        contents: contents,
                        paddingAll: 'lg',
                        backgroundColor: flexUtils.COLORS.BG_MAIN
                    }
                };
            }
        
            // 合併發送 Carousel
            const carousel = {
                type: 'carousel',
                contents: [wealthBubble, gamblerBubble, debtBubble]
            };

            flexMsg = {
                type: 'flex',
                altText: '📊 綜合排行榜 (財富 / 賭狗 / 債務)',
                contents: carousel
            };
            
            memoryCache.set(cacheKey, flexMsg, 60); // 快取 60 秒
        }

        await lineUtils.replyToLine(replyToken, [flexMsg]);

    } catch (e) {
        console.error('[Economy] showAllLeaderboards Error:', e);
        await lineUtils.replyText(replyToken, '❌ 查詢排行榜失敗');
    }
}

module.exports = {
    showAllLeaderboards
};
