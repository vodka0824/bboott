require('dotenv').config();
const { db } = require('./utils/db');

async function testLeaderboard() {
    try {
        console.log('Building query...');
        const query = db.collection('economy_users')
            .orderBy('kuCoin', 'desc')
            .limit(10);
            
        console.log('Query:', JSON.stringify({
            collectionPath: query._collectionPath,
            filters: query._filters,
            limit: query._limit,
            sort: query._sort
        }, null, 2));

        console.log('Fetching...');
        const snapshot = await query.get();
        console.log('Snapshot empty:', snapshot.empty);
        console.log('Docs count:', snapshot.docs.length);
    } catch (e) {
        console.error('Error fetching leaderboard:', e);
    }
}

testLeaderboard();
