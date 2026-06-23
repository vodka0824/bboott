const { connectDB, db } = require('./utils/db');

async function test() {
    await connectDB();
    const BETS_COL = 'worldcup_bets';
    const matchId = 'wc14';
    const snapshot = await db.collection(BETS_COL)
        .where('matchId', '==', matchId)
        .get();
        
    console.log("Empty?", snapshot.empty);
    console.log("Size:", snapshot.size);
    process.exit(0);
}

test().catch(console.error);
