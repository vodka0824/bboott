require('dotenv').config();
const { MongoClient } = require('mongodb');

async function checkCollections() {
    const uri = process.env.MONGODB_URI || 'mongodb://db:27017/linebot';
    const dbName = 'linebot';
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db(dbName);
        const collections = await db.listCollections().toArray();
        console.log(`Found ${collections.length} collections.`);
        
        for (const col of collections) {
            const count = await db.collection(col.name).countDocuments();
            console.log(`- ${col.name}: ${count} documents`);
            if (col.name.includes('user') || col.name.includes('econom') || col.name.includes('profile')) {
                const docs = await db.collection(col.name).find().limit(2).toArray();
                console.log(`  Preview of ${col.name}:`, JSON.stringify(docs, null, 2));
            }
        }
    } catch (e) {
        console.error('Error:', e);
    } finally {
        await client.close();
    }
}

checkCollections();
