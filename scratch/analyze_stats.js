// 模擬裝備屬性計算，分析上限問題
function getFinalEquipStat(type, variant, level) {
    const EQUIP_TYPES = {
        weapon: { statKey: 'atk' },
        shield: { statKey: 'def' },
        wings: { statKey: 'eva' },
        gloves: { statKey: 'crit' },
        necklace: { statKey: 'luk' },
        ring: { statKey: 'pen' }
    };
    const EQUIP_VARIANTS = {
        weapon: { 1:{sub:'def'}, 2:{sub:'crit'}, 3:{sub:'eva'}, 4:{sub:'luk'}, 5:{sub:'pen'} },
        shield: { 1:{sub:'atk'}, 2:{sub:'crit'}, 3:{sub:'eva'}, 4:{sub:'luk'}, 5:{sub:'pen'} },
        wings:  { 1:{sub:'atk'}, 2:{sub:'def'},  3:{sub:'crit'}, 4:{sub:'luk'}, 5:{sub:'pen'} },
        gloves: { 1:{sub:'atk'}, 2:{sub:'def'},  3:{sub:'eva'}, 4:{sub:'luk'}, 5:{sub:'pen'} },
        necklace:{ 1:{sub:'atk'}, 2:{sub:'def'}, 3:{sub:'crit'}, 4:{sub:'eva'}, 5:{sub:'pen'} },
        ring:   { 1:{sub:'atk'}, 2:{sub:'def'},  3:{sub:'crit'}, 4:{sub:'eva'}, 5:{sub:'luk'} }
    };
    
    const config = EQUIP_TYPES[type];
    const varConfig = EQUIP_VARIANTS[type][variant] || EQUIP_VARIANTS[type][1];
    
    const isMainFlat = config.statKey === 'atk' || config.statKey === 'def';
    let mainValue = 0;
    if (isMainFlat) {
        mainValue = Math.floor(100 * Math.pow(1.2, level));
    } else {
        let bonus = 0;
        for (let i = 1; i <= level; i++) {
            if (i <= 5) bonus += 1;
            else if (i <= 10) bonus += 2;
            else if (i <= 15) bonus += 3;
            else bonus += 4;
        }
        mainValue = 5 + bonus;
    }
    
    const isSubFlat = varConfig.sub === 'atk' || varConfig.sub === 'def';
    let subValue = 0;
    if (isSubFlat) {
        subValue = Math.floor(50 * Math.pow(1.15, level));
    } else {
        subValue = 2 + Math.floor(level / 2);
    }
    
    return { main: { type: config.statKey, value: mainValue }, sub: { type: varConfig.sub, value: subValue } };
}

// 模擬一個最強的 +15 全套建置，每件裝備都刷副屬性到同一個值
const slots = ['weapon','shield','wings','gloves','necklace','ring'];

// 最差 (新買 +0 裝備)
console.log('\n=== +0 新裝備的屬性 ===');
for(const slot of slots){
    for(let v=1;v<=5;v++){
        const s = getFinalEquipStat(slot, v, 0);
        console.log(`${slot} 變體${v}: 主=${s.main.type}+${s.main.value}, 副=${s.sub.type}+${s.sub.value}`);
    }
}

// 最大 (全 +15 爆擊建置)
console.log('\n=== +15 最大化爆擊/迴避建置 ===');
let totalCrit = 0, totalEva = 0, totalPen = 0, totalLuk = 0;
// weapon+2 (爆擊副), gloves+0 (主爆擊), necklace+3 (爆擊副), ring+3 (爆擊副)
const testBuild = [
    {slot:'weapon',v:2}, {slot:'shield',v:2}, {slot:'wings',v:3},
    {slot:'gloves',v:2}, {slot:'necklace',v:3}, {slot:'ring',v:3}
];
for(const b of testBuild){
    const s = getFinalEquipStat(b.slot, b.v, 15);
    console.log(`${b.slot} v${b.v}: 主=${s.main.type}+${s.main.value}, 副=${s.sub.type}+${s.sub.value}`);
    if(s.main.type==='crit') totalCrit += s.main.value;
    if(s.sub.type==='crit') totalCrit += s.sub.value;
    if(s.main.type==='eva') totalEva += s.main.value;
    if(s.sub.type==='eva') totalEva += s.sub.value;
    if(s.main.type==='pen') totalPen += s.main.value;
    if(s.sub.type==='pen') totalPen += s.sub.value;
    if(s.main.type==='luk') totalLuk += s.main.value;
    if(s.sub.type==='luk') totalLuk += s.sub.value;
}
console.log(`\n極限爆擊建置: CRT=${totalCrit}%`);
console.log(`crit上限: 80%, eva上限: 75%, luk上限: 60%, pen上限: 30%`);

// 迴避極限
console.log('\n=== 迴避 +15 極限 ===');
let evaTotal = 0;
const evaBuild = [
    {slot:'weapon',v:3},{slot:'shield',v:3},{slot:'wings',v:0},{slot:'gloves',v:3},{slot:'necklace',v:4},{slot:'ring',v:4}
];
for(const b of evaBuild){
    if(b.v===0){
        const s = getFinalEquipStat('wings',1,15);
        console.log(`wings 主: eva+${s.main.value}`);
        evaTotal += s.main.value;
        continue;
    }
    const s = getFinalEquipStat(b.slot, b.v, 15);
    if(s.main.type==='eva') evaTotal += s.main.value;
    if(s.sub.type==='eva') evaTotal += s.sub.value;
    console.log(`${b.slot} v${b.v}: 主=${s.main.type}+${s.main.value}%, 副=${s.sub.type}+${s.sub.value}%`);
}
console.log(`極限迴避: EVA=${evaTotal}% -> 上限75%`);

// +0 主副屬性分析
console.log('\n=== +0 初始迴避爆擊穿透幸運的起始值 ===');
console.log('翅膀 (主迴避) +0:', getFinalEquipStat('wings',1,0).main);
console.log('手套 (主爆擊) +0:', getFinalEquipStat('gloves',1,0).main);
console.log('戒指 (主穿透) +0:', getFinalEquipStat('ring',1,0).main);
console.log('項鍊 (主幸運) +0:', getFinalEquipStat('necklace',1,0).main);
console.log('武器副迴避 +0:', getFinalEquipStat('weapon',3,0).sub);
console.log('武器副爆擊 +0:', getFinalEquipStat('weapon',2,0).sub);
console.log('武器副穿透 +0:', getFinalEquipStat('weapon',5,0).sub);
