const { db } = require('../utils/db');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const authUtils = require('../utils/auth');
const { ADMIN_USER_ID } = require('../config/constants');
const { getSpamResponse } = require('../utils/spamHandler');
const memoryCache = require('../utils/memoryCache');
const notificationService = require('../services/notificationService');

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

        let hasMafiaProtection = false;
        for (const res of results) {
            const { uid, doc, name } = res;
            if (doc && doc.exists) {
                const data = doc.data();
                const wanted = data.wantedLevel || 0;
                totalWantedProbability += wanted;
                
                // 檢查黑道圍事 (堂主以上：isMafia 且 wanted >= 0.6)
                if (data.isMafia && wanted >= 0.6) {
                    hasMafiaProtection = true;
                }
                
                participantDataList.push({ uid, docRef: doc.ref, doc, wanted, name });
            }
        }

        // 若無通緝值則不可能被抓
        if (totalWantedProbability <= 0) return;

        // 【方案B：賭場圍事】若有黑道高層在場，查水表機率強制減半
        if (hasMafiaProtection) {
            totalWantedProbability = totalWantedProbability * 0.5;
        }

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
                const { getMafiaBoss } = require('../handlers/profession');
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
                const { clearProfessionCache, clearWantedListCache } = require('../handlers/profession');
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
                flexUtils.createText({ text: introText, size: 'sm', color: flexUtils.COLORS.TEXT_MAIN, wrap: true }),
                flexUtils.createText({ text: `(本次查緝觸發機率為 ${(totalWantedProbability * 100).toFixed(1)}%)`, size: 'xs', color: flexUtils.COLORS.TEXT_SUB, wrap: true, margin: 'sm' }),
                flexUtils.createSeparator('md')
            ];

            if (bustedPlayers.length > 0) {
                if (hasMafiaProtection) {
                    bodyContents.push(flexUtils.createText({ text: '🕶️ 【黑道圍事失效】警方這次出動了特種霹靂小組強行攻堅，黑幫也罩不住了！', size: 'sm', color: flexUtils.COLORS.WARNING, wrap: true, margin: 'md', weight: 'bold' }));
                }
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
                    bodyContents.push(flexUtils.createText({ text: nameStr, size: 'sm', color: player.isScapegoat ? '#FF5252' : flexUtils.COLORS.TEXT_MAIN, wrap: true }));
                });
                bodyContents.push(flexUtils.createText({ text: '他們身上的通緝值已扣除 50%（其餘保留）。', size: 'sm', color: flexUtils.COLORS.TEXT_SUB, wrap: true, margin: 'sm' }));
            } else {
                bodyContents.push(flexUtils.createText({ text: isMilitaryTable ? '🚓 憲兵在現場沒有抓到任何人！' : '🚓 警方在現場沒有抓到任何人！', size: 'sm', color: '#4CAF50', wrap: true, margin: 'md', weight: 'bold' }));
            }

            if (escapedPlayers.length > 0) {
                bodyContents.push(flexUtils.createSeparator('md'));
                bodyContents.push(flexUtils.createText({ text: '💨 【驚險逃脫】', size: 'sm', color: flexUtils.COLORS.PRIMARY, wrap: true, margin: 'md', weight: 'bold' }));
                bodyContents.push(flexUtils.createText({ text: isMilitaryTable ? '以下軍人在混亂中從後窗爬牆逃脫！' : '以下玩家在混亂中從後巷成功逃脫，逃避了刑罰！', size: 'sm', color: flexUtils.COLORS.TEXT_MAIN, wrap: true }));
                escapedPlayers.forEach(n => {
                    bodyContents.push(flexUtils.createText({ text: `- ${n}`, size: 'sm', color: flexUtils.COLORS.TEXT_MAIN, wrap: true }));
                });
            }

            if (adminEscaped) {
                bodyContents.push(flexUtils.createSeparator('md'));
                bodyContents.push(flexUtils.createText({ text: '🏃‍♂️💨 【特別線報】', size: 'sm', color: flexUtils.COLORS.PRIMARY, wrap: true, margin: 'md', weight: 'bold' }));
                bodyContents.push(flexUtils.createText({ text: '至於賭場大亨... 他因提前收到線報，早一步從後門溜走了，連個影子都沒抓到！', size: 'sm', color: flexUtils.COLORS.TEXT_SUB, wrap: true }));
            }

            const flexBubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader(headerTitle, '', flexUtils.COLORS.BG_CARD, '#FF0000'),
                body: flexUtils.createBox('vertical', bodyContents, { backgroundColor: flexUtils.COLORS.BG_CARD, paddingAll: 'xl' })
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
                await notificationService.queueNotification(groupId, [replyMsg]);
            }
        }

    } catch (e) {
        console.error('[Economy] triggerPublicGamblingEvent Error:', e);
    }
    return null;
}

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

            const currentWealth = data.kuCoin || 0;
            // 隨機獲得自身總財產的 3% ~ 5%，若資產過低則給予保底 300 萬
            let harvestRatio = Math.random() * (0.05 - 0.03) + 0.03;
            let harvestAmount = Math.floor(currentWealth * harvestRatio);
            if (harvestAmount < 3000000) harvestAmount = 3000000;

            t.update(docRef, {
                kuCoin: db.FieldValue.increment(harvestAmount),
                corruptionLevel: db.FieldValue.increment(0.15), // 每次收割增加 15% 貪污值
                lastHarvestLeeks: now,
                displayName: memberName || data.displayName || data.name
            });

            return { 
                success: true, 
                harvestAmount, 
                newBalance: currentWealth + harvestAmount,
                corruptionLevel: (data.corruptionLevel || 0) + 0.15
            };
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
            header: flexUtils.createHeader('🌾 收割韭菜', '【尊貴的市議員】專屬', flexUtils.COLORS.BG_MAIN, '#4CAF50'),
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: `【尊貴的市議員】${memberName} 啟動了收割機...`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `「各位市民辛苦了，這都是為了更美好的未來！」`, size: 'sm', weight: 'bold', color: '#388E3C', margin: 'md', wrap: true }),
                flexUtils.createText({ text: `💸 成功從廣大市民身上收割了 ${result.harvestAmount.toLocaleString()} 哭幣！`, size: 'md', weight: 'bold', color: '#E91E63', margin: 'md', wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `💰 結算總資產：${result.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: flexUtils.COLORS.BG_CARD, margin: 'md', wrap: true }),
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
        const isMafia = !!(data.isMafia === true);
        const isMonk = data.profession === 'monk';
        const isPoliceChief = isPolice && (data.policeMerit || 0) >= 200;
        
        const militaryRankIndex = isMilitary ? (data.militaryEnlistCount || 0) : -1;

        let mafiaRankId = 'soldier';
        let mafiaRankName = '🚏 泊車小弟';
        if (isMafia) {
            const profession = require('../handlers/profession');
            mafiaRankId = await profession.getMafiaRank(userId, data);
            if (mafiaRankId === 'boss') mafiaRankName = '👑 黑道老大';
            else if (mafiaRankId === 'capo') mafiaRankName = '🚬 黑幫堂主';
            else if (mafiaRankId === 'enforcer') mafiaRankName = '🔪 黑道打手';
        }

        let identityStr = '一般市民';
        let identityColor = flexUtils.COLORS.TEXT_SUB; // 灰色
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
        } else if (isMafia) {
            identityStr = mafiaRankName;
            identityColor = '#1A1A1A'; // 黑色
        } else if (data.profession === 'monk') {
            const followers = data.followers || 0;
            let monkTitle = '📿 掃地沙彌';
            if (followers >= 10000) monkTitle = '😈 邪教教主';
            else if (followers >= 1000) monkTitle = '💰 斂財住持';
            else if (followers >= 100) monkTitle = '🙏 知名知客僧';
            identityStr = monkTitle;
            identityColor = '#FF9800'; // 橘色
        } else if (data.profession === 'tsmc') {
            identityStr = '🧑‍💻 輪班星人';
            identityColor = '#009688'; // 藍綠色
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
                command: '搶劫 @',
                cooldown: '2小時',
                show: !isJailed && !isMilitary && data.profession !== 'monk',
                remainMs: data.lastRob ? (data.lastRob + 2 * 60 * 60 * 1000) - now : 0
            },
            {
                name: '🙏 告解懺悔 (單人)',
                command: '懺悔',
                cooldown: '2小時',
                show: !isJailed && !isMilitary && data.profession !== 'monk',
                remainMs: data.confessionCooldownUntil ? data.confessionCooldownUntil - now : 0
            },
            {
                name: '📆 每日簽到 (單人)',
                command: '簽到',
                cooldown: '每日一次',
                show: !isMilitary,
                remainMs: lastCheckInStr === todayStr ? msToMidnight : 0
            },
            {
                name: '🥣 街頭乞討 (單人)',
                command: '乞討',
                cooldown: '每日一次',
                show: !isJailed && !isMilitary && (data.kuCoin || 0) < 1000000 && data.profession !== 'monk',
                remainMs: lastBegStr === todayStr ? msToMidnight : 0
            },
            {
                name: '🚑 急難救助 (單人)',
                command: '急難救助',
                cooldown: '每日一次',
                show: !isMilitary && (data.kuCoin || 0) < 0 && (data.emergencyAid || 0) <= 0,
                remainMs: lastAidStr === todayStr ? msToMidnight : 0
            },
            {
                name: '🌾 收割韭菜 (技能)',
                command: '收割韭菜',
                cooldown: '24小時',
                show: isCouncilor && !isJailed && !isMilitary,
                remainMs: data.lastHarvestLeeks ? (data.lastHarvestLeeks + 24 * 60 * 60 * 1000) - now : 0
            },
            {
                name: '🏗️ 議員圍標 (技能)',
                command: '圍標',
                cooldown: '12小時',
                show: isCouncilor && !isJailed && !isMilitary,
                remainMs: data.lastRigBid ? (data.lastRigBid + 12 * 60 * 60 * 1000) - now : 0
            },
            {
                name: '📜 詐領助理費 (技能)',
                command: '詐領助理費',
                cooldown: '2小時',
                show: isCouncilor && !isJailed && !isMilitary,
                remainMs: data.lastEmbezzle ? (data.lastEmbezzle + 2 * 60 * 60 * 1000) - now : 0
            },
            {
                name: '🚨 逮捕犯人 (技能)',
                command: '逮捕 @',
                cooldown: isPoliceChief ? '1小時' : ((data.policeMerit || 0) >= 100 ? '1.4小時' : '2小時'),
                show: isPolice && !isJailed && !isMilitary,
                remainMs: data.lastArrest ? (data.lastArrest + (isPoliceChief ? 60 : ((data.policeMerit || 0) >= 100 ? 84 : 120)) * 60 * 1000) - now : 0
            },
            {
                name: '⚖️ 貪污起訴 (技能)',
                command: '貪污起訴 @',
                cooldown: '與逮捕共用',
                show: isPolice && !isJailed && !isMilitary,
                remainMs: data.lastArrest ? (data.lastArrest + (isPoliceChief ? 60 : ((data.policeMerit || 0) >= 100 ? 84 : 120)) * 60 * 1000) - now : 0
            },
            {
                name: '🔦 臨檢 (技能)',
                command: '臨檢 @',
                cooldown: '1小時',
                show: isPolice && !isJailed && !isMilitary,
                remainMs: data.lastFrisk ? (data.lastFrisk + 60 * 60 * 1000) - now : 0
            },
            {
                name: '🚁 霹靂攻堅 (技能)',
                command: '攻堅 @',
                cooldown: '24小時',
                show: isPolice && !isJailed && !isMilitary && isPoliceChief,
                remainMs: data.lastRaid ? (data.lastRaid + 24 * 60 * 60 * 1000) - now : 0
            },
            {
                name: '💼 吃案收賄 (技能)',
                command: '吃案 @',
                cooldown: '無冷卻',
                show: isPolice && !isJailed && !isMilitary,
                remainMs: 0
            },
            {
                name: '🪓 圍事 (黑幫)',
                command: '圍事',
                cooldown: '2小時',
                show: isMafia && !isJailed && !isMilitary,
                remainMs: data.lastTurfWar ? (data.lastTurfWar + 2 * 60 * 60 * 1000) - now : 0
            },
            {
                name: '🕶️ 收保護費 (黑幫)',
                command: '收保護費',
                cooldown: '12小時',
                show: isMafia && !isJailed && !isMilitary,
                remainMs: data.lastProtectionFee ? (data.lastProtectionFee + 12 * 60 * 60 * 1000) - now : 0
            },
            {
                name: '💀 勒索政客 (黑幫)',
                command: '勒索',
                cooldown: '24小時',
                show: isMafia && !isJailed && !isMilitary,
                remainMs: data.lastExtortCouncilor ? (data.lastExtortCouncilor + 24 * 60 * 60 * 1000) - now : 0
            },
            {
                name: '🔪 篡位暗殺老大 (黑幫)',
                command: '暗殺老大',
                cooldown: '24小時',
                show: isMafia && !isJailed && !isMilitary && mafiaRankId !== 'boss',
                remainMs: data.lastUsurp ? (data.lastUsurp + 24 * 60 * 60 * 1000) - now : 0
            },
            {
                name: '🔫 暗殺警察 (黑道老大)',
                command: '暗殺警察 @',
                cooldown: '無冷卻',
                show: isMafia && !isJailed && !isMilitary && mafiaRankId === 'boss',
                remainMs: 0
            },
            {
                name: '🏃‍♂️ 越獄行動 (單人)',
                command: '越獄',
                cooldown: '10分鐘',
                show: isJailed,
                remainMs: data.jailbreakCooldownUntil ? data.jailbreakCooldownUntil - now : 0
            },
            {
                name: '⛏️ 勞動改造 (單人)',
                command: '勞動',
                cooldown: '5分鐘',
                show: isJailed,
                remainMs: data.laborCooldownUntil ? data.laborCooldownUntil - now : 0
            },
            {
                name: '🎺 吹喇叭減刑 (單人)',
                command: '吹喇叭',
                cooldown: '30分鐘',
                show: isJailed,
                remainMs: data.blowCooldownUntil ? data.blowCooldownUntil - now : 0
            },
            {
                name: '🧼 撿肥皂挑戰 (單人)',
                command: '撿肥皂',
                cooldown: '10分鐘',
                show: isJailed,
                remainMs: data.soapCooldownUntil ? data.soapCooldownUntil - now : 0
            },
            {
                name: '🔥 發起暴動 (技能)',
                command: '發起暴動',
                cooldown: '1小時',
                show: isJailed,
                remainMs: data.riotCooldownUntil ? data.riotCooldownUntil - now : 0
            },
            {
                name: '🏃 出公差 (軍營)',
                command: '出公差',
                cooldown: '10分鐘',
                show: isMilitary && militaryRankIndex < 15,
                remainMs: data.lastMilitary_出公差 ? (data.lastMilitary_出公差 + 10 * 60 * 1000) - now : 0
            },
            {
                name: '🌿 拔草 (軍營)',
                command: '拔草',
                cooldown: '30分鐘',
                show: isMilitary && militaryRankIndex < 15,
                remainMs: data.lastMilitary_拔草 ? (data.lastMilitary_拔草 + 30 * 60 * 1000) - now : 0
            },
            {
                name: '🧹 掃地 (軍營)',
                command: '掃地',
                cooldown: '30分鐘',
                show: isMilitary && militaryRankIndex < 15,
                remainMs: data.lastMilitary_掃地 ? (data.lastMilitary_掃地 + 30 * 60 * 1000) - now : 0
            },
            {
                name: '🦉 站夜哨 (軍營)',
                command: '站夜哨',
                cooldown: '1小時',
                show: isMilitary && militaryRankIndex < 16,
                remainMs: data.lastMilitary_站夜哨 ? (data.lastMilitary_站夜哨 + 60 * 60 * 1000) - now : 0
            },
            {
                name: '🤒 裝病逃操 (軍營)',
                command: '裝病',
                cooldown: '2小時',
                show: isMilitary && militaryRankIndex < 16,
                remainMs: (data.lastMilitary_裝病逃操 || data.lastMilitary_裝病) ? ((data.lastMilitary_裝病逃操 || data.lastMilitary_裝病) + 2 * 60 * 60 * 1000) - now : 0
            },
            {
                name: '🎯 打靶測驗 (軍營)',
                command: '打靶',
                cooldown: '6小時',
                show: isMilitary && militaryRankIndex < 16,
                remainMs: (data.lastMilitary_打靶測驗 || data.lastMilitary_打靶) ? ((data.lastMilitary_打靶測驗 || data.lastMilitary_打靶) + 6 * 60 * 60 * 1000) - now : 0
            },
            {
                name: '🛡️ 高裝檢 (軍營)',
                command: '高裝檢',
                cooldown: '12小時',
                show: isMilitary && militaryRankIndex >= 16 && militaryRankIndex <= 18,
                remainMs: data.lastMilitary_高裝檢 ? (data.lastMilitary_高裝檢 + 12 * 60 * 60 * 1000) - now : 0
            },
            {
                name: '⚔️ 漢光演習 (軍營)',
                command: '漢光演習',
                cooldown: '24小時',
                show: isMilitary && militaryRankIndex >= 16 && militaryRankIndex <= 18,
                remainMs: data.lastMilitary_漢光演習 ? (data.lastMilitary_漢光演習 + 24 * 60 * 60 * 1000) - now : 0
            },
            {
                name: '🚀 發動戰爭 (軍營)',
                command: '發動戰爭',
                cooldown: '24小時',
                show: isMilitary && militaryRankIndex === 19, // 四星上將 enlistCount = 19
                remainMs: data.declareWarCooldownUntil ? data.declareWarCooldownUntil - now : 0
            },
            {
                name: '💣 研發軍火 (軍營)',
                command: '研發軍火',
                cooldown: '3~24小時',
                show: isMilitary && militaryRankIndex >= 20, // 五星上將 enlistCount = 20
                remainMs: data.armsDealerCooldownUntil ? data.armsDealerCooldownUntil - now : 0
            },
            {
                name: '📜 領取終身俸 (退伍)',
                command: '退伍',
                cooldown: '24小時',
                show: !isMilitary && (data.militaryEnlistCount || 0) > 0,
                remainMs: data.lastPensionTime ? (data.lastPensionTime + 24 * 60 * 60 * 1000) - now : 0
            },
            {
                name: '📿 算命 (出家人)',
                command: '算命',
                cooldown: '15分鐘',
                show: data.profession === 'monk' && !isJailed,
                remainMs: (data.monkCooldowns && data.monkCooldowns.fortune) ? (data.monkCooldowns.fortune + 15 * 60 * 1000) - now : 0
            },
            {
                name: '📖 誦經 (出家人)',
                command: '誦經',
                cooldown: '30分鐘',
                show: data.profession === 'monk' && !isJailed,
                remainMs: (data.monkCooldowns && data.monkCooldowns.chanting) ? (data.monkCooldowns.chanting + 30 * 60 * 1000) - now : 0
            },
            {
                name: '🕊️ 放生 (出家人)',
                command: '放生',
                cooldown: '2小時',
                show: data.profession === 'monk' && !isJailed,
                remainMs: (data.monkCooldowns && data.monkCooldowns.release) ? (data.monkCooldowns.release + 2 * 60 * 60 * 1000) - now : 0
            },
            {
                name: '📢 弘法 (出家人)',
                command: '弘法',
                cooldown: '4小時',
                show: data.profession === 'monk' && !isJailed,
                remainMs: (data.monkCooldowns && data.monkCooldowns.preach) ? (data.monkCooldowns.preach + 4 * 60 * 60 * 1000) - now : 0
            },
            {
                name: '🥣 化緣 (出家人)',
                command: '化緣',
                cooldown: '6小時',
                show: data.profession === 'monk' && !isJailed,
                remainMs: (data.monkCooldowns && data.monkCooldowns.begging) ? (data.monkCooldowns.begging + 6 * 60 * 60 * 1000) - now : 0
            },
            {
                name: '🎪 辦法會 (出家人)',
                command: '辦法會',
                cooldown: '12小時',
                show: data.profession === 'monk' && !isJailed,
                remainMs: (data.monkCooldowns && data.monkCooldowns.ceremony) ? (data.monkCooldowns.ceremony + 12 * 60 * 60 * 1000) - now : 0
            },
            {
                name: '⚱️ 賣塔位 (出家人)',
                command: '賣塔位 @',
                cooldown: '18小時',
                show: data.profession === 'monk' && !isJailed && (data.followers || 0) >= 1000,
                remainMs: (data.monkCooldowns && data.monkCooldowns.sellNiche) ? (data.monkCooldowns.sellNiche + 18 * 60 * 60 * 1000) - now : 0
            },
            {
                name: '🧘‍♂️ 雙修 (出家人)',
                command: '雙修 @',
                cooldown: '24小時',
                show: data.profession === 'monk' && !isJailed && (data.followers || 0) >= 10000,
                remainMs: (data.monkCooldowns && data.monkCooldowns.dualCultivation) ? (data.monkCooldowns.dualCultivation + 24 * 60 * 60 * 1000) - now : 0
            },
            {
                name: '🥠 放乖乖 (輪班星人)',
                command: '放乖乖',
                cooldown: '2小時',
                show: data.profession === 'tsmc' && !isJailed,
                remainMs: (data.tsmcCooldowns && data.tsmcCooldowns.kuaiKuai) ? (data.tsmcCooldowns.kuaiKuai + 2 * 60 * 60 * 1000) - now : 0
            },
            {
                name: '⏳ 加班 (輪班星人)',
                command: '加班',
                cooldown: '30分鐘',
                show: data.profession === 'tsmc' && !isJailed,
                remainMs: (data.tsmcCooldowns && data.tsmcCooldowns.overtime) ? (data.tsmcCooldowns.overtime + 30 * 60 * 1000) - now : 0
            },
            {
                name: '🍳 甩鍋 (輪班星人)',
                command: '甩鍋 @',
                cooldown: '24小時',
                show: data.profession === 'tsmc' && !isJailed,
                remainMs: (data.tsmcCooldowns && data.tsmcCooldowns.scapegoat) ? (data.tsmcCooldowns.scapegoat + 24 * 60 * 60 * 1000) - now : 0
            }
        ];

        const cooldownList = [];
        const availableList = [];

        for (const cmd of allCommands) {
            if (!cmd.show) continue;
            if (cmd.remainMs > 0) {
                cooldownList.push({
                    name: cmd.name,
                    command: cmd.command,
                    remainMs: cmd.remainMs,
                    cooldown: cmd.cooldown
                });
            } else {
                availableList.push({
                    name: cmd.name,
                    command: cmd.command,
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
                    flexUtils.createText({ text: identityStr, size: 'xxs', color: flexUtils.COLORS.TEXT_MAIN, weight: 'bold', align: 'center' })
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
                color: '#E65100' 
            })
        );
        bodyContents.push(flexUtils.createSeparator('md', '#E0E0E0'));

        if (cooldownList.length > 0) {
            for (const cd of cooldownList) {
                bodyContents.push(
                    flexUtils.createBox('horizontal', [
                        flexUtils.createText({ text: cd.name, size: 'sm', color: flexUtils.COLORS.TEXT_MAIN, flex: 1 }),
                        flexUtils.createText({ 
                            text: formatTime(cd.remainMs), 
                            size: 'sm', 
                            color: '#E65100', 
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
                color: '#2E7D32', 
                margin: 'xxl' 
            })
        );
        bodyContents.push(flexUtils.createSeparator('md', '#E0E0E0'));

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
                                color: '#1B5E20', 
                                align: 'center', 
                                weight: 'bold' 
                            }),
                            flexUtils.createText({ 
                                text: `CD: ${cmd.cooldown}`, 
                                size: 'xxs', 
                                color: flexUtils.COLORS.TEXT_SUB, 
                                align: 'center', 
                                margin: 'xs' 
                            })
                        ], {
                            flex: 1,
                            backgroundColor: '#E8F5E9',
                            cornerRadius: 'md',
                            paddingAll: 'sm',
                            margin: 'xs',
                            borderWidth: '1px',
                            borderColor: '#C8E6C9',
                            action: { type: 'message', label: cmd.name.split(' ')[0], text: cmd.command }
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

        if (isMilitary) {
            bodyContents.push(flexUtils.createSeparator('xl', '#E0E0E0'));
            bodyContents.push(flexUtils.createButton({
                action: { type: 'postback', label: '🔥 一鍵幹活 (批量操課)', data: 'action=batchMilitaryGames' },
                style: 'primary',
                color: '#E65100',
                margin: 'md'
            }));
        }

        if (isMonk) {
            bodyContents.push(flexUtils.createSeparator('xl', '#E0E0E0'));
            bodyContents.push(flexUtils.createButton({
                action: { type: 'postback', label: '📿 一鍵弘法 (批量行善)', data: 'action=batchMonkGames' },
                style: 'primary',
                color: '#FF9800',
                margin: 'md'
            }));
        }

        // 3. 組合 Bubble
        const bubble = flexUtils.createBubble({
            size: 'mega',
            header: headerBox,
            body: flexUtils.createBox('vertical', bodyContents, { 
                backgroundColor: flexUtils.COLORS.BG_MAIN, 
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
                flexUtils.createText({ text: '⛪ 捐款贖罪', size: 'xl', weight: 'bold', color: flexUtils.COLORS.PRIMARY, align: 'center' }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: promptText, size: 'sm', wrap: true, margin: 'md', color: flexUtils.COLORS.TEXT_MAIN })
            ], { backgroundColor: flexUtils.COLORS.BG_CARD, paddingAll: 'xl' }),
            footer: flexUtils.createBox('vertical', [
                flexUtils.createButton({ 
                    action: { type: 'postback', label: confirmLabel, data: `action=confirmDonation&allIn=${isAllIn ? '1' : '0'}` },
                    style: 'primary', color: '#4CAF50', margin: 'sm' 
                })
            ], { backgroundColor: flexUtils.COLORS.BG_CARD, paddingAll: 'md' })
        });

        await lineUtils.replyFlex(replyToken, '捐款贖罪確認', bubble);
    } catch (e) {
        console.error('[Economy] handleDonationPrompt Error:', e);
        const lineUtils = require('../utils/line');
        await lineUtils.replyText(replyToken, '❌ 系統錯誤');
    }
}

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

module.exports = {
  triggerPublicGamblingEvent,
  handleHarvestLeeks,
  checkCooldowns,
  handleDonationPrompt,
  handleDonationConfirm
};
