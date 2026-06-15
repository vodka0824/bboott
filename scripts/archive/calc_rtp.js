function calcRTP(weights, multipliers) {
    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    let expectedMultiplierPerLine = 0;

    for (const [sym, w] of Object.entries(weights)) {
        const p = w / totalWeight;
        const p3 = Math.pow(p, 3);
        expectedMultiplierPerLine += p3 * multipliers[sym];
    }

    const rtp = 8 * expectedMultiplierPerLine;
    return { rtp: rtp * 100, expectedMultiplierPerLine, totalWeight };
}

const MULTIPLIERS = {
    '7': 100, // 7
    '0': 50,  // BAR
    '3': 15,  // 西瓜
    '2': 10,  // 鈴鐺
    '4': 5,   // 櫻桃
    '1': 2    // 藍色果凍
};

// Try to find a good weight distribution
const weights = {
    '7': 1,
    '0': 2,
    '3': 4,
    '2': 5,
    '4': 7,
    '1': 10
};

console.log('Test 1:', calcRTP(weights, MULTIPLIERS));

// Let's brute force some weights to get close to 95% RTP
let bestRTP = 1000;
let bestWeights = null;

for (let w7 = 1; w7 <= 3; w7++) {
for (let w0 = 2; w0 <= 6; w0++) {
for (let w3 = 5; w3 <= 15; w3++) {
for (let w2 = 10; w2 <= 25; w2++) {
for (let w4 = 15; w4 <= 35; w4++) {
for (let w1 = 30; w1 <= 60; w1++) {
    const w = { '7': w7, '0': w0, '3': w3, '2': w2, '4': w4, '1': w1 };
    const rtp = calcRTP(w, MULTIPLIERS).rtp;
    if (Math.abs(rtp - 95.0) < Math.abs(bestRTP - 95.0)) {
        bestRTP = rtp;
        bestWeights = w;
    }
}}}}}}

console.log('Best RTP:', bestRTP.toFixed(2) + '%');
console.log('Best Weights:', bestWeights);
console.log('Probabilities:');
const tw = Object.values(bestWeights).reduce((a, b) => a + b, 0);
for (const [sym, w] of Object.entries(bestWeights)) {
    console.log(`${sym}: ${(w/tw*100).toFixed(2)}%`);
}
