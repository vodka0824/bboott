const { connectDB, db } = require('./utils/db');

async function fixDoubleIdentity() {
    await connectDB();
    const now = Date.now();
    
    // Find monks
    const snapshot = await db.collection('economy_users').where('profession', '==', 'monk').get();
    let count = 0;
    
    for (const doc of snapshot.docs) {
        const data = doc.data();
        let updates = {};
        
        if (data.militaryUntil && data.militaryUntil > now) {
            updates.militaryUntil = db.FieldValue.delete();
            updates.militaryEnlistCount = db.FieldValue.delete();
            updates.militaryPension = db.FieldValue.delete();
        }
        
        if (data.isPolice) {
            updates.isPolice = db.FieldValue.delete();
            updates.policeMerit = db.FieldValue.delete();
        }
        
        if (data.isMafia) {
            updates.isMafia = db.FieldValue.delete();
        }
        
        if (data.councilorUntil && data.councilorUntil > now) {
            updates.councilorUntil = db.FieldValue.delete();
        }
        
        if (Object.keys(updates).length > 0) {
            await doc.ref.update(updates);
            console.log(`Fixed user ${doc.id}`);
            count++;
        }
    }
    
    console.log(`Done. Fixed ${count} users.`);
    process.exit(0);
}

fixDoubleIdentity().catch(console.error);
