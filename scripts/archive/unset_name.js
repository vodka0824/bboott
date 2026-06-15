const { connectDB, getDb } = require('./utils/db');
const { ADMIN_USER_ID } = require('./config/constants');

(async () => {
    try {
        await connectDB();
        const db = await getDb();
        await db.collection('economy_users').updateOne(
            { _id: ADMIN_USER_ID },
            { $unset: { name: "" } }
        );
        console.log('Unset admin name successfully!');
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
})();
