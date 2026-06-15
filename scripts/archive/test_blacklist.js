require('dotenv').config();
const { isBlacklisted, blacklistUser, unblacklistUser, getBlacklist } = require('./utils/auth');

async function testBlacklist() {
    console.log("=== 測試小黑屋功能 ===");
    const testUserId = "U_test_user_999";
    
    // 1. 確認一開始不在黑名單
    const isBannedInit = await isBlacklisted(testUserId);
    console.log(`初始狀態 (應為 false): ${isBannedInit}`);
    
    // 2. 加入小黑屋
    await blacklistUser(testUserId, '惡意洗頻自動封鎖', 'system');
    console.log("已加入小黑屋...");
    
    // 3. 確認已在黑名單
    const isBannedNow = await isBlacklisted(testUserId);
    console.log(`封鎖後狀態 (應為 true): ${isBannedNow}`);
    
    // 4. 查看名單
    const list = await getBlacklist();
    const found = list.find(u => u.userId === testUserId);
    console.log(`名單中是否存在: ${!!found}, 原因: ${found ? found.reason : 'N/A'}`);
    
    // 5. 解除小黑屋
    await unblacklistUser(testUserId);
    console.log("已解除小黑屋...");
    
    // 6. 確認已不在黑名單
    const isBannedFinal = await isBlacklisted(testUserId);
    console.log(`解除後狀態 (應為 false): ${isBannedFinal}`);
}

// 需要在 DB 連線後執行
const { connectDB } = require('./utils/db');
connectDB().then(testBlacklist).then(() => process.exit(0)).catch(console.error);
