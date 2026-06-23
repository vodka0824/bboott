const { MongoClient } = require('mongodb');

async function main() {
    const client = new MongoClient('mongodb://localhost:27017');
    await client.connect();
    const db = client.db('linebot');
    const bets = await db.collection('worldcup_bets').find({}).toArray();
    console.log("Bets count:", bets.length);
    console.log(JSON.stringify(bets, null, 2));
    await client.close();
}

main().catch(console.error);
