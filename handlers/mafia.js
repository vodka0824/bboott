const { db } = require('../utils/db');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const { getWantedList, clearProfessionCache, getMafiaRank, getMafiaBoss } = require('./profession');

const COLLECTION_NAME = 'economy_users';

/**
 * 加入黑幫
 */
async function handleJoinMafia(replyToken, context) {
    const { userId, groupId } = context;

    try {
        const cost = 20000000; // 2000萬
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);

        const result = await db.runTransaction(async (t) => {
            const docRef = db.collection(COLLECTION_NAME).doc(userId);
            const doc = await t.get(docRef);
            if (!doc.exists) return { success: false, message: '找不到資料。' };
            
            const data = doc.data();
            const now = Date.now();

            if (data.isMafia) return { success: false, message: '你已經在道上混了，不需要重複拜大哥！' };
            if (data.isPolice) return { success: false, message: '條子也想混黑道？先去辭職再來說！' };
            if (data.councilorUntil && now < data.councilorUntil) return { success: false, message: '政客跑來混黑道太難看了，等卸任再說吧！' };
            if (data.militaryUntil && now < data.militaryUntil) return { success: false, message: '你是現役軍人，不得加入黑社會！' };
            if (data.profession === 'monk') return { success: false, message: '出家人六根清淨，怎麼跑來混黑道？請先還俗！' };

            // 新增條件：必須有至少 20% 通緝值
            if ((data.wantedLevel || 0) < 0.2) {
                return { success: false, message: '你的通緝值不到 20%，這種安分守己的菜鳥我們堂口不收！去幹幾票再回來！' };
            }

            if ((data.kuCoin || 0) < cost) {
                return { success: false, message: `拜大哥需要 ${cost.toLocaleString()} 哭幣當入會費，你錢不夠！` };
            }

            t.update(docRef, {
                isMafia: true,
                kuCoin: db.FieldValue.increment(-cost)
            });

            const newBalance = (data.kuCoin || 0) - cost;
            return { success: true, newBalance };
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        clearProfessionCache(userId);

        const bubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader('🕶️ 加入黑幫', '歡迎來到地下世界', flexUtils.COLORS.BG_MAIN, flexUtils.COLORS.BG_CARD),
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: `「拿著這杯茶，以後你就是我們兄弟了！」`, size: 'sm', weight: 'bold', color: '#B71C1C', wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `繳納了 20,000,000 哭幣入會費。`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, margin: 'md' }),
                flexUtils.createText({ text: `💰 結算總資產：${result.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: flexUtils.COLORS.BG_CARD, margin: 'sm' }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `🔓 解鎖黑道特權：`, size: 'sm', weight: 'bold', color: flexUtils.COLORS.BG_CARD, margin: 'md' }),
                flexUtils.createText({ text: `• 搶劫冷卻減免、戰鬥力提升\n• 搶劫增加的通緝值大幅降低\n• 越獄機率大增\n• 解鎖高風險犯罪技能`, size: 'xs', color: '#333333', wrap: true })
            ], { paddingAll: 'xl', backgroundColor: '#FAFAFA' })
        });

        
        await lineUtils.replyFlex(replyToken, '加入黑幫成功', bubble);

    } catch (e) {
        console.error('[Mafia] handleJoinMafia Error:', e);
        await lineUtils.replyText(replyToken, '❌ 加入黑幫發生錯誤。');
    }
}

/**
 * 退出黑幫 (斷手指)
 */
async function handleCutFinger(replyToken, context) {
    const { userId, groupId } = context;

    try {
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);

        const result = await db.runTransaction(async (t) => {
            const docRef = db.collection(COLLECTION_NAME).doc(userId);
            const doc = await t.get(docRef);
            if (!doc.exists) return { success: false, message: '找不到資料。' };
            
            const data = doc.data();
            const now = Date.now();

            if (!data.isMafia) {
                return { success: false, message: '你又不是黑道，斷什麼手指？' };
            }

            const currentCoins = data.kuCoin || 0;
            let cost = Math.floor(currentCoins * 0.5); // 扣 50% 資產
            if (cost < 50000000) cost = 50000000; // 最低 5000 萬
            
            let newBalance = currentCoins - cost;
            if (newBalance < 0) newBalance = 0; // 若連 5000 萬都沒有，直接破產

            t.update(docRef, {
                isMafia: db.FieldValue.delete(),
                kuCoin: newBalance,
                weakUntil: now + 24 * 60 * 60 * 1000 // 24H虛弱
            });

            return { success: true, cost: currentCoins - newBalance, newBalance };
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        clearProfessionCache(userId);

        const bubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader('🩸 斷指洗手', '退出江湖', flexUtils.COLORS.BG_MAIN, '#555555'),
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: `「既然你想走，就留下點東西吧！」`, size: 'sm', weight: 'bold', color: '#B71C1C', wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `你咬牙斷去一指，並支付了 ${result.cost.toLocaleString()} 哭幣的安家費。`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, margin: 'md', wrap: true }),
                flexUtils.createText({ text: `💰 結算總資產：${result.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#555555', margin: 'sm' }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `你退出了黑社會，失去了所有特權。`, size: 'sm', color: '#333333', margin: 'md' }),
                flexUtils.createText({ text: `⚠️ 虛弱狀態：未來 24 小時內戰鬥力下降 20 點。`, size: 'sm', color: '#FF0000', margin: 'sm', weight: 'bold', wrap: true })
            ], { paddingAll: 'xl', backgroundColor: '#FAFAFA' })
        });

        
        await lineUtils.replyFlex(replyToken, '退出黑幫成功', bubble);

    } catch (e) {
        console.error('[Mafia] handleCutFinger Error:', e);
        await lineUtils.replyText(replyToken, '❌ 斷手指發生錯誤。');
    }
}

/**
 * 圍事 (打手以上)
 */
async function handleTurfWar(replyToken, context) {
    const { userId, groupId } = context;

    try {
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);

        const result = await db.runTransaction(async (t) => {
            const docRef = db.collection(COLLECTION_NAME).doc(userId);
            const doc = await t.get(docRef);

            if (!doc.exists) return { success: false, message: '找不到您的資料。' };
            const data = doc.data();
            const now = Date.now();

            const rank = await getMafiaRank(userId, data);
            if (!['enforcer', 'capo', 'boss'].includes(rank)) {
                return { success: false, message: '你的階級太低，連去圍事的資格都沒有！(需要通緝值 20% 以上的打手階級)' };
            }

            const cdTime = 2 * 60 * 60 * 1000;
            if (data.lastTurfWar && (now - data.lastTurfWar) < cdTime) {
                const remainMin = Math.ceil((data.lastTurfWar + cdTime - now) / 60000);
                return { success: false, message: `⏳ 你剛圍過事，外面條子還在巡邏！請等 ${remainMin} 分鐘！` };
            }

            const playersSnapshot = await db.collection(COLLECTION_NAME)
                .where('kuCoin', '>', 100000)
                .limit(50)
                .get();

            const eligiblePlayers = [];
            playersSnapshot.forEach(playerDoc => {
                const pData = playerDoc.data();
                if (playerDoc.id !== userId && !pData.isPolice && !pData.isMafia) {
                    eligiblePlayers.push({ id: playerDoc.id, ref: db.collection(COLLECTION_NAME).doc(playerDoc.id), data: pData });
                }
            });

            if (eligiblePlayers.length === 0) return { success: false, message: '街上連一個像樣的平民都沒有！' };

            // 10% 機率遭到平民頑強抵抗
            if (Math.random() < 0.1) {
                const failPenalty = Math.floor((data.kuCoin || 0) * 0.1);
                t.update(docRef, { kuCoin: db.FieldValue.increment(-failPenalty), lastTurfWar: now });
                return { success: true, outcome: 'fail', penalty: failPenalty, newBalance: (data.kuCoin || 0) - failPenalty };
            }

            const victim = eligiblePlayers[Math.floor(Math.random() * eligiblePlayers.length)];
            const taxRatio = Math.random() * (0.05 - 0.02) + 0.02; // 2% ~ 5%
            const tax = Math.floor((victim.data.kuCoin || 0) * taxRatio);

            const currentWanted = data.wantedLevel || 0;
            const newWantedLevel = parseFloat((currentWanted + 0.02).toFixed(4)); // 圍事加 2% 通緝值

            t.update(victim.ref, { kuCoin: db.FieldValue.increment(-tax) });
            t.update(docRef, { kuCoin: db.FieldValue.increment(tax), lastTurfWar: now, wantedLevel: newWantedLevel });

            return { success: true, outcome: 'win', tax, victimName: victim.data.displayName || victim.data.name || '無名氏', newBalance: (data.kuCoin || 0) + tax };
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        const cdTimeObj = new Date(Date.now() + 2 * 60 * 60 * 1000);
        const cdTimeStr = cdTimeObj.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
        
        let header, bodyContents;

        if (result.outcome === 'fail') {
            header = flexUtils.createHeader('💥 圍事失敗', '踢到鐵板', flexUtils.COLORS.BG_MAIN, flexUtils.COLORS.DANGER);
            bodyContents = [
                flexUtils.createText({ text: '你帶人去夜店圍事，結果踢到鐵板，被平民打到骨折！', size: 'sm', color: flexUtils.COLORS.TEXT_MAIN, wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: '支付醫療費：', size: 'xs', color: flexUtils.COLORS.TEXT_MUTED, margin: 'md' }),
                flexUtils.createText({ text: `- ${result.penalty.toLocaleString()} 哭幣`, size: 'lg', color: flexUtils.COLORS.DANGER, weight: 'bold' }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `💰 結算餘額：${result.newBalance.toLocaleString()} 哭幣`, size: 'sm', color: flexUtils.COLORS.WARNING, weight: 'bold', margin: 'md' }),
                flexUtils.createText({ text: `⏳ 冷卻時間：120 分鐘\n(可於 ${cdTimeStr} 後再次行動)`, size: 'xs', color: flexUtils.COLORS.TEXT_MUTED, margin: 'sm', wrap: true })
            ];
        } else {
            header = flexUtils.createHeader('🕶️ 圍事成功', '強行收保護費', flexUtils.COLORS.BG_MAIN, flexUtils.COLORS.ACCENT);
            bodyContents = [
                flexUtils.createText({ text: `你去 ${result.victimName} 的地盤圍事，強行收走了保護費！`, size: 'sm', color: flexUtils.COLORS.TEXT_MAIN, wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: '收繳保護費：', size: 'xs', color: flexUtils.COLORS.TEXT_MUTED, margin: 'md' }),
                flexUtils.createText({ text: `+ ${result.tax.toLocaleString()} 哭幣`, size: 'lg', color: flexUtils.COLORS.SUCCESS, weight: 'bold' }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `💰 結算餘額：${result.newBalance.toLocaleString()} 哭幣`, size: 'sm', color: flexUtils.COLORS.WARNING, weight: 'bold', margin: 'md' }),
                flexUtils.createText({ text: `🚨 通緝值上升：+2%`, size: 'sm', color: '#D32F2F', weight: 'bold', margin: 'xs' }),
                flexUtils.createText({ text: `⏳ 冷卻時間：120 分鐘\n(可於 ${cdTimeStr} 後再次行動)`, size: 'xs', color: flexUtils.COLORS.TEXT_MUTED, margin: 'sm', wrap: true })
            ];
        }

        const bubble = flexUtils.createBubble({
            size: 'kilo',
            header: header,
            body: flexUtils.createBox('vertical', bodyContents, { backgroundColor: flexUtils.COLORS.BG_CARD, paddingAll: 'xl' })
        });

        await lineUtils.replyFlex(replyToken, result.outcome === 'fail' ? '圍事失敗' : '圍事成功', bubble);
    } catch (e) {
        console.error('[Mafia] handleTurfWar Error:', e);
        await lineUtils.replyText(replyToken, '❌ 圍事過程發生錯誤。');
    }
}

/**
 * 收保護費 (黑幫堂主專屬)
 */
async function handleProtectionFee(replyToken, context) {
    const { userId, groupId } = context;

    try {
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);

        const result = await db.runTransaction(async (t) => {
            const docRef = db.collection(COLLECTION_NAME).doc(userId);
            const doc = await t.get(docRef);

            if (!doc.exists) return { success: false, message: '找不到您的資料。' };
            const data = doc.data();
            const now = Date.now();

            const rank = await getMafiaRank(userId, data);
            if (rank !== 'capo' && rank !== 'boss') {
                return { success: false, message: '你必須是【黑幫堂主】以上的階級(通緝值 >= 60%)才能向議員收保護費！' };
            }

            const cdTime = 12 * 60 * 60 * 1000;
            if (data.lastProtectionFee && (now - data.lastProtectionFee) < cdTime) {
                const remainHrs = Math.ceil((data.lastProtectionFee + cdTime - now) / 3600000);
                return { success: false, message: `⏳ 小弟們還在外面避風頭，${remainHrs} 小時後才能再行動！` };
            }

            // 80% 超高風險被捕
            if (Math.random() < 0.8) {
                const currentCoins = data.kuCoin || 0;
                const confiscate = Math.floor(currentCoins * 0.5); // 沒收 50%
                const newWantedLevel = Number(((data.wantedLevel || 0) / 2).toFixed(2)); // 通緝值減半
                const penaltyMins = 120;
                const jailedUntil = now + (penaltyMins * 60 * 1000);
                
                t.update(docRef, {
                    kuCoin: db.FieldValue.increment(-confiscate),
                    lastProtectionFee: now,
                    wantedLevel: newWantedLevel,
                    jailedUntil,
                    crimeRecord: (data.crimeRecord || 0) + 1
                });
                return { success: true, outcome: 'arrested', confiscate, newWantedLevel, penaltyMins };
            }

            // 20% 成功，找一名議員
            const playersSnapshot = await db.collection(COLLECTION_NAME).where('councilorUntil', '>', now).get();
            const eligiblePlayers = [];
            playersSnapshot.forEach(playerDoc => {
                if (playerDoc.id !== userId) eligiblePlayers.push({ id: playerDoc.id, ref: db.collection(COLLECTION_NAME).doc(playerDoc.id), data: playerDoc.data() });
            });

            if (eligiblePlayers.length === 0) return { success: false, message: '目前全服沒有現任市議員可以勒索！' };

            const victim = eligiblePlayers[Math.floor(Math.random() * eligiblePlayers.length)];
            const tax = Math.floor((victim.data.kuCoin || 0) * 0.30); // 30%

            const currentWanted = data.wantedLevel || 0;
            const newWantedLevel = parseFloat((currentWanted + 0.05).toFixed(4)); // 收保護費加 5% 通緝值

            t.update(victim.ref, { kuCoin: db.FieldValue.increment(-tax) });
            t.update(docRef, { kuCoin: db.FieldValue.increment(tax), lastProtectionFee: now, wantedLevel: newWantedLevel });

            clearProfessionCache(victim.id);
            const newBalance = (data.kuCoin || 0) + tax;

            return { success: true, outcome: 'success', name: memberName, tax, victimName: victim.data.displayName || victim.data.name || '無名氏', newBalance };
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        if (result.outcome === 'arrested') {
            const bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('🚨 警方突襲', '收保護費失敗', '#B71C1C', '#FFEBEE'),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `你在勒索議員時，中了便衣警察的埋伏！`, size: 'sm', weight: 'bold', color: '#B71C1C', wrap: true }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: `法院沒收了你 50% 的總資產：\n-${result.confiscate.toLocaleString()} 哭幣`, size: 'sm', color: '#D32F2F', margin: 'md', wrap: true }),
                    flexUtils.createText({ text: `通緝值減半為：${(result.newWantedLevel * 100).toFixed(0)}% (堂主地位可能不保)`, size: 'sm', color: '#555555', margin: 'sm' }),
                    flexUtils.createText({ text: `刑期：${result.penaltyMins} 分鐘`, size: 'sm', color: '#555555', margin: 'sm' })
                ], { paddingAll: 'xl', backgroundColor: '#FAFAFA' })
            });
            
        await lineUtils.replyFlex(replyToken, '遭警逮捕', bubble);
        } else {
            const bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('🕶️ 收保護費', `【黑幫堂主】${result.name}`, '#5D4037', '#FFF3E0'),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `你帶人闖入議員辦公室，強行奪走政治獻金！`, size: 'sm', color: '#333333', wrap: true }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createBox('horizontal', [
                        flexUtils.createText({ text: `💼 ${result.victimName}`, size: 'sm', color: '#555555', flex: 4, wrap: true }),
                        flexUtils.createText({ text: `-${result.tax.toLocaleString()}`, size: 'sm', color: '#C62828', flex: 3, align: 'end', weight: 'bold' })
                    ], { margin: 'md' }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: `💰 總收入：${result.tax.toLocaleString()} 哭幣`, size: 'md', weight: 'bold', color: '#2E7D32', margin: 'md', align: 'center' }),
                    flexUtils.createText({ text: `🚨 通緝值上升：+5%`, size: 'sm', color: '#D32F2F', weight: 'bold', margin: 'xs', align: 'center' }),
                    flexUtils.createText({ text: `🏦 結算總資產：${result.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#5D4037', margin: 'sm', align: 'center' })
                ], { backgroundColor: flexUtils.COLORS.BG_MAIN, paddingAll: 'xl' })
            });
            
        await lineUtils.replyFlex(replyToken, '收保護費', bubble);
        }

    } catch (e) {
        console.error('[Mafia] handleProtectionFee Error:', e);
        await lineUtils.replyText(replyToken, '❌ 收保護費過程發生錯誤。');
    }
}

/**
 * 勒索政客 (黑道老大專屬)
 */
async function handleExtortCouncilors(replyToken, context) {
    const { userId, groupId } = context;

    try {
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);

        const result = await db.runTransaction(async (t) => {
            const docRef = db.collection(COLLECTION_NAME).doc(userId);
            const doc = await t.get(docRef);

            if (!doc.exists) return { success: false, message: '找不到您的資料。' };
            const data = doc.data();
            const now = Date.now();

            const rank = await getMafiaRank(userId, data);
            if (rank !== 'boss') {
                return { success: false, message: '你不是【黑道老大】，沒有資格發動大規模勒索！' };
            }

            const cdTime = 24 * 60 * 60 * 1000;
            if (data.lastExtortCouncilor && (now - data.lastExtortCouncilor) < cdTime) {
                const remainHrs = Math.ceil((data.lastExtortCouncilor + cdTime - now) / 3600000);
                return { success: false, message: `⏳ 政客們已經被榨乾了，${remainHrs} 小時後才能再勒索！` };
            }

            // 15% 機率全國大掃黑
            if (Math.random() < 0.15) {
                const currentCoins = data.kuCoin || 0;
                const confiscate = Math.floor(currentCoins * 0.2); // 沒收 20%
                const penaltyMins = 24 * 60; // 24小時最重刑期
                const jailedUntil = now + (penaltyMins * 60 * 1000);
                
                t.update(docRef, {
                    kuCoin: db.FieldValue.increment(-confiscate),
                    lastExtortCouncilor: now,
                    wantedLevel: 0, // 直接歸零，剝奪老大寶座
                    jailedUntil,
                    crimeRecord: (data.crimeRecord || 0) + 1
                });
                return { success: true, outcome: 'swept', confiscate, penaltyMins };
            }

            // 找出所有現任議員
            const playersSnapshot = await db.collection(COLLECTION_NAME).where('councilorUntil', '>', now).get();
            const eligiblePlayers = [];
            playersSnapshot.forEach(playerDoc => {
                if (playerDoc.id !== userId) eligiblePlayers.push({ id: playerDoc.id, ref: db.collection(COLLECTION_NAME).doc(playerDoc.id), data: playerDoc.data() });
            });

            if (eligiblePlayers.length === 0) return { success: false, message: '目前全服沒有現任市議員可以勒索！' };

            let totalCollected = 0;
            const victimDetails = [];

            for (const victim of eligiblePlayers) {
                const tax = Math.floor((victim.data.kuCoin || 0) * 0.05); // 5%
                if (tax > 0) {
                    t.update(victim.ref, { kuCoin: db.FieldValue.increment(-tax) });
                    totalCollected += tax;
                    victimDetails.push({ name: victim.data.displayName || victim.data.name || '無名氏', amount: tax });
                    clearProfessionCache(victim.id);
                }
            }

            if (totalCollected === 0) return { success: false, message: '議員們都破產了，勒索不到半毛錢！' };

            const currentWanted = data.wantedLevel || 0;
            const newWantedLevel = parseFloat((currentWanted + 0.10).toFixed(4)); // 勒索政客加 10% 通緝值

            t.update(docRef, { kuCoin: db.FieldValue.increment(totalCollected), lastExtortCouncilor: now, wantedLevel: newWantedLevel });
            return { success: true, outcome: 'success', name: memberName, totalCollected, victimDetails, newBalance: (data.kuCoin || 0) + totalCollected };
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        if (result.outcome === 'swept') {
            const bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('🚨 全國大掃黑', '黑道帝國瓦解', flexUtils.COLORS.BG_CARD, '#FFCDD2'),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `你的大規模勒索激怒了政府，警方出動維安特勤隊將你逮捕歸案！`, size: 'sm', weight: 'bold', color: '#B71C1C', wrap: true }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: `法院查封了你 20% 的財產：\n-${result.confiscate.toLocaleString()} 哭幣`, size: 'sm', color: '#D32F2F', margin: 'md', wrap: true }),
                    flexUtils.createText({ text: `通緝值已歸零，你失去了黑道老大的寶座！`, size: 'sm', weight: 'bold', color: '#555555', margin: 'sm', wrap: true }),
                    flexUtils.createText({ text: `重度刑期：${result.penaltyMins / 60} 小時`, size: 'sm', color: '#555555', margin: 'sm' })
                ], { paddingAll: 'xl', backgroundColor: '#FAFAFA' })
            });
            
        await lineUtils.replyFlex(replyToken, '全國大掃黑', bubble);
        } else {
            const bodyContents = [
                flexUtils.createText({ text: `【老大】${result.name} 強迫政客們交出政治獻金！`, size: 'sm', color: '#333333', wrap: true }),
                flexUtils.createSeparator('md')
            ];
            result.victimDetails.forEach(v => {
                bodyContents.push(flexUtils.createBox('horizontal', [
                    flexUtils.createText({ text: `💼 ${v.name}`, size: 'sm', color: '#555555', flex: 4, wrap: true }),
                    flexUtils.createText({ text: `-${v.amount.toLocaleString()}`, size: 'sm', color: '#C62828', flex: 3, align: 'end', weight: 'bold' })
                ], { margin: 'md' }));
            });
            bodyContents.push(flexUtils.createSeparator('md'));
            bodyContents.push(flexUtils.createText({ text: `💰 總計勒索：${result.totalCollected.toLocaleString()} 哭幣`, size: 'md', weight: 'bold', color: '#2E7D32', margin: 'md', align: 'center' }));
            bodyContents.push(flexUtils.createText({ text: `🚨 通緝值上升：+10%`, size: 'sm', color: '#D32F2F', weight: 'bold', margin: 'xs', align: 'center' }));
            bodyContents.push(flexUtils.createText({ text: `🏦 結算總資產：${result.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#880E4F', margin: 'sm', align: 'center' }));

            const bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('💀 勒索政客', `【黑道老大】${result.name}`, '#880E4F', '#FCE4EC'),
                body: flexUtils.createBox('vertical', bodyContents, { backgroundColor: flexUtils.COLORS.BG_MAIN, paddingAll: 'xl' })
            });
            
        await lineUtils.replyFlex(replyToken, '勒索政客', bubble);
        }
    } catch (e) {
        console.error('[Mafia] handleExtortCouncilors Error:', e);
        await lineUtils.replyText(replyToken, '❌ 勒索政客發生錯誤。');
    }
}

/**
 * 篡位 / 暗殺老大 (黑吃黑)
 */
async function handleUsurp(replyToken, context) {
    const { userId, groupId } = context;

    try {
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);

        const result = await db.runTransaction(async (t) => {
            const docRef = db.collection(COLLECTION_NAME).doc(userId);
            const doc = await t.get(docRef);

            if (!doc.exists) return { success: false, message: '找不到您的資料。' };
            const data = doc.data();
            const now = Date.now();

            const rank = await getMafiaRank(userId, data);
            if (!rank || rank === 'boss') {
                return { success: false, message: '你必須是黑幫成員才能篡位！老大無法暗殺自己！' };
            }

            const cdTime = 24 * 60 * 60 * 1000;
            if (data.lastUsurp && (now - data.lastUsurp) < cdTime) {
                const remainHrs = Math.ceil((data.lastUsurp + cdTime - now) / 3600000);
                return { success: false, message: `⏳ 你剛策劃過暗殺，還在被追殺中，${remainHrs} 小時後才能再次行動！` };
            }

            const bossInfo = await getMafiaBoss();
            if (!bossInfo || !bossInfo.userId) {
                return { success: false, message: '目前全服沒有黑道老大，你想篡位也沒對象！快去提升通緝值吧！' };
            }

            const bossDocRef = db.collection(COLLECTION_NAME).doc(bossInfo.userId);
            const bossDoc = await t.get(bossDocRef);
            if (!bossDoc.exists) return { success: false, message: '找不到老大的資料。' };
            
            const bossData = bossDoc.data();

            // 30% 成功暗殺
            if (Math.random() < 0.3) {
                const stealAmount = Math.floor((bossData.kuCoin || 0) * 0.2); // 奪走 20%
                
                t.update(bossDocRef, {
                    kuCoin: db.FieldValue.increment(-stealAmount),
                    wantedLevel: 0 // 老大通緝值歸零
                });

                t.update(docRef, {
                    kuCoin: db.FieldValue.increment(stealAmount),
                    lastUsurp: now
                });

                clearProfessionCache(bossInfo.userId);
                return { success: true, outcome: 'success', stealAmount, bossName: bossInfo.name, newBalance: (data.kuCoin || 0) + stealAmount };
            } else {
                // 70% 失敗反殺
                const currentCoins = data.kuCoin || 0;
                const confiscate = Math.floor(currentCoins * 0.5); // 損失 50%
                const penaltyMins = 120;
                
                t.update(docRef, {
                    kuCoin: db.FieldValue.increment(-confiscate),
                    wantedLevel: 0, // 通緝值歸零
                    jailedUntil: now + (penaltyMins * 60 * 1000), // 丟進監獄(醫院)
                    lastUsurp: now
                });
                return { success: true, outcome: 'fail', confiscate, bossName: bossInfo.name, penaltyMins };
            }
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        if (result.outcome === 'success') {
            const bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('🗡️ 篡位成功', '黑吃黑', '#000000', '#FFD700'),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `你成功暗殺了老大 ${result.bossName}！`, size: 'md', weight: 'bold', color: '#1B5E20', wrap: true }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: `💰 奪走權力與 ${result.stealAmount.toLocaleString()} 哭幣！`, size: 'sm', margin: 'md', wrap: true }),
                    flexUtils.createText({ text: `老大的通緝值已歸零，江湖即將重新洗牌！`, size: 'sm', margin: 'sm', color: '#666666', wrap: true }),
                    flexUtils.createText({ text: `(剩餘餘額: ${result.newBalance.toLocaleString()})`, size: 'xs', color: '#999999', margin: 'md', align: 'end' })
                ], { paddingAll: 'xl', backgroundColor: '#FAFAFA' })
            });
            await lineUtils.replyFlex(replyToken, '篡位成功', bubble);
        } else {
            const bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('💀 暗殺失敗', '殘酷反殺', '#D32F2F', '#FFEBEE'),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `你的行蹤敗露，遭到了 ${result.bossName} 的殘酷反殺！`, size: 'md', weight: 'bold', color: '#C62828', wrap: true }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: `你被沒收了 50% 資產 (-${result.confiscate.toLocaleString()} 哭幣) 並且通緝值歸零！`, size: 'sm', margin: 'md', wrap: true }),
                    flexUtils.createText({ text: `(目前重傷入獄中，需休養 ${result.penaltyMins / 60} 小時)`, size: 'xs', color: '#999999', margin: 'md', align: 'end' })
                ], { paddingAll: 'xl', backgroundColor: '#FAFAFA' })
            });
            await lineUtils.replyFlex(replyToken, '暗殺失敗', bubble);
        }
    } catch (e) {
        console.error('[Mafia] handleUsurp Error:', e);
        await lineUtils.replyText(replyToken, '❌ 篡位過程發生錯誤。');
    }
}

module.exports = {
    handleJoinMafia,
    handleCutFinger,
    handleTurfWar,
    handleProtectionFee,
    handleExtortCouncilors,
    handleUsurp
};
