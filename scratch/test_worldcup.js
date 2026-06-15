const { db, connectDB } = require('../utils/db');
const worldcupHandler = require('../handlers/worldcup');
const userState = require('../utils/userState');

async function runTest() {
    await connectDB();
    console.log('DB Connected');
    
    const adminId = 'U_admin_123';
    const userId = 'U_test_user_456';
    const groupId = 'G_test_group';

    // Mock replyToken
    const replyToken = 'test_reply_token';

    // 1. Open a match
    console.log('--- 測試: 手動開盤 ---');
    await worldcupHandler.openManualMatch(replyToken, adminId, ['test_match_1', '阿根廷', '法國', '2.5', '2.8', '3.1']);

    // 2. Show matches
    console.log('--- 測試: 顯示賽事 ---');
    await worldcupHandler.showMatches(replyToken);

    // 3. Postback for betting
    console.log('--- 測試: 點擊押注 (Postback) ---');
    await worldcupHandler.handleBetPostback(replyToken, userId, { matchId: 'test_match_1', pred: 'home' });

    // Verify user state
    const state = await userState.getUserState(userId);
    console.log('User State:', state);

    // 4. Process bet amount
    console.log('--- 測試: 處理押注金額 ---');
    // Give user some money first
    await db.collection('economy_users').doc(userId).set({ kuCoin: 50000 });
    await worldcupHandler.processBetAmount(replyToken, groupId, userId, '1000', state);

    // Verify DB
    const bets = await db.collection('worldcup_bets').get();
    console.log('Bets in DB:', bets.docs.map(d => d.data()));

    // 5. Check My Bets
    console.log('--- 測試: 我的世足 ---');
    await worldcupHandler.myBets(replyToken, userId);

    // 6. Settle match
    console.log('--- 測試: 手動結算 ---');
    await worldcupHandler.settleMatch(replyToken, adminId, ['test_match_1', 'home']);

    // Verify user money
    const userDoc = await db.collection('economy_users').doc(userId).get();
    console.log('User Money after win:', userDoc.data());

    console.log('Done');
    process.exit(0);
}

runTest();
