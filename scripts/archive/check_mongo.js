const { MongoClient } = require('mongodb');
const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = process.env.MONGODB_DB_NAME || 'linebot';

async function run() {
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db(dbName);
    
    console.log('--- MongoDB equipments collection ---');
    const docs = await db.collection('equipments').find({}).toArray();
    console.log(`Found ${docs.length} documents in equipments.`);
    
    const targets = [
        'U9e72d794955d37efc8241ecec4ef293c',
        'U826e0899e15c57859247db0423ac4577',
        'U9f5eeadb9f63f05d729a986d7ffb88f2'
    ];
    
    for (const uid of targets) {
        const doc = docs.find(d => d._id === uid);
        if (doc) {
            console.log(`\nFound target ${uid}!`);
            const level = doc.rpg ? doc.rpg.level : 'Unknown';
            console.log(`Level: ${level}`);
            if (doc.equipments) {
                for (const [k, v] of Object.entries(doc.equipments)) {
                    if (v) console.log(`  ${k}: +${v.level}`);
                }
            }
        } else {
            console.log(`\nTarget ${uid} not found in equipments array!`);
        }
    }
    
    // Check if they are stored with a prefix like groups_
    const allIds = docs.map(d => d._id);
    for (const uid of targets) {
        const fuzzy = docs.find(d => typeof d._id === 'string' && d._id.includes(uid));
        if (fuzzy) {
            console.log(`Found fuzzy match for ${uid}: ${fuzzy._id}`);
        }
    }
    
    process.exit(0);
}

run();
