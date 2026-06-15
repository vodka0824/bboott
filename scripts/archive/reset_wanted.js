require('dotenv').config();
const { db } = require('./utils/db');

async function resetWantedLevels() {
    try {
        console.log('Fetching users with wantedLevel > 0...');
        const snapshot = await db.collection('economy_users')
            .where('wantedLevel', '>', 0)
            .get();

        if (snapshot.empty) {
            console.log('No users found with wanted level > 0.');
            return;
        }

        const batch = db.batch();
        let count = 0;

        snapshot.forEach(doc => {
            const docRef = db.collection('economy_users').doc(doc.id);
            batch.update(docRef, { wantedLevel: 0 });
            count++;
        });

        await batch.commit();
        console.log(`Successfully reset wanted level for ${count} users.`);
    } catch (error) {
        console.error('Error resetting wanted levels:', error);
    }
}

resetWantedLevels().then(() => process.exit(0));
