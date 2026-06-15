require('dotenv').config();
const { handleCommonCommands } = require('./index');
const lineUtils = require('./utils/line');
const { db } = require('./utils/db');
const authUtils = require('./utils/auth');

// Mock lineUtils.replyText 以便觀察輸出
lineUtils.replyText = async (replyToken, text) => {
    console.log(`========================================`);
    console.log(`[MOCK REPLY - ${replyToken}]`);
    console.log(text);
    console.log(`========================================\n`);
    return true;
};

const TEST_USER = 'Utestjailcmduser999999999999999999';
const TEST_GROUP = 'Gtestjailcmdgroup999999999999999999';

async function setupJailUser() {
    console.log('正在初始化測試資料庫資料...');
    
    // 1. 註冊並激活群組
    await db.collection('groups').doc(TEST_GROUP).set({
        status: 'active',
        features: {
            bank: { enabled: true },
            casino: { enabled: true }
        }
    }, { merge: true });

    // 2. 初始化帳戶餘額與監獄刑期 (給 5,000,000 哭幣以供測試交保，並設定坐牢刑期)
    await db.collection('economy_users').doc(TEST_USER).set({
        kuCoin: 5000000,
        name: '測試坐牢勇者',
        jailedUntil: Date.now() + 60 * 60 * 1000 // 關一小時
    }, { merge: true });

    // 4. 手動刷新權限快取，確保群組被授權
    await authUtils.refreshGroupCache();
    console.log('測試資料庫初始化完成，群組已開通，玩家已被關入監獄。\n');
}

async function runTests() {
    await setupJailUser();

    console.log('--- 測試 1: 在監獄中，輸入非允許指令 "賭場" (預期被攔截並提示，此時提示詞不應有 ! ) ---');
    await handleCommonCommands('賭場', 'reply_token_1', 'group', TEST_USER, TEST_GROUP);

    console.log('--- 測試 2: 在監獄中，輸入帶有驚嘆號的允許指令 "!交保" (預期進入 jailRoutes 並成功交保) ---');
    await handleCommonCommands('!交保', 'reply_token_2', 'group', TEST_USER, TEST_GROUP);

    // 再次把使用者關進監獄以測試不帶驚嘆號的指令
    await db.collection('economy_users').doc(TEST_USER).set({
        jailedUntil: Date.now() + 60 * 60 * 1000
    }, { merge: true });

    console.log('--- 測試 3: 在監獄中，輸入不帶驚嘆號的允許指令 "交保" (預期同樣進入 jailRoutes 並交保成功) ---');
    await handleCommonCommands('交保', 'reply_token_3', 'group', TEST_USER, TEST_GROUP);

    // 再次關入監獄測試越獄
    await db.collection('economy_users').doc(TEST_USER).set({
        jailedUntil: Date.now() + 60 * 60 * 1000
    }, { merge: true });

    console.log('--- 測試 4: 在監獄中，輸入不帶驚嘆號的允許指令 "越獄" (預期進入 jailRoutes 並處理越獄) ---');
    await handleCommonCommands('越獄', 'reply_token_4', 'group', TEST_USER, TEST_GROUP);

    console.log('--- 測試 5: 在監獄中，輸入不帶驚嘆號的允許指令 "撿肥皂" (預期進入 jailRoutes 並處理撿肥皂) ---');
    await handleCommonCommands('撿肥皂', 'reply_token_5', 'group', TEST_USER, TEST_GROUP);

    // 清理
    console.log('正在清理測試資料...');
    await db.collection('players').doc(TEST_USER).delete();
    await db.collection('economy_users').doc(TEST_USER).delete();
    await db.collection('groups').doc(TEST_GROUP).delete();
    console.log('測試完成！');
    process.exit(0);
}

runTests().catch(err => {
    console.error('測試發生錯誤:', err);
    process.exit(1);
});
