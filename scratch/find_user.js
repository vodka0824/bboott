const { connectDB } = require('../utils/db');

async function findUser() {
    const db = await connectDB();
    const cursor = db.collection('economy_users').find({});
    const docs = await cursor.toArray();
    docs.forEach(doc => {
        console.log(doc._id, doc.displayName);
    });
    process.exit(0);
}
findUser();
