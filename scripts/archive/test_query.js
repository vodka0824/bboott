require('dotenv').config();
const { MongoClient } = require('mongodb');

async function testQuery() {
    const uri = process.env.MONGODB_URI || 'mongodb://db:27017/linebot';
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db('linebot');
        const coll = db.collection('economy_users');
        
        console.log('Querying all...');
        let docs = await coll.find({}).toArray();
        console.log('All docs count:', docs.length);

        console.log('Querying with sort...');
        docs = await coll.find({}).sort({ kuCoin: -1 }).toArray();
        console.log('Sorted docs count:', docs.length);
        
        console.log('Querying with sort and limit...');
        docs = await coll.find({}).sort({ kuCoin: -1 }).limit(10).toArray();
        console.log('Sorted+Limit docs count:', docs.length);

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await client.close();
    }
}

testQuery();
