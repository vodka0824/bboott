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

// 1. 查詢餘額
async function checkBalance(replyToken, groupId, userId) {
    try {
        // 先取名字，再進入 Transaction
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);
        const { data } = await db.runTransaction(async (t) => {
            return await getUserProfile(t, userId, memberName);
        });
        // 冪先更新名字到 DB
        if (memberName && memberName !== '成員' && data.displayName !== memberName) {
            db.collection(COLLECTION_NAME).doc(userId).update({ displayName: memberName }).catch(() => {});
        }
        const titleInfo = getTitleInfo(data.kuCoin);
        const displayName = data.displayName || data.name || memberName || '玩家';
        
        let rank = '?';
        try {
            const higherRankSnapshot = await db.collection(COLLECTION_NAME).where('kuCoin', '>', data.kuCoin).count().get();
            rank = higherRankSnapshot.data().count + 1;
        } catch (err) {
            const higherRankSnapshot = await db.collection(COLLECTION_NAME).where('kuCoin', '>', data.kuCoin).get();
            rank = higherRankSnapshot.size + 1;
        }

        const wantedPercent = ((data.wantedLevel || 0) * 100).toFixed(1);

        const bodyContents = [
            flexUtils.createText({ text: displayName, size: 'md', weight: 'bold', color: '#FFFFFF', align: 'center', wrap: true }),
            flexUtils.createText({ text: `「${titleInfo.name}」`, size: 'lg', weight: 'bold', color: '#CE93D8', align: 'center', margin: 'sm' }),
            flexUtils.createSeparator('md'),
            flexUtils.createBox('horizontal', [
                flexUtils.createText({ text: '目前餘額', size: 'sm', color: '#AAAAAA', align: 'start', flex: 1 }),
                flexUtils.createText({ text: `${data.kuCoin.toLocaleString()} ${COIN_NAME}`, size: 'xl', weight: 'bold', color: '#FFD700', align: 'end', flex: 2, adjustMode: 'shrink-to-fit' })
            ], { margin: 'md', alignItems: 'center' }),
            flexUtils.createSeparator('md'),
            flexUtils.createBox('horizontal', [
                flexUtils.createText({ text: `🏆 財富: 第 ${rank} 名`, size: 'xs', color: '#DDDDDD', flex: 1 }),
                flexUtils.createText({ text: `🚨 通緝: ${wantedPercent}%`, size: 'xs', color: '#DDDDDD', align: 'end', flex: 1 })
            ], { margin: 'md', alignItems: 'center' })
        ];

        // 若有急難救助金，額外顯示
        if ((data.emergencyAid || 0) > 0) {
            bodyContents.push(
                flexUtils.createSeparator('md'),
                flexUtils.createBox('horizontal', [
                    flexUtils.createText({ text: '🆘 急難救助金', size: 'sm', color: '#888888', align: 'start', flex: 1 }),
                    flexUtils.createText({ text: `${data.emergencyAid.toLocaleString()} ${COIN_NAME}`, size: 'md', weight: 'bold', color: '#E91E63', align: 'end', flex: 1, adjustMode: 'shrink-to-fit' })
                ], { margin: 'md', alignItems: 'center' })
            );
        }


        if (titleInfo.nextName) {
            bodyContents.push(
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `距下一等級「${titleInfo.nextName}」還差 ${titleInfo.diff.toLocaleString()} 哭幣`, size: 'xs', color: '#888888', align: 'center', margin: 'md', wrap: true })
            );
        }

        const bubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader('💰 我的錢包', '', '#121212', '#FFD700'),
            body: flexUtils.createBox('vertical', bodyContents, { paddingAll: 'xl', backgroundColor: '#1A1A1A' })
        });

        await lineUtils.replyFlex(replyToken, `💰 我的${COIN_NAME}`, bubble);
    } catch (e) {
        console.error('[Economy] checkBalance Error:', e);
        await lineUtils.replyText(replyToken, `❌ 查詢${COIN_NAME}失敗`);
    }
}

// 2. 每日簽到
async function dailyCheckIn(replyToken, groupId, userId) {
    try {
        // 先在 Transaction 外取名字與屬性
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);
        const { getFinalPlayerStats } = require('./rpg');
        const stats = await getFinalPlayerStats(userId);
        const luk = stats.final.luk || 0;
        
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
                const { getMilitaryRankInfo } = require('./jail_redemption');
                const rankInfo = getMilitaryRankInfo(data.militaryEnlistCount - 1);
                pension = rankInfo.pension || 0;
                rankName = rankInfo.name;
            }

            const totalReward = reward + extraReward + lukBonus + pension;

            // 使用原子操作避免 Race Condition
            t.update(docRef, {
                kuCoin: db.FieldValue.increment(totalReward),
                lastCheckIn: now.getTime(),
                consecutiveDays: consecutiveDays,
                displayName: memberName || data.displayName || data.name
            });

            return { success: true, reward, extraReward, lukBonus, pension, rankName, consecutiveDays, totalReward, newBalance: (data.kuCoin || 0) + totalReward, name: memberName || data.displayName || data.name };
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
                flexUtils.createText({ text: `基本獲得`, size: 'sm', color: '#666666', align: 'start', flex: 1 }),
                flexUtils.createText({ text: `+${result.reward.toLocaleString()} ${COIN_NAME}`, size: 'md', weight: 'bold', color: '#4CAF50', align: 'end', flex: 1 })
            ], { margin: 'md', alignItems: 'center' })
        ];

        if (result.extraReward > 0) {
            bodyContents.push(
                flexUtils.createBox('horizontal', [
                    flexUtils.createText({ text: `🔥 連簽 ${result.consecutiveDays} 天`, size: 'sm', color: '#FF9800', align: 'start', flex: 1 }),
                    flexUtils.createText({ text: `+${result.extraReward.toLocaleString()} ${COIN_NAME}`, size: 'md', weight: 'bold', color: '#FF9800', align: 'end', flex: 1 })
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

        const nextCheckIn = new Date();
        nextCheckIn.setDate(nextCheckIn.getDate() + 1);
        nextCheckIn.setHours(0, 0, 0, 0);
        const cdText = `⏳ 下次簽到開放：明天 00:00 後\n（可於 ${nextCheckIn.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })} 00:00:00 後再次簽到）`;

        bodyContents.push(
            flexUtils.createSeparator('md'),
            flexUtils.createText({ text: `💰 結算總資產：${result.newBalance.toLocaleString()} ${COIN_NAME}`, size: 'sm', weight: 'bold', color: '#1A1A1A', align: 'center', margin: 'md' }),
            flexUtils.createText({ text: cdText, size: 'xs', color: '#4CAF50', align: 'center', margin: 'sm', wrap: true })
        );

        const bubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader('📅 每日簽到成功', '', '#4CAF50', '#FFFFFF'),
            body: flexUtils.createBox('vertical', bodyContents, { paddingAll: '20px', backgroundColor: '#F1F8E9' })
        });

        await lineUtils.replyFlex(replyToken, `📅 簽到成功！獲得 ${result.totalReward} ${COIN_NAME}`, bubble);

    } catch (e) {
        console.error('[Economy] dailyCheckIn Error:', e);
        await lineUtils.replyText(replyToken, `❌ 簽到失敗，請稍後再試`);
    }
}

// 2.5 乞討 (For bankrupt players)
async function begCoin(replyToken, groupId, userId) {
    try {
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);
        const { getFinalPlayerStats } = require('./rpg');
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

            t.update(docRef, {
                kuCoin: db.FieldValue.increment(reward),
                lastBeg: now.getTime(),
                displayName: memberName || data.displayName || data.name
            });

            return {
                success: true,
                reward,
                tier,
                newBalance: (data.kuCoin || 0) + reward,
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
            '傳說': '#FFD700'  // 金
        };
        const bgColor = colorMap[tier.label] || '#9E9E9E';

        const nextBeg = new Date();
        nextBeg.setDate(nextBeg.getDate() + 1);
        nextBeg.setHours(0, 0, 0, 0);
        const cdText = `⏳ 冷卻時間：每日一次\n（可於 ${nextBeg.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })} 00:00:00 後再次乞討）`;

        const bubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader(`🥺 神明施捨`, `${tier.emoji} ${tier.label}`, '#FFFFFF', bgColor),
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: `${name} 跪在地上痛哭流涕，向神明祈求施捨...`, size: 'xs', color: '#666666', wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: tierMessages[tier.label], size: 'sm', weight: 'bold', color: bgColor, margin: 'md', wrap: true }),
                flexUtils.createText({ text: `✨ 獲得：${reward.toLocaleString()} 哭幣`, size: 'xl', weight: 'bold', color: '#FF9800', margin: 'sm' }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `💰 結算總資產：${newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#1A1A1A', margin: 'md' }),
                flexUtils.createText({ text: cdText, size: 'xs', color: '#E74C3C', margin: 'xs', wrap: true }),
                flexUtils.createText({ text: `拿去翻本吧，可憐蟲！不要再來煩我了！`, size: 'xs', color: '#AAAAAA', margin: 'sm', wrap: true })
            ], { paddingAll: 'xl', backgroundColor: '#FAFAFA' })
        });

        await lineUtils.replyFlex(replyToken, `神明施捨: ${tier.label}`, bubble);
    } catch (e) {
        console.error('[Economy] begCoin Error:', e);
        await lineUtils.replyText(replyToken, `❌ 乞討失敗`);
    }
}


const { robCoin } = require('./robberyHandler');
async function transferCoin(replyToken, groupId, fromUserId, amountStr, messageObject) {
    const amount = parseInt(amountStr);
    if (isNaN(amount) || amount <= 0) {
        await lineUtils.replyText(replyToken, '❌ 轉帳金額無效（請輸入大於 0 的正整數金額，例如：轉帳 1000000 @某人）。');
        return;
    }

    const mentionObj = messageObject && messageObject.mention;
    if (!mentionObj || !mentionObj.mentionees || mentionObj.mentionees.length === 0) {
        await lineUtils.replyText(replyToken, '❌ 請 @標記 要轉帳的對象');
        return;
    }

    const toUserId = mentionObj.mentionees[0].userId;

    if (fromUserId === toUserId) {
        await lineUtils.replyText(replyToken, '❌ 不能轉帳給自己');
        return;
    }

    try {
        const fromMemberName = await lineUtils.getGroupMemberName(groupId, fromUserId);
        const toMemberName = await lineUtils.getGroupMemberName(groupId, toUserId);

        const result = await db.runTransaction(async (t) => {
            const fromProfile = await getUserProfile(t, fromUserId, fromMemberName);
            const toProfile = await getUserProfile(t, toUserId, toMemberName);

            if ((fromProfile.data.kuCoin || 0) < amount) {
                const currentBalance = fromProfile.data.kuCoin || 0;
                const mocking = MOCKING_MESSAGES[Math.floor(Math.random() * MOCKING_MESSAGES.length)];
                return { success: false, message: `餘額不足！你只剩下 ${currentBalance.toLocaleString()} 哭幣。\n${mocking}` };
            }

            t.update(fromProfile.docRef, { kuCoin: db.FieldValue.increment(-amount) });
            t.update(toProfile.docRef, { kuCoin: db.FieldValue.increment(amount) });

            return { success: true, fromName: fromProfile.data.name, toName: toProfile.data.name, amount };
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, `❌ 轉帳失敗：${result.message}`);
            return;
        }

        await lineUtils.replyText(replyToken, `✅ 轉帳成功！\n${result.fromName} 轉交了 ${result.amount} ${COIN_NAME} 給 ${result.toName}`);
    } catch (e) {
        console.error('[Economy] transfer Error:', e);
        await lineUtils.replyText(replyToken, `❌ 轉帳失敗，系統發生錯誤`);
    }
}

// 4. 管理員發放/扣除
async function adminManageCoin(replyToken, groupId, adminId, amountStr, isAdd, messageObject) {
    if (!authUtils.isSuperAdmin(adminId)) {
        await lineUtils.replyText(replyToken, '❌ 只有超級管理員可以使用此功能');
        return;
    }

    const amount = parseInt(amountStr);
    if (isNaN(amount) || amount <= 0) {
        await lineUtils.replyText(replyToken, '❌ 管理發放金額格式錯誤（請輸入大於 0 的正整數金額，例如：給錢 1000000 @某人）。');
        return;
    }

    const mentionObj = messageObject && messageObject.mention;
    if (!mentionObj || !mentionObj.mentionees || mentionObj.mentionees.length === 0) {
        await lineUtils.replyText(replyToken, '❌ 找不到目標用戶，請確實 @標記 對方');
        return;
    }

    const targetUserId = mentionObj.mentionees[0].userId;
    const targetMemberName = await lineUtils.getGroupMemberName(groupId, targetUserId);

    try {
        const result = await db.runTransaction(async (t) => {
            const { docRef, data } = await getUserProfile(t, targetUserId, targetMemberName);
            const updateAmount = isAdd ? amount : -amount;
            t.update(docRef, { kuCoin: db.FieldValue.increment(updateAmount) });
            return { name: data.displayName || data.name || '未知', newBalance: (data.kuCoin || 0) + updateAmount };
        });

        const actionStr = isAdd ? '發放' : '扣除';
        await lineUtils.replyText(replyToken, `✅ 成功${actionStr} ${result.name} ${amount.toLocaleString()} ${COIN_NAME}\n預估餘額：${result.newBalance.toLocaleString()} ${COIN_NAME}`);
    } catch (e) {
        console.error('[Economy] adminManageCoin Error:', e);
        await lineUtils.replyText(replyToken, `❌ 操作失敗`);
    }
}

// 5. 供其他模組呼叫的扣點函式（急難救助金優先扣，再扣哭幣）
async function consumeCoin(groupId, userId, amount, isGamble = false, externalT = null) {
    if (amount <= 0) return { success: true };
    try {
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);
        const executor = async (t) => {
            const { docRef, data } = await getUserProfile(t, userId, memberName);
            const currentAid = data.emergencyAid || 0;
            const currentKuCoin = data.kuCoin || 0;
            const effectiveKuCoin = Math.max(0, currentKuCoin);
            const totalAvailable = currentAid + effectiveKuCoin;

            if (totalAvailable < amount) {
                const mocking = MOCKING_MESSAGES[Math.floor(Math.random() * MOCKING_MESSAGES.length)];
                return {
                    success: false,
                    message: `餘額不足！你只剩下 ${currentKuCoin.toLocaleString()} 哭幣${currentAid > 0 ? ` + ${currentAid.toLocaleString()} 急難金` : ''}。\n${mocking}`,
                    currentBalance: currentKuCoin,
                    name: data.displayName || data.name || '玩家',
                    mockingText: mocking
                };
            }

            // 優先扣急難救助金
            let aidDeduct = 0;
            let coinDeduct = 0;
            if (currentAid >= amount) {
                aidDeduct = amount;
            } else {
                aidDeduct = currentAid;
                coinDeduct = amount - currentAid;
            }

            const updates = {};
            if (aidDeduct > 0) updates.emergencyAid = db.FieldValue.increment(-aidDeduct);
            if (coinDeduct > 0) updates.kuCoin = db.FieldValue.increment(-coinDeduct);
            if (isGamble) {
                updates.totalBetAmount = db.FieldValue.increment(amount);
                updates.gambleCount = db.FieldValue.increment(1);
            }
            t.update(docRef, updates);

            return {
                success: true,
                name: data.displayName || data.name || '玩家',
                newBalance: currentKuCoin - coinDeduct,
                aidUsed: aidDeduct,
                coinUsed: coinDeduct
            };
        };
        
        if (externalT) {
            return await executor(externalT);
        } else {
            return await db.runTransaction(executor);
        }
    } catch (e) {
        console.error('[Economy] consumeCoin Error:', e);
        return { success: false, message: '系統發生錯誤' };
    }
}

// 6. 靜默增減點數 (供發言等日常功能呼叫，也支援負數)
async function addCoinQuietly(groupId, userId, amount) {
    if (amount === 0 || !userId) return 0;
    try {
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);
        return await db.runTransaction(async (t) => {
            const { docRef, data } = await getUserProfile(t, userId, memberName);
            t.update(docRef, { kuCoin: db.FieldValue.increment(amount) });
            return (data.kuCoin || 0) + amount;
        });
    } catch (e) {
        console.error('[Economy] addCoinQuietly Error:', e);
        return 0;
    }
}

// 6.5 極速增減點數 (供多人遊戲結算大量併發呼叫，不依賴 Transaction，不回傳精確餘額)
async function addCoinFast(userId, amount) {
    if (!amount || amount === 0 || !userId) return;
    try {
        const docRef = db.collection(COLLECTION_NAME).doc(userId);
        await docRef.set({ kuCoin: db.FieldValue.increment(amount) }, { merge: true });
    } catch (e) {
        console.error('[Economy] addCoinFast Error:', e);
    }
}
// 7. 財富排行榜
// 7. 綜合排行榜 (財富、賭狗、債務)
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
        ], { paddingAll: 'xl', backgroundColor: '#FFFFFF' })
    };
}

async function showAllLeaderboards(replyToken) {
    try {
        const adminId = process.env.ADMIN_USER_ID;
        const cacheKey = 'leaderboard:all';
        let flexMsg = memoryCache.get(cacheKey);

        if (!flexMsg) {
            const { getMafiaBoss, getProfessionTitle } = require('./profession');
            const mafiaBoss = await getMafiaBoss();
            const mafiaBossId = mafiaBoss ? mafiaBoss.userId : null;
            const now = Date.now();

            const getProfessionName = (user, title) => {
                if (user.id === mafiaBossId) return '黑道老大';
                if (!title) return '一般市民';
                const clean = title.replace(/[\[\]]/g, '').replace(/\(出賣靈魂的賭狗\)/g, '').trim();
                return clean || '一般市民';
            };

            const cleanName = (name) => {
                if (!name) return '';
                return name.replace(/\[.*?\]/g, '').replace(/\(出賣靈魂的賭狗\)/g, '').trim();
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
                    return `${prefix}${(abs / 100000000).toFixed(1)}億`;
                }
                if (abs >= 10000) {
                    return `${prefix}${(abs / 10000).toFixed(0)}萬`;
                }
                return `${prefix}${abs.toLocaleString()}`;
            };

            const createLeaderboardRow = (rankStr, rankColor, displayName, professionName, subText, subTextColor, valStr, labelStr, valColor) => {
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
                            flex: 6,
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
                                            backgroundColor: '#F5F5F5',
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
                                                    color: '#616161',
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

            // W-06: 平行查詢三種排行榜資料
            const [wealthSnapshot, gamblerSnapshot, debtSnapshot] = await Promise.all([
                db.collection(COLLECTION_NAME).orderBy('kuCoin', 'desc').limit(15).get(),
                db.collection(COLLECTION_NAME).orderBy('totalBetAmount', 'desc').limit(15).get(),
                db.collection(COLLECTION_NAME).where('kuCoin', '<', 0).orderBy('kuCoin', 'asc').limit(15).get()
            ]);

            // ================= 財富榜 =================
            let wealthBubble;
            if (wealthSnapshot.empty) {
                wealthBubble = createEmptyLeaderboardBubble('🏆 財富排行榜 (Top 10)', '目前沒有任何人擁有哭幣。', '#FFFDE7', '#FFF9C4', '#F57F17');
            } else {
                const topUsers = wealthSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(u => u.id !== adminId).slice(0, 10);
                const contents = [];
                
                for (let i = 0; i < topUsers.length; i++) {
                    const user = topUsers[i];
                    let rankStr = `${i + 1}.`;
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
                        rankStr,
                        rankColor,
                        displayName,
                        professionName,
                        `「${titleInfo.name}」`,
                        '#8E24AA', // 稱號紫字
                        formattedCoin,
                        '資產',
                        '#E65100' // 金額深橘色
                    ));

                    if (i < topUsers.length - 1) {
                        contents.push(flexUtils.createSeparator('sm', '#EEEEEE'));
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
                            startColor: '#FFFDE7',
                            endColor: '#FFF9C4'
                        },
                        contents: [
                            { type: 'text', text: '🏆 財富排行榜 (Top 10)', weight: 'bold', size: 'lg', color: '#F57F17', align: 'center' },
                            { type: 'text', text: 'WEALTH RANK • 社會富豪', size: 'xxs', color: '#F57F17', align: 'center', margin: 'xs', weight: 'bold' }
                        ]
                    },
                    body: {
                        type: 'box',
                        layout: 'vertical',
                        contents: contents,
                        paddingAll: 'lg',
                        backgroundColor: '#FFFFFF'
                    }
                };
            }

            // ================= 賭狗榜 =================
            let gamblerBubble;
            const gamblerUsers = gamblerSnapshot.empty ? [] : gamblerSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(u => u.id !== adminId && u.totalBetAmount > 0).slice(0, 10);
            
            if (gamblerUsers.length === 0) {
                gamblerBubble = createEmptyLeaderboardBubble('🎲 賭狗排行榜 (Top 10)', '目前還沒有人參與過任何賭博。', '#FCE4EC', '#F8BBD0', '#C2185B');
            } else {
                const contents = [];

                for (let i = 0; i < gamblerUsers.length; i++) {
                    const user = gamblerUsers[i];
                    let rankStr = `${i + 1}.`;
                    let rankColor = '#757575';
                    if (i === 0) { rankStr = '🥇'; rankColor = '#D4AF37'; }
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
                        '#757575',
                        formattedCoin,
                        '總投注',
                        '#C2185B'
                    ));

                    if (i < gamblerUsers.length - 1) {
                        contents.push(flexUtils.createSeparator('sm', '#EEEEEE'));
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
                            startColor: '#FCE4EC',
                            endColor: '#F8BBD0'
                        },
                        contents: [
                            { type: 'text', text: '🎲 賭狗排行榜 (Top 10)', weight: 'bold', size: 'lg', color: '#C2185B', align: 'center' },
                            { type: 'text', text: 'GAMBLER RANK • 歷史總投注', size: 'xxs', color: '#C2185B', align: 'center', margin: 'xs', weight: 'bold' }
                        ]
                    },
                    body: {
                        type: 'box',
                        layout: 'vertical',
                        contents: contents,
                        paddingAll: 'lg',
                        backgroundColor: '#FFFFFF'
                    }
                };
            }

            // ================= 債務榜 =================
            let debtBubble;
            const debtUsers = debtSnapshot.empty ? [] : debtSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(u => u.id !== adminId).slice(0, 10);
            
            if (debtUsers.length === 0) {
                debtBubble = createEmptyLeaderboardBubble('💸 跑路債務榜 (Top 10)', '🎉 目前沒有任何人負債！大家都很富有！', '#4CAF50');
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
                        flexUtils.createText({ text: `${rankIcon} ${index + 1}`, size: 'sm', weight: 'bold', color: '#AAAAAA', flex: 2 }),
                        flexUtils.createBox('vertical', [
                            flexUtils.createText({ text: nameWithProfession, size: 'sm', weight: 'bold', color: '#FFFFFF', wrap: true }),
                            flexUtils.createText({ text: '跑路中', size: 'xs', color: '#E91E63' })
                        ], { flex: 6 }),
                        flexUtils.createText({ text: formattedCoin, size: 'sm', weight: 'bold', color: '#D32F2F', align: 'end', flex: 4 })
                    ], { margin: 'md', alignItems: 'center' });
                });
                debtBubble = flexUtils.createBubble({
                    size: 'mega',
                    header: flexUtils.createHeader('💸 跑路債務榜 (Top 10)', '負債排名', '#121212', '#4CAF50'),
                    body: flexUtils.createBox('vertical', contents, { paddingAll: 'xl', backgroundColor: '#1A1A1A' })
                });
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


// 10. 急難救助金 (僅限負債玩家，每日一次，10萬，獨立帳戶優先使用)
async function claimEmergencyAid(replyToken, groupId, userId) {
    const EMERGENCY_AMOUNT = 100000; // 10 萬
    try {
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);

        const result = await db.runTransaction(async (t) => {
            const { docRef, data } = await getUserProfile(t, userId, memberName);

            // 只有負債才能領
            if ((data.kuCoin || 0) >= 0) {
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

            t.update(docRef, {
                emergencyAid: db.FieldValue.increment(EMERGENCY_AMOUNT),
                lastEmergencyAid: now.getTime(),
                displayName: memberName || data.displayName || data.name
            });

            return {
                success: true,
                name: memberName || data.displayName || data.name,
                debtBefore: data.kuCoin || 0,
                emergencyAid: EMERGENCY_AMOUNT
            };
        });

        if (!result.success) {
            if (result.ignore) return;
            if (result.message) await lineUtils.replyText(replyToken, result.message);
            return;
        }

        const { name, debtBefore, emergencyAid } = result;
        const msgs = [
            `🆘 【急難救助金】`,
            `${name}，你目前負債 ${Math.abs(debtBefore).toLocaleString()} 哭幣。`,
            ``,
            `政府決定發放緊急救助金 💸`,
            `+${emergencyAid.toLocaleString()} 急難救助金（獨立帳戶）`,
            ``,
            `⚠️ 急難救助金優先於哭幣用於下注`,
            `贏得的錢將回歸哭幣帳戶`,
            `好好把握！翻身機會只有一次！`
        ];
        await lineUtils.replyText(replyToken, msgs.join('\n'));
    } catch (e) {
        console.error('[Economy] claimEmergencyAid Error:', e);
        await lineUtils.replyText(replyToken, '❌ 領取急難救助金失敗，請稍後再試。');
    }
}


// =====================================
// == 新增：通緝值與公然聚賭系統 ==
// =====================================

/**
 * 增加通緝值 (每呼叫一次增加 0.1% 機率)
 * 通緝值以 0.001 (0.1%) 為單位
 */
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

/**
 * 觸發公然聚賭查緝事件 (在賭局結束時呼叫)
 */
async function triggerPublicGamblingEvent(groupId, participants, replyToken, returnMessage = false, creatorId = null) {
    if (!participants || participants.length === 0) return;
    
    try {
        let totalWantedProbability = 0;
        const participantDataList = [];

        let isMilitaryTable = false;
        if (creatorId) {
            const creatorDoc = await db.collection(COLLECTION_NAME).doc(creatorId).get();
            if (creatorDoc.exists) {
                const cData = creatorDoc.data();
                if (cData.militaryUntil && Date.now() < cData.militaryUntil) {
                    isMilitaryTable = true;
                }
            }
        }
        
        // 收集所有玩家的通緝值與名字 (批次處理 W-04)
        const snapshot = await db.collection(COLLECTION_NAME).where('_id', 'in', participants).get();
        const docsMap = {};
        snapshot.docs.forEach(doc => { docsMap[doc.id] = doc; });

        const results = await Promise.all(participants.map(async uid => {
            let name = '玩家';
            if (uid !== ADMIN_USER_ID) {
                name = await lineUtils.getGroupMemberName(groupId, uid).catch(() => '玩家');
            }
            return { uid, doc: docsMap[uid], name };
        }));

        for (const res of results) {
            const { uid, doc, name } = res;
            if (doc && doc.exists) {
                const data = doc.data();
                const wanted = data.wantedLevel || 0;
                totalWantedProbability += wanted;
                participantDataList.push({ uid, docRef: doc.ref, doc, wanted, name });
            }
        }

        // 若無通緝值則不可能被抓
        if (totalWantedProbability <= 0) return;

        // 擲骰子判定是否被抓 (例如 totalWantedProbability = 0.005 代表 0.5% 機率)
        const rand = Math.random();
        
        if (rand < totalWantedProbability) {
            // 觸發被抓事件！
            let bustedPlayers = [];
            let escapedPlayers = [];
            let adminEscaped = false;

            const now = Date.now();
            const jailDurationMs = 3 * 60 * 60 * 1000; // 刑期 3 小時
            const jailedUntil = now + jailDurationMs;

            let bossId = '';
            let mafiaMembers = [];
            try {
                const { getMafiaBoss } = require('./profession');
                const mafiaBoss = await getMafiaBoss();
                if (mafiaBoss) {
                    bossId = mafiaBoss.userId;
                }
                mafiaMembers = participantDataList.filter(item => 
                    item.uid !== bossId && 
                    item.uid !== ADMIN_USER_ID && 
                    item.doc.exists && 
                    item.doc.data().isMafia
                );
            } catch (err) {
                console.error('[Economy] Failed to get mafia info before transaction:', err);
            }

            await db.runTransaction(async (t) => {
                // 檢查是否有通緝值超過 100% 的頭號通緝犯 (排除擁有特權的管理員)
                const hasHighWantedPlayer = participantDataList.some(p => p.wanted >= 1.0 && p.uid !== ADMIN_USER_ID);

                // 在處理迴圈前，先進行老大頂罪判定，避免因迴圈處理順序導致小弟先被處理而無法頂罪
                const bossPlayer = participantDataList.find(p => p.uid === bossId);
                if (bossPlayer && mafiaMembers.length > 0 && Math.random() < 0.70) {
                    const scapegoatIdx = Math.floor(Math.random() * mafiaMembers.length);
                    const scapegoat = mafiaMembers[scapegoatIdx];
                    
                    // 找到對應的 participantDataList 中的小弟物件，並設定
                    const targetScapegoat = participantDataList.find(p => p.uid === scapegoat.uid);
                    if (targetScapegoat) {
                        targetScapegoat.isForcedScapegoat = true;
                        targetScapegoat.bossToSaveName = bossPlayer.name || '老大';
                        bossPlayer.isSavedByScapegoat = true;
                    }
                }

                for (const p of participantDataList) {
                    if (p.uid === ADMIN_USER_ID) {
                        adminEscaped = true;
                        if (p.wanted > 0) {
                            t.update(p.docRef, { wantedLevel: 0 });
                        }
                        continue; // 管理員免刑
                    }

                    const name = p.name || '玩家';
                    
                    // 若有頭號通緝犯在場，且該玩家不是頭號通緝犯，則趁亂逃脫 (100% 逃脫)
                    if (hasHighWantedPlayer && p.wanted < 1.0) {
                        escapedPlayers.push(name);
                        continue;
                    }

                    // 老大頂罪機制！
                    if (p.uid === bossId && p.isSavedByScapegoat) {
                        escapedPlayers.push(name + ' (🕶️小弟頂罪逃脫)');
                        continue;
                    }

                    // 一般逃跑判定 (10% 機率成功逃跑)
                    if (Math.random() < 0.1) {
                        if (!p.isForcedScapegoat) {
                            escapedPlayers.push(name);
                            continue; // 成功逃走，免入獄，保留通緝值
                        }
                    }

                    // 入獄並折半扣減通緝值
                    const docData = p.doc.data();
                    const targetWantedLevel = docData.wantedLevel || 0;
                    const newTargetWantedLevel = Number((targetWantedLevel * 0.5).toFixed(2));
                    const updates = { 
                        jailedUntil: jailedUntil,
                        jailbreakCooldownUntil: db.FieldValue.delete(),
                        wantedLevel: newTargetWantedLevel 
                    };
                    
                    let lostCouncilor = false;
                    let lostMilitary = false;

                    if (docData.councilorUntil && now < docData.councilorUntil) {
                        if (Math.random() < 0.25) {
                            escapedPlayers.push(name + ' (🏛️司法保護傘)');
                            continue; // 觸發保護傘，免入獄
                        } else {
                            updates.councilorUntil = db.FieldValue.delete();
                            const targetKuCoin = docData.kuCoin || 0;
                            if (targetKuCoin > 0) {
                                updates.kuCoin = Math.floor(targetKuCoin * 0.5);
                            }
                            updates.crimeRecord = db.FieldValue.increment(1);
                            updates.corruptionLevel = db.FieldValue.delete();
                            lostCouncilor = true;
                        }
                    }

                    if (p.isForcedScapegoat) {
                        updates.crimeRecord = db.FieldValue.increment(1); // 頂罪多加一條前科
                    }

                    if (docData.militaryUntil && now < docData.militaryUntil) {
                        updates.militaryUntil = db.FieldValue.delete();
                        updates.militaryGroupId = db.FieldValue.delete();
                        lostMilitary = true;
                    }

                    t.update(p.docRef, updates);
                    
                    bustedPlayers.push({ 
                        uid: p.uid, 
                        name, 
                        lostCouncilor, 
                        lostMilitary,
                        isScapegoat: !!p.isForcedScapegoat,
                        bossName: p.bossToSaveName
                    });
                }
            });

            // 清除職業快取與通緝名單快取
            try {
                const { clearProfessionCache, clearWantedListCache } = require('./profession');
                clearWantedListCache();
                bustedPlayers.forEach(player => {
                    clearProfessionCache(player.uid);
                });
            } catch (err) {
                console.error('[Economy] triggerPublicGamblingEvent failed to clear cache:', err);
            }

            // 準備廣播 Flex 訊息
            const flexUtils = require('../utils/flex');
            
            const headerTitle = isMilitaryTable ? '🚨 突發事件：憲兵搜查營區！ 🚨' : '🚨 突發事件：警察查水表！ 🚨';
            const introText = isMilitaryTable ? '有人通報軍中集體聚賭，憲兵隊破門而入！' : '有人通報這裡正在「公然聚賭」，警方破門而入！';
            const bustTitleText = isMilitaryTable 
                ? '🚓 以下軍人當場被捕，移送軍事法庭 (刑期 3 小時)：' 
                : '🚓 以下嫌疑犯當場被捕，送往監獄 (刑期 3 小時)：';

            let bodyContents = [
                flexUtils.createText({ text: introText, size: 'sm', color: '#FFFFFF', wrap: true }),
                flexUtils.createText({ text: `(本次查緝觸發機率為 ${(totalWantedProbability * 100).toFixed(1)}%)`, size: 'xs', color: '#AAAAAA', wrap: true, margin: 'sm' }),
                flexUtils.createSeparator('md')
            ];

            if (bustedPlayers.length > 0) {
                const hasHighWantedPlayer = participantDataList.some(p => p.wanted >= 1.0 && p.uid !== ADMIN_USER_ID);
                if (hasHighWantedPlayer) {
                    bodyContents.push(flexUtils.createText({ text: isMilitaryTable ? '🚓 憲兵集中火力專門追捕頭號通緝犯！' : '🚓 警方發現了頭號通緝犯，集中火力專門追捕！', size: 'sm', color: '#FF4500', wrap: true, margin: 'md', weight: 'bold' }));
                }
                bodyContents.push(flexUtils.createText({ text: bustTitleText, size: 'sm', color: '#FF4500', wrap: true, margin: 'md', weight: 'bold' }));
                bustedPlayers.forEach(player => {
                    let nameStr = `- ${player.name}`;
                    if (player.isScapegoat) {
                        nameStr = `- 🕶️ ${player.name} (替老大 ${player.bossName} 頂罪入獄！前科+1)`;
                    } else {
                        if (player.lostCouncilor) {
                            nameStr += ' (💥喪失議員資格並扣押50%財產，前科+1)';
                        }
                        if (player.lostMilitary) {
                            nameStr += ' (🪖勒令退伍)';
                        }
                    }
                    bodyContents.push(flexUtils.createText({ text: nameStr, size: 'sm', color: player.isScapegoat ? '#FF5252' : '#FFFFFF', wrap: true }));
                });
                bodyContents.push(flexUtils.createText({ text: '他們身上的通緝值已扣除 50%（其餘保留）。', size: 'sm', color: '#AAAAAA', wrap: true, margin: 'sm' }));
            } else {
                bodyContents.push(flexUtils.createText({ text: isMilitaryTable ? '🚓 憲兵在現場沒有抓到任何人！' : '🚓 警方在現場沒有抓到任何人！', size: 'sm', color: '#4CAF50', wrap: true, margin: 'md', weight: 'bold' }));
            }

            if (escapedPlayers.length > 0) {
                bodyContents.push(flexUtils.createSeparator('md'));
                bodyContents.push(flexUtils.createText({ text: '💨 【驚險逃脫】', size: 'sm', color: '#FFD700', wrap: true, margin: 'md', weight: 'bold' }));
                bodyContents.push(flexUtils.createText({ text: isMilitaryTable ? '以下軍人在混亂中從後窗爬牆逃脫！' : '以下玩家在混亂中從後巷成功逃脫，逃避了刑罰！', size: 'sm', color: '#FFFFFF', wrap: true }));
                escapedPlayers.forEach(n => {
                    bodyContents.push(flexUtils.createText({ text: `- ${n}`, size: 'sm', color: '#FFFFFF', wrap: true }));
                });
            }

            if (adminEscaped) {
                bodyContents.push(flexUtils.createSeparator('md'));
                bodyContents.push(flexUtils.createText({ text: '🏃‍♂️💨 【特別線報】', size: 'sm', color: '#FFD700', wrap: true, margin: 'md', weight: 'bold' }));
                bodyContents.push(flexUtils.createText({ text: '至於賭場大亨... 他因提前收到線報，早一步從後門溜走了，連個影子都沒抓到！', size: 'sm', color: '#AAAAAA', wrap: true }));
            }

            const flexBubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader(headerTitle, '', '#1A1A1A', '#FF0000'),
                body: flexUtils.createBox('vertical', bodyContents, { backgroundColor: '#1A1A1A', paddingAll: 'xl' })
            });

            const replyMsg = {
                type: 'flex',
                altText: isMilitaryTable ? '突發事件：憲兵搜查營區！' : '突發事件：警察查水表！',
                contents: flexBubble
            };

            // 若要求回傳訊息字串，則直接回傳，不再呼叫 lineUtils
            if (returnMessage) {
                return replyMsg;
            }

            // 使用 lineUtils 廣播
            if (replyToken) {
                await lineUtils.replyToLine(replyToken, [replyMsg]);
            } else if (groupId) {
                await lineUtils.pushMessage(groupId, [replyMsg]);
            }
        }

    } catch (e) {
        console.error('[Economy] triggerPublicGamblingEvent Error:', e);
    }
    return null;
}


// === 查詢系統 ===

/**
 * 查詢玩家個人檔案 (查詢 @某人)
 */
async function queryPlayerProfile(replyToken, groupId, targetUserId, callerUserId) {
    try {
        const docRef = db.collection(COLLECTION_NAME).doc(targetUserId);
        const doc = await docRef.get();
        const lineUtils = require('../utils/line');
        const flexUtils = require('../utils/flex');
        
        let memberName = '玩家';
        try {
            let groupName = await lineUtils.getGroupMemberName(groupId, targetUserId);
            if (groupName.startsWith('成員') && doc.exists) {
                const data = doc.data();
                memberName = data.displayName || data.name || groupName;
                if (memberName !== groupName && data.devilContractUntil && Date.now() < data.devilContractUntil) {
                    memberName += '(出賣靈魂的賭狗)';
                }
            } else {
                memberName = groupName;
                
                // 動態抓取成功，如果名字跟資料庫不同，則更新資料庫，確保其他功能(如排行榜)也會顯示新名字
                if (doc.exists) {
                    const data = doc.data();
                    const cleanName = groupName.replace(/\(出賣靈魂的賭狗\)$/, '');
                    if (data.displayName !== cleanName) {
                        try {
                            await docRef.update({ displayName: cleanName, name: cleanName });
                        } catch (err) {
                            console.error('[Economy] Failed to update displayName in DB:', err);
                        }
                    }
                }
            }
        } catch (e) {
            console.log("Failed to get member name for query.");
            if (doc.exists) {
                const data = doc.data();
                memberName = data.displayName || data.name || '未知玩家';
                if (data.devilContractUntil && Date.now() < data.devilContractUntil) {
                    memberName += '(出賣靈魂的賭狗)';
                }
            }
        }

        let kuCoin = 0;
        let title = '無稱號';
        let wantedStr = '0.0%';
        let jailStr = '自由之身';
        let devilStr = '未出賣';

        let crimeRecord = 0;
        let robCount = 0;
        let militaryStr = '未服役';
        let professionStr = '無職業 (市民)';

        if (doc.exists) {
            const data = doc.data();
            const { getMafiaBoss } = require('./profession');
            const mafiaBoss = await getMafiaBoss();
            const isMafiaBoss = mafiaBoss && mafiaBoss.userId === targetUserId;

            if (isMafiaBoss) {
                professionStr = '🕶️ 黑道老大';
            } else if (data.isPolice) {
                professionStr = '👮 警察';
            } else if (data.councilorUntil && Date.now() < data.councilorUntil) {
                const remainDays = Math.ceil((data.councilorUntil - Date.now()) / (24 * 60 * 60 * 1000));
                professionStr = `🏛️ 市議員 (剩餘 ${remainDays} 天)`;
            } else if (data.militaryUntil && Date.now() < data.militaryUntil) {
                professionStr = '🪖 軍人 (服役中)';
            }

            kuCoin = data.kuCoin || 0;
            if (data.title) title = data.title;
            crimeRecord = data.crimeRecord || 0;
            robCount = data.robCount || 0;
            
            const wantedLevel = data.wantedLevel || 0;
            wantedStr = (wantedLevel * 100).toFixed(1) + '%';
            
            if (data.militaryEnlistCount && data.militaryEnlistCount > 0) {
                const { getMilitaryRankInfo } = require('./jail_redemption');
                const rankInfo = getMilitaryRankInfo(data.militaryEnlistCount - 1);
                militaryStr = `${rankInfo.name} (入伍 ${data.militaryEnlistCount} 次)`;
            }
            if (data.militaryUntil && Date.now() < data.militaryUntil) {
                militaryStr += ' [營區管制中]';
            }
            
            if (targetUserId === require('../config/constants').ADMIN_USER_ID) {
                wantedStr = '0.0% (豁免)';
            }

            if (data.jailedUntil && Date.now() < data.jailedUntil) {
                const remainMs = data.jailedUntil - Date.now();
                const remainMins = Math.ceil(remainMs / 60000);
                jailStr = `🚨 入獄中 (剩餘 ${remainMins} 分鐘)`;
            }
            
            if (data.devilContractUntil && Date.now() < data.devilContractUntil) {
                const remainMs = data.devilContractUntil - Date.now();
                const remainHrs = (remainMs / (1000 * 60 * 60)).toFixed(1);
                devilStr = `🔥 靈魂已出賣 (剩餘 ${remainHrs} 小時)`;
            }
        }

        let hasCorruption = false;
        let corruptionStr = '0%';
        if (doc.exists) {
            const data = doc.data();
            if (data.councilorUntil && Date.now() < data.councilorUntil && data.corruptionLevel > 0) {
                hasCorruption = true;
                corruptionStr = (data.corruptionLevel * 100).toFixed(0) + '%';
            }
        }

        const { getFinalPlayerStats, getPlayerTitle } = require('./rpg');
        const stats = await getFinalPlayerStats(targetUserId);
        
        const wealthTitleInfo = getTitleInfo(kuCoin);
        const rpgTitle = getPlayerTitle(stats.level);
        const titleStr = `${wealthTitleInfo.name} ‧ ${rpgTitle.title}`;

        const bodyContents = [
            flexUtils.createText({ text: memberName, size: 'xl', color: '#1A1A1A', weight: 'bold', align: 'center', wrap: true }),
            flexUtils.createText({ text: `「${titleStr}」`, size: 'xs', color: rpgTitle.color, weight: 'bold', align: 'center', margin: 'sm' }),
            flexUtils.createSeparator('md'),
            flexUtils.createBox('horizontal', [
                flexUtils.createText({ text: '🔰 冒險等級', size: 'sm', color: '#555555', flex: 1 }),
                flexUtils.createText({ text: `Lv. ${stats.level}`, size: 'sm', color: '#1976D2', align: 'end', flex: 2, weight: 'bold' })
            ], { margin: 'md' }),
            flexUtils.createBox('horizontal', [
                flexUtils.createText({ text: '💼 職業', size: 'sm', color: '#555555', flex: 1 }),
                flexUtils.createText({ text: professionStr, size: 'sm', color: '#673AB7', align: 'end', flex: 2, weight: 'bold' })
            ], { margin: 'sm' })
        ];

        if (hasCorruption) {
            bodyContents.push(flexUtils.createBox('horizontal', [
                flexUtils.createText({ text: '💰 議員貪污值', size: 'sm', color: '#555555', flex: 1 }),
                flexUtils.createText({ text: corruptionStr, size: 'sm', color: '#E91E63', align: 'end', flex: 2, weight: 'bold' })
            ], { margin: 'sm' }));
        }

        bodyContents.push(
            flexUtils.createBox('horizontal', [
                flexUtils.createText({ text: '⚡ 戰鬥力', size: 'sm', color: '#555555', flex: 1 }),
                flexUtils.createText({ text: `${stats.final.combatPower.toLocaleString()}`, size: 'sm', color: '#E64A19', align: 'end', flex: 2, weight: 'bold' })
            ], { margin: 'sm' }),
            flexUtils.createBox('horizontal', [
                flexUtils.createText({ text: '💰 餘額', size: 'sm', color: '#555555', flex: 1 }),
                flexUtils.createText({ text: `${kuCoin.toLocaleString()} 哭幣`, size: 'sm', color: '#333333', align: 'end', flex: 2, weight: 'bold' })
            ], { margin: 'sm' }),
            flexUtils.createBox('horizontal', [
                flexUtils.createText({ text: '🚨 通緝值', size: 'sm', color: '#555555', flex: 1 }),
                flexUtils.createText({ text: wantedStr, size: 'sm', color: '#FF4500', align: 'end', flex: 2, weight: 'bold' })
            ], { margin: 'sm' }),
            flexUtils.createBox('horizontal', [
                flexUtils.createText({ text: '⛓️ 狀態', size: 'sm', color: '#555555', flex: 1 }),
                flexUtils.createText({ text: jailStr, size: 'sm', color: '#333333', align: 'end', flex: 2 })
            ], { margin: 'sm' }),
            flexUtils.createBox('horizontal', [
                flexUtils.createText({ text: '😈 靈魂契約', size: 'sm', color: '#555555', flex: 1 }),
                flexUtils.createText({ text: devilStr, size: 'sm', color: '#333333', align: 'end', flex: 2 })
            ], { margin: 'sm' }),
            flexUtils.createBox('horizontal', [
                flexUtils.createText({ text: '📜 前科次數', size: 'sm', color: '#555555', flex: 1 }),
                flexUtils.createText({ text: `${crimeRecord} 次`, size: 'sm', color: '#333333', align: 'end', flex: 2 })
            ], { margin: 'sm' }),
            flexUtils.createBox('horizontal', [
                flexUtils.createText({ text: '🦹‍♂️ 今日搶劫', size: 'sm', color: '#555555', flex: 1 }),
                flexUtils.createText({ text: `${robCount} 次`, size: 'sm', color: '#333333', align: 'end', flex: 2 })
            ], { margin: 'sm' }),
            flexUtils.createBox('horizontal', [
                flexUtils.createText({ text: '🪖 兵籍狀態', size: 'sm', color: '#555555', flex: 1 }),
                flexUtils.createText({ text: militaryStr, size: 'sm', color: '#333333', align: 'end', flex: 2 })
            ], { margin: 'sm' })
        );

        const profileBubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: '🔍 個人狀態', weight: 'bold', color: '#FFD700', size: 'md' })
            ], { backgroundColor: '#121212', paddingAll: '12px' }),
            body: flexUtils.createBox('vertical', bodyContents, { paddingAll: 'xl', backgroundColor: '#FFFFFF' })
        });

        const leftBox = flexUtils.createBox('vertical', [
            flexUtils.createText({ text: '⚔️ 屬性', weight: 'bold', color: '#c0392b', size: 'sm', margin: 'sm' }),
            flexUtils.createSeparator('sm'),
            flexUtils.createBox('horizontal', [
                flexUtils.createText({ text: '攻擊', size: 'xs', color: '#555555', flex: 1 }),
                flexUtils.createText({ text: `${stats.final.atk}`, size: 'xs', color: '#333333', align: 'end', flex: 1 })
            ], { margin: 'md' }),
            flexUtils.createBox('horizontal', [
                flexUtils.createText({ text: '防禦', size: 'xs', color: '#555555', flex: 1 }),
                flexUtils.createText({ text: `${stats.final.def}`, size: 'xs', color: '#333333', align: 'end', flex: 1 })
            ], { margin: 'md' }),
            flexUtils.createBox('horizontal', [
                flexUtils.createText({ text: '迴避', size: 'xs', color: '#555555', flex: 1 }),
                flexUtils.createText({ text: `${stats.final.eva}%`, size: 'xs', color: '#333333', align: 'end', flex: 1 })
            ], { margin: 'md' }),
            flexUtils.createBox('horizontal', [
                flexUtils.createText({ text: '爆擊', size: 'xs', color: '#555555', flex: 1 }),
                flexUtils.createText({ text: `${stats.final.crit}%`, size: 'xs', color: '#333333', align: 'end', flex: 1 })
            ], { margin: 'md' }),
            flexUtils.createBox('horizontal', [
                flexUtils.createText({ text: '幸運', size: 'xs', color: '#555555', flex: 1 }),
                flexUtils.createText({ text: `${stats.final.luk}%`, size: 'xs', color: '#333333', align: 'end', flex: 1 })
            ], { margin: 'md' }),
            flexUtils.createBox('horizontal', [
                flexUtils.createText({ text: '穿透', size: 'xs', color: '#555555', flex: 1 }),
                flexUtils.createText({ text: `${stats.final.pen}%`, size: 'xs', color: '#333333', align: 'end', flex: 1 })
            ], { margin: 'md' })
        ], { flex: 1, backgroundColor: '#f8f9fa', paddingAll: '8px', cornerRadius: '8px', margin: 'xs' });

        const rightBox = flexUtils.createBox('vertical', [
            flexUtils.createText({ text: '🛡️ 裝備', weight: 'bold', color: '#2980b9', size: 'sm', margin: 'sm' }),
            flexUtils.createSeparator('sm'),
            flexUtils.createText({ text: `⚔️ ${stats.equipments.weapon ? `+${stats.equipments.weapon.level} ${stats.equipments.weapon.name}` : '無'}`, size: 'xs', color: stats.equipments.weapon ? '#333333' : '#aaaaaa', wrap: true, margin: 'md' }),
            flexUtils.createText({ text: `🛡️ ${stats.equipments.shield ? `+${stats.equipments.shield.level} ${stats.equipments.shield.name}` : '無'}`, size: 'xs', color: stats.equipments.shield ? '#333333' : '#aaaaaa', wrap: true, margin: 'md' }),
            flexUtils.createText({ text: `🧭 ${stats.equipments.wings ? `+${stats.equipments.wings.level} ${stats.equipments.wings.name}` : '無'}`, size: 'xs', color: stats.equipments.wings ? '#333333' : '#aaaaaa', wrap: true, margin: 'md' }),
            flexUtils.createText({ text: `💥 ${stats.equipments.gloves ? `+${stats.equipments.gloves.level} ${stats.equipments.gloves.name}` : '無'}`, size: 'xs', color: stats.equipments.gloves ? '#333333' : '#aaaaaa', wrap: true, margin: 'md' }),
            flexUtils.createText({ text: `🍀 ${stats.equipments.necklace ? `+${stats.equipments.necklace.level} ${stats.equipments.necklace.name}` : '無'}`, size: 'xs', color: stats.equipments.necklace ? '#333333' : '#aaaaaa', wrap: true, margin: 'md' }),
            flexUtils.createText({ text: `💍 ${stats.equipments.ring ? `+${stats.equipments.ring.level} ${stats.equipments.ring.name}` : '無'}`, size: 'xs', color: stats.equipments.ring ? '#333333' : '#aaaaaa', wrap: true, margin: 'md' })
        ], { flex: 1, backgroundColor: '#fdfefe', paddingAll: '8px', cornerRadius: '8px', borderWidth: '1px', borderColor: '#e3e4e6', margin: 'xs' });

        const rpgBodyContents = [
            flexUtils.createBox('horizontal', [leftBox, rightBox], { alignItems: 'flex-start' })
        ];

        const equipBubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader('⚔️ 裝備與戰鬥資訊', '', '#1976D2', '#E3F2FD'),
            body: flexUtils.createBox('vertical', rpgBodyContents, { paddingAll: 'xl', backgroundColor: '#FFFFFF' })
        });

        const carousel = flexUtils.createCarousel([profileBubble, equipBubble]);
        await lineUtils.replyFlex(replyToken, '玩家資料', carousel);

    } catch (e) {
        console.error('[Economy] queryPlayerProfile Error:', e);
        const lineUtils = require('../utils/line');
        await lineUtils.replyText(replyToken, `❌ 查詢資料時發生錯誤：${e.message}`);
    }
}

/**
 * 查自己通緝值
 */
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
            color = '#FFD700';
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
            ], { backgroundColor: '#FFFFFF', paddingAll: 'xl' })
        });

        await lineUtils.replyFlex(replyToken, '個人通緝狀態', bubble);

    } catch (e) {
        console.error('[Economy] queryWantedLevel Error:', e);
    }
}

/**
 * 通緝榜
 */
/**
 * 社會治安榜單 (通緝榜與前科榜合併，Carousel 明亮 UI)
 */
async function showCombinedWantedAndJailRank(replyToken, groupId) {
    try {
        const lineUtils = require('../utils/line');
        const flexUtils = require('../utils/flex');
        const { getWantedList, getProfessionTitle } = require('./profession');

        // 平行查詢通緝榜（前10名）與前科榜（前10名）
        const [wantedList, criminalSnapshot] = await Promise.all([
            getWantedList(), 
            db.collection(COLLECTION_NAME)
                .where('crimeRecord', '>', 0)
                .orderBy('crimeRecord', 'desc')
                .limit(10)
                .get()
        ]);

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
                                        backgroundColor: '#F5F5F5',
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
                                                color: '#616161',
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
                ], { paddingAll: 'xl', backgroundColor: '#FFFFFF' })
            });
        } else {
            const contents = [];
            
            for (let i = 0; i < wantedList.length; i++) {
                const item = wantedList[i];
                let rankStr = `${i + 1}.`;
                let rankColor = '#757575';
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
                    contents.push(flexUtils.createSeparator('sm', '#EEEEEE'));
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
                    backgroundColor: '#FFFFFF'
                }
            };
        }

        // ================= 2. 建立前科榜 Bubble =================
        let criminalBubble;
        if (criminalSnapshot.empty) {
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
                ], { paddingAll: 'xl', backgroundColor: '#FFFFFF' })
            });
        } else {
            const contents = [];
            const docs = criminalSnapshot.docs;
            
            for (let i = 0; i < docs.length; i++) {
                const doc = docs[i];
                const data = doc.data();
                let rankStr = `${i + 1}.`;
                let rankColor = '#757575';
                if (i === 0) { rankStr = '🥇'; rankColor = '#D4AF37'; }
                else if (i === 1) { rankStr = '🥈'; rankColor = '#C0C0C0'; }
                else if (i === 2) { rankStr = '🥉'; rankColor = '#CD7F32'; }

                const crimeRecord = data.crimeRecord || 0;
                
                const professionTitle = await getProfessionTitle(doc.id);
                const professionName = parseProfession(professionTitle);
                
                const { getCriminalTitle } = require('./jail');
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
                
                if (i < docs.length - 1) {
                    contents.push(flexUtils.createSeparator('sm', '#EEEEEE'));
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
                    backgroundColor: '#FFFFFF'
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

/**
 * 通緝榜
 */
async function showWantedLeaderboard(replyToken, groupId) {
    await showCombinedWantedAndJailRank(replyToken, groupId);
}

/**
 * 通緝名單 (Top 5 前科排行)
 * 警察查看時會額外顯示逮捕按鈕
 */
async function showCriminalList(replyToken, context) {
    const { userId, groupId } = context;
    try {
        const { getWantedList, getMafiaBoss } = require('./profession');
        const topList = await getWantedList();

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
            flexUtils.createText({ text: '依通緝值排序，最高且具黑幫身份者為【黑道老大】', size: 'xxs', color: '#AAAAAA', align: 'center', margin: 'sm' }),
            flexUtils.createSeparator('md')
        ];

        topList.forEach((entry, i) => {
            const rank = i + 1;
            let rankStr = `${rank}.`;
            let rankColor = '#FFFFFF';
            let namePrefix = '';
            
            const isBoss = mafiaBossId && entry.userId === mafiaBossId;

            if (isBoss) {
                rankStr = '👑';
                rankColor = '#FFD700';
                namePrefix = '【黑道老大】';
            } else {
                if (rank === 1) { rankStr = '🥇'; rankColor = '#FFD700'; }
                else if (rank === 2) { rankStr = '🥈'; rankColor = '#C0C0C0'; }
                else if (rank === 3) { rankStr = '🥉'; rankColor = '#CD7F32'; }
            }

            const cleanName = entry.name.replace(/\[.*?\]/g, '').trim();
            const bounty = entry.crimeRecord * 5000000;
            const wantedPct = (entry.wantedLevel * 100).toFixed(1) + '%';

            contents.push(flexUtils.createBox('vertical', [
                flexUtils.createBox('horizontal', [
                    flexUtils.createText({ text: rankStr, size: 'md', color: rankColor, flex: 1, weight: 'bold' }),
                    flexUtils.createText({ text: `${namePrefix}${cleanName}`, size: 'md', color: '#FFFFFF', flex: 8, wrap: true, weight: isBoss ? 'bold' : 'regular' })
                ], { alignItems: 'center' }),
                flexUtils.createBox('horizontal', [
                    flexUtils.createText({ text: `前科：${entry.crimeRecord} 次`, size: 'xs', color: '#FF9800', flex: 1 }),
                    flexUtils.createText({ text: `通緝值：${wantedPct}`, size: 'xs', color: '#FF4500', flex: 1, align: 'end' })
                ], { margin: 'sm' }),
                flexUtils.createBox('horizontal', [
                    flexUtils.createText({ text: `💰 懸賞：${bounty.toLocaleString()} 哭幣`, size: 'xs', color: '#FFD700', flex: 1 })
                ], { margin: 'xs' })
            ], { margin: 'lg' }));
        });

        const bubble = flexUtils.createBubble({
            size: 'mega',
            body: flexUtils.createBox('vertical', contents, { backgroundColor: '#1A1A1A', paddingAll: 'xl' })
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

/**
 * 處理捐款/贖罪提示
 */
async function handleDonationPrompt(replyToken, groupId, userId) {
    try {
        const lineUtils = require('../utils/line');
        const flexUtils = require('../utils/flex');
        
        const docRef = db.collection(COLLECTION_NAME).doc(userId);
        const doc = await docRef.get();
        if (!doc.exists) {
            await lineUtils.replyText(replyToken, '❌ 找不到您的資料，請先簽到。');
            return;
        }

        const data = doc.data();
        const wantedLevel = data.wantedLevel || 0;
        
        if (wantedLevel <= 0) {
            await lineUtils.replyText(replyToken, '👼 您目前沒有任何通緝值，不需要贖罪！');
            return;
        }

        const balance = data.kuCoin || 0;
        if (balance <= 0) {
            await lineUtils.replyText(replyToken, '❌ 您的餘額不足，無法捐款贖罪。');
            return;
        }

        // 計算贖罪費用：每消除 1% (0.01) 通緝值需要 1,000,000 哭幣
        // 若餘額不足則以 All In 方式盡量消除
        const costPerPercent = 1000000;
        const requiredAmount = Math.ceil(wantedLevel * 100 * costPerPercent);
        
        const wantedPercent = (wantedLevel * 100).toFixed(1) + '%';
        
        let promptText = `您目前的通緝值為 ${wantedPercent}。\n`;
        promptText += `完全消除需要 ${requiredAmount.toLocaleString()} 哭幣。\n`;
        promptText += `您目前有 ${balance.toLocaleString()} 哭幣。\n`;
        
        let confirmLabel = '💸 全額贖罪';
        let isAllIn = false;
        
        if (balance < requiredAmount) {
            promptText += `⚠️ 您的餘額不足以完全消除通緝值，是否要 All In 盡可能消除？`;
            confirmLabel = '💸 All In 贖罪';
            isAllIn = true;
        } else {
            promptText += `是否確定要支付 ${requiredAmount.toLocaleString()} 哭幣來完全消除通緝值？`;
        }

        const bubble = flexUtils.createBubble({
            size: 'mega',
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: '⛪ 捐款贖罪', size: 'xl', weight: 'bold', color: '#FFD700', align: 'center' }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: promptText, size: 'sm', wrap: true, margin: 'md', color: '#FFFFFF' })
            ], { backgroundColor: '#1A1A1A', paddingAll: 'xl' }),
            footer: flexUtils.createBox('vertical', [
                flexUtils.createButton({ 
                    action: { type: 'postback', label: confirmLabel, data: `action=confirmDonation&allIn=${isAllIn ? '1' : '0'}` },
                    style: 'primary', color: '#4CAF50', margin: 'sm' 
                })
            ], { backgroundColor: '#1A1A1A', paddingAll: 'md' })
        });

        await lineUtils.replyFlex(replyToken, '捐款贖罪確認', bubble);
    } catch (e) {
        console.error('[Economy] handleDonationPrompt Error:', e);
        const lineUtils = require('../utils/line');
        await lineUtils.replyText(replyToken, '❌ 系統錯誤');
    }
}

/**
 * 確認捐款/贖罪
 */
async function handleDonationConfirm(replyToken, groupId, userId, isAllIn) {
    try {
        const lineUtils = require('../utils/line');
        const costPerPercent = 1000000;
        
        await db.runTransaction(async (t) => {
            const docRef = db.collection(COLLECTION_NAME).doc(userId);
            const doc = await t.get(docRef);
            if (!doc.exists) throw new Error('NOT_FOUND');
            
            const data = doc.data();
            let wantedLevel = data.wantedLevel || 0;
            let balance = data.kuCoin || 0;
            
            if (wantedLevel <= 0) {
                t.set(docRef, {}, { merge: true }); // Dummy update
                return { success: false, reason: 'NO_WANTED' };
            }
            if (balance <= 0) {
                return { success: false, reason: 'NO_MONEY' };
            }

            const requiredAmount = Math.ceil(wantedLevel * 100 * costPerPercent);
            let deductAmount = 0;
            let reduceLevel = 0;
            
            if (balance >= requiredAmount) {
                deductAmount = requiredAmount;
                reduceLevel = wantedLevel;
            } else {
                deductAmount = balance;
                reduceLevel = (balance / costPerPercent) / 100;
            }
            
            let newWantedLevel = Math.max(0, wantedLevel - reduceLevel);
            
            t.update(docRef, {
                kuCoin: db.FieldValue.increment(-deductAmount),
                wantedLevel: parseFloat(newWantedLevel.toFixed(4))
            });
            
            return { 
                success: true, 
                deductAmount, 
                oldWanted: wantedLevel, 
                newWanted: newWantedLevel 
            };
        }).then(async (result) => {
            if (!result.success) {
                if (result.reason === 'NO_WANTED') await lineUtils.replyText(replyToken, '👼 您目前沒有通緝值，不需贖罪！');
                else if (result.reason === 'NO_MONEY') await lineUtils.replyText(replyToken, '❌ 餘額不足。');
                return;
            }
            
            const reducedPercent = ((result.oldWanted - result.newWanted) * 100).toFixed(1) + '%';
            const newPercent = (result.newWanted * 100).toFixed(1) + '%';
            
            let msg = `⛪ 贖罪成功！\n`;
            msg += `您捐獻了 ${result.deductAmount.toLocaleString()} 哭幣，消除了 ${reducedPercent} 的通緝值。\n`;
            msg += `目前剩餘通緝值：${newPercent}`;
            
            if (result.newWanted <= 0) {
                msg += `\n👼 恭喜您重獲自由，洗白成功！`;
            }
            
            await lineUtils.replyText(replyToken, msg);
        }).catch(async (e) => {
            if (e.message === 'NOT_FOUND') await lineUtils.replyText(replyToken, '❌ 找不到您的資料。');
            else throw e;
        });
        
    } catch (e) {
        console.error('[Economy] handleDonationConfirm Error:', e);
        const lineUtils = require('../utils/line');
        await lineUtils.replyText(replyToken, '❌ 系統錯誤');
    }
}

// 2.7 議員收割韭菜 (每日一次，獲得 1,000,000 哭幣)
async function handleHarvestLeeks(replyToken, groupId, userId) {
    try {
        const lineUtils = require('../utils/line');
        const flexUtils = require('../utils/flex');
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);

        const result = await db.runTransaction(async (t) => {
            const { docRef, data } = await getUserProfile(t, userId, memberName);

            const now = Date.now();
            const isCouncilor = data.councilorUntil && now < data.councilorUntil;
            if (!isCouncilor) {
                const spam = getSpamResponse(data, 'harvest_not_councilor', '你又不是議員，憑什麼收割韭菜？');
                t.update(docRef, { spamTracker: spam.newTracker });
                return { success: false, message: spam.message, ignore: spam.ignore };
            }

            // 檢查冷卻 (24小時)
            const lastHarvest = data.lastHarvestLeeks || 0;
            const cooldownMs = 24 * 60 * 60 * 1000;
            if (now - lastHarvest < cooldownMs) {
                const remainHours = Math.ceil((cooldownMs - (now - lastHarvest)) / (60 * 60 * 1000));
                const spam = getSpamResponse(data, 'harvest_cd', `⏳ 韭菜還沒長出來！請再等 ${remainHours} 小時後再來收割。`);
                t.update(docRef, { spamTracker: spam.newTracker });
                return { success: false, message: spam.message, ignore: spam.ignore };
            }

            const harvestAmount = 1000000;
            t.update(docRef, {
                kuCoin: db.FieldValue.increment(harvestAmount),
                lastHarvestLeeks: now,
                displayName: memberName || data.displayName || data.name
            });

            return { success: true, harvestAmount, newBalance: (data.kuCoin || 0) + harvestAmount };
        });

        if (!result.success) {
            if (result.ignore) return;
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        const cdTimeStr = new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
        const cdText = `⏳ 冷卻時間：24 小時\n（可於 ${cdTimeStr} 後再次收割）`;

        const bubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader('🌾 收割韭菜', '【尊貴的市議員】專屬', '#FFFFFF', '#4CAF50'),
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: `【尊貴的市議員】${memberName} 啟動了收割機...`, size: 'sm', color: '#666666', wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `「各位市民辛苦了，這都是為了更美好的未來！」`, size: 'sm', weight: 'bold', color: '#388E3C', margin: 'md', wrap: true }),
                flexUtils.createText({ text: `💸 成功從廣大市民身上收割了 ${result.harvestAmount.toLocaleString()} 哭幣！`, size: 'md', weight: 'bold', color: '#E91E63', margin: 'md', wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `💰 結算總資產：${result.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#1A1A1A', margin: 'md', wrap: true }),
                flexUtils.createText({ text: cdText, size: 'xs', color: '#E91E63', margin: 'sm', wrap: true })
            ], { paddingAll: 'xl', backgroundColor: '#F1F8E9' })
        });

        await lineUtils.replyFlex(replyToken, '🌾 收割韭菜', bubble);
    } catch (e) {
        console.error('[Economy] handleHarvestLeeks Error:', e);
        const lineUtils = require('../utils/line');
        await lineUtils.replyText(replyToken, '❌ 收割失敗');
    }
}


// === 新增：查詢冷卻時間 ===
async function checkCooldowns(replyToken, groupId, userId) {
    try {
        const lineUtils = require('../utils/line');
        const flexUtils = require('../utils/flex');
        const memberName = await lineUtils.getGroupMemberName(groupId, userId).catch(() => '冒險者');
        
        const now = Date.now();
        
        // 使用 Promise.all 同步讀取兩個資料表文件以增強效能
        const [ecoDoc, playerDoc] = await Promise.all([
            db.collection(COLLECTION_NAME).doc(userId).get(),
            db.collection('players').doc(userId).get()
        ]);

        const data = ecoDoc.exists ? ecoDoc.data() : {};
        const pData = playerDoc.exists ? playerDoc.data() : {};

        // 判定身分與狀態
        const isJailed = !!(data.jailedUntil && data.jailedUntil > now);
        const isCouncilor = !!(data.councilorUntil && data.councilorUntil > now);
        const isPolice = !!(data.isPolice === true);
        const isMilitary = !!(data.militaryUntil && data.militaryUntil > now);

        let identityStr = '一般市民';
        let identityColor = '#757575'; // 灰色
        if (isJailed) {
            identityStr = '⛓️ 監獄服刑中';
            identityColor = '#E53935'; // 紅色
        } else if (isMilitary) {
            identityStr = '🪖 志願役軍人';
            identityColor = '#4CAF50'; // 綠色
        } else if (isCouncilor) {
            identityStr = '👑 榮譽市議員';
            identityColor = '#FFB300'; // 琥珀/黃色
        } else if (isPolice) {
            identityStr = '👮 執法警察';
            identityColor = '#1E88E5'; // 藍色
        }

        // 台北時間當天午夜 24:00 判定 (每日重置冷卻用)
        const tzOffset = 8 * 60 * 60 * 1000;
        const taipeiNow = new Date(now + tzOffset);
        const taipeiMidnight = new Date(taipeiNow.getFullYear(), taipeiNow.getMonth(), taipeiNow.getDate() + 1);
        const msToMidnight = taipeiMidnight.getTime() - taipeiNow.getTime();

        const todayStr = new Date(now).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
        
        const lastCheckInStr = data.lastCheckIn ? new Date(data.lastCheckIn).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' }) : '';
        const lastBegStr = data.lastBeg ? new Date(data.lastBeg).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' }) : '';
        const lastAidStr = data.lastEmergencyAid ? new Date(data.lastEmergencyAid).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' }) : '';

        // 定義所有冷卻指令
        const allCommands = [
            {
                name: '🦹‍♂️ 搶劫他人 (技能)',
                cooldown: '2小時',
                show: !isJailed && !isMilitary,
                remainMs: data.lastRob ? (data.lastRob + 2 * 60 * 60 * 1000) - now : 0
            },
            {
                name: '🙏 告解懺悔 (單人)',
                cooldown: '2小時',
                show: !isJailed && !isMilitary,
                remainMs: data.confessionCooldownUntil ? data.confessionCooldownUntil - now : 0
            },
            {
                name: '📆 每日簽到 (單人)',
                cooldown: '每日一次',
                show: !isMilitary,
                remainMs: lastCheckInStr === todayStr ? msToMidnight : 0
            },
            {
                name: '🥣 街頭乞討 (單人)',
                cooldown: '每日一次',
                show: !isJailed && !isMilitary && (data.kuCoin || 0) < 1000000,
                remainMs: lastBegStr === todayStr ? msToMidnight : 0
            },
            {
                name: '🚑 急難救助 (單人)',
                cooldown: '每日一次',
                show: !isMilitary && (data.kuCoin || 0) < 0 && (data.emergencyAid || 0) <= 0,
                remainMs: lastAidStr === todayStr ? msToMidnight : 0
            },
            {
                name: '🌾 收割韭菜 (技能)',
                cooldown: '24小時',
                show: isCouncilor && !isJailed && !isMilitary,
                remainMs: data.lastHarvestLeeks ? (data.lastHarvestLeeks + 24 * 60 * 60 * 1000) - now : 0
            },
            {
                name: '🏗️ 議員圍標 (技能)',
                cooldown: '12小時',
                show: isCouncilor && !isJailed && !isMilitary,
                remainMs: data.lastRigBid ? (data.lastRigBid + 12 * 60 * 60 * 1000) - now : 0
            },
            {
                name: '📜 詐領助理費 (技能)',
                cooldown: '2小時',
                show: isCouncilor && !isJailed && !isMilitary,
                remainMs: data.lastEmbezzle ? (data.lastEmbezzle + 2 * 60 * 60 * 1000) - now : 0
            },
            {
                name: '🚨 逮捕犯人 (技能)',
                cooldown: '2小時',
                show: isPolice && !isJailed && !isMilitary,
                remainMs: data.lastArrest ? (data.lastArrest + 2 * 60 * 60 * 1000) - now : 0
            },
            {
                name: '🏃‍♂️ 越獄行動 (單人)',
                cooldown: '10分鐘',
                show: isJailed,
                remainMs: data.jailbreakCooldownUntil ? data.jailbreakCooldownUntil - now : 0
            },
            {
                name: '🎺 吹喇叭減刑 (單人)',
                cooldown: '30分鐘',
                show: isJailed,
                remainMs: data.blowCooldownUntil ? data.blowCooldownUntil - now : 0
            },
            {
                name: '🧼 撿肥皂挑戰 (單人)',
                cooldown: '10分鐘',
                show: isJailed,
                remainMs: data.soapCooldownUntil ? data.soapCooldownUntil - now : 0
            },
            {
                name: '🔥 發起暴動 (技能)',
                cooldown: '1小時',
                show: isJailed,
                remainMs: data.riotCooldownUntil ? data.riotCooldownUntil - now : 0
            },
            {
                name: '🏃 出公差 (軍營)',
                cooldown: '10分鐘',
                show: isMilitary,
                remainMs: data.lastMilitary_出公差 ? (data.lastMilitary_出公差 + 10 * 60 * 1000) - now : 0
            },
            {
                name: '🌿 拔草 (軍營)',
                cooldown: '30分鐘',
                show: isMilitary,
                remainMs: data.lastMilitary_拔草 ? (data.lastMilitary_拔草 + 30 * 60 * 1000) - now : 0
            },
            {
                name: '🧹 掃地 (軍營)',
                cooldown: '30分鐘',
                show: isMilitary,
                remainMs: data.lastMilitary_掃地 ? (data.lastMilitary_掃地 + 30 * 60 * 1000) - now : 0
            },
            {
                name: '🦉 站夜哨 (軍營)',
                cooldown: '1小時',
                show: isMilitary,
                remainMs: data.lastMilitary_站夜哨 ? (data.lastMilitary_站夜哨 + 60 * 60 * 1000) - now : 0
            },
            {
                name: '🤒 裝病逃操 (軍營)',
                cooldown: '2小時',
                show: isMilitary,
                remainMs: (data.lastMilitary_裝病逃操 || data.lastMilitary_裝病) ? ((data.lastMilitary_裝病逃操 || data.lastMilitary_裝病) + 2 * 60 * 60 * 1000) - now : 0
            },
            {
                name: '🎯 打靶測驗 (軍營)',
                cooldown: '6小時',
                show: isMilitary,
                remainMs: (data.lastMilitary_打靶測驗 || data.lastMilitary_打靶) ? ((data.lastMilitary_打靶測驗 || data.lastMilitary_打靶) + 6 * 60 * 60 * 1000) - now : 0
            },
            {
                name: '🛡️ 高裝檢 (軍營)',
                cooldown: '12小時',
                show: isMilitary,
                remainMs: data.lastMilitary_高裝檢 ? (data.lastMilitary_高裝檢 + 12 * 60 * 60 * 1000) - now : 0
            },
            {
                name: '⚔️ 漢光演習 (軍營)',
                cooldown: '24小時',
                show: isMilitary,
                remainMs: data.lastMilitary_漢光演習 ? (data.lastMilitary_漢光演習 + 24 * 60 * 60 * 1000) - now : 0
            },
            {
                name: '📜 領取終身俸 (退伍)',
                cooldown: '24小時',
                show: !isMilitary && (data.militaryEnlistCount || 0) > 0,
                remainMs: data.lastPensionTime ? (data.lastPensionTime + 24 * 60 * 60 * 1000) - now : 0
            }
        ];

        const cooldownList = [];
        const availableList = [];

        for (const cmd of allCommands) {
            if (!cmd.show) continue;
            if (cmd.remainMs > 0) {
                cooldownList.push({
                    name: cmd.name,
                    remainMs: cmd.remainMs,
                    cooldown: cmd.cooldown
                });
            } else {
                availableList.push({
                    name: cmd.name,
                    cooldown: cmd.cooldown
                });
            }
        }

        // 排序：快要結束冷卻的排在前面
        cooldownList.sort((a, b) => a.remainMs - b.remainMs);

        // 輔助函數：格式化時間
        const formatTime = (ms) => {
            if (ms > 60 * 60 * 1000) {
                const hrs = Math.floor(ms / (60 * 60 * 1000));
                const mins = Math.ceil((ms % (60 * 60 * 1000)) / 60000);
                return `${hrs}時 ${mins}分`;
            } else if (ms > 60000) {
                const mins = Math.ceil(ms / 60000);
                return `${mins} 分鐘`;
            } else {
                const secs = Math.ceil(ms / 1000);
                return `${secs} 秒`;
            }
        };

        // 1. 建立 Header Box (藍綠色漸層背景)
        const headerBox = flexUtils.createBox('vertical', [
            flexUtils.createText({ text: '⏳ 技能冷卻儀表板', size: 'lg', weight: 'bold', color: '#FFFFFF' }),
            flexUtils.createBox('horizontal', [
                flexUtils.createText({ text: memberName, size: 'xs', color: '#E0F7FA', weight: 'bold', flex: 1 }),
                flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: identityStr, size: 'xxs', color: '#FFFFFF', weight: 'bold', align: 'center' })
                ], {
                    backgroundColor: identityColor,
                    cornerRadius: 'md',
                    paddingStart: '6px',
                    paddingEnd: '6px',
                    paddingTop: '2px',
                    paddingBottom: '2px',
                    flex: 0
                })
            ], { margin: 'md', alignItems: 'center' })
        ], {
            background: {
                type: 'linearGradient',
                angle: '0deg',
                startColor: '#006064',
                endColor: '#00838F'
            },
            paddingAll: '16px'
        });

        // 2. 建立 Body Contents
        const bodyContents = [];

        // A. 正在冷卻中區塊
        bodyContents.push(
            flexUtils.createText({ 
                text: `⏳ 正在冷卻中 (${cooldownList.length})`, 
                size: 'xs', 
                weight: 'bold', 
                color: '#FF9100' 
            })
        );
        bodyContents.push(flexUtils.createSeparator('md', '#2C2C2C'));

        if (cooldownList.length > 0) {
            for (const cd of cooldownList) {
                bodyContents.push(
                    flexUtils.createBox('horizontal', [
                        flexUtils.createText({ text: cd.name, size: 'sm', color: '#B0BEC5', flex: 1 }),
                        flexUtils.createText({ 
                            text: formatTime(cd.remainMs), 
                            size: 'sm', 
                            color: '#FFD600', 
                            weight: 'bold', 
                            align: 'end',
                            flex: 0 
                        })
                    ], { margin: 'md', alignItems: 'center' })
                );
            }
        } else {
            bodyContents.push(
                flexUtils.createText({ 
                    text: '✨ 渾身輕盈！目前無任何技能冷卻限制。', 
                    size: 'xs', 
                    color: '#81C784', 
                    margin: 'md', 
                    align: 'center' 
                })
            );
        }

        // B. 目前可使用區塊
        bodyContents.push(
            flexUtils.createText({ 
                text: `✅ 目前可使用 (${availableList.length})`, 
                size: 'xs', 
                weight: 'bold', 
                color: '#00E676', 
                margin: 'xxl' 
            })
        );
        bodyContents.push(flexUtils.createSeparator('md', '#2C2C2C'));

        if (availableList.length > 0) {
            // 每兩個可用指令排成一行
            const rows = [];
            for (let i = 0; i < availableList.length; i += 2) {
                rows.push(availableList.slice(i, i + 2));
            }

            for (const row of rows) {
                bodyContents.push(
                    flexUtils.createBox('horizontal', row.map(cmd => {
                        return flexUtils.createBox('vertical', [
                            flexUtils.createText({ 
                                text: cmd.name, 
                                size: 'xs', 
                                color: '#00E676', 
                                align: 'center', 
                                weight: 'bold' 
                            }),
                            flexUtils.createText({ 
                                text: `CD: ${cmd.cooldown}`, 
                                size: 'xxs', 
                                color: '#90A4AE', 
                                align: 'center', 
                                margin: 'xs' 
                            })
                        ], {
                            flex: 1,
                            backgroundColor: '#1E1E1E',
                            cornerRadius: 'md',
                            paddingAll: 'sm',
                            margin: 'xs'
                        });
                    }), { margin: 'md' })
                );
            }
        } else {
            bodyContents.push(
                flexUtils.createText({ 
                    text: '❌ 目前無任何可用的冷卻型指令。', 
                    size: 'xs', 
                    color: '#E57373', 
                    margin: 'md', 
                    align: 'center' 
                })
            );
        }

        // 3. 組合 Bubble
        const bubble = flexUtils.createBubble({
            size: 'mega',
            header: headerBox,
            body: flexUtils.createBox('vertical', bodyContents, { 
                backgroundColor: '#121212', 
                paddingAll: '16px' 
            })
        });

        await lineUtils.replyFlex(replyToken, '冷卻時間查詢', bubble);

    } catch (e) {
        console.error('[Economy] checkCooldowns Error:', e);
        const lineUtils = require('../utils/line');
        await lineUtils.replyText(replyToken, '❌ 查詢冷卻時間失敗。');
    }
}

// === 議員專屬：圍標工程 ===
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
            
            const currentWealth = data.kuCoin || 0;

            if (rand < 0.4) {
                // 一般成功 40%
                isSuccess = true;
                rewards = Math.floor(currentWealth * (0.15 + Math.random() * 0.10));
                if (rewards > 50000000) rewards = 50000000;
                title = '💰 圍標成功';
                desc = '你透過各種白手套運作，順利拿下了市府的公有停車場 BOT 案！';
                color = '#4CAF50';
            } else if (rand < 0.7) {
                // 巨大成功 30%
                isSuccess = true;
                isSuper = true;
                rewards = Math.floor(currentWealth * (0.30 + Math.random() * 0.20));
                if (rewards > 100000000) rewards = 100000000;
                title = '💎 世紀大案得標';
                desc = '太神啦！你完美打通所有關節，獨攬了捷運聯合開發案的超級大工程，準備數錢數到手軟！';
                color = '#FFD700';
            } else {
                // 東窗事發 30%
                lostCouncilor = true;
                title = '🚨 東窗事發！';
                desc = '你的白手套在喝醉時把事情全抖了出來，檢調單位直接持搜索票衝進你的辦公室！';
                color = '#FF0000';
                
                let penalty = Math.floor(currentWealth * 0.5);
                if (penalty < 100000000) penalty = 100000000;
                if (penalty > currentWealth) penalty = currentWealth;
                rewards = -penalty;
            }

            const updates = { [cdKey]: now };
            let isUmbrella = false;
            let addedCorruption = 0;

            if (isSuccess) {
                updates.kuCoin = db.FieldValue.increment(rewards);
                addedCorruption = 0.10;
                updates.corruptionLevel = db.FieldValue.increment(addedCorruption);
            } else {
                updates.kuCoin = db.FieldValue.increment(rewards); // 照扣
                if (Math.random() < 0.25) {
                    isUmbrella = true;
                    lostCouncilor = false; // 保住資格
                    addedCorruption = 0.30;
                    updates.corruptionLevel = db.FieldValue.increment(addedCorruption);
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
                corruptionLevel: (data.corruptionLevel || 0) + addedCorruption,
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
            flexUtils.createText({ text: resultData.desc, size: 'sm', color: '#FFFFFF', wrap: true }),
            flexUtils.createSeparator('md')
        ];

        if (resultData.isSuccess) {
            bodyContents.push(flexUtils.createText({ text: `💸 獲得暴利：${resultData.rewards.toLocaleString()} 哭幣`, size: 'sm', color: '#FFD700', weight: 'bold', margin: 'md' }));
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
        bodyContents.push(flexUtils.createText({ text: `💰 結算總資產：${resultData.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#FFD700', margin: 'md' }));

        // 加上冷卻提示
        const nextTimeStr = new Date(resultData.now + 12 * 60 * 60 * 1000).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
        bodyContents.push(flexUtils.createText({ text: `⏳ 冷卻時間：12 小時\n（可於 ${nextTimeStr} 後再次圍標）`, size: 'xs', color: '#AAAAAA', wrap: true, margin: 'sm' }));

        const flexBubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader(resultData.title, `【市議員】${memberName}`, '#1A1A1A', resultData.color),
            body: flexUtils.createBox('vertical', bodyContents, { backgroundColor: '#1A1A1A', paddingAll: 'xl' })
        });

        // 發送結果
        await lineUtils.replyFlex(replyToken, resultData.isSuccess ? '議員圍標成功！' : '議員貪污遭逮！', flexBubble);

    } catch (e) {
        console.error('[Economy] handleRigBidding Error:', e);
        const lineUtils = require('../utils/line');
        await lineUtils.replyText(replyToken, '❌ 執行發生錯誤。');
    }
}

// === 議員專屬：詐領助理費 ===
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
                let addedCorruption = 0;
                const updates = { [cdKey]: now };
                
                const currentWealth = data.kuCoin || 0;
                let penalty = 50000000; // 5000 萬
                if (penalty > currentWealth) penalty = currentWealth;
                
                updates.kuCoin = db.FieldValue.increment(-penalty);

                if (Math.random() < 0.25) {
                    isUmbrella = true;
                    // 觸發保護傘免死
                    addedCorruption = 0.30;
                    updates.corruptionLevel = db.FieldValue.increment(addedCorruption);
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
                    corruptionLevel: (data.corruptionLevel || 0) + addedCorruption,
                    name: data.name,
                    newBalance: currentWealth - penalty,
                    penalty
                };
                return;
            }

            // 成功領取
            const rewards = Math.floor(Math.random() * 2000000) + 1000000; // 100萬 ~ 300萬
            embezzleRisk.rate += 0.05; // 每次增加 5% 風險
            let addedCorruption = 0.03;

            t.update(docRef, {
                kuCoin: db.FieldValue.increment(rewards),
                embezzleRisk: embezzleRisk,
                corruptionLevel: db.FieldValue.increment(addedCorruption),
                [cdKey]: now
            });

            const newBalance = (data.kuCoin || 0) + rewards;

            resultData = {
                outcome: 'success',
                rewards,
                embezzleRisk,
                now,
                corruptionLevel: (data.corruptionLevel || 0) + addedCorruption,
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
                flexUtils.createText({ text: '調查局接獲檢舉，查出你長期利用人頭詐領助理費中飽私囊！', size: 'sm', color: '#FFFFFF', wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `💸 強制追繳罰金：${resultData.penalty.toLocaleString()} 哭幣`, size: 'sm', color: '#FF0000', weight: 'bold', margin: 'md' })
            ];

            if (resultData.isUmbrella) {
                bodyContents.push(flexUtils.createText({ text: `🏛️ 【司法保護傘】因缺乏關鍵證據，地檢署對您不予起訴！您免除了牢獄之災並保住資格！`, size: 'sm', color: '#673AB7', weight: 'bold', margin: 'md', wrap: true }));
                bodyContents.push(flexUtils.createText({ text: `💰 目前貪污值：${corruptionStr}`, size: 'xs', color: '#E91E63', margin: 'sm' }));
            } else {
                bodyContents.push(flexUtils.createText({ text: `💥 當場遭到褫奪公權，喪失議員資格！`, size: 'sm', color: '#FF0000', weight: 'bold', margin: 'md' }));
                bodyContents.push(flexUtils.createText({ text: `🚓 收押禁見入獄 12 小時，前科 + 1！`, size: 'sm', color: '#FF0000', weight: 'bold' }));
            }

            // 加上結算後的總資產
            bodyContents.push(flexUtils.createText({ text: `💰 結算總資產：${resultData.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#FFD700', margin: 'md' }));

            // 加上冷卻提示
            bodyContents.push(flexUtils.createText({ text: `⏳ 冷卻時間：2 小時\n（可於 ${nextTimeStr} 後再次發動）`, size: 'xs', color: '#AAAAAA', wrap: true, margin: 'sm' }));

            const flexBubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('🚨 詐領助理費遭法辦', `【市議員】${memberName}`, '#1A1A1A', '#FF0000'),
                body: flexUtils.createBox('vertical', bodyContents, { backgroundColor: '#1A1A1A', paddingAll: 'xl' })
            });

            await lineUtils.replyFlex(replyToken, '議員詐領助理費遭法辦！', flexBubble);
        } else {
            const corruptionStr = (resultData.corruptionLevel * 100).toFixed(0) + '%';

            let bodyContents = [
                flexUtils.createText({ text: '你順利利用親戚當人頭報帳，把市府的公款洗進自己的口袋裡。', size: 'sm', color: '#FFFFFF', wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `💸 獲得公款：${resultData.rewards.toLocaleString()} 哭幣`, size: 'sm', color: '#4CAF50', weight: 'bold', margin: 'md' }),
                flexUtils.createText({ text: `💰 目前貪污值：${corruptionStr}`, size: 'xs', color: '#E91E63', margin: 'sm' }),
                flexUtils.createText({ text: `⚠️ (檢調盯上你的風險已提升至 ${Math.round(resultData.embezzleRisk.rate * 100)}%)`, size: 'xs', color: '#AAAAAA', wrap: true, margin: 'sm' }),
                flexUtils.createText({ text: `💰 結算總資產：${resultData.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#FFD700', margin: 'md' }),
                flexUtils.createText({ text: `⏳ 冷卻時間：2 小時\n（可於 ${nextTimeStr} 後再次詐領）`, size: 'xs', color: '#AAAAAA', wrap: true, margin: 'sm' })
            ];

            const flexBubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('📜 詐領助理費', `【市議員】${memberName}`, '#1A1A1A', '#8BC34A'),
                body: flexUtils.createBox('vertical', bodyContents, { backgroundColor: '#1A1A1A', paddingAll: 'xl' })
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
    handleDonationPrompt,
    handleDonationConfirm,
    checkBalance,
    dailyCheckIn,
    transferCoin,
    adminManageCoin,
    consumeCoin,
    addCoinQuietly,
    addCoinFast,
    showAllLeaderboards,
    begCoin,
    robCoin,
    claimEmergencyAid,
    addWantedLevel,
    triggerPublicGamblingEvent,
    queryPlayerProfile,
    queryWantedLevel,
    showWantedLeaderboard,
    showCombinedWantedAndJailRank,
    showCriminalList,
    handleHarvestLeeks,
    checkCooldowns,
    handleRigBidding,
    handleEmbezzle,
    COIN_NAME,
    MOCKING_MESSAGES
};
