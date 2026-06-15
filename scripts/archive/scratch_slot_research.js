const fs = require('fs');

const PAYOUT_MULTIPLIER = {
    '7': 100, // Lucky 7
    '0': 15,  // BAR
    '3': 10,   // 西瓜
    '2': 5,   // 鈴鐺
    '4': 3,   // 櫻桃
    '1': 2    // 藍色果凍
};

let REEL1 = ['1','4','2','1','3','4','1','0','2','1','4','3','1','2','4','1','7','4','1','2'];
let REEL2 = ['1','2','4','1','3','2','1','4','0','1','2','4','1','3','2','1','7','4','1','2'];
let REEL3 = ['1','4','2','1','3','4','1','2','0','1','4','2','1','3','4','1','7','2','1','4'];

function countSyms(arr) {
    let counts = {};
    for(let s of arr) counts[s] = (counts[s]||0) + 1;
    return counts;
}

function calculateRTP(r1, r2, r3) {
    let c1 = countSyms(r1);
    let c2 = countSyms(r2);
    let c3 = countSyms(r3);
    
    let rtp = 0;
    for (const [sym, multi] of Object.entries(PAYOUT_MULTIPLIER)) {
        let n1 = c1[sym] || 0;
        let n2 = c2[sym] || 0;
        let n3 = c3[sym] || 0;
        let p = (n1 * n2 * n3 * 5 / 8000) * multi;
        rtp += p;
    }
    return rtp * 100;
}

// Find a replacement that reaches 90%
let symbols = Object.keys(PAYOUT_MULTIPLIER);
let best_diff = 1000;
let best_r1, best_r2, best_r3;

for (let i=0; i<10000; i++) {
    let nr1 = [...REEL1];
    let nr2 = [...REEL2];
    let nr3 = [...REEL3];
    
    // Mutate
    for(let j=0; j<3; j++) {
        let reel = [nr1, nr2, nr3][Math.floor(Math.random()*3)];
        reel[Math.floor(Math.random()*20)] = symbols[Math.floor(Math.random()*symbols.length)];
    }
    
    let rtp = calculateRTP(nr1, nr2, nr3);
    if (Math.abs(rtp - 90.0) < best_diff) {
        // Ensure minimum 1 of each symbol
        let c1=countSyms(nr1), c2=countSyms(nr2), c3=countSyms(nr3);
        let valid = true;
        for (let s of symbols) {
            if (!c1[s] || !c2[s] || !c3[s]) valid = false;
        }
        if (valid) {
            best_diff = Math.abs(rtp - 90.0);
            best_r1 = nr1;
            best_r2 = nr2;
            best_r3 = nr3;
        }
    }
}
console.log(`Best RTP: ${calculateRTP(best_r1, best_r2, best_r3)}%`);
console.log("R1:", JSON.stringify(best_r1).replace(/"/g, "'"));
console.log("R2:", JSON.stringify(best_r2).replace(/"/g, "'"));
console.log("R3:", JSON.stringify(best_r3).replace(/"/g, "'"));
