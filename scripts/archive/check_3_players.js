const { db, connectDB, closeDB } = require('./utils/db');

async function checkPlayers() {
    try {
        await connectDB();
        
        const targets = [
            'U9e72d794955d37efc8241ecec4ef293c',
            'U826e0899e15c57859247db0423ac4577',
            'U9f5eeadb9f63f05d729a986d7ffb88f2'
        ];
        
        console.log('--- 玩家裝備等級查詢 ---');
        
        for (const uid of targets) {
            const docRef = db.collection('players').doc(uid);
            const doc = await docRef.get();
            
            if (doc.exists) {
                const data = doc.data();
                const level = data.rpg ? data.rpg.level || 1 : 1;
                console.log(`\n玩家 ID: ${uid}`);
                console.log(`目前等級: Lv.${level}`);
                console.log(`裝備清單:`);
                
                const equips = data.equipments || {};
                const parts = ['weapon', 'shield', 'wings', 'gloves', 'necklace', 'ring'];
                
                for (const p of parts) {
                    if (equips[p]) {
                        console.log(`  - [${p}] ${equips[p].name} : +${equips[p].level} (品階: ${equips[p].grade})`);
                    } else {
                        console.log(`  - [${p}] 未裝備`);
                    }
                }
            } else {
                console.log(`\n玩家 ID: ${uid} (找不到該玩家資料)`);
            }
        }
        
    } catch (e) {
        console.error('Error:', e);
    } finally {
        await closeDB();
    }
}

checkPlayers();
