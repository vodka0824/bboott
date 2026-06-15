const { connectDB, getDb } = require('../utils/db');

async function resetRobCounts() {
    try {
        await connectDB();
        const db = await getDb();
        
        console.log('Fetching players...');
        const coll = db.collection('players');
        
        const result = await coll.updateMany(
            {}, 
            { 
                $set: { 
                    robCount: 0, 
                    lastRobDate: '', 
                    robSpamCount: 0, 
                    lastRobSpamDate: '' 
                } 
            }
        );

        console.log(`Successfully reset rob counts for ${result.modifiedCount} players.`);
        process.exit(0);
    } catch (e) {
        console.error('Failed to reset rob counts:', e);
        process.exit(1);
    }
}

resetRobCounts();
