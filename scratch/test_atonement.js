require('dotenv').config();
const { db, connectDB } = require('../utils/db');
const atonementHandler = require('../handlers/atonement');
const lineUtils = require('../utils/line');
const COLLECTION_NAME = 'economy_users';

let replyMessages = [];
lineUtils.replyText = async (token, msg) => {
    replyMessages.push(msg);
};

async function setupTest() {
    await connectDB();
    const batch = db.batch();
    
    // 初始化負債玩家
    batch.set(db.collection(COLLECTION_NAME).doc('U_ATONEMENT_TEST'), {
        kuCoin: -500000,
        displayName: '測試負債仔'
    });

    await batch.commit();
}

async function runTest() {
    await setupTest();
    console.log('--- 懺悔測試開始 ---');

    for (let i = 1; i <= 3; i++) {
        console.log(`\n▶️ 第 ${i} 次懺悔...`);
        replyMessages = [];
        
        // 第一次強制神蹟
        if (i === 1) Math.random = () => 0.01;
        // 第二次先設定負債並讓他觸發冷卻中
        else Math.random = () => 0.1;
        
        if (i === 2) {
             const batch = db.batch();
             batch.update(db.collection(COLLECTION_NAME).doc('U_ATONEMENT_TEST'), {
                 kuCoin: -100000,
                 confessionCooldownUntil: Date.now() + 60000
             });
             await batch.commit();
        }
        
        if (i === 3) {
             const batch = db.batch();
             batch.update(db.collection(COLLECTION_NAME).doc('U_ATONEMENT_TEST'), {
                 kuCoin: -100000,
                 confessionCooldownUntil: Date.now() - 10000 // 過期
             });
             await batch.commit();
             Math.random = () => 0.99; // 神罰
        }

        const ctx = { userId: 'U_ATONEMENT_TEST' };
        await atonementHandler.handleConfession('mock_token', ctx);
        
        console.log('🤖 Bot 回覆:\n' + replyMessages.join('\n'));
    }

    console.log('\n--- 測試結束 ---');
    process.exit(0);
}

runTest();
