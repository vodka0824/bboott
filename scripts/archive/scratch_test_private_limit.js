require('dotenv').config();
const router = require('./utils/router');
const lineUtils = require('./utils/line');

// 用於記錄收到的 Mock LINE 回覆
const replies = [];

// Mock lineUtils.replyText
lineUtils.replyText = async (replyToken, text) => {
    console.log(`[MOCK LINE REPLY - ${replyToken}]`);
    console.log(text);
    replies.push({ replyToken, text });
    return true;
};

// 註冊一個假的只能私訊的指令
router.register('測試私訊', async (context) => {
    // 正常執行邏輯，如果是 DM 才會走到這裡
    await lineUtils.replyText(context.replyToken, '✅ 成功執行只能私訊功能！');
}, { isDMOnly: true });

const TEST_USER = 'Utestuser999999999999999999999';
const TEST_GROUP = 'Gtestgroup99999999999999999999';

async function runTests() {
    console.log('=== 開始測試私訊功能次數限制 ===\n');

    // 模擬在群組呼叫 isDMOnly 指令
    const context = {
        replyToken: 'token_1',
        userId: TEST_USER,
        groupId: TEST_GROUP,
        isGroup: true,
        isAuthorizedGroup: true,
        isSuper: false
    };

    console.log('--- 模擬第 1 次呼叫 ---');
    await router.execute('測試私訊', context);

    console.log('\n--- 模擬第 2 次呼叫 ---');
    context.replyToken = 'token_2';
    await router.execute('測試私訊', context);

    console.log('\n--- 模擬第 3 次呼叫 (應直接無視) ---');
    context.replyToken = 'token_3';
    const handled3 = await router.execute('測試私訊', context);
    console.log(`[第 3 次執行結果] router.execute 回傳: ${handled3} (預期應為 true，表示已匹配但被阻擋並無視)`);

    console.log('\n--- 模擬第 4 次呼叫 (應直接無視) ---');
    context.replyToken = 'token_4';
    const handled4 = await router.execute('測試私訊', context);
    console.log(`[第 4 次執行結果] router.execute 回傳: ${handled4} (預期應為 true)`);

    console.log('\n=== 測試結果摘要 ===');
    console.log(`收到回覆總數: ${replies.length} (預期應為 2)`);
    if (replies.length === 2) {
        console.log('✅ 測試成功：第 1 次顯示一般警告，第 2 次顯示隨機毒舌嘲諷，之後直接無視！');
    } else {
        console.log('❌ 測試失敗：回覆數量不符預期！');
    }
    process.exit(replies.length === 2 ? 0 : 1);
}

runTests().catch(err => {
    console.error('測試發生錯誤:', err);
    process.exit(1);
});
