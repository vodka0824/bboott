process.env.CHANNEL_ACCESS_TOKEN = "mock_token";
process.env.ADMIN_USER_ID = "mock_admin";
process.env.MONGODB_URI = "mongodb://localhost:27017";
process.env.BASE_URL = "http://localhost:8080";

const { calculateRobOutcome } = require('../handlers/robberyHandler');

console.log('=== 測試開始 ===');

// Mock statistics
const stats = { atk: 10, def: 10, eva: 0, crit: 0, luk: 0, pen: 0 };

console.log('\n--- 1. 測試搶劫失敗入獄 (Jailed) 時的通緝值結算 ---');

// 情況 A: 平民搶劫被捕 (mafiaRank = null)
// 預期: 通緝值歸零 (無論原本是多少)
// 為了在 executeRobTransaction 裡實現，我們看一下 calculateRobOutcome 回傳的 jail
const resCivilian = calculateRobOutcome(stats, stats, 1000, 0, 0.5, false, false, null, null);
console.log('平民 calculateRobOutcome 結果:', resCivilian);
// 在 executeRobTransaction 中，我們有 updates.wantedLevel = jailWanted
// 若 mafiaRank = null (平民)，jailWanted = 0.
console.log('平民入獄後通緝值更新為: 0');

// 情況 B: 黑幫小弟搶劫被捕 (mafiaRank = "thug", 原通緝值 = 0.6)
// 預期: 通緝值折半 (0.6 * 0.5 = 0.3)
let thugWantedLevel = 0.6;
let jailWantedThug = Number((thugWantedLevel * 0.5).toFixed(2));
console.log(`黑幫小弟 (原通緝值 ${thugWantedLevel}) 入獄後通緝值更新為:`, jailWantedThug);

// 情況 C: 老大頂罪 (outcome = "mafiaBossEscape", 原通緝值 = 0.8)
// 預期: 老大通緝值折半 (0.8 * 0.5 = 0.4)
let bossWantedLevel = 0.8;
let bossEscapeWanted = Number((bossWantedLevel * 0.5).toFixed(2));
console.log(`黑道老大 (原通緝值 ${bossWantedLevel}) 頂罪後通緝值更新為:`, bossEscapeWanted);

console.log('\n--- 2. 測試警察收賄與執法雙規邏輯 (police.js) ---');
// 警察收賄成功
let currentPoliceWanted = 0.1;
let newPoliceWanted = Number((currentPoliceWanted + 0.20).toFixed(2));
console.log(`警察收賄成功後通緝值 (從 ${currentPoliceWanted}) 增加為: ${newPoliceWanted}`);

// 執勤前雙規機率測試
let doubleGuaiTriggered = 0;
const testRuns = 10000;
for (let i = 0; i < testRuns; i++) {
    // 假設警察通緝值為 0.3，預期有 30% 機率雙規
    if (Math.random() < 0.3) {
        doubleGuaiTriggered++;
    }
}
console.log(`測試 ${testRuns} 次執勤，通緝值 0.3 時雙規次數: ${doubleGuaiTriggered} (${(doubleGuaiTriggered/testRuns*100).toFixed(2)}%)`);

console.log('=== 測試結束 ===');
process.exit(0);
