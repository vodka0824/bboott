const { db } = require('../utils/db');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const { getWantedList, clearProfessionCache, getMafiaRank } = require('./profession');

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

            if (data.isMafia) {
                return { success: false, message: '你已經在道上混了，不需要重複拜大哥！' };
            }

            if (data.isPolice) {
                return { success: false, message: '條子也想混黑道？先去辭職再來說！' };
            }

            if (data.councilorUntil && now < data.councilorUntil) {
                return { success: false, message: '政客跑來混黑道太難看了，等卸任再說吧！' };
            }

            if (data.militaryUntil && now < data.militaryUntil) {
                return { success: false, message: '你是現役軍人，不得加入黑社會！' };
            }

            if ((data.crimeRecord || 0) < 3) {
                return { success: false, message: '你的前科不到 3 次，這種菜鳥我們堂口不收！去幹幾票再回來！' };
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
            header: flexUtils.createHeader('🕶️ 加入黑幫', '歡迎來到地下世界', '#FFFFFF', '#1A1A1A'),
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: `「拿著這杯茶，以後你就是我們兄弟了！」`, size: 'sm', weight: 'bold', color: '#B71C1C', wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `繳納了 20,000,000 哭幣入會費。`, size: 'sm', color: '#666666', margin: 'md' }),
                flexUtils.createText({ text: `💰 結算總資產：${result.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#1A1A1A', margin: 'sm' }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `🔓 解鎖黑道特權：`, size: 'sm', weight: 'bold', color: '#1A1A1A', margin: 'md' }),
                flexUtils.createText({ text: `• 搶劫冷卻減免、成功率提升\n• 搶劫增加的通緝值大幅降低\n• 高通緝值提供額外戰鬥力\n• 越獄機率大增`, size: 'xs', color: '#333333', wrap: true }),
                flexUtils.createText({ text: `⚠️ 警告：被警察逮捕將加重刑期！`, size: 'xs', color: '#FF0000', margin: 'sm' })
            ], { paddingAll: 'xl', backgroundColor: '#FAFAFA' })
        });

        await lineUtils.replyFlex(replyToken, '加入黑幫成功', bubble);

    } catch (e) {
        console.error('[Mafia] handleJoinMafia Error:', e);
        await lineUtils.replyText(replyToken, '❌ 加入黑幫發生錯誤。');
    }
}

/**
 * 退出黑幫
 */
async function handleLeaveMafia(replyToken, context) {
    const { userId, groupId } = context;

    try {
        const cost = 50000000; // 5000萬
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);

        const result = await db.runTransaction(async (t) => {
            const docRef = db.collection(COLLECTION_NAME).doc(userId);
            const doc = await t.get(docRef);
            if (!doc.exists) return { success: false, message: '找不到資料。' };
            
            const data = doc.data();
            const now = Date.now();

            if (!data.isMafia) {
                return { success: false, message: '你又不是黑道，退什麼幫？' };
            }

            if ((data.kuCoin || 0) < cost) {
                return { success: false, message: `金盆洗手需要支付 ${cost.toLocaleString()} 哭幣的斷指費，你錢不夠！` };
            }

            t.update(docRef, {
                isMafia: db.FieldValue.delete(),
                kuCoin: db.FieldValue.increment(-cost),
                weakUntil: now + 24 * 60 * 60 * 1000 // 24H虛弱
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
            header: flexUtils.createHeader('🩸 金盆洗手', '退出江湖', '#FFFFFF', '#555555'),
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: `「既然你想走，就留下點東西吧！」`, size: 'sm', weight: 'bold', color: '#B71C1C', wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `支付了 50,000,000 哭幣斷指費。`, size: 'sm', color: '#666666', margin: 'md' }),
                flexUtils.createText({ text: `💰 結算總資產：${result.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#555555', margin: 'sm' }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `你退出了黑社會，失去了所有特權。`, size: 'sm', color: '#333333', margin: 'md' }),
                flexUtils.createText({ text: `⚠️ 虛弱狀態：未來 24 小時內戰鬥力下降 20 點。`, size: 'sm', color: '#FF0000', margin: 'sm', weight: 'bold', wrap: true })
            ], { paddingAll: 'xl', backgroundColor: '#FAFAFA' })
        });

        await lineUtils.replyFlex(replyToken, '退出黑幫成功', bubble);

    } catch (e) {
        console.error('[Mafia] handleLeaveMafia Error:', e);
        await lineUtils.replyText(replyToken, '❌ 退出黑幫發生錯誤。');
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
                return { success: false, message: '你必須是【黑幫堂主】以上的階級才能收保護費！' };
            }

            if (data.lastProtectionFee && (now - data.lastProtectionFee) < 24 * 60 * 60 * 1000) {
                const remainHrs = Math.ceil((data.lastProtectionFee + 24 * 60 * 60 * 1000 - now) / 3600000);
                return { success: false, message: `⏳ 小弟們還在外面巡邏收帳，${remainHrs} 小時後才能再收！` };
            }

            // 隨機選 1 名有錢的平民 (不是議員、不是警察、不是黑道)
            const playersSnapshot = await db.collection(COLLECTION_NAME)
                .where('kuCoin', '>', 500000)
                .limit(50)
                .get();

            const eligiblePlayers = [];
            playersSnapshot.forEach(playerDoc => {
                const pData = playerDoc.data();
                if (playerDoc.id !== userId && !pData.isPolice && !pData.isMafia && !(pData.councilorUntil && now < pData.councilorUntil)) {
                    eligiblePlayers.push({
                        id: playerDoc.id,
                        ref: db.collection(COLLECTION_NAME).doc(playerDoc.id),
                        data: pData
                    });
                }
            });

            if (eligiblePlayers.length === 0) {
                return { success: false, message: '這個地盤上沒有足夠肥的普通市民可以收保護費！' };
            }

            const victim = eligiblePlayers[Math.floor(Math.random() * eligiblePlayers.length)];
            const tax = Math.floor((victim.data.kuCoin || 0) * 0.10); // 10%

            t.update(victim.ref, { kuCoin: db.FieldValue.increment(-tax) });
            t.update(docRef, {
                kuCoin: db.FieldValue.increment(tax),
                lastProtectionFee: now
            });

            clearProfessionCache(victim.id);
            const newBalance = (data.kuCoin || 0) + tax;

            return { success: true, name: memberName, tax, victimName: victim.data.displayName || victim.data.name || '無名氏', newBalance };
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        const bodyContents = [
            flexUtils.createText({ text: `【堂主】${result.name} 帶著小弟砸爛了商家的店面！`, size: 'sm', color: '#333333', wrap: true }),
            flexUtils.createSeparator('md'),
            flexUtils.createBox('horizontal', [
                flexUtils.createText({ text: `🔪 ${result.victimName}`, size: 'sm', color: '#555555', flex: 4, wrap: true }),
                flexUtils.createText({ text: `-${result.tax.toLocaleString()}`, size: 'sm', color: '#C62828', flex: 3, align: 'end', weight: 'bold' })
            ], { margin: 'md' }),
            flexUtils.createSeparator('md'),
            flexUtils.createText({
                text: `💰 總收入：${result.tax.toLocaleString()} 哭幣`,
                size: 'md', weight: 'bold', color: '#2E7D32', margin: 'md', align: 'center'
            }),
            flexUtils.createText({
                text: `🏦 結算總資產：${result.newBalance.toLocaleString()} 哭幣`,
                size: 'sm', weight: 'bold', color: '#5D4037', margin: 'sm', align: 'center'
            }),
            flexUtils.createSeparator('md'),
            flexUtils.createText({
                text: `⏳ 冷卻時間：24 小時\n（可於 ${new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })} 後再次收保護費）`,
                size: 'xxs', color: '#888888', align: 'center', margin: 'md', wrap: true
            })
        ];

        const bubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader('🕶️ 收保護費', `【黑幫堂主】${result.name}`, '#5D4037', '#FFF3E0'),
            body: flexUtils.createBox('vertical', bodyContents, { backgroundColor: '#FFFFFF', paddingAll: 'xl' })
        });

        await lineUtils.replyFlex(replyToken, '收保護費', bubble);

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
                return { success: false, message: '你不是【黑道老大】，沒有資格勒索政客！' };
            }

            if (data.lastExtortCouncilor && (now - data.lastExtortCouncilor) < 24 * 60 * 60 * 1000) {
                const remainHrs = Math.ceil((data.lastExtortCouncilor + 24 * 60 * 60 * 1000 - now) / 3600000);
                return { success: false, message: `⏳ 政客們已經被榨乾了，${remainHrs} 小時後才能再勒索！` };
            }

            // 找出所有現任議員
            const playersSnapshot = await db.collection(COLLECTION_NAME)
                .where('councilorUntil', '>', now)
                .get();

            const eligiblePlayers = [];
            playersSnapshot.forEach(playerDoc => {
                if (playerDoc.id !== userId) { // 雖然老大不能是議員，但安全起見
                    eligiblePlayers.push({
                        id: playerDoc.id,
                        ref: db.collection(COLLECTION_NAME).doc(playerDoc.id),
                        data: playerDoc.data()
                    });
                }
            });

            if (eligiblePlayers.length === 0) {
                return { success: false, message: '目前全服沒有現任市議員可以勒索！' };
            }

            let totalCollected = 0;
            const victimDetails = [];

            for (const victim of eligiblePlayers) {
                const tax = Math.floor((victim.data.kuCoin || 0) * 0.03); // 3%
                if (tax > 0) {
                    t.update(victim.ref, { kuCoin: db.FieldValue.increment(-tax) });
                    totalCollected += tax;
                    victimDetails.push({
                        name: victim.data.displayName || victim.data.name || '無名氏',
                        amount: tax
                    });
                    clearProfessionCache(victim.id);
                }
            }

            if (totalCollected === 0) {
                return { success: false, message: '議員們都破產了，勒索不到半毛錢！' };
            }

            t.update(docRef, {
                kuCoin: db.FieldValue.increment(totalCollected),
                lastExtortCouncilor: now
            });
            const newBalance = (data.kuCoin || 0) + totalCollected;

            return { success: true, name: memberName, totalCollected, victimDetails, newBalance };
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        const bodyContents = [
            flexUtils.createText({ text: `【老大】${result.name} 掌握了政客們的洗錢證據，強迫他們交出政治獻金！`, size: 'sm', color: '#333333', wrap: true }),
            flexUtils.createSeparator('md')
        ];

        result.victimDetails.forEach(v => {
            bodyContents.push(flexUtils.createBox('horizontal', [
                flexUtils.createText({ text: `💼 ${v.name}`, size: 'sm', color: '#555555', flex: 4, wrap: true }),
                flexUtils.createText({ text: `-${v.amount.toLocaleString()}`, size: 'sm', color: '#C62828', flex: 3, align: 'end', weight: 'bold' })
            ], { margin: 'md' }));
        });

        bodyContents.push(flexUtils.createSeparator('md'));
        bodyContents.push(flexUtils.createText({
            text: `💰 總計勒索：${result.totalCollected.toLocaleString()} 哭幣`,
            size: 'md', weight: 'bold', color: '#2E7D32', margin: 'md', align: 'center'
        }));
        bodyContents.push(flexUtils.createText({
            text: `🏦 結算總資產：${result.newBalance.toLocaleString()} 哭幣`,
            size: 'sm', weight: 'bold', color: '#880E4F', margin: 'sm', align: 'center'
        }));
        bodyContents.push(flexUtils.createSeparator('md'));
        bodyContents.push(flexUtils.createText({
            text: `⏳ 冷卻時間：24 小時\n（可於 ${new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })} 後再次勒索）`,
            size: 'xxs', color: '#888888', align: 'center', margin: 'md', wrap: true
        }));

        const bubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader('💀 勒索政客', `【黑道老大】${result.name}`, '#880E4F', '#FCE4EC'),
            body: flexUtils.createBox('vertical', bodyContents, { backgroundColor: '#FFFFFF', paddingAll: 'xl' })
        });

        await lineUtils.replyFlex(replyToken, '勒索政客', bubble);

    } catch (e) {
        console.error('[Mafia] handleExtortCouncilors Error:', e);
        await lineUtils.replyText(replyToken, '❌ 勒索政客過程發生錯誤。');
    }
}

module.exports = {
    handleJoinMafia,
    handleLeaveMafia,
    handleProtectionFee,
    handleExtortCouncilors
};
