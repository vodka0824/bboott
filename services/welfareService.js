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

async function dailyCheckIn(replyToken, groupId, userId) {
    try {
        // 先在 Transaction 外取名字與屬性
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);
        const { getFinalPlayerStats } = require('../handlers/rpg');
        const stats = await getFinalPlayerStats(userId);
        const luk = stats.final.luk || 0;
        
        const { getMafiaBoss } = require('../handlers/profession');
        const mafiaBoss = await getMafiaBoss();
        
        const result = await db.runTransaction(async (t) => {
            const { docRef, data } = await getUserProfile(t, userId, memberName);
            
            const now = new Date();
            const todayStr = now.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
            
            let lastCheckInStr = '';
            if (data.lastCheckIn) {
                lastCheckInStr = new Date(data.lastCheckIn).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
            }

            if (lastCheckInStr === todayStr) {
                return { success: false, message: `您今天已經簽到過了哦！\n目前餘額：${data.kuCoin} ${COIN_NAME}` };
            }

            let consecutiveDays = data.consecutiveDays || 0;
            if (lastCheckInStr === yesterdayStr) {
                consecutiveDays++;
            } else {
                consecutiveDays = 1;
            }


            // 隨機獲得 10,000 ~ 100,000
            const reward = Math.floor(Math.random() * 90001) + 10000;
            let extraReward = 0;
            if (consecutiveDays > 1) {
                extraReward = reward * consecutiveDays;
            }
            
            // 幸運加成
            const lukBonus = Math.floor((reward + extraReward) * (luk / 100));
            
            // 終身俸加給 (少校以上)
            let pension = 0;
            let rankName = '';
            if (data.militaryEnlistCount && data.militaryEnlistCount > 0) {
                const { getMilitaryRankInfo } = require('./jailRedemptionService');
                const rankInfo = getMilitaryRankInfo(data.militaryEnlistCount - 1);
                pension = rankInfo.pension || 0;
                rankName = rankInfo.name;
            }

            const isPolice = data.isPolice === true;
            const isCouncilor = data.councilorUntil && Date.now() < data.councilorUntil;
            const isBoss = mafiaBoss && mafiaBoss.userId === userId;
            const isMafia = data.isMafia || isBoss;
            const isMilitary = data.militaryUntil && Date.now() < data.militaryUntil;
            const isMonk = data.profession === 'monk';
            const isTsmc = data.profession === 'tsmc';
            
            const isCivilian = !isPolice && !isCouncilor && !isMafia && !isMilitary && !isMonk && !isTsmc && pension === 0;

            let rentSubsidy = 0;
            if (isCivilian) {
                rentSubsidy = 500000;
            }

            // 法師信徒供養金
            let monkBonus = 0;
            let followers = data.followers || 0;
            if (isMonk && followers > 0) {
                monkBonus = followers * 1000000;
            }

            // 台積電分紅
            let tsmcBonus = 0;
            let tsmcBase = 0;
            let tsmcTitle = '';
            let currentKpi = 0;

            if (isTsmc) {
                tsmcBase = 2000000; // 護國神山底薪 200萬
                currentKpi = data.tsmcKpi || 0;
                
                if (currentKpi < 0) {
                    tsmcTitle = '考績吃丙';
                } else {
                    tsmcBonus = currentKpi * 500000; // 每點 KPI 50萬
                    if (currentKpi >= 100) tsmcTitle = '卷王工程師';
                    else if (currentKpi > 0) tsmcTitle = '優秀工程師';
                    else tsmcTitle = '平凡工程師';
                }
            }

            const totalReward = reward + extraReward + lukBonus + pension + rentSubsidy + monkBonus + tsmcBase + tsmcBonus;

            let deductAmount = 0;
            let finalReward = totalReward;
            if ((data.medicalDebt || 0) > 0) {
                deductAmount = Math.min(totalReward, data.medicalDebt);
                finalReward = totalReward - deductAmount;
            }

            const updates = {
                kuCoin: db.FieldValue.increment(finalReward),
                lastCheckIn: now.getTime(),
                consecutiveDays: consecutiveDays,
                displayName: memberName || data.displayName || data.name
            };
            if (deductAmount > 0) {
                updates.medicalDebt = db.FieldValue.increment(-deductAmount);
            }
            if (isTsmc) {
                updates.tsmcKpi = 0; // 每日結算後歸零
            }

            // 使用原子操作避免 Race Condition
            t.update(docRef, updates);

            return { success: true, reward, extraReward, lukBonus, pension, rankName, rentSubsidy, monkBonus, followers, tsmcBase, tsmcBonus, tsmcTitle, currentKpi, consecutiveDays, totalReward, finalReward, deductAmount, newBalance: (data.kuCoin || 0) + finalReward, name: memberName || data.displayName || data.name };
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        const pension = result.pension || 0;
        const rankName = result.rankName || '';

        const bodyContents = [
            flexUtils.createText({ text: `恭喜 ${result.name} !`, size: 'md', weight: 'bold', color: '#333333', align: 'center' }),
            flexUtils.createSeparator('md'),
            flexUtils.createBox('horizontal', [
                flexUtils.createText({ text: `基本獲得`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, align: 'start', flex: 1 }),
                flexUtils.createText({ text: `+${result.reward.toLocaleString()} ${COIN_NAME}`, size: 'md', weight: 'bold', color: '#4CAF50', align: 'end', flex: 1 })
            ], { margin: 'md', alignItems: 'center' })
        ];

        if (result.extraReward > 0) {
            bodyContents.push(
                flexUtils.createBox('horizontal', [
                    flexUtils.createText({ text: `🔥 連簽 ${result.consecutiveDays} 天`, size: 'sm', color: flexUtils.COLORS.SECONDARY, align: 'start', flex: 1 }),
                    flexUtils.createText({ text: `+${result.extraReward.toLocaleString()} ${COIN_NAME}`, size: 'md', weight: 'bold', color: flexUtils.COLORS.SECONDARY, align: 'end', flex: 1 })
                ], { margin: 'sm', alignItems: 'center' })
            );
        }

        if (result.lukBonus > 0) {
            bodyContents.push(
                flexUtils.createBox('horizontal', [
                    flexUtils.createText({ text: `🍀 幸運加成`, size: 'sm', color: '#f39c12', align: 'start', flex: 1 }),
                    flexUtils.createText({ text: `+${result.lukBonus.toLocaleString()} ${COIN_NAME}`, size: 'md', weight: 'bold', color: '#f39c12', align: 'end', flex: 1 })
                ], { margin: 'sm', alignItems: 'center' })
            );
        }

        if (pension > 0) {
            bodyContents.push(
                flexUtils.createBox('horizontal', [
                    flexUtils.createText({ text: `🪖 終身俸 (${rankName})`, size: 'sm', color: '#673AB7', align: 'start', flex: 1 }),
                    flexUtils.createText({ text: `+${pension.toLocaleString()} ${COIN_NAME}`, size: 'md', weight: 'bold', color: '#673AB7', align: 'end', flex: 1 })
                ], { margin: 'sm', alignItems: 'center' })
            );
        }

        if (result.rentSubsidy > 0) {
            bodyContents.push(
                flexUtils.createBox('horizontal', [
                    flexUtils.createText({ text: `🏠 平民租屋補助`, size: 'sm', color: '#00BCD4', align: 'start', flex: 1 }),
                    flexUtils.createText({ text: `+${result.rentSubsidy.toLocaleString()} ${COIN_NAME}`, size: 'md', weight: 'bold', color: '#00BCD4', align: 'end', flex: 1 })
                ], { margin: 'sm', alignItems: 'center' })
            );
        }

        if (result.monkBonus > 0) {
            bodyContents.push(
                flexUtils.createBox('horizontal', [
                    flexUtils.createText({ text: `🙏 信徒供養 (${result.followers}人)`, size: 'sm', color: '#FF9800', align: 'start', flex: 1 }),
                    flexUtils.createText({ text: `+${result.monkBonus.toLocaleString()} ${COIN_NAME}`, size: 'md', weight: 'bold', color: '#FF9800', align: 'end', flex: 1 })
                ], { margin: 'sm', alignItems: 'center' })
            );
        }

        if (result.tsmcTitle === '考績吃丙') {
            bodyContents.push(
                flexUtils.createBox('horizontal', [
                    flexUtils.createText({ text: `🧑‍💻 底薪 (護國神山)`, size: 'sm', color: '#009688', align: 'start', flex: 1 }),
                    flexUtils.createText({ text: `+${result.tsmcBase.toLocaleString()} ${COIN_NAME}`, size: 'md', weight: 'bold', color: '#009688', align: 'end', flex: 1 })
                ], { margin: 'sm', alignItems: 'center' }),
                flexUtils.createBox('horizontal', [
                    flexUtils.createText({ text: `📉 分紅 (${result.tsmcTitle})`, size: 'sm', color: '#795548', align: 'start', flex: 1 }),
                    flexUtils.createText({ text: `被扣光了`, size: 'md', weight: 'bold', color: '#795548', align: 'end', flex: 1 })
                ], { margin: 'sm', alignItems: 'center' })
            );
        } else if (result.tsmcBase > 0) {
            bodyContents.push(
                flexUtils.createBox('horizontal', [
                    flexUtils.createText({ text: `🧑‍💻 底薪 (護國神山)`, size: 'sm', color: '#009688', align: 'start', flex: 1 }),
                    flexUtils.createText({ text: `+${result.tsmcBase.toLocaleString()} ${COIN_NAME}`, size: 'md', weight: 'bold', color: '#009688', align: 'end', flex: 1 })
                ], { margin: 'sm', alignItems: 'center' })
            );
            if (result.tsmcBonus > 0) {
                bodyContents.push(
                    flexUtils.createBox('horizontal', [
                        flexUtils.createText({ text: `📈 分紅 (${result.tsmcTitle})`, size: 'sm', color: '#4CAF50', align: 'start', flex: 1 }),
                        flexUtils.createText({ text: `+${result.tsmcBonus.toLocaleString()} ${COIN_NAME}`, size: 'md', weight: 'bold', color: '#4CAF50', align: 'end', flex: 1 })
                    ], { margin: 'sm', alignItems: 'center' })
                );
            }
        }

        if (result.deductAmount > 0) {
            bodyContents.push(
                flexUtils.createSeparator('md'),
                flexUtils.createBox('horizontal', [
                    flexUtils.createText({ text: `🏥 醫療負債強制扣除`, size: 'sm', color: '#B71C1C', align: 'start', flex: 1 }),
                    flexUtils.createText({ text: `-${result.deductAmount.toLocaleString()} ${COIN_NAME}`, size: 'md', weight: 'bold', color: '#B71C1C', align: 'end', flex: 1 })
                ], { margin: 'md', alignItems: 'center' })
            );
        }

        const nextCheckIn = new Date();
        nextCheckIn.setDate(nextCheckIn.getDate() + 1);
        nextCheckIn.setHours(0, 0, 0, 0);
        const cdText = `⏳ 下次簽到開放：明天 00:00 後\n（可於 ${nextCheckIn.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })} 00:00:00 後再次簽到）`;

        bodyContents.push(
            flexUtils.createSeparator('md'),
            flexUtils.createText({ text: `💰 結算總資產：${result.newBalance.toLocaleString()} ${COIN_NAME}`, size: 'sm', weight: 'bold', color: flexUtils.COLORS.BG_CARD, align: 'center', margin: 'md' }),
            flexUtils.createText({ text: cdText, size: 'xs', color: '#4CAF50', align: 'center', margin: 'sm', wrap: true })
        );

        const bubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader('📅 每日簽到成功', '', '#4CAF50', flexUtils.COLORS.TEXT_MAIN),
            body: flexUtils.createBox('vertical', bodyContents, { paddingAll: '20px', backgroundColor: '#F1F8E9' })
        });

        
        await lineUtils.replyFlex(replyToken, `📅 簽到成功！獲得 ${result.totalReward} ${COIN_NAME}`, bubble);

    } catch (e) {
        console.error('[Economy] dailyCheckIn Error:', e);
        await lineUtils.replyText(replyToken, `❌ 簽到失敗，請稍後再試`);
    }
}

async function begCoin(replyToken, groupId, userId) {
    try {
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);
        const { getFinalPlayerStats } = require('../handlers/rpg');
        const stats = await getFinalPlayerStats(userId);
        const luk = stats.final.luk || 0;

        const result = await db.runTransaction(async (t) => {
            const { docRef, data } = await getUserProfile(t, userId, memberName);

            // 100 萬以內才能乞討
            if ((data.kuCoin || 0) >= 1000000) {
                return { success: false, message: `您身上還有 ${(data.kuCoin || 0).toLocaleString()} 哭幣，少在那邊裝可憐！存款低於 100 萬再來找本神！` };
            }

            const now = new Date();
            const todayStr = now.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
            let lastBegStr = '';
            if (data.lastBeg) {
                lastBegStr = new Date(data.lastBeg).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
            }

            if (lastBegStr === todayStr) {
                const spam = getSpamResponse(data, 'beg', `你今天已經乞討過一次了！滾！\n目前餘額：${(data.kuCoin || 0).toLocaleString()} ${COIN_NAME}`);
                t.update(docRef, { spamTracker: spam.newTracker });
                if (spam.ignore) return { success: false, ignore: true };
                return { success: false, message: spam.message };
            }


            // 分層機率獎勵 (利用 LUK 將普通機率轉移至史詩與傳說)
            // LUK 每 1 點: 史詩機率 +0.2%, 傳說機率 +0.1% (從普通機率扣除)
            const epicBonus = luk * 0.2;
            const legendBonus = luk * 0.1;
            
            const pNormal = 50 - epicBonus - legendBonus;
            const pRare = 30;
            const pEpic = 15 + epicBonus;
            // 剩餘即傳說

            const roll = Math.random() * 100;
            let reward, tier;
            if (roll < pNormal) {
                // 普通
                reward = Math.floor(Math.random() * (1000000 - 10000 + 1)) + 10000;
                tier = { label: '普通', emoji: '🪙', color: 'silver' };
            } else if (roll < pNormal + pRare) {
                // 稀有
                reward = Math.floor(Math.random() * (3000000 - 1000000 + 1)) + 1000000;
                tier = { label: '稀有', emoji: '💎', color: 'blue' };
            } else if (roll < pNormal + pRare + pEpic) {
                // 史詩
                reward = Math.floor(Math.random() * (5000000 - 3000000 + 1)) + 3000000;
                tier = { label: '史詩', emoji: '🔥', color: 'purple' };
            } else {
                // 傳說
                reward = Math.floor(Math.random() * (10000000 - 5000000 + 1)) + 5000000;
                tier = { label: '傳說', emoji: '⚡', color: 'gold' };
            }

            // LUK 加成：最終獲得金額額外增加 (LUK)%
            if (luk > 0) {
                reward = Math.floor(reward * (1 + (luk / 100)));
            }

            let deductAmount = 0;
            let finalReward = reward;
            if ((data.medicalDebt || 0) > 0) {
                deductAmount = Math.min(reward, data.medicalDebt);
                finalReward = reward - deductAmount;
            }

            const updates = {
                kuCoin: db.FieldValue.increment(finalReward),
                lastBeg: now.getTime(),
                displayName: memberName || data.displayName || data.name
            };
            if (deductAmount > 0) {
                updates.medicalDebt = db.FieldValue.increment(-deductAmount);
            }

            t.update(docRef, updates);

            return {
                success: true,
                reward: finalReward,
                deductAmount,
                tier,
                newBalance: (data.kuCoin || 0) + finalReward,
                name: memberName || data.displayName || data.name
            };
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, `😒 ${result.message}`);
            return;
        }

        const { tier, reward, newBalance, name } = result;

        const tierMessages = {
            '普通':  `😅 本神今天心情還行，賞你點零頭花花。`,
            '稀有':  `😲 哎？這個叫花子運氣不錯，本神大方一次！`,
            '史詩':  `🤯 你居然騙走了本神一大筆錢！！`,
            '傳說':  `😱 ！！！傳說中的神明庇佑！你是什麼妖怪！！`
        };

        const colorMap = {
            '普通': '#9E9E9E', // 灰
            '稀有': '#2196F3', // 藍
            '史詩': '#9C27B0', // 紫
            '傳說': flexUtils.COLORS.PRIMARY  // 金
        };
        const bgColor = colorMap[tier.label] || '#9E9E9E';

        const nextBeg = new Date();
        nextBeg.setDate(nextBeg.getDate() + 1);
        nextBeg.setHours(0, 0, 0, 0);
        const cdText = `⏳ 冷卻時間：每日一次\n（可於 ${nextBeg.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })} 00:00:00 後再次乞討）`;

        const bodyItems = [
            flexUtils.createText({ text: `${name} 跪在地上痛哭流涕，向神明祈求施捨...`, size: 'xs', color: flexUtils.COLORS.TEXT_MUTED, wrap: true }),
            flexUtils.createSeparator('md'),
            flexUtils.createText({ text: tierMessages[tier.label], size: 'sm', weight: 'bold', color: bgColor, margin: 'md', wrap: true }),
            flexUtils.createText({ text: `✨ 獲得：${reward.toLocaleString()} 哭幣`, size: 'xl', weight: 'bold', color: flexUtils.COLORS.SECONDARY, margin: 'sm' })
        ];

        if (result.deductAmount > 0) {
            bodyItems.push(
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `🏥 系統強制徵收醫療負債：-${result.deductAmount.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#B71C1C', margin: 'md', wrap: true })
            );
        }

        bodyItems.push(
            flexUtils.createSeparator('md'),
            flexUtils.createText({ text: `💰 結算總資產：${newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: flexUtils.COLORS.BG_CARD, margin: 'md' }),
            flexUtils.createText({ text: cdText, size: 'xs', color: '#E74C3C', margin: 'xs', wrap: true }),
            flexUtils.createText({ text: `拿去翻本吧，可憐蟲！不要再來煩我了！`, size: 'xs', color: flexUtils.COLORS.TEXT_SUB, margin: 'sm', wrap: true })
        );

        const bubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader(`🥺 神明施捨`, `${tier.emoji} ${tier.label}`, flexUtils.COLORS.BG_MAIN, bgColor),
            body: flexUtils.createBox('vertical', bodyItems, { paddingAll: 'xl', backgroundColor: '#FAFAFA' })
        });

        
        await lineUtils.replyFlex(replyToken, `神明施捨: ${tier.label}`, bubble);
    } catch (e) {
        console.error('[Economy] begCoin Error:', e);
        await lineUtils.replyText(replyToken, `❌ 乞討失敗`);
    }
}

async function claimEmergencyAid(replyToken, groupId, userId) {
    const EMERGENCY_AMOUNT = 100000; // 10 萬
    try {
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);

        const result = await db.runTransaction(async (t) => {
            const { docRef, data } = await getUserProfile(t, userId, memberName);

            // 只有負債才能領
            if ((data.kuCoin || 0) >= 0 && !(data.medicalDebt > 0)) {
                return { success: false, message: `❌ 你還有 ${(data.kuCoin || 0).toLocaleString()} 哭幣，沒有資格領急難救助金！` };
            }

            // 若還有未用完的急難救助金，也不能再領
            if ((data.emergencyAid || 0) > 0) {
                return { success: false, message: `❌ 你還有 ${(data.emergencyAid || 0).toLocaleString()} 急難救助金未用完，請先用完再領！` };
            }

            const now = new Date();
            const todayStr = now.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
            let lastAidStr = '';
            if (data.lastEmergencyAid) {
                lastAidStr = new Date(data.lastEmergencyAid).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
            }

            if (lastAidStr === todayStr) {
                const spam = getSpamResponse(data, 'aid', '❌ 你今天已經領過急難救助金了！明天再來吧。');
                t.update(docRef, { spamTracker: spam.newTracker });
                if (spam.ignore) return { success: false, ignore: true };
                return { success: false, message: spam.message };
            }

            let deductAmount = 0;
            let finalAid = EMERGENCY_AMOUNT;
            if ((data.medicalDebt || 0) > 0) {
                deductAmount = Math.min(EMERGENCY_AMOUNT, data.medicalDebt);
                finalAid = EMERGENCY_AMOUNT - deductAmount;
            }

            const updates = {
                lastEmergencyAid: now.getTime(),
                displayName: memberName || data.displayName || data.name
            };
            if (finalAid > 0) updates.emergencyAid = db.FieldValue.increment(finalAid);
            if (deductAmount > 0) updates.medicalDebt = db.FieldValue.increment(-deductAmount);

            t.update(docRef, updates);

            return {
                success: true,
                name: memberName || data.displayName || data.name,
                debtBefore: data.medicalDebt > 0 ? data.medicalDebt : (data.kuCoin || 0),
                emergencyAid: finalAid,
                deductAmount
            };
        });

        if (!result.success) {
            if (result.ignore) return;
            if (result.message) await lineUtils.replyText(replyToken, result.message);
            return;
        }

        const { name, debtBefore, emergencyAid, deductAmount } = result;
        const msgs = [
            `🆘 【急難救助金】`,
            `${name}，你目前負債 ${Math.abs(debtBefore).toLocaleString()} 哭幣。`,
            ``,
            `政府決定發放緊急救助金 💸`
        ];

        if (deductAmount > 0) {
            msgs.push(`🏥 (已被醫院強制查扣 ${deductAmount.toLocaleString()} 償還醫療負債)`);
        }
        
        if (emergencyAid > 0) {
            msgs.push(
                `+${emergencyAid.toLocaleString()} 急難救助金（獨立帳戶）`,
                ``,
                `⚠️ 急難救助金優先於哭幣用於下注`,
                `贏得的錢將回歸哭幣帳戶`,
                `好好把握！翻身機會只有一次！`
            );
        } else {
            msgs.push(
                `+0 急難救助金`,
                ``,
                `⚠️ 救助金已全數被查扣還債，請明天再來領取！`
            );
        }

        await lineUtils.replyText(replyToken, msgs.join('\n'));
    } catch (e) {
        console.error('[Economy] claimEmergencyAid Error:', e);
        await lineUtils.replyText(replyToken, '❌ 領取急難救助金失敗，請稍後再試。');
    }
}

module.exports = {
  dailyCheckIn,
  begCoin,
  claimEmergencyAid
};
