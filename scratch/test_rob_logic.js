require('dotenv').config();
const { db, connectDB } = require('../utils/db');
const economyHandler = require('../handlers/economy');
const lineUtils = require('../utils/line');
const COLLECTION_NAME = process.env.COLLECTION_NAME || 'users';

// Mock lineUtils
let replyMessages = [];
lineUtils.replyText = async (token, msg) => {
    replyMessages.push(msg);
};
lineUtils.getGroupMemberName = async (groupId, userId) => {
    return userId === 'U_ROBBER' ? '搶匪哥' : '大肥羊';
};

async function setupTestData() {
    await connectDB();
    const batch = db.batch();
    
    // 初始化搶匪 (0錢, 0前科)
    batch.set(db.collection(COLLECTION_NAME).doc('U_ROBBER'), {
        kuCoin: 0,
        crimeRecord: 0,
        robCount: 0,
        displayName: '搶匪哥'
    });

    // 初始化肥羊 (100萬)
    batch.set(db.collection(COLLECTION_NAME).doc('U_VICTIM'), {
        kuCoin: 1000000,
        displayName: '大肥羊'
    });

    await batch.commit();
    
    // 強制用 handler 加錢確保更新
    await economyHandler.addCoinFast('U_VICTIM', 1000000, '大肥羊');
}

async function runSimulation() {
    await setupTestData();
    
    const messageObject = {
        mention: {
            mentionees: [{ userId: 'U_VICTIM' }]
        }
    };

    console.log('--- 模擬開始 ---');
    
    // 連續搶劫 4 次 (3次額度 + 1次爆額度)
    for (let i = 1; i <= 4; i++) {
        console.log(`\n▶️ 發起第 ${i} 次搶劫...`);
        replyMessages = [];
        
        // 替換 Math.random 以控制結果 (可選，這裡我們先看純機率自然發生，或者強制作弊)
        // 為了展示流程，我們讓隨機數固定
        if (i === 1) Math.random = () => 0.5; // 第一搶: 50% -> 成功 (因為 counter=5%, jail=25%, <30%才失敗)
        if (i === 2) Math.random = () => 0.5; // 第二搶: 50% -> 成功 (counter=5%, jail=35%, <40%才失敗)
        if (i === 3) Math.random = () => 0.2; // 第三搶: 20% -> 被捕 (counter=10%, jail=55%, <65%是失敗，其中 0-10 是反殺，10-65是坐牢)
        if (i === 4) Math.random = () => 0.5; // 第四搶: 預期會被防洗版機制擋下
        
        await economyHandler.robCoin('mock_token', 'G_TEST', 'U_ROBBER', messageObject);
        
        console.log('🤖 Bot 回覆:\n' + replyMessages.join('\n'));
        
        // 檢查資料庫狀態
        const robberDoc = await db.collection(COLLECTION_NAME).doc('U_ROBBER').get();
        const victimDoc = await db.collection(COLLECTION_NAME).doc('U_VICTIM').get();
        const rData = robberDoc.data();
        const vData = victimDoc.data();
        
        console.log('📊 搶匪狀態:');
        console.log(`  - 存款: ${rData.kuCoin || 0}`);
        console.log(`  - 搶劫計數 (robCount): ${rData.robCount || 0}`);
        console.log(`  - 防洗版計數 (robSpamCount): ${rData.robSpamCount || 0}`);
        console.log(`  - 前科 (crimeRecord): ${rData.crimeRecord || 0}`);
        if (rData.jailedUntil) {
            console.log(`  - 坐牢到: ${new Date(rData.jailedUntil).toLocaleString()}`);
        }
    }
    
    console.log('\n--- 模擬結束 ---');
    process.exit(0);
}

// 需要 export robCoin 給我們測試
runSimulation();
