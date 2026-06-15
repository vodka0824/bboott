const { MongoClient } = require('mongodb');
const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = process.env.MONGODB_DB_NAME || 'linebot';

async function run() {
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db(dbName);
    
    console.log('--- Collections in MongoDB ---');
    const cols = await db.listCollections().toArray();
    for (const c of cols) {
        const count = await db.collection(c.name).countDocuments();
        console.log(`- ${c.name} (${count} documents)`);
    }
    
    process.exit(0);
}

run();
