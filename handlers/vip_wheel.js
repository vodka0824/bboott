const { db } = require('../utils/db');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const atonementHandler = require('./atonement');

const COLLECTION_VIP = 'economy_vip_wheel';
const DOC_VIP = 'current';
const ENTRY_FEE = 1000000;
const POOL_CONTRIBUTION = 200000;
const INITIAL_POOL = 50000000;

// Probabilities array for the wheel
const REWARDS = [
    { name: '銘謝惠顧', value: 0, weight: 500 },
    { name: '50 萬', value: 500000, weight: 250 },
    { name: '100 萬 (保本)', value: 1000000, weight: 150 },
    { name: '300 萬', value: 3000000, weight: 80 },
    { name: '1000 萬', value: 10000000, weight: 19 },
    { name: 'JACKPOT', value: -1, weight: 1 }
];

async function playVIPWheel(replyToken, groupId, userId) {
    try {
        const memberName = await lineUtils.getGroupMemberName(groupId, userId) || '土豪';

        let isJackpot = false;
        let wonAmount = 0;
        let finalPool = 0;

        const result = await db.runTransaction(async (t) => {
            // 1. Check user balance
            const userRef = db.collection('economy_users').doc(userId);
            const userDoc = await t.get(userRef);
            let userData = { kuCoin: 0, name: memberName };
            if (userDoc.exists) {
                userData = userDoc.data();
            } else {
                t.set(userRef, userData);
            }

            if ((userData.kuCoin || 0) < ENTRY_FEE) {
                return { success: false, message: `貧窮限制了你的想像！\n你的餘額只有 ${(userData.kuCoin || 0).toLocaleString()} 哭幣，連踏進尊爵輪盤的資格都沒有！` };
            }

            // 2. Get/Init VIP Pool
            const poolRef = db.collection(COLLECTION_VIP).doc(DOC_VIP);
            const poolDoc = await t.get(poolRef);
            let poolData = { prizePool: INITIAL_POOL };
            if (poolDoc.exists) {
                poolData = poolDoc.data();
            } else {
                t.set(poolRef, poolData);
            }

            // 3. Roll Wheel
            const roll = Math.floor(Math.random() * 1000);
            let cumulative = 0;
            let selectedReward = REWARDS[0];
            for (const reward of REWARDS) {
                cumulative += reward.weight;
                if (roll < cumulative) {
                    selectedReward = reward;
                    break;
                }
            }

            // 4. Calculate Economics
            const currentPool = poolData.prizePool || INITIAL_POOL;
            const newPool = currentPool + POOL_CONTRIBUTION;
            
            if (selectedReward.value === -1) {
                // JACKPOT
                wonAmount = newPool;
                finalPool = INITIAL_POOL;
                isJackpot = true;
            } else {
                wonAmount = selectedReward.value;
                finalPool = newPool;
            }

            // 5. Apply Updates
            t.update(userRef, {
                kuCoin: db.FieldValue.increment(-ENTRY_FEE + wonAmount),
                totalBetAmount: db.FieldValue.increment(ENTRY_FEE),
                gambleCount: db.FieldValue.increment(1)
            });

            t.update(poolRef, { prizePool: finalPool });

            return { success: true, rewardName: selectedReward.name, wonAmount, finalPool, newBalance: (userData.kuCoin || 0) - ENTRY_FEE + wonAmount };
        });

        if (!result.success) {
            return lineUtils.replyText(replyToken, `❌ ${result.message}`);
        }

        // Build Flex Message
        const color = isJackpot ? flexUtils.COLORS.PRIMARY : (result.wonAmount >= ENTRY_FEE ? '#4CAF50' : '#D32F2F');
        
        let title = 'VIP 尊爵輪盤';
        if (isJackpot) title = '👑 JACKPOT 👑';
        else if (result.wonAmount === 0) title = '💥 慘遭收割';
        
        const contents = [
            flexUtils.createText({ text: title, size: 'xl', weight: 'bold', color: color, align: 'center', margin: 'md' }),
            flexUtils.createSeparator('md'),
            flexUtils.createText({ text: `玩家: ${memberName}`, size: 'sm', color: flexUtils.COLORS.TEXT_MAIN, align: 'center', margin: 'md' }),
            flexUtils.createText({ text: `結果: ${result.rewardName}`, size: 'xxl', weight: 'bold', color: color, align: 'center', margin: 'md' })
        ];

        if (result.wonAmount > 0) {
            contents.push(flexUtils.createText({ text: `獲得: ${result.wonAmount.toLocaleString()} 哭幣`, size: 'md', color: flexUtils.COLORS.PRIMARY, align: 'center', margin: 'sm' }));
        }

        contents.push(
            flexUtils.createSeparator('md'),
            flexUtils.createText({ text: `目前餘額: ${result.newBalance.toLocaleString()}`, size: 'xs', color: flexUtils.COLORS.TEXT_SUB, align: 'center', margin: 'md' }),
            flexUtils.createText({ text: `💰 當前大獎池: ${result.finalPool.toLocaleString()}`, size: 'xs', color: flexUtils.COLORS.SECONDARY, weight: 'bold', align: 'center', margin: 'sm' })
        );

        // Add action button for retry
        contents.push(
            flexUtils.createBox('horizontal', [
                flexUtils.createButton({
                    label: '🔥 再轉一次',
                    style: 'primary',
                    color: '#D32F2F',
                    action: { type: 'message', label: '尊爵輪盤', text: '尊爵輪盤' }
                })
            ], { margin: 'xl' })
        );

        const bubble = flexUtils.createBubble({
            size: 'kilo',
            body: flexUtils.createBox('vertical', contents, { backgroundColor: flexUtils.COLORS.BG_CARD, paddingAll: 'xl' })
        });

        const messages = [];
        
        // 廣播 JACKPOT (改為只在當前群組顯示，不消耗推播額度)
        if (isJackpot) {
            const broadcastMsg = `👑👑👑 【神之恩典・公告】 👑👑👑\n\n狂賀！土豪玩家【${memberName}】在尊爵輪盤中觸發了 0.1% 的奇蹟，\n獨得大獎池：\n💎 ${result.wonAmount.toLocaleString()} 哭幣 💎！\n\n獎池已重新重置為 5,000 萬，歡迎各路乾爹繼續挑戰！`;
            messages.push({ type: 'text', text: broadcastMsg });
        }

        messages.push({ type: 'flex', altText: 'VIP 輪盤開獎', contents: bubble });
        await lineUtils.replyToLine(replyToken, messages);

    } catch (e) {
        console.error('[VIP Wheel] Error:', e);
        await lineUtils.replyText(replyToken, '❌ 輪盤發生異常，你的錢被神明沒收了。');
    }
}

async function showVIPPool(replyToken) {
    try {
        const poolRef = db.collection(COLLECTION_VIP).doc(DOC_VIP);
        const poolDoc = await poolRef.get();
        let pool = INITIAL_POOL;
        if (poolDoc.exists) {
            pool = poolDoc.data().prizePool || INITIAL_POOL;
        }

        await lineUtils.replyText(replyToken, `👑 【VIP 尊爵輪盤】 👑\n\n每次轉動花費：1,000,000 哭幣\n(含 20 萬注入獎池)\n\n💰 目前大獎池累積：\n${pool.toLocaleString()} 哭幣\n\n輸入「尊爵輪盤」立刻傾家蕩產！`);
    } catch (e) {
        console.error('[VIP Wheel] showVIPPool Error:', e);
        await lineUtils.replyText(replyToken, '❌ 查詢大獎池失敗');
    }
}

module.exports = { playVIPWheel, showVIPPool };
