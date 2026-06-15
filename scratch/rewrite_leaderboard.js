const fs = require('fs');
const path = require('path');

const economyJsPath = path.join(__dirname, '../handlers/economy.js');
let economyCode = fs.readFileSync(economyJsPath, 'utf8');

// Replace showAllLeaderboards with showLeaderboard
const showAllLeaderboardsStart = economyCode.indexOf('async function showAllLeaderboards(replyToken) {');
if (showAllLeaderboardsStart === -1) {
    console.error("Could not find showAllLeaderboards in economy.js");
    process.exit(1);
}

// Find the end of showAllLeaderboards (it ends right before `// 10. 急難救助金`)
const showAllLeaderboardsEnd = economyCode.indexOf('// 10. 急難救助金', showAllLeaderboardsStart);

if (showAllLeaderboardsEnd === -1) {
    console.error("Could not find the end of showAllLeaderboards");
    process.exit(1);
}

const newShowLeaderboard = `async function showLeaderboard(replyToken, type) {
    try {
        const adminId = process.env.ADMIN_USER_ID;
        const cacheKey = \`leaderboard:\${type}\`;
        let flexMsg = memoryCache.get(cacheKey);

        if (!flexMsg) {
            const { getMafiaBoss, getProfessionTitle } = require('./profession');
            const mafiaBoss = await getMafiaBoss();
            const mafiaBossId = mafiaBoss ? mafiaBoss.userId : null;
            const now = Date.now();

            const getProfessionName = (user, title) => {
                if (user.id === mafiaBossId) return '黑道老大';
                if (!title) return '一般市民';
                const clean = title.replace(/[\\[\\]]/g, '').replace(/\\(出賣靈魂的賭狗\\)/g, '').trim();
                return clean || '一般市民';
            };

            const cleanName = (name) => {
                if (!name) return '';
                return name.replace(/\\[.*?\\]/g, '').replace(/\\(出賣靈魂的賭狗\\)/g, '').trim();
            };

            const getProfessionSuffix = (user) => {
                if (user.isMafia) {
                    if (user.id === mafiaBossId) return '[黑道老大]';
                    if ((user.crimeRecord || 0) >= 11) return '[黑幫堂主]';
                    if ((user.crimeRecord || 0) >= 3) return '[黑道小弟]';
                    return '[黑道泊車小弟]';
                }
                if (user.councilorUntil && now < user.councilorUntil) return '[市議員]';
                if (user.militaryUntil && now < user.militaryUntil) return '[軍人]';
                if (user.isPolice) return '[警察]';
                return '';
            };

            const formatCoins = (coins) => {
                if (coins === undefined || coins === null) return '0';
                const abs = Math.abs(coins);
                const prefix = coins < 0 ? '-' : '';
                if (abs >= 100000000) {
                    return \`\${prefix}\${(abs / 100000000).toFixed(1)}億\`;
                }
                if (abs >= 10000) {
                    return \`\${prefix}\${(abs / 10000).toFixed(0)}萬\`;
                }
                return \`\${prefix}\${abs.toLocaleString()}\`;
            };

            const createLeaderboardRow = (rankStr, rankColor, displayName, professionName, subText, subTextColor, valStr, labelStr, valColor) => {
                return {
                    type: 'box',
                    layout: 'horizontal',
                    alignItems: 'center',
                    margin: 'md',
                    contents: [
                        { type: 'text', text: rankStr, size: 'sm', weight: 'bold', color: rankColor, flex: 2, align: 'center' },
                        {
                            type: 'box', layout: 'vertical', flex: 6,
                            contents: [
                                { type: 'text', text: displayName, size: 'sm', weight: 'bold', color: '#212121', wrap: true },
                                {
                                    type: 'box', layout: 'horizontal', alignItems: 'center', margin: 'xs', spacing: 'md',
                                    contents: [
                                        {
                                            type: 'box', layout: 'vertical', backgroundColor: '#F5F5F5', cornerRadius: 'md', paddingStart: '6px', paddingEnd: '6px', paddingTop: '2px', paddingBottom: '2px',
                                            contents: [{ type: 'text', text: professionName, size: 'xxs', color: '#616161', weight: 'bold' }]
                                        },
                                        { type: 'text', text: subText, size: 'xxs', color: subTextColor, weight: 'bold' }
                                    ]
                                }
                            ]
                        },
                        {
                            type: 'box', layout: 'vertical', flex: 4, alignItems: 'flex-end',
                            contents: [
                                { type: 'text', text: valStr, size: 'sm', weight: 'bold', color: valColor },
                                { type: 'text', text: labelStr, size: 'xxs', color: '#9E9E9E', margin: 'xs' }
                            ]
                        }
                    ]
                };
            };

            let bubble;

            if (type === 'wealth') {
                const wealthSnapshot = await db.collection(COLLECTION_NAME).orderBy('kuCoin', 'desc').limit(15).get();
                if (wealthSnapshot.empty) {
                    bubble = createEmptyLeaderboardBubble('🏆 財富排行榜 (Top 10)', '目前沒有任何人擁有哭幣。', '#FFFDE7', '#FFF9C4', '#F57F17');
                } else {
                    const topUsers = wealthSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(u => u.id !== adminId).slice(0, 10);
                    const contents = [];
                    for (let i = 0; i < topUsers.length; i++) {
                        const user = topUsers[i];
                        let rankStr = \`\${i + 1}.\`;
                        let rankColor = '#757575';
                        if (i === 0) { rankStr = '🥇'; rankColor = '#D4AF37'; }
                        else if (i === 1) { rankStr = '🥈'; rankColor = '#C0C0C0'; }
                        else if (i === 2) { rankStr = '🥉'; rankColor = '#CD7F32'; }

                        const titleInfo = getTitleInfo(user.kuCoin || 0);
                        const formattedCoin = formatCoins(user.kuCoin || 0);
                        const professionTitle = await getProfessionTitle(user.id);
                        const professionName = getProfessionName(user, professionTitle);
                        const displayName = cleanName(user.displayName || user.name || '未知用戶');

                        contents.push(createLeaderboardRow(
                            rankStr, rankColor, displayName, professionName,
                            \`「\${titleInfo.name}」\`, '#8E24AA', formattedCoin, '資產', '#E65100'
                        ));

                        if (i < topUsers.length - 1) contents.push(flexUtils.createSeparator('sm', '#EEEEEE'));
                    }
                    bubble = {
                        type: 'bubble', size: 'mega',
                        header: {
                            type: 'box', layout: 'vertical', paddingAll: '16px',
                            background: { type: 'linearGradient', angle: '0deg', startColor: '#FFFDE7', endColor: '#FFF9C4' },
                            contents: [
                                { type: 'text', text: '🏆 財富排行榜 (Top 10)', weight: 'bold', size: 'lg', color: '#F57F17', align: 'center' },
                                { type: 'text', text: 'WEALTH RANK • 社會富豪', size: 'xxs', color: '#F57F17', align: 'center', margin: 'xs', weight: 'bold' }
                            ]
                        },
                        body: { type: 'box', layout: 'vertical', contents: contents, paddingAll: 'lg', backgroundColor: '#FFFFFF' }
                    };
                }
                flexMsg = { type: 'flex', altText: '🏆 財富排行榜', contents: bubble };

            } else if (type === 'gambler') {
                const gamblerSnapshot = await db.collection(COLLECTION_NAME).orderBy('totalBetAmount', 'desc').limit(15).get();
                const gamblerUsers = gamblerSnapshot.empty ? [] : gamblerSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(u => u.id !== adminId && u.totalBetAmount > 0).slice(0, 10);
                
                if (gamblerUsers.length === 0) {
                    bubble = createEmptyLeaderboardBubble('🎲 賭博排行榜 (Top 10)', '目前還沒有人參與過任何賭博。', '#FCE4EC', '#F8BBD0', '#C2185B');
                } else {
                    const contents = [];
                    for (let i = 0; i < gamblerUsers.length; i++) {
                        const user = gamblerUsers[i];
                        let rankStr = \`\${i + 1}.\`;
                        let rankColor = '#757575';
                        if (i === 0) { rankStr = '🥇'; rankColor = '#D4AF37'; }
                        else if (i === 1) { rankStr = '🥈'; rankColor = '#C0C0C0'; }
                        else if (i === 2) { rankStr = '🥉'; rankColor = '#CD7F32'; }

                        const formattedCoin = formatCoins(user.totalBetAmount || 0);
                        const professionTitle = await getProfessionTitle(user.id);
                        const professionName = getProfessionName(user, professionTitle);
                        const displayName = cleanName(user.displayName || user.name || '未知用戶');

                        contents.push(createLeaderboardRow(
                            rankStr, rankColor, displayName, professionName,
                            \`\${user.gambleCount || 0} 次賭博\`, '#757575', formattedCoin, '總投注', '#C2185B'
                        ));

                        if (i < gamblerUsers.length - 1) contents.push(flexUtils.createSeparator('sm', '#EEEEEE'));
                    }
                    bubble = {
                        type: 'bubble', size: 'mega',
                        header: {
                            type: 'box', layout: 'vertical', paddingAll: '16px',
                            background: { type: 'linearGradient', angle: '0deg', startColor: '#FCE4EC', endColor: '#F8BBD0' },
                            contents: [
                                { type: 'text', text: '🎲 賭博排行榜 (Top 10)', weight: 'bold', size: 'lg', color: '#C2185B', align: 'center' },
                                { type: 'text', text: 'GAMBLER RANK • 歷史總投注', size: 'xxs', color: '#C2185B', align: 'center', margin: 'xs', weight: 'bold' }
                            ]
                        },
                        body: { type: 'box', layout: 'vertical', contents: contents, paddingAll: 'lg', backgroundColor: '#FFFFFF' }
                    };
                }
                flexMsg = { type: 'flex', altText: '🎲 賭博排行榜', contents: bubble };

            } else if (type === 'debt') {
                const debtSnapshot = await db.collection(COLLECTION_NAME).where('kuCoin', '<', 0).orderBy('kuCoin', 'asc').limit(15).get();
                const debtUsers = debtSnapshot.empty ? [] : debtSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(u => u.id !== adminId).slice(0, 10);
                
                if (debtUsers.length === 0) {
                    bubble = createEmptyLeaderboardBubble('💸 跑路債務榜 (Top 10)', '🎉 目前沒有任何人負債！大家都很富有！', '#E8F5E9', '#C8E6C9', '#4CAF50');
                } else {
                    const contents = debtUsers.map((user, index) => {
                        let rankIcon = '📉';
                        if (index === 0) rankIcon = '💀'; else if (index === 1) rankIcon = '🩸'; else if (index === 2) rankIcon = '🤕';
                        let formattedCoin = (user.kuCoin || 0).toLocaleString();
                        let absCoin = Math.abs(user.kuCoin || 0);
                        if (absCoin >= 100000000) formattedCoin = ((user.kuCoin || 0) / 100000000).toFixed(1) + '億';
                        else if (absCoin >= 10000) formattedCoin = ((user.kuCoin || 0) / 10000).toFixed(1) + '萬';

                        const nameWithProfession = cleanName(user.displayName || user.name || '未知帳戶') + getProfessionSuffix(user);

                        return flexUtils.createBox('horizontal', [
                            flexUtils.createText({ text: \`\${rankIcon} \${index + 1}\`, size: 'sm', weight: 'bold', color: '#AAAAAA', flex: 2 }),
                            flexUtils.createBox('vertical', [
                                flexUtils.createText({ text: nameWithProfession, size: 'sm', weight: 'bold', color: '#FFFFFF', wrap: true }),
                                flexUtils.createText({ text: '跑路中', size: 'xs', color: '#E91E63' })
                            ], { flex: 6 }),
                            flexUtils.createText({ text: formattedCoin, size: 'sm', weight: 'bold', color: '#D32F2F', align: 'end', flex: 4 })
                        ], { margin: 'md', alignItems: 'center' });
                    });
                    bubble = flexUtils.createBubble({
                        size: 'mega',
                        header: flexUtils.createHeader('💸 跑路債務榜 (Top 10)', '負債排名', '#121212', '#4CAF50'),
                        body: flexUtils.createBox('vertical', contents, { paddingAll: 'xl', backgroundColor: '#1A1A1A' })
                    });
                }
                flexMsg = { type: 'flex', altText: '💸 債務排行榜', contents: bubble };
            }
            
            memoryCache.set(cacheKey, flexMsg, 60); // 快取 60 秒
        }

        await lineUtils.replyToLine(replyToken, [flexMsg]);

    } catch (e) {
        console.error('[Economy] showLeaderboard Error:', e);
        await lineUtils.replyText(replyToken, '❌ 查詢排行榜失敗');
    }
}

`;

economyCode = economyCode.substring(0, showAllLeaderboardsStart) + newShowLeaderboard + economyCode.substring(showAllLeaderboardsEnd);
economyCode = economyCode.replace('showAllLeaderboards,', 'showLeaderboard,');

fs.writeFileSync(economyJsPath, economyCode, 'utf8');

const routesJsPath = path.join(__dirname, '../routes/economyRoutes.js');
let routesCode = fs.readFileSync(routesJsPath, 'utf8');

const oldRoute = `    // 5. 綜合排行榜 (財富、賭狗、債務)
    router.register(/^\\s*(財富排行榜|首富|哭幣排行榜|賭狗排行榜|賭神|債務排行榜|欠債榜|負債榜|負債排行榜)\\s*$/, async (ctx) => {
        await economyHandler.showAllLeaderboards(ctx.replyToken);
    }, { allowDM: true, needAuth: true, feature: 'leaderboard', keywords: ['哭幣排行榜', '財富排行榜', '賭狗排行榜', '債務排行榜'] });`;

const newRoutes = `    // 5. 排行榜 (財富、賭博、債務已拆分獨立)
    router.register(/^\\s*(財富排行榜|首富|哭幣排行榜)\\s*$/, async (ctx) => {
        await economyHandler.showLeaderboard(ctx.replyToken, 'wealth');
    }, { allowDM: true, needAuth: true, feature: 'leaderboard', keywords: ['財富排行榜', '哭幣排行榜', '首富'] });

    router.register(/^\\s*(賭狗排行榜|賭神)\\s*$/, async (ctx) => {
        await economyHandler.showLeaderboard(ctx.replyToken, 'gambler');
    }, { allowDM: true, needAuth: true, feature: 'leaderboard', keywords: ['賭狗排行榜', '賭神'] });

    router.register(/^\\s*(債務排行榜|欠債榜|負債榜|負債排行榜)\\s*$/, async (ctx) => {
        await economyHandler.showLeaderboard(ctx.replyToken, 'debt');
    }, { allowDM: true, needAuth: true, feature: 'leaderboard', keywords: ['債務排行榜', '欠債榜', '負債榜', '負債排行榜'] });`;

routesCode = routesCode.replace(oldRoute, newRoutes);
fs.writeFileSync(routesJsPath, routesCode, 'utf8');

console.log("Rewrite completed successfully.");
