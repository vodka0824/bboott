const { db } = require('./utils/db');

function cleanName(name) {
    if (!name) return '';
    return name.replace(/\[.*?\]/g, '').replace(/\(出賣靈魂的賭狗\)/g, '').trim();
}

async function run() {
    const snapshot = await db.collection('economy_users').get();
    let count = 0;
    const batch = db.batch();
    
    snapshot.forEach(doc => {
        const data = doc.data();
        let needsUpdate = false;
        const updates = {};
        
        if (data.displayName && (data.displayName.includes('[') || data.displayName.includes('('))) {
            const cleaned = cleanName(data.displayName);
            if (cleaned !== data.displayName) {
                updates.displayName = cleaned;
                needsUpdate = true;
            }
        }
        
        if (data.name && (data.name.includes('[') || data.name.includes('('))) {
            const cleaned = cleanName(data.name);
            if (cleaned !== data.name) {
                updates.name = cleaned;
                needsUpdate = true;
            }
        }
        
        if (needsUpdate) {
            batch.update(doc.ref, updates);
            count++;
            console.log(`Will clean ${doc.id}: ${data.displayName} -> ${updates.displayName || data.displayName}`);
        }
    });
    
    if (count > 0) {
        await batch.commit();
        console.log(`Cleaned ${count} users.`);
    } else {
        console.log('No users needed cleaning.');
    }
}

run().then(() => process.exit(0)).catch(console.error);
