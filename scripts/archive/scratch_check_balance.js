const { MongoClient } = require('mongodb');
const uri = 'mongodb://localhost:27017';

async function check() {
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db('linebot');
    const doc = await db.collection('groups__leaderboard').findOne({ _id: 'C147ac337a28d4e0d7a85dc323c30878a_Uf0f4df46b2859ad47daf96cbb7830f84' });
    console.log(doc);
    process.exit(0);
}
check();
