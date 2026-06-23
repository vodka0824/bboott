const { db } = require('../utils/db');
const COLLECTION_NAME = 'economy_users';

async function fix() {
    console.log('Fixing military enlist counts...');
    const snapshot = await db.collection(COLLECTION_NAME).where('militaryEnlistCount', '>=', 19).get();
    
    if (snapshot.empty) {
        console.log('No users with count >= 19 found.');
        process.exit(0);
    }

    const batch = db.batch();
    let count = 0;
    
    snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.militaryEnlistCount >= 20) { // If >= 20, clamp to 19 to prevent auto 5-star
            console.log(`Clamping user ${data.name} from ${data.militaryEnlistCount} to 19.`);
            batch.update(doc.ref, { militaryEnlistCount: 19 });
            count++;
        }
    });

    if (count > 0) {
        await batch.commit();
        console.log(`Updated ${count} users.`);
    } else {
        console.log('No users needed clamping (all were exactly 19).');
    }
    process.exit(0);
}

fix().catch(console.error);
