const { connectDB, db } = require('./utils/db');

async function resetMonkCD() {
    await connectDB();
    const snapshot = await db.collection('economy_users').where('profession', '==', 'monk').get();
    let count = 0;
    for (const doc of snapshot.docs) {
        await doc.ref.update({
            monkCooldowns: db.FieldValue.delete()
        });
        count++;
    }
    console.log(`Reset monk cooldowns for ${count} users.`);
    process.exit(0);
}

resetMonkCD().catch(console.error);
