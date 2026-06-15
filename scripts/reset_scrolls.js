const { db } = require('../utils/db');

async function resetScrolls() {
    console.log('[Script] Starting to reset all users scrolls to 0...');
    try {
        const snapshot = await db.collection('lineage_users').get();
        let count = 0;
        
        for (const doc of snapshot.docs) {
            await db.collection('lineage_users').doc(doc.id).update({
                scrolls: 0
            });
            count++;
        }
        
        console.log(`[Script] Successfully reset scrolls for ${count} users.`);
    } catch (e) {
        console.error('[Script] Error resetting scrolls:', e);
    }
    process.exit(0);
}

resetScrolls();
