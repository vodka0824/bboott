const { db } = require('../utils/db');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const economyHandler = require('./economy');

const MONK_NAMES = [
    '夢遺大師', '智障禪師', '圓寂法師', '性福上師', 
    '感恩Seafood', '紫衣教主', '海濤大師', '淨空法師', 
    '妙禪師父', '法海禪師', '唐僧', '法拉利姊',
    '法喜充滿師', '阿彌陀佛姐', '恆述法師', '少林掃地僧'
];

function getRandomMonkName() {
    return MONK_NAMES[Math.floor(Math.random() * MONK_NAMES.length)];
}

const RANKS = [
    { name: '🟢 掃地沙彌', followers: 0 },
    { name: '🔵 知名知客僧', followers: 10 },
    { name: '🟡 斂財住持', followers: 50 },
    { name: '🔴 邪教教主', followers: 100 }
];

function getMonkRank(followers) {
    let rank = 0;
    if (followers >= 100) rank = 3;
    else if (followers >= 50) rank = 2;
    else if (followers >= 10) rank = 1;
    return rank;
}

function getRankName(followers) {
    return RANKS[getMonkRank(followers)].name;
}

// 檢查冷卻時間
async function checkCooldown(userId, skillKey, durationMs) {
    const doc = await db.collection('economy_users').doc(userId).get();
    if (!doc.exists) return { allowed: false, msg: '查無資料' };
    const data = doc.data();
    if (data.profession !== 'monk') return { allowed: false, msg: '你不是出家人！' };

    const cooldowns = data.monkCooldowns || {};
    const lastTime = cooldowns[skillKey] || 0;
    const now = Date.now();

    if (now - lastTime < durationMs) {
        const remainMs = durationMs - (now - lastTime);
        const hours = Math.floor(remainMs / 3600000);
        const mins = Math.floor((remainMs % 3600000) / 60000);
        const secs = Math.floor((remainMs % 60000) / 1000);
        return { allowed: false, msg: `⏳ 技能冷卻中，還需等待 ${hours}小時 ${mins}分 ${secs}秒` };
    }

    return { allowed: true, data };
}

// 更新冷卻時間
async function updateCooldown(userId, skillKey) {
    await db.collection('economy_users').doc(userId).update({
        [`monkCooldowns.${skillKey}`]: Date.now()
    });
}

// 業障天譴判定
async function checkKarmaPunishment(groupId, userId, data) {
    let karma = data.karma || 0;
    if (karma < 100) return false;

    const rank = getMonkRank(data.followers || 0);
    const punishChance = rank === 3 ? 0.2 : 0.5; // 教主抗性

    if (Math.random() > punishChance) return false;

    // 觸發天譴
    const roll = Math.random();
    let msg = '';
    
    // 業障歸零
    await db.collection('economy_users').doc(userId).set({ karma: 0 }, { merge: true });

    if (roll < 0.33) {
        // 雷劈: 等級 -1，經驗歸零
        const currentLevel = data.level || 1;
        const newLevel = Math.max(1, currentLevel - 1);
        await db.collection('economy_users').doc(userId).set({
            level: newLevel,
            exp: 0
        }, { merge: true });
        msg = `⚡ 【天譴降臨】你平時作惡多端，遭天打雷劈！等級強制降為 Lv.${newLevel}，經驗值歸零！`;
    } else if (roll < 0.66) {
        // 拆違建: 財產歸零
        await db.collection('economy_users').doc(userId).set({
            kuCoin: 0
        }, { merge: true });
        msg = `🏚️ 【天譴降臨】政府認定你的道場是超級大違建，強制拆除並沒收全部財產！你的現金歸零！`;
    } else {
        // 社會性死亡: 入獄 12 小時
        const jailTime = Date.now() + 12 * 60 * 60 * 1000;
        await db.collection('economy_users').doc(userId).set({
            jailUntil: jailTime,
            jailReason: '宗教詐騙/性醜聞'
        }, { merge: true });
        msg = `🚓 【天譴降臨】你的性醜聞與詐騙案登上壹週刊頭條！社會性死亡，直接被檢調帶回，入獄 12 小時！`;
    }

    const bubble = flexUtils.createBubble({
        size: 'mega',
        header: flexUtils.createHeader('⚡ 天譴降臨', '業障引爆', '#D32F2F', '#FFFFFF'),
        body: flexUtils.createBox('vertical', [
            flexUtils.createText({ text: msg, size: 'sm', color: flexUtils.COLORS.TEXT_MAIN, wrap: true, weight: 'bold' }),
            flexUtils.createSeparator('md'),
            flexUtils.createText({ text: '💀 業障已重新歸零', size: 'sm', color: '#D32F2F', margin: 'md' })
        ], { paddingAll: 'xl', backgroundColor: '#FFEBEE' })
    });

    lineUtils.addPendingMessage(groupId, [{ type: 'flex', altText: '天譴降臨', contents: bubble }]);
    return true; // 觸發了天譴
}

// 出家
async function becomeMonk(replyToken, groupId, userId) {
    const doc = await db.collection('economy_users').doc(userId).get();
    if (!doc.exists) {
        await lineUtils.replyText(replyToken, '❌ 您還沒有銀行帳戶，無法出家。');
        return;
    }
    const data = doc.data();

    if (data.jailUntil && data.jailUntil > Date.now()) {
        await lineUtils.replyText(replyToken, '❌ 坐牢中無法出家！');
        return;
    }
    if (data.wantedLevel > 0) {
        await lineUtils.replyText(replyToken, '❌ 你身上背負通緝值，警察盯著你呢，佛門不收通緝犯！');
        return;
    }
    if (data.isPolice || data.isMafia || (data.councilorUntil && data.councilorUntil > Date.now()) || (data.militaryUntil && data.militaryUntil > Date.now()) || data.profession) {
        await lineUtils.replyText(replyToken, `❌ 你已經有其他職業或公職身分了，請先辭職/退伍/卸任或退出黑幫再出家！`);
        return;
    }

    const currentCoin = data.kuCoin || 0;
    if (currentCoin < 0) {
        await lineUtils.replyText(replyToken, '❌ 你背負鉅額債務，佛祖不幫你還債，先去把欠款還清！');
        return;
    }

    // 沒收 90% 財產
    const donateAmount = Math.floor(currentCoin * 0.9);
    const newBalance = currentCoin - donateAmount;
    const monkName = getRandomMonkName();

    await db.collection('economy_users').doc(userId).set({
        profession: 'monk',
        monkName: monkName,
        followers: 0,
        karma: 0,
        kuCoin: newBalance,
        monkCooldowns: {}
    }, { merge: true });

    const bubble = flexUtils.createBubble({
        size: 'mega',
        header: flexUtils.createHeader('📿 遁入空門', '放下屠刀', flexUtils.COLORS.BG_MAIN, '#FF9800'),
        body: flexUtils.createBox('vertical', [
            flexUtils.createText({ text: '你自願剃度出家，從今以後，阿彌陀佛，善哉善哉。', size: 'sm', color: flexUtils.COLORS.TEXT_MAIN, wrap: true }),
            flexUtils.createSeparator('md'),
            flexUtils.createText({ text: `🙏 佛祖賜你法號：『${monkName}』`, size: 'md', weight: 'bold', color: '#1976D2', margin: 'md' }),
            flexUtils.createText({ text: `💸 捐出香油錢：${donateAmount.toLocaleString()} 哭幣`, size: 'sm', color: '#E65100', margin: 'sm' }),
            flexUtils.createText({ text: `🎒 裝備與俗世之物已全數捨棄。`, size: 'sm', color: flexUtils.COLORS.TEXT_SUB, margin: 'sm', wrap: true })
        ], { paddingAll: 'xl', backgroundColor: '#FFF8E1' })
    });
    await lineUtils.replyFlex(replyToken, '遁入空門', bubble);
}

// 還俗
async function leaveMonk(replyToken, groupId, userId) {
    const doc = await db.collection('economy_users').doc(userId).get();
    const data = doc.data();
    if (!data || data.profession !== 'monk') {
        await lineUtils.replyText(replyToken, '❌ 你又不是出家人！');
        return;
    }

    const currentCoin = data.kuCoin || 0;
    let fee = 0;
    if (currentCoin > 0) {
        fee = Math.floor(currentCoin * 0.5);
    }

    await db.collection('economy_users').doc(userId).update({
        profession: db.FieldValue.delete(),
        monkName: db.FieldValue.delete(),
        followers: db.FieldValue.delete(),
        karma: db.FieldValue.delete(),
        monkCooldowns: db.FieldValue.delete(),
        kuCoin: currentCoin - fee
    });

    const bubble = flexUtils.createBubble({
        size: 'mega',
        header: flexUtils.createHeader('🏃 金盆還俗', '重返俗世', flexUtils.COLORS.BG_MAIN, '#795548'),
        body: flexUtils.createBox('vertical', [
            flexUtils.createText({ text: '你受不了佛門清規，決定捲款潛逃還俗！', size: 'sm', color: flexUtils.COLORS.TEXT_MAIN, wrap: true }),
            flexUtils.createSeparator('md'),
            flexUtils.createText({ text: `💸 為了躲避信徒追殺，花費封口費：${fee.toLocaleString()}`, size: 'sm', weight: 'bold', color: '#E65100', margin: 'md', wrap: true }),
            flexUtils.createText({ text: `🏃 信徒已作鳥獸散，你恢復了一般平民身分。`, size: 'sm', color: flexUtils.COLORS.TEXT_SUB, margin: 'sm', wrap: true })
        ], { paddingAll: 'xl', backgroundColor: '#EFEBE9' })
    });
    await lineUtils.replyFlex(replyToken, '金盆還俗', bubble);
}

// 共用的結果處理函數
async function processSkillResult(replyToken, groupId, userId, data, skillName, resultMsg, moneyChange, followersChange, karmaChange, skillKey) {
    const docRef = db.collection('economy_users').doc(userId);
    const doc = await docRef.get();
    if (!doc.exists) return;
    const currentData = doc.data();

    const isPunished = await checkKarmaPunishment(groupId, userId, currentData);
    if (isPunished) return; // 天譴發動，行動中斷 (不進冷卻)

    let newCoin = 0, newFollowers = 0, newKarma = 0;

    await db.runTransaction(async (t) => {
        const tDoc = await t.get(docRef);
        if (!tDoc.exists) return;
        const tData = tDoc.data();

        newCoin = (tData.kuCoin || 0) + moneyChange;
        newFollowers = Math.max(0, (tData.followers || 0) + followersChange);
        newKarma = Math.max(0, (tData.karma || 0) + karmaChange);

        const updates = {
            kuCoin: newCoin,
            followers: newFollowers,
            karma: newKarma
        };
        if (skillKey) {
            updates[`monkCooldowns.${skillKey}`] = Date.now();
        }
        t.update(docRef, updates);
    });


    let profitText = '';
    if (moneyChange > 0) profitText = `💰 獲得香油錢：+${moneyChange.toLocaleString()}`;
    else if (moneyChange < 0) profitText = `💸 損失金錢：${moneyChange.toLocaleString()}`;

    let fText = '';
    if (followersChange > 0) fText = `🙏 信徒：+${followersChange}`;
    else if (followersChange < 0) fText = `🏃 信徒流失：${followersChange}`;

    let kText = '';
    if (karmaChange > 0) kText = `💀 業障：+${karmaChange}%`;
    else if (karmaChange < 0) kText = `✨ 業障：${karmaChange}% (減輕)`;

    const bodyContents = [
        flexUtils.createText({ text: resultMsg, size: 'sm', color: flexUtils.COLORS.TEXT_MAIN, wrap: true }),
        flexUtils.createSeparator('md')
    ];

    if (profitText) bodyContents.push(flexUtils.createText({ text: profitText, size: 'sm', weight: 'bold', color: moneyChange > 0 ? '#4CAF50' : '#E65100', margin: 'md' }));
    if (fText) bodyContents.push(flexUtils.createText({ text: fText, size: 'sm', weight: 'bold', color: followersChange > 0 ? '#1976D2' : '#E53935', margin: 'sm' }));
    if (kText) bodyContents.push(flexUtils.createText({ text: kText, size: 'sm', weight: 'bold', color: karmaChange > 0 ? '#D32F2F' : '#FF9800', margin: 'sm' }));
    
    bodyContents.push(flexUtils.createSeparator('md'));
    bodyContents.push(flexUtils.createText({ text: `🏦 結算資金：${newCoin.toLocaleString()}`, size: 'sm', weight: 'bold', color: '#1976D2', margin: 'md' }));
    bodyContents.push(flexUtils.createText({ text: `🙏 結算信徒：${newFollowers}`, size: 'sm', weight: 'bold', color: '#333333', margin: 'sm' }));
    bodyContents.push(flexUtils.createText({ text: `💀 結算總業障：${newKarma}%`, size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'sm' }));

    const bubble = flexUtils.createBubble({
        size: 'mega',
        header: flexUtils.createHeader(`📿 【${skillName}】`, '結果結算', flexUtils.COLORS.BG_MAIN, '#FF9800'),
        body: flexUtils.createBox('vertical', bodyContents, { paddingAll: 'xl', backgroundColor: '#FFF8E1' })
    });

    await lineUtils.replyFlex(replyToken, skillName, bubble);
}

// 1. 算命 (15m CD)
async function fortuneTelling(replyToken, groupId, userId) {
    const cdCheck = await checkCooldown(userId, 'fortune', 15 * 60 * 1000);
    if (!cdCheck.allowed) return lineUtils.replyText(replyToken, cdCheck.msg);

    const roll = Math.random();
    
    if (roll < 0.40) {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '街邊算命', '😱 你恐嚇大老闆印堂發黑必有血光之災，成功騙到鉅額改運費！', 5000000, 0, 3, 'fortune');
    } else if (roll < 0.80) {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '街邊算命', '🗣️ 你隨便講了幾句星座運勢幹話，收到紅包。', 1000000, 0, 1, 'fortune');
    } else {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '街邊算命', '📉 你報給大媽的六合彩明牌全摃龜，大媽們要求退費！', -1000000, 0, 0, 'fortune');
    }
}

// 2. 誦經 (30m CD)
async function chanting(replyToken, groupId, userId) {
    const cdCheck = await checkCooldown(userId, 'chanting', 30 * 60 * 1000);
    if (!cdCheck.allowed) return lineUtils.replyText(replyToken, cdCheck.msg);

    const roll = Math.random();
    
    if (roll < 0.30) {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '代客誦經', '😭 你去首富喪禮念經念得痛哭流涕，超逼真演技讓家屬感動大賞！', 8000000, 2, 1, 'chanting');
    } else if (roll < 0.70) {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '代客誦經', '🎤 念到一半發現跑錯靈堂，隨便混過去領走車馬費。', 3000000, 1, 2, 'chanting');
    } else if (roll < 0.90) {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '代客誦經', '😴 木魚敲到睡著狂打呼。通告費被沒收還被丟雞蛋！', -1000000, 0, 5, 'chanting');
    } else {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '代客誦經', '👻 去凶宅做法事結果被鬼壓床，跑去收驚花費鉅資。但你被嚇到屁滾尿流，業障竟然神奇地大減！', -3000000, 0, -5, 'chanting');
    }
}

// 3. 放生 (2h CD, 花費 100萬)
async function releaseAnimal(replyToken, groupId, userId) {
    const cdCheck = await checkCooldown(userId, 'release', 2 * 60 * 60 * 1000);
    if (!cdCheck.allowed) return lineUtils.replyText(replyToken, cdCheck.msg);

    if ((cdCheck.data.kuCoin || 0) < 1000000) {
        return lineUtils.replyText(replyToken, '❌ 放生需要購買動物，你的存款連 100 萬都不到！');
    }

    // 固定花費 100 萬
    let cost = -1000000;
    const roll = Math.random();
    
    if (roll < 0.50) {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '放生', '🐟 買了市場的小魚去放生，路過的善心人士深受感動捐款支持！', cost + 3000000, 5, 2, 'release');
    } else if (roll < 0.80) {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '放生', '💧 買了幾大卡車的礦泉水倒進水溝放生！智商堪憂，但信徒覺得你很有大愛並熱烈捐款！', cost + 10000000, 10, 5, 'release');
    } else {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '放生', '🐍 買毒蛇放生反被咬，緊急送醫花費大筆醫藥費！', cost - 5000000, 0, 5, 'release');
    }
}

// 4. 化緣 (6h CD)
async function begging(replyToken, groupId, userId) {
    const cdCheck = await checkCooldown(userId, 'begging', 6 * 60 * 60 * 1000);
    if (!cdCheck.allowed) return lineUtils.replyText(replyToken, cdCheck.msg);

    const roll = Math.random();
    
    if (roll < 0.30) {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '化緣', '🍀 成功洗腦路過的貴婦，推銷出高價開光佛珠！', 20000000, 2, 5, 'begging');
    } else if (roll < 0.80) {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '化緣', '😐 在路邊罰站一天，化到幾個便當跟一些香油錢。', 5000000, 0, -2, 'begging'); // 降業障
    } else {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '化緣', '💀 遇到+9陣頭被嗆「看三小」並扁了一頓，損失醫藥費。', -3000000, 0, 0, 'begging');
    }
}

// 5. 弘法 (4h CD, 需花費 1000萬)
async function preach(replyToken, groupId, userId) {
    const cdCheck = await checkCooldown(userId, 'preach', 4 * 60 * 60 * 1000);
    if (!cdCheck.allowed) return lineUtils.replyText(replyToken, cdCheck.msg);

    if ((cdCheck.data.kuCoin || 0) < 10000000) {
        return lineUtils.replyText(replyToken, '❌ 電視台時段費需要 1000 萬，你錢不夠！');
    }

    let cost = -10000000;
    const roll = Math.random();
    
    if (roll < 0.30) {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '電視弘法', '🔥 弘法神曲爆紅！信徒激動落淚大喊「感恩師父！讚嘆師父！」', cost + 30000000, 20, 15, 'preach');
    } else if (roll < 0.80) {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '電視弘法', '👴 只有早起的阿公阿嬤在看，勉強吸收了幾個信徒並收到一點捐款。', cost + 15000000, 5, 5, 'preach');
    } else {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '電視弘法', '🤬 講道時不小心爆粗口被直播出去！遭 NCC 重罰！', cost - 20000000, -5, 0, 'preach');
    }
}

// 6. 辦法會 (12h CD, 需 10 信徒)
async function ceremony(replyToken, groupId, userId) {
    const cdCheck = await checkCooldown(userId, 'ceremony', 12 * 60 * 60 * 1000);
    if (!cdCheck.allowed) return lineUtils.replyText(replyToken, cdCheck.msg);

    if ((cdCheck.data.followers || 0) < 10) {
        return lineUtils.replyText(replyToken, '❌ 辦法會需要至少 10 名信徒，不然沒人參加！');
    }

    const roll = Math.random();
    
    if (roll < 0.30) {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '祈福法會', '🎉 請了辣妹鋼管陣頭來大雄寶殿跳舞還願，氣氛嗨翻天，吸金無數！', 80000000, 15, 15, 'ceremony');
    } else if (roll < 0.70) {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '祈福法會', '🎐 正常舉辦念經消災法會，信眾熱烈捐獻。', 30000000, 5, 5, 'ceremony');
    } else if (roll < 0.90) {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '祈福法會', '🚨 法會被檢舉噪音污染，遭環保局開單開罰！', -10000000, 0, 0, 'ceremony');
    } else {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '祈福法會', '🔪 被地方黑道堂口強收保護費，法會被迫取消！', -30000000, -10, 0, 'ceremony');
    }
}

// 7. 賣塔位 (18h CD, 需 10 信徒, 目標 > 5000萬)
async function sellNiche(replyToken, groupId, userId, targetId) {
    const cdCheck = await checkCooldown(userId, 'sellNiche', 18 * 60 * 60 * 1000);
    if (!cdCheck.allowed) return lineUtils.replyText(replyToken, cdCheck.msg);

    if ((cdCheck.data.followers || 0) < 10) {
        return lineUtils.replyText(replyToken, '❌ 階級不足，需至少 10 名信徒。');
    }

    const targetDoc = await db.collection('economy_users').doc(targetId).get();
    if (!targetDoc.exists || (targetDoc.data().kuCoin || 0) < 50000000) {
        return lineUtils.replyText(replyToken, '❌ 對方太窮了（餘額低於 5000 萬），推銷靈骨塔對他沒用。');
    }

    const targetCoin = targetDoc.data().kuCoin;
    const roll = Math.random();
    const targetName = await lineUtils.getGroupMemberName(groupId, targetId) || '信徒';
    
    if (roll < 0.60) {
        const stealAmount = Math.floor(targetCoin * 0.12);
        await economyHandler.addCoinQuietly(groupId, targetId, -stealAmount);
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '推銷塔位', `😇 成功用「祖先業障重」恐嚇 ${targetName}，強迫推銷極樂海景塔位，奪走對方 12% 總財產！`, stealAmount, 5, 10, 'sellNiche');
    } else if (roll < 0.85) {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '推銷塔位', `🤡 想騙 ${targetName}，結果對方剛好也是詐騙集團！你反被騙走活動資金！`, -10000000, 0, 5, 'sellNiche');
    } else {
        await db.collection('economy_users').doc(userId).set({
            jailUntil: Date.now() + 4 * 60 * 60 * 1000,
            jailReason: '靈骨塔詐騙'
        }, { merge: true });
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '推銷塔位', `🚔 對 ${targetName} 推銷靈骨塔被認定為惡性詐騙！警察當場逮人，直接無條件入獄 4 小時！`, -20000000, 0, 15, 'sellNiche');
    }
}

// 8. 雙修 (24h CD, 需 50 信徒, 目標 > 1億)
async function dualCultivation(replyToken, groupId, userId, targetId) {
    const cdCheck = await checkCooldown(userId, 'dualCultivation', 24 * 60 * 60 * 1000);
    if (!cdCheck.allowed) return lineUtils.replyText(replyToken, cdCheck.msg);

    if ((cdCheck.data.followers || 0) < 50) {
        return lineUtils.replyText(replyToken, '❌ 階級不足，雙修需要至少 50 名信徒（斂財住持）。');
    }

    const targetDoc = await db.collection('economy_users').doc(targetId).get();
    if (!targetDoc.exists || (targetDoc.data().kuCoin || 0) < 100000000) {
        return lineUtils.replyText(replyToken, '❌ 對方身家不到 1 億，不配與你雙修！');
    }

    const targetCoin = targetDoc.data().kuCoin;
    const roll = Math.random();
    const targetName = await lineUtils.getGroupMemberName(groupId, targetId) || '信眾';
    
    if (roll < 0.50) {
        const stealAmount = Math.floor(targetCoin * 0.20);
        await economyHandler.addCoinQuietly(groupId, targetId, -stealAmount);
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '歡喜雙修', `💖 ${targetName} 被無上佛法徹底洗腦，與你靈肉合一！你順利轉移了對方 20% 總資產！`, stealAmount, 10, 30, 'dualCultivation');
    } else if (roll < 0.80) {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '歡喜雙修', `🤬 ${targetName} 覺得你是死變態並報警！你緊急賠償和解金平息風波！`, -30000000, 0, 10, 'dualCultivation');
    } else {
        await db.collection('economy_users').doc(userId).set({
            jailUntil: Date.now() + 8 * 60 * 60 * 1000,
            jailReason: '宗教性侵騙財'
        }, { merge: true });
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '歡喜雙修', `📸 與 ${targetName} 開房間被壹週刊偷拍爆料！身敗名裂被勒索封口費，信徒大幅流失，並遭檢調收押入獄 8 小時！`, -50000000, -20, 40, 'dualCultivation');
    }
}

// 9. 蓋廟資訊面板
async function buildTempleInfo(replyToken, groupId, userId) {
    const doc = await db.collection('economy_users').doc(userId).get();
    if (!doc.exists) return;
    const data = doc.data();
    if (data.profession !== 'monk') {
        return lineUtils.replyText(replyToken, '❌ 你不是出家人，蓋廟沒有功德！');
    }

    const currentKarma = data.karma || 0;
    const currentCoin = data.kuCoin || 0;
    const costPerKarma = 1000000;

    const bodyContents = [
        flexUtils.createText({ text: '請選擇你想消除多少業障：', size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, wrap: true }),
        flexUtils.createSeparator('md'),
        flexUtils.createText({ text: `💰 目前可用存款：${currentCoin.toLocaleString()}`, size: 'sm', weight: 'bold', color: flexUtils.COLORS.SECONDARY, margin: 'md' }),
        flexUtils.createText({ text: `💀 目前累積業障：${currentKarma}%`, size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'sm' }),
        flexUtils.createText({ text: `💸 蓋廟行情：每消 1% 業障需 ${costPerKarma.toLocaleString()} 哭幣`, size: 'xs', color: '#757575', margin: 'sm' })
    ];

    const actionButtons = [];
    
    if (currentKarma <= 0) {
        bodyContents.push(
            flexUtils.createSeparator('md'),
            flexUtils.createText({ text: '✨ 你目前沒有業障，不需花錢消災！', size: 'sm', weight: 'bold', color: '#4CAF50', margin: 'md', align: 'center' })
        );
    } else {
        // Option 1: 1%
        if (currentCoin >= costPerKarma) {
            actionButtons.push({
                type: 'button',
                style: 'secondary',
                color: '#E0E0E0',
                action: { type: 'postback', label: '🥉 消 1% (100萬)', data: `action=buildTempleConfirm&amount=${costPerKarma}`, displayText: '蓋廟 100萬' }
            });
        }
        
        // Option 2: 10%
        if (currentKarma >= 10 && currentCoin >= costPerKarma * 10) {
            actionButtons.push({
                type: 'button',
                style: 'secondary',
                color: '#E0E0E0',
                action: { type: 'postback', label: '🥈 消 10% (1000萬)', data: `action=buildTempleConfirm&amount=${costPerKarma * 10}`, displayText: '蓋廟 1000萬' }
            });
        }

        // Option 3: All-in (Max possible)
        const maxAffordable = Math.floor(currentCoin / costPerKarma);
        const maxToRemove = Math.min(maxAffordable, currentKarma);
        
        if (maxToRemove > 0) {
            const allInCost = maxToRemove * costPerKarma;
            let label = `🥇 消 ${maxToRemove}% (歐印)`;
            if (maxToRemove === currentKarma) label = `🥇 全消 (${(allInCost/10000).toLocaleString()}萬)`;
            actionButtons.push({
                type: 'button',
                style: 'primary',
                color: '#4CAF50',
                action: { type: 'postback', label: label, data: `action=buildTempleConfirm&amount=${allInCost}`, displayText: '蓋廟 歐印' }
            });
        }
    }

    if (actionButtons.length === 0 && currentKarma > 0) {
        bodyContents.push(
            flexUtils.createSeparator('md'),
            flexUtils.createText({ text: '❌ 存款不足！最少需要 1,000,000 哭幣才能消除業障。', size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'md', align: 'center' })
        );
    } else if (actionButtons.length > 0) {
        bodyContents.push(flexUtils.createSeparator('md'));
        bodyContents.push(
            flexUtils.createText({ text: '⌨️ 你也可以手動輸入「蓋廟 500萬」', size: 'xs', color: flexUtils.COLORS.TEXT_MUTED, align: 'center', margin: 'sm' })
        );
    }

    const bubble = flexUtils.createBubble({
        size: 'mega',
        header: flexUtils.createHeader('🏛️ 蓋廟消災', '花錢買功德', flexUtils.COLORS.BG_MAIN, '#FFC107'),
        body: flexUtils.createBox('vertical', bodyContents, { paddingAll: 'xl', backgroundColor: '#FFFDE7' }),
        footer: actionButtons.length > 0 ? flexUtils.createBox('vertical', actionButtons, { spacing: 'sm' }) : undefined
    });

    await lineUtils.replyFlex(replyToken, '蓋廟消災選單', bubble);
}

// 10. 蓋廟 (執行)
async function buildTemple(replyToken, groupId, userId, amount) {
    const doc = await db.collection('economy_users').doc(userId).get();
    if (!doc.exists) return;
    const data = doc.data();
    if (data.profession !== 'monk') {
        return lineUtils.replyText(replyToken, '❌ 你不是出家人，蓋廟沒有功德！');
    }

    const currentKarma = data.karma || 0;
    if (currentKarma <= 0) {
        return lineUtils.replyText(replyToken, '✨ 你目前沒有業障，不需要花錢消災！');
    }

    const costPerKarma = 1000000;
    let removeKarma = Math.floor(amount / costPerKarma);
    
    if (removeKarma <= 0) {
        return lineUtils.replyText(replyToken, `❌ 捐太少了！每消除 1% 業障需要 ${costPerKarma.toLocaleString()} 哭幣。`);
    }

    if (removeKarma > currentKarma) removeKarma = currentKarma;
    const totalCost = removeKarma * costPerKarma;

    const currentCoin = data.kuCoin || 0;
    if (currentCoin < totalCost) {
        return lineUtils.replyText(replyToken, `❌ 存款不足！消除 ${removeKarma}% 業障需要 ${totalCost.toLocaleString()} 哭幣。`);
    }

    await db.collection('economy_users').doc(userId).update({
        kuCoin: currentCoin - totalCost,
        karma: currentKarma - removeKarma
    });

    const bubble = flexUtils.createBubble({
        size: 'mega',
        header: flexUtils.createHeader('🏛️ 花錢消災', '蓋廟功德', flexUtils.COLORS.BG_MAIN, '#FFC107'),
        body: flexUtils.createBox('vertical', [
            flexUtils.createText({ text: '你豪擲千金蓋了一間金碧輝煌的廟宇，佛祖覺得很滿意。', size: 'sm', color: flexUtils.COLORS.TEXT_MAIN, wrap: true }),
            flexUtils.createSeparator('md'),
            flexUtils.createText({ text: `💸 消耗資金：${totalCost.toLocaleString()}`, size: 'sm', weight: 'bold', color: '#E65100', margin: 'md' }),
            flexUtils.createText({ text: `✨ 消除業障：-${removeKarma}%`, size: 'md', weight: 'bold', color: '#4CAF50', margin: 'sm' }),
            flexUtils.createText({ text: `💀 目前剩餘業障：${currentKarma - removeKarma}%`, size: 'sm', color: '#D32F2F', margin: 'sm' })
        ], { paddingAll: 'xl', backgroundColor: '#FFFDE7' })
    });
    await lineUtils.replyFlex(replyToken, '蓋廟消災', bubble);
}

// === 批量執行 (一鍵化緣/弘法) ===
async function handleBatchMonkGames(replyToken, context) {
    const { userId, groupId } = context;
    const docRef = db.collection('economy_users').doc(userId);
    const doc = await docRef.get();
    if (!doc.exists) return;
    const data = doc.data();

    if (data.profession !== 'monk') {
        return lineUtils.replyText(replyToken, '❌ 你不是出家人！');
    }

    // 先檢查天譴
    const isPunished = await checkKarmaPunishment(groupId, userId, data);
    if (isPunished) {
        // 如果觸發天譴，使用 addPendingMessage，此處如果被攔截就直接 return，因為天譴已經處理完
        // 但由於天譴是用 addPendingMessage，我們仍需用 replyToken 回覆一個字串避免 timeout
        return lineUtils.replyText(replyToken, '❌ 你的業障引爆了！天譴已經降臨！');
    }

    const now = Date.now();
    const cooldowns = data.monkCooldowns || {};
    const followers = data.followers || 0;
    let kuCoin = data.kuCoin || 0;
    let currentKarma = data.karma || 0;

    const skills = [
        { id: 'fortune', name: '街邊算命', cdMs: 15 * 60 * 1000, condition: () => true },
        { id: 'chanting', name: '代客誦經', cdMs: 30 * 60 * 1000, condition: () => true },
        { id: 'release', name: '放生', cdMs: 2 * 60 * 60 * 1000, condition: (c) => c >= 1000000, cost: 1000000 },
        { id: 'begging', name: '化緣', cdMs: 6 * 60 * 60 * 1000, condition: () => true },
        { id: 'preach', name: '電視弘法', cdMs: 4 * 60 * 60 * 1000, condition: (c) => c >= 10000000, cost: 10000000 },
        { id: 'ceremony', name: '祈福法會', cdMs: 12 * 60 * 60 * 1000, condition: (c, f) => f >= 10 }
    ];

    const executedSkills = [];
    let totalMoneyChange = 0;
    let totalFollowersChange = 0;
    let totalKarmaChange = 0;
    const updates = { 'monkCooldowns': { ...cooldowns } };

    for (const skill of skills) {
        const lastTime = cooldowns[skill.id] || 0;
        if (now - lastTime < skill.cdMs) continue; // 冷卻中

        // 檢查前置條件 (金錢、信徒)
        if (!skill.condition(kuCoin, followers)) continue;

        const roll = Math.random();
        let mChange = 0, fChange = 0, kChange = 0, text = '';

        if (skill.cost) {
            kuCoin -= skill.cost;
            mChange -= skill.cost;
        }

        if (skill.id === 'fortune') {
            if (roll < 0.40) { text = '😱 恐嚇大老闆印堂發黑，騙到改運費！'; mChange += 5000000; kChange += 3; }
            else if (roll < 0.80) { text = '🗣️ 講了星座運勢幹話，收到紅包。'; mChange += 1000000; kChange += 1; }
            else { text = '📉 報給大媽的明牌全摃龜，被要求退費！'; mChange -= 1000000; }
        } else if (skill.id === 'chanting') {
            if (roll < 0.30) { text = '😭 在首富喪禮痛哭流涕，獲感動大賞！'; mChange += 8000000; fChange += 2; kChange += 1; }
            else if (roll < 0.70) { text = '🎤 跑錯靈堂隨便混過去，領走車馬費。'; mChange += 3000000; fChange += 1; kChange += 2; }
            else if (roll < 0.90) { text = '😴 木魚敲到睡著狂打呼，通告費被沒收！'; mChange -= 1000000; kChange += 5; }
            else { text = '👻 凶宅法事被鬼壓床！花大錢收驚但業障大減！'; mChange -= 3000000; kChange -= 5; }
        } else if (skill.id === 'release') {
            if (roll < 0.50) { text = '🐟 放生小魚，善心人士感動捐款！'; mChange += 3000000; fChange += 5; kChange += 2; }
            else if (roll < 0.80) { text = '💧 把礦泉水倒水溝放生！智商堪憂但獲熱烈捐款！'; mChange += 10000000; fChange += 10; kChange += 5; }
            else { text = '🐍 買毒蛇放生反被咬，花費大筆醫藥費！'; mChange -= 5000000; kChange += 5; }
        } else if (skill.id === 'begging') {
            if (roll < 0.30) { text = '🍀 洗腦路過貴婦，推銷出高價佛珠！'; mChange += 20000000; fChange += 2; kChange += 5; }
            else if (roll < 0.80) { text = '😐 路邊罰站一天，化到便當與香油錢。'; mChange += 5000000; kChange -= 2; }
            else { text = '💀 遇到+9陣頭被嗆扁了一頓，損失醫藥費。'; mChange -= 3000000; }
        } else if (skill.id === 'preach') {
            if (roll < 0.30) { text = '🔥 弘法神曲爆紅！信徒大喊感恩師父！'; mChange += 30000000; fChange += 20; kChange += 15; }
            else if (roll < 0.80) { text = '👴 只有阿公阿嬤在看，吸收幾個信徒。'; mChange += 15000000; fChange += 5; kChange += 5; }
            else { text = '🤬 講道爆粗口直播出去！遭重罰！'; mChange -= 20000000; fChange -= 5; }
        } else if (skill.id === 'ceremony') {
            if (roll < 0.30) { text = '🎉 辣妹鋼管陣頭大雄寶殿跳舞，氣氛嗨翻！'; mChange += 80000000; fChange += 15; kChange += 15; }
            else if (roll < 0.70) { text = '🎐 舉辦念經消災法會，信眾熱烈捐獻。'; mChange += 30000000; fChange += 5; kChange += 5; }
            else if (roll < 0.90) { text = '🚨 法會被檢舉噪音，遭環保局開罰！'; mChange -= 10000000; }
            else { text = '🔪 被黑道強收保護費，被迫取消！'; mChange -= 30000000; fChange -= 10; }
        }

        kuCoin += (mChange - (skill.cost ? -skill.cost : 0));
        totalMoneyChange += mChange;
        totalFollowersChange += fChange;
        totalKarmaChange += kChange;
        
        updates.monkCooldowns[skill.id] = now;
        executedSkills.push({ name: skill.name, text, mChange, fChange, kChange });
    }

    if (executedSkills.length === 0) {
        return lineUtils.replyText(replyToken, '❌ 目前沒有任何準備好的技能可以批量執行，或是你缺乏所需的資金/信徒。');
    }

    // 更新資料庫
    await db.runTransaction(async (t) => {
        const tDoc = await t.get(docRef);
        if (!tDoc.exists) return;
        const tData = tDoc.data();

        const newCoin = (tData.kuCoin || 0) + totalMoneyChange;
        const newFollowers = Math.max(0, (tData.followers || 0) + totalFollowersChange);
        const newKarma = Math.max(0, (tData.karma || 0) + totalKarmaChange);

        t.update(docRef, {
            kuCoin: newCoin,
            followers: newFollowers,
            karma: newKarma,
            monkCooldowns: updates.monkCooldowns
        });
        
        kuCoin = newCoin;
        currentKarma = newKarma;
    });

    // 建立結算 Flex Message
    const bodyContents = [];
    bodyContents.push(flexUtils.createText({ text: '🔥 一鍵弘法結果', weight: 'bold', size: 'md', color: '#1976D2' }));
    bodyContents.push(flexUtils.createSeparator('sm'));

    for (const res of executedSkills) {
        bodyContents.push(flexUtils.createBox('vertical', [
            flexUtils.createText({ text: `📿 【${res.name}】`, size: 'sm', weight: 'bold', color: '#FF9800' }),
            flexUtils.createText({ text: res.text, size: 'xs', color: flexUtils.COLORS.TEXT_MAIN, wrap: true, margin: 'xs' }),
            flexUtils.createText({ 
                text: `💰 ${res.mChange > 0 ? '+' : ''}${res.mChange.toLocaleString()}  🙏 ${res.fChange > 0 ? '+' : ''}${res.fChange}  💀 ${res.kChange > 0 ? '+' : ''}${res.kChange}%`, 
                size: 'xxs', color: flexUtils.COLORS.TEXT_MUTED, align: 'end', margin: 'xs' 
            })
        ], { margin: 'md', paddingAll: 'sm', backgroundColor: '#F5F5F5', cornerRadius: 'sm' }));
    }

    bodyContents.push(flexUtils.createSeparator('md'));
    bodyContents.push(flexUtils.createBox('horizontal', [
        flexUtils.createText({ text: '總計收益:', size: 'sm', weight: 'bold', color: flexUtils.COLORS.TEXT_MAIN }),
        flexUtils.createText({ text: `${totalMoneyChange > 0 ? '+' : ''}${totalMoneyChange.toLocaleString()}`, size: 'sm', weight: 'bold', color: totalMoneyChange >= 0 ? '#4CAF50' : '#E65100', align: 'end' })
    ], { margin: 'md' }));

    const bubble = flexUtils.createBubble({
        size: 'mega',
        header: flexUtils.createHeader('📿 佛法無邊', '一鍵批量執行', '#FF9800', '#FFFFFF'),
        body: flexUtils.createBox('vertical', bodyContents, { paddingAll: 'lg', backgroundColor: '#FFF8E1' })
    });

    await lineUtils.replyFlex(replyToken, '一鍵弘法結果', bubble);
}

module.exports = {
    becomeMonk,
    leaveMonk,
    fortuneTelling,
    chanting,
    releaseAnimal,
    begging,
    preach,
    ceremony,
    sellNiche,
    dualCultivation,
    buildTemple,
    buildTempleInfo,
    handleBatchMonkGames,
    getMonkRank,
    getRankName
};
