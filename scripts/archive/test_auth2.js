require('dotenv').config();
const { MongoClient } = require('mongodb');

async function testAuth() {
    const uri = process.env.MONGODB_URI || 'mongodb://db:27017/linebot';
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db('linebot');
        const groupId = 'C147ac337a28d4e0d7a85dc323c30878a';
        
        const groupDoc = await db.collection('groups').findOne({ _id: groupId });
        console.log('Group config:', JSON.stringify(groupDoc, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

testAuth();
