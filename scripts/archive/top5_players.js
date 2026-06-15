const { MongoClient } = require('mongodb');
const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = process.env.MONGODB_DB_NAME || 'linebot';

async function run() {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db(dbName);
        
        // Fetch players and economy_users
        const players = await db.collection('players').find({}).toArray();
        const economyUsers = await db.collection('economy_users').find({}).toArray();
        
        // Create map of userId -> name
        const nameMap = {};
        economyUsers.forEach(u => {
            nameMap[u._id] = u.displayName || u.name || '未知玩家';
        });
        
        // Map and sort players
        const playerStats = players.map(p => {
            const level = p.level || 1;
            const chatExp = p.chatExp || 0;
            const name = nameMap[p._id] || '未知玩家';
            
            // Calc equipment power roughly to show something interesting
            let equipLevels = 0;
            if (p.equipments) {
                for (const v of Object.values(p.equipments)) {
                    if (v && v.level) equipLevels += v.level;
                }
            }
            
            return {
                userId: p._id,
                name,
                level,
                chatExp,
                equipLevels
            };
        });
        
        // Sort by level desc, then exp desc
        playerStats.sort((a, b) => {
            if (b.level !== a.level) return b.level - a.level;
            return b.chatExp - a.chatExp;
        });
        
        const top5 = playerStats.slice(0, 5);
        
        console.log('--- 🏆 伺服器等級 Top 5 玩家 🏆 ---');
        top5.forEach((p, idx) => {
            console.log(`${idx + 1}. ${p.name} (ID: ${p.userId})`);
            console.log(`   🔸 等級: Lv.${p.level} (總經驗: ${p.chatExp})`);
            console.log(`   🔸 全身裝備總強化等級: +${p.equipLevels}\n`);
        });
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

run();
