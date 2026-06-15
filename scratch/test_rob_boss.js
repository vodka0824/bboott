process.env.CHANNEL_ACCESS_TOKEN = "mock_token";
process.env.ADMIN_USER_ID = "mock_admin";
process.env.MONGODB_URI = "mongodb://localhost:27017";
process.env.BASE_URL = "http://localhost:8080";

const { calculateRobOutcome } = require('../handlers/robberyHandler');

console.log('=== 測試開始 ===');

const robberStats = { atk: 100, def: 50, eva: 10, crit: 10, luk: 10, pen: 5 };
const targetStats = { atk: 50, def: 100, eva: 5, crit: 5, luk: 5, pen: 0 };
const targetCoins = 10000000; // 1000 萬

console.log('--- 測試 1：一般市民與老大被捕率的比較 (方案 A) ---');
// 假設 wantedLevel = 1.0 (通緝值 100%)，crimeRecord = 10
// 市民：
// baseJailChance = 20
// wantedPenalty = 1.0 * 100 * 0.4 = 40
// crimePenalty = min(30, 10 * 1.5) = 15
// jailChance = 20 + 40 + 15 = 75%
//
// 老大：
// crimePenalty = 0 (免除前科被捕懲罰)
// wantedPenalty = 40 * 0.5 = 20 (通緝值懲罰減半)
// jailChance = 20 + 20 + 0 = 40%

let bossJailedCount = 0;
let bossEscapeCount = 0;
let bossSuccessCount = 0;
let bossCounterCount = 0;
let bossLukEscapeCount = 0;

const iterations = 100000;
for (let i = 0; i < iterations; i++) {
    const outcome = calculateRobOutcome(
        robberStats,
        targetStats,
        targetCoins,
        10, // crimeRecord
        1.0, // wantedLevel
        false, // isCouncilor
        false, // isSnitch
        'boss', // mafiaRank
        null // targetMafiaRank
    );
    
    if (outcome.outcome === 'jailed') {
        bossJailedCount++;
    } else if (outcome.outcome === 'mafiaBossEscape') {
        bossEscapeCount++;
    } else if (outcome.outcome === 'success') {
        bossSuccessCount++;
    } else if (outcome.outcome === 'counterAttack') {
        bossCounterCount++;
    } else if (outcome.outcome === 'lukEscape') {
        bossLukEscapeCount++;
    }
}

console.log(`總測試次數: ${iterations}`);
console.log(`被捕次數 (Jailed): ${bossJailedCount} (${((bossJailedCount/iterations)*100).toFixed(2)}%)`);
console.log(`小弟頂罪次數 (Escape): ${bossEscapeCount} (${((bossEscapeCount/iterations)*100).toFixed(2)}%)`);
console.log(`成功次數 (Success): ${bossSuccessCount} (${((bossSuccessCount/iterations)*100).toFixed(2)}%)`);
console.log(`幸運逃脫次數 (LukEscape): ${bossLukEscapeCount} (${((bossLukEscapeCount/iterations)*100).toFixed(2)}%)`);
console.log(`反殺次數 (Counter): ${bossCounterCount} (${((bossCounterCount/iterations)*100).toFixed(2)}%)`);

console.log('\n--- 測試 2：檢查頂罪事件回傳的值 ---');
const sampleOutcome = calculateRobOutcome(
    robberStats,
    targetStats,
    targetCoins,
    10,
    1.0,
    false,
    false,
    'boss',
    null
);
// 強制找一個頂罪結果來輸出看看
let foundEscape = null;
for (let i = 0; i < 1000; i++) {
    const res = calculateRobOutcome(robberStats, targetStats, targetCoins, 10, 1.0, false, false, 'boss', null);
    if (res.outcome === 'mafiaBossEscape') {
        foundEscape = res;
        break;
    }
}
console.log('頂罪結果範例:', foundEscape);

console.log('=== 測試結束 ===');
process.exit(0);
