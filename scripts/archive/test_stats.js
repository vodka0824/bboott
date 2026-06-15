require('dotenv').config();
const { getFinalEquipStat } = require('./handlers/equipment');
const { getFinalPlayerStats } = require('./handlers/rpg');

console.log("=== Testing max Eva at +15 ===");
const mainEva = getFinalEquipStat('wings', 3, 15); // Wings variant 3 is '致命之羽' (sub: crit), variant 1 is Atk. Let's say we just want the Eva stat of Wings. Wings statKey is Eva.
console.log(`Wings at +15 (Main Eva):`, mainEva);

const subEva = getFinalEquipStat('shield', 3, 15); // Shield variant 3 sub is Eva.
console.log(`Shield at +15 (Sub Eva):`, subEva);

let maxEva = mainEva.main.value + (subEva.sub.value * 5); // 1 main + 5 subs
console.log(`Max achievable Eva at +15: ${maxEva}%`);

let cpEva = Math.pow(maxEva, 2) * 0.8;
console.log(`CP contribution of ${maxEva}% Eva: ${cpEva}`);
