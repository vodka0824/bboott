require('dotenv').config();
const { db } = require('./utils/db');

async function testLeaderboard() {
    try {
        console.log('Fetching leaderboard from economy_users...');
        const snapshot = await db.collection('economy_users')
            .orderBy('kuCoin', 'desc')
            .limit(10)
            .get();

        if (snapshot.empty) {
            console.log('Snapshot is empty!');
            return;
        }

        console.log(`Got ${snapshot.size} users.`);
        const topUsers = snapshot.docs.map(doc => doc.data());
        console.log(topUsers);
    } catch (e) {
        console.error('Error fetching leaderboard:', e);
    }
}

testLeaderboard();
