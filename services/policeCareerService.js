const { Firestore } = require('@google-cloud/firestore');
const { db } = require('../utils/db');
const COLLECTION_NAME = 'economy_users';
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const authUtils = require('../utils/auth');
const economyHandler = require('../handlers/economy');
const professionHandler = require('../handlers/profession');
const rpgHandler = require('../handlers/rpg');
const { createInternalAffairsBubble } = require('./policeActionService');

/**
 * 報考警察
 */
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
            if (data.isMafia) return { success: false, message: '黑道份子還想考警察？門都沒有！先去斷手指退出黑道再說！' };
            if (data.profession === 'monk') return { success: false, message: '出家人不能報考警察，請先還俗！' };
            if ((data.crimeRecord || 0) > 0) return { success: false, message: `你有 ${data.crimeRecord} 次前科紀錄，品行不良無法報考！(需前科 = 0)` };
            if ((data.wantedLevel || 0) > 0) return { success: false, message: '你身上還有通緝值，先洗清嫌疑再來！(需通緝值 = 0)' };

            const cost = 50000000; // 5千萬訓練費
            if ((data.kuCoin || 0) < cost) return { success: false, message: `報考警察需要 ${cost.toLocaleString()} 哭幣的訓練費用，你的餘額不足！` };

            t.update(docRef, {
                kuCoin: db.FieldValue.increment(-cost),
                isPolice: true,
                policeMerit: 0,
                policeCorruption: 0
            });
            const newBalance = (data.kuCoin || 0) - cost;
            return { success: true, name: memberName || data.displayName || data.name, cost, newBalance };
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        professionHandler.clearProfessionCache(userId);

        const bubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader('👮 警察任命狀', '正義降臨', flexUtils.COLORS.BG_MAIN, '#1976D2'),
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: `恭喜 ${result.name} 通過了嚴格的警察特考！`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, wrap: true }),
                flexUtils.createText({ text: `「我宣誓，我將忠於職守、維護正義、保護市民！」`, size: 'sm', weight: 'bold', color: '#1976D2', margin: 'md', wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `📋 警察守則：`, size: 'sm', weight: 'bold', color: '#333333', margin: 'md' }),
                flexUtils.createText({ text: `• 禁止搶劫平民\n• 可使用「逮捕」抓黑道、「貪污起訴」抓議員\n• 可使用「臨檢」向平民抽油水\n• 貪污、收賄隨時可能被政風室查獲抄家！`, size: 'xs', color: flexUtils.COLORS.TEXT_MUTED, margin: 'sm', wrap: true }),
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

/**
 * 辭職警察
 */

/**
 * 辭職警察
 */
async function handleResignPolice(replyToken, context) {
    const { userId, groupId } = context;

    try {
        const policeName = await lineUtils.getGroupMemberName(groupId, userId);
        const result = await db.runTransaction(async (t) => {
            const docRef = db.collection(COLLECTION_NAME).doc(userId);
            const doc = await t.get(docRef);

            if (!doc.exists || !doc.data().isPolice) {
                return { success: false, message: '你又不是警察，辭什麼職？' };
            }

            const data = doc.data();
            const corruption = data.policeCorruption || 0;
            const now = Date.now();

            if (corruption > 0) {
                const auditChance = corruption * 0.01; // 辭職時 1% * 貪污值 的最後審計
                if (Math.random() < auditChance) {
                    const confiscated = data.kuCoin || 0;
                    t.update(docRef, {
                        isPolice: db.FieldValue.delete(),
                        kuCoin: 0,
                        policeMerit: db.FieldValue.delete(),
                        policeCorruption: db.FieldValue.delete(),
                        jailedUntil: now + 24 * 60 * 60 * 1000,
                        jailbreakCooldownUntil: db.FieldValue.delete(),
                        crimeRecord: db.FieldValue.increment(1)
                    });
                    return { success: true, caught: true, confiscated, policeName };
                }
            }

            t.update(docRef, {
                isPolice: db.FieldValue.delete(),
                policeMerit: db.FieldValue.delete(),
                policeCorruption: db.FieldValue.delete()
            });
            return { success: true, caught: false, policeName };
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        professionHandler.clearProfessionCache(userId);

        if (result.caught) {
            const bubble = createInternalAffairsBubble(result.policeName, result.confiscated);
            
        await lineUtils.replyFlex(replyToken, '離職審計失敗', bubble);
        } else {
            const bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('👮‍♂️ 繳回警徽', '辭去警職', '#37474F', '#ECEFF1'),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `你默默地將警徽與配槍放在辦公桌上。`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, wrap: true }),
                    flexUtils.createText({ text: `「局長，這差事我不幹了。」`, size: 'sm', weight: 'bold', color: '#37474F', margin: 'md', wrap: true }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: `🔓 你已正式脫離警察編制，安全下莊。`, size: 'sm', color: '#333333', margin: 'md', wrap: true }),
                    flexUtils.createText({ text: `🕶️ 歡迎回到自由的黑暗世界！`, size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'sm', wrap: true })
                ], { paddingAll: 'xl', backgroundColor: flexUtils.COLORS.BG_MAIN })
            });
            
        await lineUtils.replyFlex(replyToken, '警察辭職', bubble);
        }
    } catch (e) {
        console.error('[Police] handleResignPolice Error:', e);
        await lineUtils.replyText(replyToken, '❌ 辭職過程發生錯誤。');
    }
}

/**
 * 合法逮捕 (限黑道)
 */


module.exports = {
    handleJoinPolice,
    handleResignPolice
};
