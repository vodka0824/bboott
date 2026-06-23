const { getDb } = require('./utils/db');

async function fixMonkMilitary() {
    try {
        const db = await getDb();
        const coll = db.collection('economy_users');

        // Find users who are both Monk and have any militaryUntil set
        const docs = await coll.find({
            profession: 'monk',
            militaryUntil: { $exists: true, $gt: 0 }
        }).toArray();

        if (docs.length === 0) {
            console.log('No players found who are both Monk and have militaryUntil set.');
        } else {
            console.log(`Found ${docs.length} players. Fixing...`);
            let count = 0;
            for (const doc of docs) {
                await coll.updateOne(
                    { _id: doc._id },
                    { $unset: { militaryUntil: "", militaryGroupId: "" } }
                );
                count++;
                console.log(`Removed military status for ${doc._id} (Kept militaryEnlistCount: ${doc.militaryEnlistCount})`);
            }
            console.log(`Successfully fixed ${count} players.`);
        }
    } catch (e) {
        console.error('Error fixing:', e);
    } finally {
        process.exit(0);
    }
}

fixMonkMilitary();
