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

async function addCoinFast(userId, amount) {
    if (!amount || amount === 0 || !userId) return;
    try {
        const docRef = db.collection(COLLECTION_NAME).doc(userId);
        await docRef.set({ kuCoin: db.FieldValue.increment(amount) }, { merge: true });
    } catch (e) {
        console.error('[Economy] addCoinFast Error:', e);
    }
}

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
            const { getMafiaBoss } = require('../handlers/profession');
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

const { robCoin } = require('../handlers/robberyHandler');
module.exports = {
  checkBalance,
  transferCoin,
  adminManageCoin,
  consumeCoin,
  addCoinQuietly,
  addCoinFast,
  queryPlayerProfile
};
