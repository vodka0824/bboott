const fs = require('fs');

function simulateRobRatio(atk, def, crit, comboCount, iterations) {
    let totalRatio = 0;
    let minRatio = 1.0;
    let maxRatio = 0.0;
    
    let baseRobRatioMin = 0.1;
    let baseRobRatioMax = 0.3;
    
    if (comboCount === 2) {
        baseRobRatioMin = 0.3;
        baseRobRatioMax = 0.5;
    } else if (comboCount === 3) {
        baseRobRatioMin = 1.0;
        baseRobRatioMax = 1.0;
    }

    for (let i = 0; i < iterations; i++) {
        let isCrit = Math.random() * 100 < crit;
        let effectiveAtk = Math.max(1, atk);
        let effectiveDef = Math.max(0, def);
        
        let currentBaseMin = baseRobRatioMin;
        let currentBaseMax = baseRobRatioMax;
        
        if (isCrit) {
            currentBaseMax = Math.min(1.0, currentBaseMax * 1.5);
            currentBaseMin = Math.min(1.0, currentBaseMin * 1.5);
            effectiveDef = effectiveDef * 0.5;
        }
        
        let mitigation = effectiveAtk / (effectiveAtk + effectiveDef);
        if (mitigation < 0.01) mitigation = 0.01;
        
        let rawRatio = Math.random() * (currentBaseMax - currentBaseMin) + currentBaseMin;
        let robRatio = rawRatio * mitigation;
        
        if (robRatio < 0.01) robRatio = 0.01;
        if (robRatio > 1.0) robRatio = 1.0;
        
        totalRatio += robRatio;
        if (robRatio < minRatio) minRatio = robRatio;
        if (robRatio > maxRatio) maxRatio = robRatio;
    }
    
    return {
        avgRatio: (totalRatio / iterations) * 100,
        minRatio: minRatio * 100,
        maxRatio: maxRatio * 100
    };
}

const scenarios = [
    { name: '勢均力敵 (ATK 50, DEF 50, CRT 10%)', atk: 50, def: 50, crit: 10 },
    { name: '大欺小 (ATK 100, DEF 10, CRT 30%)', atk: 100, def: 10, crit: 30 },
    { name: '小蝦米對大鯨魚 (ATK 10, DEF 100, CRT 5%)', atk: 10, def: 100, crit: 5 },
    { name: '爆擊特化流 (ATK 50, DEF 100, CRT 80%)', atk: 50, def: 100, crit: 80 }
];

console.log('=== 搶劫比例模擬分析 (每組 100 萬次) ===\n');

scenarios.forEach(sc => {
    console.log(`[ 狀況: ${sc.name} ]`);
    [1, 2, 3].forEach(combo => {
        let res = simulateRobRatio(sc.atk, sc.def, sc.crit, combo, 1000000);
        console.log(`  - Combo ${combo}: 平均搶奪 ${res.avgRatio.toFixed(2)}% | 區間 [${res.minRatio.toFixed(2)}% ~ ${res.maxRatio.toFixed(2)}%]`);
    });
    console.log('');
});
