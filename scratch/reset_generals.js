const { db } = require('../utils/db');
const COLLECTION_NAME = 'economy_users';

async function resetGenerals() {
    console.log('Resetting generals to Admiral...');
    
    const snapshot = await db.collection(COLLECTION_NAME)
        .where('militaryEnlistCount', '>=', 14) // >= 14 covers 少將, 中將, 上將, and above
        .get();

    if (snapshot.empty) {
        console.log('No generals found.');
        process.exit(0);
    }

    const batch = db.batch();
    let count = 0;
    
    snapshot.docs.forEach(doc => {
        const data = doc.data();
        let needsUpdate = false;
        const updates = {};
        
        // 1. 將超過上將的入伍次數(>16) 強制回推到上將(16)
        if (data.militaryEnlistCount > 16) {
            updates.militaryEnlistCount = 16;
            needsUpdate = true;
        }
        
        // 2. 如果目前在當兵的將官，強制退伍 (移除 militaryUntil)
        if (data.militaryUntil) {
            updates.militaryUntil = db.FieldValue.delete();
            needsUpdate = true;
        }

        if (needsUpdate) {
            console.log(`Resetting user ${data.name || doc.id} (Old Count: ${data.militaryEnlistCount}, Serving: ${!!data.militaryUntil})`);
            batch.update(doc.ref, updates);
            count++;
        }
    });

    if (count > 0) {
        await batch.commit();
        console.log(`Updated ${count} generals.`);
    } else {
        console.log('No generals needed resetting.');
    }
    process.exit(0);
}

resetGenerals().catch(console.error);
