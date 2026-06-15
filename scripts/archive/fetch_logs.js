const { db, connectDB } = require('./utils/db');

async function fetchLogs() {
    await connectDB();
    try {
        const result = await db.collection('log_robberies').orderBy('timestamp', 'desc').limit(500).get();
        let outcomes = {};
        let totalRobAmount = 0;
        let totalLostCoins = 0;
        let critCount = 0;
        
        result.forEach(doc => {
            const data = doc.data();
            outcomes[data.outcome] = (outcomes[data.outcome] || 0) + 1;
            totalRobAmount += (data.robAmount || 0);
            totalLostCoins += (data.lostCoins || 0);
            if (data.isCrit) critCount++;
        });
        
        console.log('Total logs fetched:', result.size);
        console.log('Outcomes:', outcomes);
        console.log('Total Rob Amount:', totalRobAmount);
        console.log('Total Lost Coins:', totalLostCoins);
        console.log('Crit Count:', critCount);
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

fetchLogs();
