const { db, connectDB } = require('./utils/db');

async function investigate() {
    try {
        await connectDB();
        
        console.log('--- 尋找高等級玩家 (Top 10) ---');
        const equipmentsSnapshot = await db.collection('equipments').get();
        const users = [];
        
        equipmentsSnapshot.forEach(doc => {
            const data = doc.data();
            const level = data.rpg ? data.rpg.level || 1 : 1;
            const exp = data.rpg ? data.rpg.chatExp || 0 : 0;
            users.push({ id: doc.id, level, exp, data });
        });
        
        users.sort((a, b) => b.level - a.level);
        
        const top10 = users.slice(0, 10);
        const suspiciousUsers = [];
        
        top10.forEach(u => {
            console.log(`User ID: ${u.id}, Level: ${u.level}, Exp: ${u.exp}`);
            if (u.level > 50) suspiciousUsers.push(u.id);
            const equips = u.data.equipments || {};
            for (const [part, eq] of Object.entries(equips)) {
                if (eq && eq.level > 0) console.log(`    ${part}: +${eq.level} (${eq.name})`);
            }
        });

        console.log('\n--- 檢查 log_enchants (Top 10 recent) ---');
        const logs = [];
        const logsSnapshot = await db.collection('log_enchants').get();
        logsSnapshot.forEach(doc => logs.push(doc.data()));
        
        console.log(`Total enchant logs: ${logs.length}`);
        
        // Find users with 100% success rate on +15
        const userStats = {};
        logs.forEach(log => {
            const uid = log.userId;
            if (!userStats[uid]) userStats[uid] = { success: 0, fail: 0 };
            if (log.isSuccess) userStats[uid].success++;
            else userStats[uid].fail++;
        });
        
        console.log('\n--- User Enchant Success Rates ---');
        for (const [uid, stats] of Object.entries(userStats)) {
            const total = stats.success + stats.fail;
            const rate = (stats.success / total) * 100;
            if (total > 20 && rate > 80) {
                console.log(`[SUSPICIOUS] User: ${uid} | Success: ${stats.success} | Fail: ${stats.fail} | Rate: ${rate.toFixed(1)}%`);
            }
        }
        
        process.exit(0);
    } catch (e) {
        console.error('Error during investigation:', e);
        process.exit(1);
    }
}

investigate();
