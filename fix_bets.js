const { getDb } = require('./utils/db');
(async () => {
    try {
        const db = await getDb();
        const betsCol = db.collection('worldcup_bets');
        const matchesCol = db.collection('worldcup_matches');
        const bets = await betsCol.find({ homeTeam: { $exists: false } }).toArray();
        for (const bet of bets) {
            const match = await matchesCol.findOne({ _id: bet.matchId });
            if (match) {
                await betsCol.updateOne({ _id: bet._id }, { $set: { homeTeam: match.homeTeam, awayTeam: match.awayTeam } });
                console.log('Fixed bet: ' + bet._id);
            }
        }
        console.log('Done');
    } catch(e) {
        console.error(e);
    } finally {
        process.exit();
    }
})();
