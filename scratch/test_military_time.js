// test_military_time.js
function runSimulation(action, runs) {
    let totalTimeChange = 0;
    let totalRewards = 0;
    let jackpotCount = 0;

    for (let i = 0; i < runs; i++) {
        const rand = Math.random();
        if (action === 'mow') { // 拔草
            if (rand < 0.15) {
                totalTimeChange -= 60;
                totalRewards += 100;
            } else if (rand < 0.75) {
                totalTimeChange -= 15;
                totalRewards += 100;
            } else {
                totalTimeChange += 60;
            }
        } else if (action === 'sweep') { // 掃地
            if (rand < 0.15) {
                totalRewards += 1000000;
                jackpotCount++;
            } else if (rand < 0.75) {
                totalTimeChange -= 5;
                totalRewards += 200;
            } else {
                totalTimeChange += 60;
                totalRewards -= 300;
            }
        } else if (action === 'errand') { // 出公差
            if (rand < 0.10) {
                totalTimeChange -= 60;
                totalRewards += 300;
            } else if (rand < 0.70) {
                totalTimeChange -= 15;
                totalRewards += 150;
            } else {
                totalTimeChange += 60;
                totalRewards -= 300;
            }
        }
    }
    return {
        avgTimeChange: totalTimeChange / runs,
        avgRewards: totalRewards / runs,
        jackpotRate: jackpotCount / runs
    };
}

const runs = 100000;
console.log('--- 單次操作期望值 (模擬 ' + runs + ' 次) ---');
console.log('🌱 拔草:', runSimulation('mow', runs));
console.log('🧹 掃地:', runSimulation('sweep', runs));
console.log('🏃‍♂️ 出公差:', runSimulation('errand', runs));

// 模擬連續做 10 次 (耗時 30 分鐘)
function simulateSequence(action, tries) {
    let increaseCount = 0;
    let decreaseCount = 0;
    
    for (let i = 0; i < runs; i++) {
        let sessionTimeChange = 0;
        for (let j = 0; j < tries; j++) {
            const rand = Math.random();
            if (action === 'mow') {
                if (rand < 0.15) sessionTimeChange -= 60;
                else if (rand < 0.75) sessionTimeChange -= 15;
                else sessionTimeChange += 60;
            } else if (action === 'sweep') {
                if (rand < 0.15) sessionTimeChange += 0;
                else if (rand < 0.75) sessionTimeChange -= 5;
                else sessionTimeChange += 60;
            } else if (action === 'errand') {
                if (rand < 0.10) sessionTimeChange -= 60;
                else if (rand < 0.70) sessionTimeChange -= 15;
                else sessionTimeChange += 60;
            }
        }
        // 注意：每次操作需等 3 分鐘，所以 tries 次經過了 tries * 3 分鐘的現實時間
        // 這裡單純看 "判決時間增減" 總和
        if (sessionTimeChange > 0) increaseCount++;
        else if (sessionTimeChange < 0) decreaseCount++;
    }
    
    return {
        probIncreaseTime: (increaseCount / runs * 100).toFixed(2) + '%',
        probDecreaseTime: (decreaseCount / runs * 100).toFixed(2) + '%'
    };
}

console.log('\n--- 連續玩 10 次 (花費現實 30 分鐘) 結果分佈 ---');
console.log('🌱 拔草:', simulateSequence('mow', 10));
console.log('🧹 掃地:', simulateSequence('sweep', 10));
console.log('🏃‍♂️ 出公差:', simulateSequence('errand', 10));
