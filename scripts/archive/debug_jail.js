const { connectDB, getDb } = require('./utils/db');

async function debugJail() {
    try {
        await connectDB();
        const db = await getDb();
        const coll = db.collection('players');
        
        const now = Date.now();
        console.log('Current Date.now():', now);
        
        const allDocs = await coll.find({}).toArray();
        console.log(`Total players: ${allDocs.length}`);
        
        const jailed = allDocs.filter(d => d.jailedUntil && d.jailedUntil > now);
        console.log('Jailed via filter:');
        jailed.forEach(d => console.log(d.displayName || d.name, d.jailedUntil, typeof d.jailedUntil));

        const queryMatched = await coll.find({ jailedUntil: { $gt: now } }).toArray();
        console.log('Jailed via query:');
        queryMatched.forEach(d => console.log(d.displayName || d.name, d.jailedUntil, typeof d.jailedUntil));
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
debugJail();
