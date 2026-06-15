require('dotenv').config();
const { db } = require('./utils/db');

async function resetJailStats() {
    try {
        console.log('Fetching users to reset crimeRecord and wantedLevel...');
        const snapshot = await db.collection('economy_users').get();

        if (snapshot.empty) {
            console.log('No users found.');
            return;
        }

        const batch = db.batch();
        let count = 0;

        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.crimeRecord > 0 || data.wantedLevel > 0) {
                const docRef = db.collection('economy_users').doc(doc.id);
                batch.update(docRef, { 
                    crimeRecord: 0,
                    wantedLevel: 0
                });
                count++;
            }
        });

        if (count > 0) {
            await batch.commit();
            console.log(`Successfully reset crimeRecord and wantedLevel for ${count} users.`);
        } else {
            console.log('No users needed resetting.');
        }
    } catch (error) {
        console.error('Error resetting stats:', error);
    }
}

resetJailStats().then(() => process.exit(0));
