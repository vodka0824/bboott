const fs = require('fs');

function simulateOneWeek() {
    let kuCoin = 20000000; // 初始資金 2000萬
    let followers = 0;
    let karma = 0;
    let jailedUntil = 0;
    
    // Cooldown trackers (in minutes)
    let cds = {
        fortune: 0,
        chanting: 0,
        release: 0,
        begging: 0,
        preach: 0,
        ceremony: 0,
        sellNiche: 0,
        dualCultivation: 0
    };

    let stats = {
        karmaPaid: 0,
        karmaRemoved: 0,
        timesPunished: 0,
        totalEarned: 0,
        totalSpent: 0
    };

    const EFFICIENCY = 0.9; // 90% 效率

    function applyCd(skill, minutes) {
        cds[skill] = minutes / EFFICIENCY; // e.g. 15m CD at 90% efficiency takes 16.66m
    }

    function checkKarma(rank) {
        if (karma < 100) return false;
        const punishChance = rank === 3 ? 0.2 : 0.5;
        if (Math.random() > punishChance) return false;
        
        // Punished
        stats.timesPunished++;
        karma = 0;
        const roll = Math.random();
        if (roll < 0.33) {
            // Level drop, ignore
        } else if (roll < 0.66) {
            kuCoin = 0;
        } else {
            jailedUntil = 12 * 60; // 12 hours jail
        }
        return true;
    }

    function getRank(f) {
        if (f >= 100) return 3;
        if (f >= 50) return 2;
        if (f >= 10) return 1;
        return 0;
    }

    function changeMoney(amt) {
        kuCoin += amt;
        if (amt > 0) stats.totalEarned += amt;
        else stats.totalSpent += Math.abs(amt);
    }

    for (let t = 0; t < 7 * 24 * 60; t++) {
        // Decrease cooldowns and jail
        if (jailedUntil > 0) {
            jailedUntil--;
            continue; // Cannot act while in jail
        }

        for (let s in cds) {
            if (cds[s] > 0) cds[s]--;
        }

        // Auto Build Temple to manage Karma
        // Hardcore player tries to keep karma low, say below 50 if they have money
        if (karma >= 50 && kuCoin >= 2000000) {
            const maxAffordable = Math.floor(kuCoin / 2000000);
            const remove = Math.min(maxAffordable, karma);
            if (remove > 0) {
                const cost = remove * 2000000;
                kuCoin -= cost;
                karma -= remove;
                stats.karmaPaid += cost;
                stats.karmaRemoved += remove;
            }
        }

        const rank = getRank(followers);

        // 1. 算命 (15m)
        if (cds.fortune <= 0) {
            applyCd('fortune', 15);
            const roll = Math.random();
            let isPunished = checkKarma(rank);
            if (!isPunished) {
                if (roll < 0.20) { changeMoney(5000000); karma += 3; }
                else if (roll < 0.70) { changeMoney(500000); karma += 1; }
                else if (roll < 0.90) { changeMoney(-2000000); }
                else { changeMoney(-15000000); }
            }
        }

        // 2. 誦經 (30m)
        if (cds.chanting <= 0) {
            applyCd('chanting', 30);
            const roll = Math.random();
            let isPunished = checkKarma(rank);
            if (!isPunished) {
                if (roll < 0.15) { changeMoney(15000000); followers += 1; }
                else if (roll < 0.55) { changeMoney(2000000); karma += 2; }
                else if (roll < 0.85) { changeMoney(-1000000); karma += 5; }
                else { changeMoney(-8000000); karma -= 10; if (karma < 0) karma = 0; }
            }
        }

        // 3. 放生 (2h, 1M)
        if (cds.release <= 0 && kuCoin >= 1000000) {
            applyCd('release', 120);
            const roll = Math.random();
            let isPunished = checkKarma(rank);
            if (!isPunished) {
                changeMoney(-1000000); // Base cost
                if (roll < 0.60) { followers += 2; karma += 2; }
                else if (roll < 0.70) { followers += 5; karma += 10; }
                else { changeMoney(-2000000); karma += 5; }
            }
        }

        // 4. 化緣 (6h)
        if (cds.begging <= 0) {
            applyCd('begging', 360);
            const roll = Math.random();
            let isPunished = checkKarma(rank);
            if (!isPunished) {
                if (roll < 0.20) { changeMoney(15000000); followers += 1; karma += 5; }
                else if (roll < 0.70) { changeMoney(3000000); karma -= 2; if (karma < 0) karma = 0; }
                else { changeMoney(-2000000); }
            }
        }

        // 5. 弘法 (4h, 10M)
        if (cds.preach <= 0 && kuCoin >= 10000000) {
            applyCd('preach', 240);
            const roll = Math.random();
            let isPunished = checkKarma(rank);
            if (!isPunished) {
                changeMoney(-10000000); // Base cost
                if (roll < 0.20) { followers += 15; karma += 20; }
                else if (roll < 0.70) { followers += 3; karma += 5; }
                else { changeMoney(-30000000); followers = Math.max(0, followers - 5); }
            }
        }

        // 6. 辦法會 (12h, 10 followers)
        if (cds.ceremony <= 0 && followers >= 10) {
            applyCd('ceremony', 720);
            const roll = Math.random();
            let isPunished = checkKarma(rank);
            if (!isPunished) {
                if (roll < 0.25) { changeMoney(50000000); followers += 10; karma += 20; }
                else if (roll < 0.70) { changeMoney(15000000); followers += 3; karma += 5; }
                else if (roll < 0.90) { changeMoney(-30000000); }
                else { changeMoney(-20000000); followers = Math.max(0, followers - 5); }
            }
        }

        // 7. 賣塔位 (18h, 10 followers)
        // Assume target has 100,000,000
        if (cds.sellNiche <= 0 && followers >= 10) {
            applyCd('sellNiche', 1080);
            const roll = Math.random();
            let isPunished = checkKarma(rank);
            if (!isPunished) {
                if (roll < 0.40) { changeMoney(8000000); followers += 2; karma += 25; }
                else if (roll < 0.80) { changeMoney(-30000000); karma += 5; }
                else { jailedUntil = 4 * 60; karma += 40; }
            }
        }

        // 8. 雙修 (24h, 50 followers)
        // Assume target has 200,000,000
        if (cds.dualCultivation <= 0 && followers >= 50) {
            applyCd('dualCultivation', 1440);
            const roll = Math.random();
            let isPunished = checkKarma(rank);
            if (!isPunished) {
                if (roll < 0.30) { changeMoney(30000000); followers += 5; karma += 50; }
                else if (roll < 0.70) { changeMoney(-50000000); karma += 10; }
                else { changeMoney(-100000000); followers = Math.max(0, followers - 20); karma += 80; jailedUntil = 8 * 60; }
            }
        }
    }

    return { kuCoin, followers, karma, stats };
}

// Run 1000 simulations
let totalKuCoin = 0;
let totalFollowers = 0;
let totalKarma = 0;
let totalKarmaPaid = 0;
let totalKarmaRemoved = 0;
let totalTimesPunished = 0;
let totalEarned = 0;
let bankruptCount = 0;

const iterations = 1000;

for (let i = 0; i < iterations; i++) {
    const res = simulateOneWeek();
    totalKuCoin += res.kuCoin;
    totalFollowers += res.followers;
    totalKarma += res.karma;
    totalKarmaPaid += res.stats.karmaPaid;
    totalKarmaRemoved += res.stats.karmaRemoved;
    totalTimesPunished += res.stats.timesPunished;
    totalEarned += res.stats.totalEarned;
    if (res.kuCoin <= 0) bankruptCount++;
}

console.log(JSON.stringify({
    avgKuCoin: totalKuCoin / iterations,
    avgFollowers: totalFollowers / iterations,
    avgKarma: totalKarma / iterations,
    avgKarmaPaid: totalKarmaPaid / iterations,
    avgKarmaRemoved: totalKarmaRemoved / iterations,
    avgTimesPunished: totalTimesPunished / iterations,
    avgEarned: totalEarned / iterations,
    bankruptRate: bankruptCount / iterations
}, null, 2));
