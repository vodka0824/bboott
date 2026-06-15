function calcRTP(probs, multipliers) {
    let expectedMultiplierPerLine = 0;
    for (const sym of Object.keys(probs)) {
        const p = probs[sym];
        expectedMultiplierPerLine += Math.pow(p, 3) * multipliers[sym];
    }
    return 8 * expectedMultiplierPerLine * 100;
}

const multipliers = {
    '7': 100, // Lucky 7
    '0': 30,  // BAR
    '3': 15,  // 西瓜
    '2': 10,  // 鈴鐺
    '4': 5,   // 櫻桃
    '1': 2    // 果凍
};

// Start with some reasonable probabilities
// Sum must be 1.0
// 1 > 4 > 2 > 3 > 0 > 7
let probs = {
    '1': 0.35,
    '4': 0.30,
    '2': 0.20,
    '3': 0.10,
    '0': 0.04,
    '7': 0.01
};

// 0.35^3 * 2 * 8 = 0.686
// 0.30^3 * 5 * 8 = 1.08  -> already 176%!!

// The issue is multiplier 2 and 5 are too high for probabilities 0.35 and 0.30.
// If we lower probabilities:
probs = {
    '1': 0.28, // 0.28^3 * 2 * 8 = 0.35
    '4': 0.24, // 0.24^3 * 5 * 8 = 0.55 -> Total = 0.90
    '2': 0.20, // 0.20^3 * 10 * 8 = 0.64 -> Total = 1.54!
    '3': 0.15, // 0.15^3 * 15 * 8 = 0.40 -> Total = 1.94!
    '0': 0.10, // 0.10^3 * 30 * 8 = 0.24
    '7': 0.03  // 0.03^3 * 100 * 8 = 0.02
};

// To get 0.95 total, we need MUCH lower multipliers or flatter probabilities with more symbols.
// Let's change the payout formula in the game code!
// If payout is `betAmount * multiplier`, and you get multiple lines, it adds up.
// If we change it to: multiplier applies to the TOTAL bet, but we divide the multiplier array by 10.
// OR we just use integer multipliers but the code does:
// totalWinAmount = betAmount * totalMultiplier / 10
console.log('We should just lower the multipliers significantly, or change the game logic.');
