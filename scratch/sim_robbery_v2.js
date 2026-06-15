const fs = require('fs');

function getWeaponShieldStat(grade, level) {
    const bases = { 1: 10, 2: 30, 3: 70, 4: 150, 5: 400 };
    const base = bases[grade] || 0;
    return Math.floor(base * Math.pow(1.15, level));
}

function getGlovesStat(grade, level) {
    const bases = { 1: 1, 2: 3, 3: 6, 4: 10, 5: 15 };
    const base = bases[grade] || 0;
    
    let bonus = 0;
    for (let i = 1; i <= level; i++) {
        if (i <= 5) bonus += 1;
        else if (i <= 10) bonus += 2;
        else if (i <= 15) bonus += 3;
        else bonus += 4;
    }
    return base + bonus;
}

function calcStats(level, wGrade, wLevel, sGrade, sLevel, gGrade, gLevel) {
    let atk = level + (wGrade ? getWeaponShieldStat(wGrade, wLevel) : 0);
    let def = level + (sGrade ? getWeaponShieldStat(sGrade, sLevel) : 0);
    let crit = Math.floor(level * 0.25) + (gGrade ? getGlovesStat(gGrade, gLevel) : 0);
    if (crit > 80) crit = 80;
    return { atk, def, crit };
}

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

// 建立真實遊戲情境
const scenarios = [
    { 
        name: '👑 頂峰對決 (皆為 Lv.80，全頂裝階級5+15)', 
        attacker: calcStats(80, 5, 15, null, null, 5, 15),
        defender: calcStats(80, null, null, 5, 15, null, null)
    },
    { 
        name: '😈 虐殺新手 (打手: Lv.80 頂裝, 目標: Lv.1 裸裝)', 
        attacker: calcStats(80, 5, 15, null, null, 5, 15),
        defender: calcStats(1, null, null, null, null, null, null)
    },
    { 
        name: '🛡️ 銅牆鐵壁 (打手: Lv.1 裸裝, 目標: Lv.80 頂裝)', 
        attacker: calcStats(1, null, null, null, null, null, null),
        defender: calcStats(80, null, null, 5, 15, null, null)
    },
    { 
        name: '⚔️ 中期平民對決 (皆為 Lv.40，全裝備階級3+8)', 
        attacker: calcStats(40, 3, 8, null, null, 3, 8),
        defender: calcStats(40, null, null, 3, 8, null, null)
    },
    { 
        name: '🔥 玻璃大砲 vs 🪨 肉盾 (打手高攻爆 Lv.60，目標高防 Lv.60)', 
        attacker: calcStats(60, 4, 12, null, null, 4, 12),
        defender: calcStats(60, null, null, 4, 12, null, null)
    }
];

console.log('=== 真實數值搶劫比例模擬分析 (每組 100 萬次) ===\n');

scenarios.forEach(sc => {
    console.log(`[ 情境: ${sc.name} ]`);
    console.log(`  > 打手面板: ATK ${sc.attacker.atk} | CRT ${sc.attacker.crit}%`);
    console.log(`  > 目標面板: DEF ${sc.defender.def}`);
    [1, 2, 3].forEach(combo => {
        let res = simulateRobRatio(sc.attacker.atk, sc.defender.def, sc.attacker.crit, combo, 1000000);
        console.log(`  - Combo ${combo}: 平均搶走 ${res.avgRatio.toFixed(2)}% | 區間 [${res.minRatio.toFixed(2)}% ~ ${res.maxRatio.toFixed(2)}%]`);
    });
    console.log('');
});
