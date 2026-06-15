require('dotenv').config();
const { db } = require('./utils/db');
const economyHandler = require('./handlers/economy');
const lineUtils = require('./utils/line');

// Mock lineUtils
lineUtils.replyText = async (replyToken, text) => {
    console.log(`========================================`);
    console.log(`[MOCK LINE REPLY - ${replyToken}]`);
    console.log(text);
    console.log(`========================================\n`);
    return true;
};

lineUtils.getGroupMemberName = async (groupId, userId) => {
    return `User_${userId.substring(0, 6)}`;
};

const TEST_GROUP = 'Gtestgroup00000000000000000000001';
const ROBBER_ID = 'Utestrobber000000000000000000001';
const VICTIM_ID = 'Utestvictim000000000000000000002';

async function setupTestUsers() {
    console.log('正在重置測試用戶的哭幣與搶劫紀錄...');
    
    // 重置搶匪：給予 100,000 哭幣，清空搶劫次數與 jailedUntil
    await db.collection('economy_users').doc(ROBBER_ID).set({
        kuCoin: 100000,
        name: '測試搶匪',
        lastRobDate: '',
        robCount: 0,
        jailedUntil: 0
    }, { merge: true });

    // 重置受害者：給予 500,000 哭幣
    await db.collection('economy_users').doc(VICTIM_ID).set({
        kuCoin: 500000,
        name: '測試肥羊',
        lastRobDate: '',
        robCount: 0,
        jailedUntil: 0
    }, { merge: true });

    console.log('測試用戶重置完成。\n');
}

async function runTests() {
    await setupTestUsers();

    const mockMessageObject = {
        mention: {
            mentionees: [
                { userId: VICTIM_ID }
            ]
        }
    };

    console.log('--- 測試第 1 次搶劫 ---');
    await economyHandler.robCoin('mock_reply_1', TEST_GROUP, ROBBER_ID, mockMessageObject);

    // 檢查資料庫狀態
    let robberDoc = await db.collection('economy_users').doc(ROBBER_ID).get();
    console.log(`[第 1 次後] 搶匪餘額: ${robberDoc.data().kuCoin}, 搶劫次數: ${robberDoc.data().robCount}, 坐牢期限: ${robberDoc.data().jailedUntil || '無'}`);

    console.log('\n--- 測試第 2 次搶劫 ---');
    await economyHandler.robCoin('mock_reply_2', TEST_GROUP, ROBBER_ID, mockMessageObject);

    robberDoc = await db.collection('economy_users').doc(ROBBER_ID).get();
    console.log(`[第 2 次後] 搶匪餘額: ${robberDoc.data().kuCoin}, 搶劫次數: ${robberDoc.data().robCount}, 坐牢期限: ${robberDoc.data().jailedUntil || '無'}`);

    console.log('\n--- 測試第 3 次搶劫 (應直接進監獄) ---');
    await economyHandler.robCoin('mock_reply_3', TEST_GROUP, ROBBER_ID, mockMessageObject);

    robberDoc = await db.collection('economy_users').doc(ROBBER_ID).get();
    const jailedUntil = robberDoc.data().jailedUntil;
    const isJailed = jailedUntil && jailedUntil > Date.now();
    console.log(`[第 3 次後] 搶匪餘額: ${robberDoc.data().kuCoin}, 搶劫次數: ${robberDoc.data().robCount}, 坐牢期限: ${jailedUntil} (是否坐牢中: ${isJailed})`);

    // 清理測試用戶
    console.log('\n正在清理測試帳號資料...');
    await db.collection('economy_users').doc(ROBBER_ID).delete();
    await db.collection('economy_users').doc(VICTIM_ID).delete();
    console.log('測試完成！');
    process.exit(0);
}

runTests().catch(err => {
    console.error('測試過程中發生錯誤：', err);
    process.exit(1);
});
