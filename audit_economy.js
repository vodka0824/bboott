const { db } = require('./utils/db');

async function auditEconomy() {
    try {
        const usersSnapshot = await db.collection('economy_users').get();
        const users = [];
        
        usersSnapshot.forEach(doc => {
            const data = doc.data();
            users.push({ id: doc.id, ...data });
        });
        
        users.sort((a, b) => (b.kuCoin || 0) - (a.kuCoin || 0));
        
        console.log('--- Top 5 Wealthiest Players Details ---');
        for (let i = 0; i < 5; i++) {
            const u = users[i];
            console.log(`\n#${i+1} Name: ${u.displayName || u.name}`);
            console.log(`kuCoin: ${(u.kuCoin || 0).toLocaleString()}`);
            console.log(`Job: Police: ${!!u.isPolice}, Mafia: ${!!u.isMafia}, Councilor: ${!!u.councilorUntil}`);
            console.log(`Total Bet: ${(u.totalBetAmount || 0).toLocaleString()}`);
            console.log(`Gamble Count: ${u.gambleCount || 0}`);
            console.log(`Crimes: ${u.crimeRecord || 0}, Wanted: ${u.wantedLevel || 0}`);
            if (u.embezzleRisk) console.log(`Embezzle Risk: ${JSON.stringify(u.embezzleRisk)}`);
            if (u.mafiaExp) console.log(`Mafia Exp: ${u.mafiaExp}`);
        }
        
    } catch (e) {
        console.error('Error querying DB:', e);
    }
    process.exit(0);
}

auditEconomy();
