const { db } = require('../utils/db');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const memoryCache = require('../utils/memoryCache');
const { getSpamResponse } = require('../utils/spamHandler');
const COLLECTION_NAME = 'economy_users';

function getCriminalTitle(record) {
    if (!record || record <= 0) return '';
    if (record >= 30) return '【頭號通緝犯】';
    if (record >= 10) return '【監獄角頭】';
    if (record >= 3) return '【慣犯】';
    return '';
}

async function checkJailStatus(userId) {
    try {
        const docRef = db.collection(COLLECTION_NAME).doc(userId);
        const doc = await docRef.get();
        if (!doc.exists) return false;
        
        const data = doc.data();
        if (data.jailedUntil && Date.now() < data.jailedUntil) {
            return {
                isJailed: true,
                jailedUntil: data.jailedUntil
            };
        }
        return { isJailed: false };
    } catch (e) {
        console.error('[Jail] checkJailStatus Error:', e);
        return { isJailed: false };
    }
}

async function handleJailList(replyToken) {
    try {
        const now = Date.now();
        // 抓取被關押的犯人 (jailedUntil > 現在時間)
        const snapshot = await db.collection(COLLECTION_NAME)
            .where('jailedUntil', '>', now)
            .orderBy('jailedUntil', 'asc')
            .limit(20)
            .get();

        if (snapshot.empty) {
            await lineUtils.replyText(replyToken, '🕊️ 目前天下太平，皇家監獄裡連一隻蚊子都沒有！');
            return;
        }

        const bubbles = [];
        let currentBubbleContents = [];
        
        snapshot.forEach((doc) => {
            const data = doc.data();
            const name = data.displayName || data.name || '未知囚犯';
            const remainingMins = Math.ceil((data.jailedUntil - now) / 60000);
            const crimeRecord = data.crimeRecord || 0;
            const title = getCriminalTitle(crimeRecord);
            const userId = doc.id;

            const row = flexUtils.createBox('horizontal', [
                flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `${title}${name}`, size: 'sm', weight: 'bold', color: '#333333', wrap: true }),
                    flexUtils.createText({ text: `前科: ${crimeRecord} 次 | 剩餘: ${remainingMins} 分`, size: 'xs', color: '#888888' }),
                    ...(data.hasShiv ? [flexUtils.createText({ text: `(偷偷藏了一把銼刀...)`, size: 'xxs', color: '#E91E63' })] : [])
                ], { flex: 2 }),
                flexUtils.createBox('vertical', [
                    flexUtils.createButton({ action: { type: 'postback', label: '保釋', data: `action=confirmBailOther&targetId=${userId}&initiatorId=self`, displayText: `確認保釋` }, style: 'secondary', height: 'sm', color: '#1DB446' }),
                    flexUtils.createButton({ action: { type: 'message', label: '探監', text: `探監 @${name}` }, style: 'link', height: 'sm', color: '#9E9E9E' })
                ], { flex: 1, spacing: 'sm' })
            ], { margin: 'md', spacing: 'sm' });

            currentBubbleContents.push(row);
            currentBubbleContents.push(flexUtils.createSeparator('sm'));

            if (currentBubbleContents.length >= 10) { // 5 items (row+sep)
                bubbles.push(flexUtils.createBubble({
                    size: 'mega',
                    header: flexUtils.createHeader('🚔 皇家監獄名單', '', '#FFFFFF', '#607D8B'),
                    body: flexUtils.createBox('vertical', currentBubbleContents, { paddingAll: 'lg' })
                }));
                currentBubbleContents = [];
            }
        });

        if (currentBubbleContents.length > 0) {
            bubbles.push(flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('🚔 皇家監獄名單', '', '#FFFFFF', '#607D8B'),
                body: flexUtils.createBox('vertical', currentBubbleContents, { paddingAll: 'lg' })
            }));
        }

        const flexMsg = flexUtils.createFlexMessage('監獄名單', flexUtils.createCarousel(bubbles));
        await lineUtils.replyToLine(replyToken, [flexMsg]);
    } catch (e) {
        console.error('[Jail] handleJailList Error:', e);
        await lineUtils.replyText(replyToken, '❌ 查詢監獄名單發生錯誤，可能是資料庫索引尚未建立。');
    }
}

async function handleJailRank(replyToken) {
    try {
        const snapshot = await db.collection(COLLECTION_NAME)
            .where('crimeRecord', '>', 0)
            .orderBy('crimeRecord', 'desc')
            .limit(10)
            .get();

        if (snapshot.empty) {
            await lineUtils.replyText(replyToken, '🕊️ 目前群組內還沒有任何前科犯！大家都是乖寶寶！');
            return;
        }

        const contents = [];
        let rank = 1;
        snapshot.forEach(doc => {
            const data = doc.data();
            const name = data.displayName || data.name || '未知';
            const crimeRecord = data.crimeRecord || 0;
            
            let emoji = '🏅';
            let color = '#333333';
            if (rank === 1) { emoji = '🥇'; color = '#D4AF37'; }
            if (rank === 2) { emoji = '🥈'; color = '#C0C0C0'; }
            if (rank === 3) { emoji = '🥉'; color = '#CD7F32'; }
            
            const title = getCriminalTitle(crimeRecord);
            
            contents.push(
                flexUtils.createBox('horizontal', [
                    flexUtils.createText({ text: `${emoji} 第${rank}名`, size: 'sm', weight: 'bold', color: color, flex: 1 }),
                    flexUtils.createBox('vertical', [
                        flexUtils.createText({ text: `${title}${name}`, size: 'sm', weight: 'bold', color: '#333333', wrap: true }),
                        flexUtils.createText({ text: `入獄次數: ${crimeRecord} 次`, size: 'xs', color: '#666666' })
                    ], { flex: 2 })
                ], { margin: 'md', alignItems: 'center' })
            );
            contents.push(flexUtils.createSeparator('sm'));
            rank++;
        });

        const bubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader('🏆 前科排行榜', '監獄常客榜單', '#FFFFFF', '#424242'),
            body: flexUtils.createBox('vertical', contents, { paddingAll: 'lg', backgroundColor: '#FAFAFA' })
        });

        await lineUtils.replyFlex(replyToken, '前科排行榜', bubble);
    } catch (e) {
        console.error('[Jail] handleJailRank Error:', e);
        await lineUtils.replyText(replyToken, '❌ 查詢前科排行榜發生錯誤，可能是資料庫索引尚未建立。');
    }
}

module.exports = {
    getCriminalTitle,
    checkJailStatus,
    handleJailList,
    handleJailRank
};
