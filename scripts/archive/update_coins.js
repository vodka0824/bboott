const { connectDB, getDb } = require('./utils/db');
const { ADMIN_USER_ID } = require('./config/constants');

(async () => {
    try {
        await connectDB();
        const db = await getDb();
        await db.collection('economy_users').updateOne(
            { _id: ADMIN_USER_ID },
            { $set: { kuCoin: 1100000000, name: '我是管理員' } },
            { upsert: true }
        );
        console.log('Updated admin coins successfully!');
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
})();
