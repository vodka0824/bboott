const { MongoClient } = require('mongodb');
const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = process.env.MONGODB_DB_NAME || 'linebot';

async function run() {
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db(dbName);
    
    console.log('--- MongoDB players collection ---');
    const docs = await db.collection('players').find({}).toArray();
    
    const level100Users = docs.filter(d => d.level >= 100);
    console.log(`Found ${level100Users.length} users with level >= 100`);
    
    for (const doc of level100Users) {
        console.log(`\nUser ID: ${doc._id}`);
        console.log(`Level: ${doc.level}`);
        if (doc.equipments) {
            for (const [k, v] of Object.entries(doc.equipments)) {
                if (v) console.log(`  ${k}: +${v.level} (grade ${v.grade})`);
            }
        }
    }
    
    // Check the 3 users specified
    const targets = [
        'U9e72d794955d37efc8241ecec4ef293c',
        'U826e0899e15c57859247db0423ac4577',
        'U9f5eeadb9f63f05d729a986d7ffb88f2'
    ];
    
    console.log('\n--- Checking 3 specific users ---');
    for (const uid of targets) {
        const doc = docs.find(d => d._id === uid);
        if (doc) {
            console.log(`User ID: ${uid} -> Level: ${doc.level || 1}`);
            if (doc.equipments) {
                for (const [k, v] of Object.entries(doc.equipments)) {
                    if (v) console.log(`  ${k}: +${v.level} (grade ${v.grade})`);
                }
            }
        }
    }
    
    process.exit(0);
}

run();
