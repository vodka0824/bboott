const { db } = require('../utils/db');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const memoryCache = require('../utils/memoryCache');
const { getWantedList, getProfessionTitle, getMafiaRank } = require('../handlers/profession');
const { getFinalPlayerStats } = require('../handlers/rpg');
const economyHandler = require('../handlers/economy');

const COLLECTION_NAME = 'economy_users';

async function handleJoinPolice(replyToken, context) {
    const { userId, groupId } = context;

    try {
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);

        const result = await db.runTransaction(async (t) => {
            const docRef = db.collection(COLLECTION_NAME).doc(userId);
            const doc = await t.get(docRef);

            if (!doc.exists) return { success: false, message: '找不到您的資料，請先簽到。' };

            const data = doc.data();
            const now = Date.now();

            if (data.isPolice) return { success: false, message: '你已經是警察了，別再考了！' };
            if (data.jailedUntil && now < data.jailedUntil) return { success: false, message: '你在坐牢，怎麼考警察？' };
            if (data.councilorUntil && now < data.councilorUntil) return { success: false, message: '議員不能兼任警察！你是要球員兼裁判嗎？' };
            if (data.militaryUntil && now < data.militaryUntil) return { success: false, message: '你目前正在服役，退伍後再來報考！' };
            if ((data.crimeRecord || 0) > 0) return { success: false, message: `你有 ${data.crimeRecord} 次前科紀錄，品行不良無法報考！(需前科 = 0)` };
            if ((data.wantedLevel || 0) > 0) return { success: false, message: '你身上還有通緝值，先洗清嫌疑再來！(需通緝值 = 0)' };

            const cost = 50000000; // 5千萬訓練費
            if ((data.kuCoin || 0) < cost) return { success: false, message: `報考警察需要 ${cost.toLocaleString()} 哭幣的訓練費用，你的餘額不足！` };

            t.update(docRef, {
                kuCoin: db.FieldValue.increment(-cost),
                isPolice: true
            });
            const newBalance = (data.kuCoin || 0) - cost;
            return { success: true, name: memberName || data.displayName || data.name, cost, newBalance };
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        clearProfessionCache(userId);

        const bubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader('👮 警察任命狀', '正義降臨', '#FFFFFF', '#1976D2'),
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: `恭喜 ${result.name} 通過了嚴格的警察特考！`, size: 'sm', color: '#666666', wrap: true }),
                flexUtils.createText({ text: `「我宣誓，我將忠於職守、維護正義、保護市民！」`, size: 'sm', weight: 'bold', color: '#1976D2', margin: 'md', wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `📋 警察守則：`, size: 'sm', weight: 'bold', color: '#333333', margin: 'md' }),
                flexUtils.createText({ text: `• 禁止賭博、禁止搶劫\n• 可使用「逮捕 @玩家」執法\n• 查看「通緝名單」可快速逮捕\n• 收賄可能被廉政公署查獲！`, size: 'xs', color: '#666666', margin: 'sm', wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `💰 訓練費用：-${result.cost.toLocaleString()} 哭幣`, size: 'xs', color: '#E91E63', margin: 'md' }),
                flexUtils.createText({ text: `🏦 結算總資產：${result.newBalance.toLocaleString()} 哭幣`, size: 'xs', color: '#1976D2', weight: 'bold', margin: 'sm' })
            ], { paddingAll: 'xl', backgroundColor: '#E3F2FD' })
        });

        await lineUtils.replyFlex(replyToken, '警察任命', bubble);

    } catch (e) {
        console.error('[Police] handleJoinPolice Error:', e);
        await lineUtils.replyText(replyToken, '❌ 報考過程發生錯誤。');
    }
}

async function handleResignPolice(replyToken, context) {
    const { userId, groupId } = context;

    try {
        const docRef = db.collection(COLLECTION_NAME).doc(userId);
        const doc = await docRef.get();

        if (!doc.exists || !doc.data().isPolice) {
            await lineUtils.replyText(replyToken, '❌ 你又不是警察，辭什麼職？');
            return;
        }

        await docRef.update({ isPolice: db.FieldValue.delete() });
        clearProfessionCache(userId);

        const bubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader('👮‍♂️ 繳回警徽', '辭去警職', '#37474F', '#ECEFF1'),
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: `你默默地將警徽與配槍放在局長的辦公桌上。`, size: 'sm', color: '#666666', wrap: true }),
                flexUtils.createText({ text: `「局長，這差事我不幹了。」`, size: 'sm', weight: 'bold', color: '#37474F', margin: 'md', wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `🔓 你已正式脫離警察編制，失去了逮捕犯人的執法權。`, size: 'sm', color: '#333333', margin: 'md', wrap: true }),
                flexUtils.createText({ text: `🕶️ 歡迎回到自由的黑暗世界！`, size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'sm', wrap: true })
            ], { paddingAll: 'xl', backgroundColor: '#FFFFFF' })
        });
        await lineUtils.replyFlex(replyToken, '警察辭職', bubble);

    } catch (e) {
        console.error('[Police] handleResignPolice Error:', e);
        await lineUtils.replyText(replyToken, '❌ 辭職過程發生錯誤。');
    }
}

module.exports = {
    handleJoinPolice,
    handleResignPolice
};
