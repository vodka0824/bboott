const { db, connectDB } = require('./utils/db');

async function analyze() {
    await connectDB();
    console.log('--- 玩家經濟與犯罪數據 ---');
    const economySnapshot = await db.collection('economy_users').get();
    
    let totalCoins = 0;
    let highestCoin = 0;
    let highestCoinUser = '';
    
    let totalCrimes = 0;
    let jailedPlayers = 0;
    let playersWithRobHistory = 0;
    const excludeIds = new Set();

    economySnapshot.forEach(doc => {
        const data = doc.data();
        const playerName = data.name || data.displayName || doc.id;
        
        // 排除管理員 / 特殊玩家
        if (playerName.includes('小宋')) {
            excludeIds.add(doc.id);
            return;
        }

        const coins = data.kuCoin || 0;
        totalCoins += coins;
        if (coins > highestCoin) {
            highestCoin = coins;
            highestCoinUser = data.name || data.displayName || doc.id;
        }
        
        if (data.crimeRecord) {
            totalCrimes += data.crimeRecord;
            playersWithRobHistory++;
        }
        
        if (data.jailedUntil && data.jailedUntil > Date.now()) {
            jailedPlayers++;
        }
    });

    console.log(`發行哭幣總數: ${totalCoins}`);
    console.log(`首富擁有哭幣: ${highestCoin} (玩家: ${highestCoinUser})`);
    console.log(`有搶劫/前科紀錄玩家數: ${playersWithRobHistory}`);
    console.log(`累計前科總數: ${totalCrimes}`);
    console.log(`目前在獄中玩家數: ${jailedPlayers}`);

    console.log('\n--- 玩家裝備數據 ---');
    const playersSnapshot = await db.collection('players').get();
    
    let totalPlayers = 0;
    let totalEnchantCount = 0;

    let wLvl=[], sLvl=[], wingLvl=[], gLvl=[];
    let bwLvl=[], bsLvl=[], bwingLvl=[], bgLvl=[];
    
    playersSnapshot.forEach(doc => {
        const data = doc.data();

        // 透過 economy_users 中抓到的 ID 排除小宋
        if (excludeIds.has(doc.id)) return;
        
        totalPlayers++;
        
        if (data.enchantCount) totalEnchantCount += data.enchantCount;

        if (data.equipments) {
            if (data.equipments.weapon) wLvl.push(data.equipments.weapon.level || 0);
            if (data.equipments.shield) sLvl.push(data.equipments.shield.level || 0);
            if (data.equipments.wings) wingLvl.push(data.equipments.wings.level || 0);
            if (data.equipments.gloves) gLvl.push(data.equipments.gloves.level || 0);
        }
        if (data.backupEquips) {
            if (data.backupEquips.weapon) bwLvl.push(data.backupEquips.weapon.level || 0);
            if (data.backupEquips.shield) bsLvl.push(data.backupEquips.shield.level || 0);
            if (data.backupEquips.wings) bwingLvl.push(data.backupEquips.wings.level || 0);
            if (data.backupEquips.gloves) bgLvl.push(data.backupEquips.gloves.level || 0);
        }
    });
    
    const avg = arr => arr.length ? (arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(2) : 0;
    const max = arr => arr.length ? Math.max(...arr) : 0;

    console.log(`裝備系統啟用玩家數: ${totalPlayers}`);
    console.log(`全伺服器衝裝總次數: ${totalEnchantCount}`);
    
    console.log('\n[主裝備平均/最高等級]');
    console.log(`武器: 平均 +${avg(wLvl)}, 最高 +${max(wLvl)} (共 ${wLvl.length} 把)`);
    console.log(`盾牌: 平均 +${avg(sLvl)}, 最高 +${max(sLvl)} (共 ${sLvl.length} 把)`);
    console.log(`翅膀: 平均 +${avg(wingLvl)}, 最高 +${max(wingLvl)} (共 ${wingLvl.length} 把)`);
    console.log(`手套: 平均 +${avg(gLvl)}, 最高 +${max(gLvl)} (共 ${gLvl.length} 把)`);

    process.exit(0);
}

analyze().catch(console.error);
