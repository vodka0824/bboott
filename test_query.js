const { connectDB, db, Firestore } = require('./utils/db');

async function test() {
    await connectDB();
    const BETS_COL = 'worldcup_bets';
    const userId = 'U4643b7e8ae1092c489807ac1c019c0e5'; // Copy from test_db.js output
    const snapshot = await db.collection(BETS_COL)
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .get();
        
    console.log("Empty?", snapshot.empty);
    console.log("Size:", snapshot.size);
    snapshot.forEach(doc => {
        console.log(doc.id, doc.data());
    });
    process.exit(0);
}

test().catch(console.error);
