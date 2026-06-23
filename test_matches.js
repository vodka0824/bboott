const { MongoClient } = require('mongodb');

async function main() {
    const client = new MongoClient('mongodb://localhost:27017');
    await client.connect();
    const db = client.db('linebot');
    const matches = await db.collection('worldcup_matches').find({}).toArray();
    console.log("Matches:", matches);
    await client.close();
}

main().catch(console.error);
