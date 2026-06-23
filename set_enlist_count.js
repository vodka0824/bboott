const { getDb } = require('./utils/db');

async function setMilitaryCount() {
    const userId = 'U9f112e62754b283d2a95f6a49898dc4f';
    const targetCount = 18;

    try {
        const db = await getDb();
        const coll = db.collection('economy_users');

        const result = await coll.updateOne(
            { _id: userId },
            { $set: { militaryEnlistCount: targetCount } }
        );

        if (result.matchedCount === 0) {
            console.log(`User ${userId} not found.`);
        } else {
            console.log(`Successfully updated militaryEnlistCount for ${userId} to ${targetCount}.`);
        }
    } catch (e) {
        console.error('Error updating:', e);
    } finally {
        process.exit(0);
    }
}

setMilitaryCount();
