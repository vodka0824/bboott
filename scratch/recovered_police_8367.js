const { db } = require('../utils/db');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const { getFinalPlayerStats } = require('./rpg');
const { getWantedList, clearWantedListCache, clearProfessionCache, applyWantedDecay } = require('./profession');
const COLLECTION_NAME = 'economy_users';

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
            if
            ];
            const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
            const pickedBribe = pick(bribeActs);

            const bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('💰 黑白掛勾', '暗中交易', '#FFFFFF', '#333333'),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `${result.policeName} 環顧四周，確認沒人注意後...`, size: 'sm', color: '#666666', wrap: true }),
                    flexUtils.createText({ text: pickedBribe, size: 'sm', weight: 'bold', color: '#FFD700', margin: 'md', wrap: true }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: `🔓 ${result.targetName} 被悄悄放走了，通緝值歸零！`, size: 'sm', color: '#333333', margin: 'md', wrap: true }),
                    flexUtils.createText({ text: `💰 收賄所得：${result.bribeAmount.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#4CAF50', margin: 'sm' }),
                    flexUtils.createText({ text: `🏦 結算總資產：${result.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#1976D2', margin: 'sm' }),
                    flexUtils.createText({ text: `⚠️ 小心廉政公署盯上你...`, size: 'xxs', color: '#FF9800', margin: 'md' })
                ], { paddingAll: 'xl', backgroundColor: '#FAFAFA' })
            });

            await lineUtils.replyFlex(replyToken, '黑白掛勾', bubble);
        }

    } catch (e) {
        console.error('[Police] handleOfferBribe Error:', e);
        aw