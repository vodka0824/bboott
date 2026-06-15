// simulate_12h_professions.js
const RUNS = 100000;
const INITIAL_COINS = 10000000; // 1000萬
const TARGET_COINS = 10000000; // 1000萬

function simulateThug() {
    let totalCoins = 0;
    let totalJailed = 0;
    let totalLoss = 0;
    for (let i = 0; i < RUNS; i++) {
        let coins = INITIAL_COINS;
        let isJailed = false;
        // 12 hours / 1.8 hours = 6.66 -> assume 6 actions
        for (let j = 0; j < 6; j++) {
            if (isJailed) break;
            const rand = Math.random();
            if (rand < 0.15) {
                // counter
                totalLoss += coins;
                coins = 0; 
            } else if (rand < 0.35) {
                // jail
                if (Math.random() < 0.2) { /* escape */ }
                else {
                    const fine = coins * 0.1;
                    coins -= fine;
                    totalLoss += fine;
                    isJailed = true;
                }
            } else if (rand < 0.50) {
                // dodge
            } else {
                // success
                const robRatio = (Math.random() * (0.3 - 0.05) + 0.05) * 1.1 * 0.5; // mitigated
                const gain = Math.floor(TARGET_COINS * robRatio);
                coins += gain;
            }
        }
        totalCoins += (coins - INITIAL_COINS);
        if (isJailed) totalJailed++;
    }
    return { avgIncome: totalCoins / RUNS, jailRate: totalJailed / RUNS, avgLoss: totalLoss / RUNS };
}

function simulateBoss() {
    let totalCoins = 0;
    let totalJailed = 0;
    let totalLoss = 0;
    for (let i = 0; i < RUNS; i++) {
        let coins = INITIAL_COINS;
        let isJailed = false;
        // 12 hours / 1 hours = 12 actions
        for (let j = 0; j < 12; j++) {
            if (isJailed) break;
            
            // Betrayal 5%
            if (Math.random() < 0.05) {
                const fine = coins * 0.5;
                coins -= fine;
                totalLoss += fine;
                isJailed = true;
                break;
            }
            
            // counter = 0 for boss
            // jail = 20%
            const rand = Math.random();
            if (rand < 0.20) {
                if (Math.random() < 0.2) { /* escape */ }
                else if (Math.random() < 0.35) {
                    // escape via thug
                    const robRatio = 0.3 * 1.5;
                    const gain = Math.floor(TARGET_COINS * robRatio * 0.7);
                    coins += gain;
                } else {
                    const fine = coins * 0.1;
                    coins -= fine;
                    totalLoss += fine;
                    isJailed = true;
                }
            } else {
                // success (no dodge)
                const robRatio = 0.3 * 0.5; // baseMax * mitigated
                const gain = Math.floor(TARGET_COINS * robRatio);
                coins += gain;
            }
        }
        totalCoins += (coins - INITIAL_COINS);
        if (isJailed) totalJailed++;
    }
    return { avgIncome: totalCoins / RUNS, jailRate: totalJailed / RUNS, avgLoss: totalLoss / RUNS };
}

function simulateCouncilor() {
    let totalCoins = 0;
    let totalJailed = 0;
    let totalLoss = 0;
    for (let i = 0; i < RUNS; i++) {
        let coins = INITIAL_COINS;
        let isJailed = false;
        
        // Embezzle (2h CD) -> 6 actions
        let risk = 0;
        for (let j = 0; j < 6; j++) {
            if (isJailed) break;
            if (Math.random() < risk) {
                const fine = Math.min(coins, 50000000);
                coins -= fine;
                totalLoss += fine;
                if (Math.random() >= 0.25) { // umbrella
                    isJailed = true;
                }
            } else {
                const gain = Math.floor(Math.random() * 2000000) + 1000000;
                coins += gain;
                risk += 0.05;
            }
        }
        
        // Rig bid (12h CD) -> 1 action
        if (!isJailed) {
            const rand = Math.random();
            if (rand < 0.4) {
                const gain = Math.floor(Math.random() * 30000000) + 30000000;
                coins += gain;
            } else if (rand < 0.7) {
                const gain = Math.floor(Math.random() * 100000000) + 150000000;
                coins += gain;
            } else {
                const fine = Math.min(coins * 0.5, 100000000); // Wait, max(50%, 100M). Wait, Math.min(coins, Math.max(coins*0.5, 100M)) -> if coins is 10M, max is 100M, so we lose 10M.
                const actualFine = Math.min(coins, Math.max(coins * 0.5, 100000000));
                coins -= actualFine;
                totalLoss += actualFine;
                if (Math.random() >= 0.25) {
                    isJailed = true;
                }
            }
        }
        
        totalCoins += (coins - INITIAL_COINS);
        if (isJailed) totalJailed++;
    }
    return { avgIncome: totalCoins / RUNS, jailRate: totalJailed / RUNS, avgLoss: totalLoss / RUNS };
}

console.log('Thug:', simulateThug());
console.log('Boss:', simulateBoss());
console.log('Councilor:', simulateCouncilor());
