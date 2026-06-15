const fs = require('fs');

// 模擬裝備等級對應的最終屬性 (參考 rpg.js)
function getFinalStats(grade, level) {
    // Weapon & Shield base: 1:10, 2:30, 3:70, 4:150, 5:400
    // formula: floor(base * 1.15^level)
    const baseAtkDef = { 1: 10, 2: 30, 3: 70, 4: 150, 5: 400 };
    
    // Wings & Gloves base: 1:1, 2:3, 3:5, 4:8, 5:12
    const basePerc = { 1: 1, 2: 3, 3: 5, 4: 8, 5: 12 };
    
    let bonusPerc = 0;
    for (let i = 1; i <= level; i++) {
        if (i <= 4) bonusPerc += 1;
        else if (i <= 9) bonusPerc += 2;
        else bonusPerc += 3;
    }
    
    const atk = Math.floor(baseAtkDef[grade] * Math.pow(1.15, level)) + level; // +level from levelBonus (assuming enchantCount = level * 100)
    const def = Math.floor(baseAtkDef[grade] * Math.pow(1.15, level)) + level;
    let eva = basePerc[grade] + bonusPerc + level;
    let crit = basePerc[grade] + bonusPerc + level;
    
    if (eva > 75) eva = 75;
    if (crit > 80) crit = 80;

    return { atk, def, eva, crit };
}

// 定義測試情境
const SCENARIOS = [
    {
        name: "新手互啄 (雙方無裝備)",
        attacker: { atk: 0, def: 0, eva: 0, crit: 0 },
        defender: { atk: 0, def: 0, eva: 0, crit: 0 }
    },
    {
        name: "小資族對決 (雙方全套 3階 +7)",
        attacker: getFinalStats(3, 7),
        defender: getFinalStats(3, 7)
    },
    {
        name: "頂裝刺客 vs 頂裝坦克 (雙方全套 5階 +15)",
        attacker: getFinalStats(5, 15),
        defender: getFinalStats(5, 15)
    },
    {
        name: "頂裝神仙 虐殺 新手",
        attacker: getFinalStats(5, 15),
        defender: { atk: 0, def: 0, eva: 0, crit: 0 }
    },
    {
        name: "新手 偷竊 頂裝神仙",
        attacker: { atk: 0, def: 0, eva: 0, crit: 0 },
        defender: getFinalStats(5, 15)
    }
];

function simulate(attacker, defender, robCount, crimeRecord, iterations = 100000) {
    let results = {
        dodged: 0,
        counterAttack: 0,
        jailed: 0,
        success: 0,
        totalRobRatio: 0,
        critCount: 0
    };

    let baseJailChance = 25;
    let baseCounterChance = 5;
    let minJailChance = 5;
    let minCounterChance = 1;
    let robRatioMin = 0.1;
    let robRatioMax = 0.3;

    if (robCount === 2) {
        baseJailChance = 35;
        baseCounterChance = 5;
        robRatioMin = 0.3;
        robRatioMax = 0.5;
    } else if (robCount === 3) {
        baseJailChance = 55;
        baseCounterChance = 10;
        robRatioMin = 1.0;
        robRatioMax = 1.0;
    }

    for (let i = 0; i < iterations; i++) {
        const isCrit = (Math.random() * 100) < attacker.crit;
        let isDodge = false;
        
        if (!isCrit) {
            if ((Math.random() * 100) < defender.eva) {
                isDodge = true;
            }
        }
        
        if (isDodge) {
            results.dodged++;
            continue;
        }

        let counterChance = Math.max(minCounterChance, baseCounterChance - crimeRecord * 0.1);
        let jailChance = Math.max(minJailChance, baseJailChance - crimeRecord * 0.5);
        
        const evaReduction = 1 - Math.min(0.5, attacker.eva / 100);
        counterChance = counterChance * evaReduction;
        jailChance = jailChance * evaReduction;
        
        const rand = Math.random() * 100;

        if (rand < counterChance) {
            results.counterAttack++;
        } else if (rand < counterChance + jailChance) {
            results.jailed++;
        } else {
            results.success++;
            if (isCrit) results.critCount++;

            let currentBaseMax = robRatioMax;
            let currentBaseMin = robRatioMin;
            let atkDefDiff = 0;

            if (isCrit) {
                currentBaseMax = Math.min(1.0, currentBaseMax * 1.5);
                currentBaseMin = Math.min(1.0, currentBaseMin * 1.5);
                atkDefDiff = attacker.atk - (defender.def * 0.5);
            } else {
                atkDefDiff = attacker.atk - defender.def;
            }

            let robRatio = Math.random() * (currentBaseMax - currentBaseMin) + currentBaseMin; 
            
            if (atkDefDiff > 0) {
                robRatio += (atkDefDiff * 0.0001);
            } else if (atkDefDiff < 0) {
                robRatio += (atkDefDiff * 0.0001);
            }
            
            if (robRatio < 0.01) robRatio = 0.01;
            if (robRatio > 1.0) robRatio = 1.0;

            results.totalRobRatio += robRatio;
        }
    }

    return {
        dodgeRate: (results.dodged / iterations * 100).toFixed(2),
        counterRate: (results.counterAttack / iterations * 100).toFixed(2),
        jailRate: (results.jailed / iterations * 100).toFixed(2),
        successRate: (results.success / iterations * 100).toFixed(2),
        critRateInSuccess: results.success > 0 ? (results.critCount / results.success * 100).toFixed(2) : '0.00',
        avgRobRatio: results.success > 0 ? (results.totalRobRatio / results.success * 100).toFixed(2) : '0.00'
    };
}

let md = `# 搶劫系統數值模擬測試報告\n\n`;
md += `> 本測試針對「最新平衡修正版」的程式碼邏輯，模擬不同裝備階層下的搶劫表現。\n`;
md += `> 每個情境針對 第 1 搶、第 2 搶 (Combo)、第 3 搶 (終極一票) 各進行 100,000 次蒙地卡羅模擬。\n\n`;

SCENARIOS.forEach(scenario => {
    md += `## 情境：${scenario.name}\n`;
    md += `- **搶匪屬性 (ATK/DEF/EVA/CRIT)**: ${scenario.attacker.atk} / ${scenario.attacker.def} / ${scenario.attacker.eva}% / ${scenario.attacker.crit}%\n`;
    md += `- **目標屬性 (ATK/DEF/EVA/CRIT)**: ${scenario.defender.atk} / ${scenario.defender.def} / ${scenario.defender.eva}% / ${scenario.defender.crit}%\n\n`;
    
    md += `| 搶劫次數 (Combo) | 目標閃避率 | 被反殺率 | 坐牢率 | 搶劫成功率 | 成功中爆擊率 | 平均搶奪財產比例 |\n`;
    md += `|---|---|---|---|---|---|---|\n`;

    // 假設前科為 0
    const crimeRecord = 0;
    for (let robCount = 1; robCount <= 3; robCount++) {
        let title = robCount === 1 ? "第 1 搶" : robCount === 2 ? "第 2 搶 (乘勝追擊)" : "第 3 搶 (終極一票)";
        const res = simulate(scenario.attacker, scenario.defender, robCount, crimeRecord);
        md += `| **${title}** | ${res.dodgeRate}% | ${res.counterRate}% | ${res.jailRate}% | **${res.successRate}%** | ${res.critRateInSuccess}% | **${res.avgRobRatio}%** |\n`;
    }
    md += `\n---\n\n`;
});

fs.writeFileSync('robbery_simulation_results.md', md, 'utf8');
console.log('Simulation complete. Check robbery_simulation_results.md');
