const { db } = require('./utils/db');

async function analyzeEconomy() {
    try {
        const usersSnapshot = await db.collection('economy_users').get();
        const users = [];
        let totalCoins = 0;
        
        usersSnapshot.forEach(doc => {
            const data = doc.data();
            const coins = data.kuCoin || 0;
            totalCoins += coins;
            users.push({
                id: doc.id,
                name: data.displayName || data.name || 'Unknown',
                coins: coins,
                isPolice: !!data.isPolice,
                isMafia: !!data.isMafia,
                isCouncilor: data.councilorUntil && Date.now() < data.councilorUntil,
                crimeRecord: data.crimeRecord || 0,
                wantedLevel: data.wantedLevel || 0,
                job: data.isPolice ? 'Police' : (data.councilorUntil && Date.now() < data.councilorUntil) ? 'Councilor' : (data.isMafia ? 'Mafia' : 'Citizen')
            });
        });
        
        users.sort((a, b) => b.coins - a.coins);
        
        console.log('=== Economy Analysis ===');
        console.log(`Total Players: ${users.length}`);
        console.log(`Total Coins in Economy: ${totalCoins.toLocaleString()}`);
        console.log(`Average Coins per Player: ${Math.floor(totalCoins / users.length || 0).toLocaleString()}`);
        console.log('\n--- Top 20 Wealthiest Players ---');
        
        for (let i = 0; i < Math.min(20, users.length); i++) {
            const u = users[i];
            const pct = ((u.coins / totalCoins) * 100).toFixed(2);
            console.log(`${i+1}. [${u.job}] ${u.name} - ${u.coins.toLocaleString()} coins (${pct}%) | Crimes: ${u.crimeRecord} | Wanted: ${u.wantedLevel}`);
        }

        console.log('\n--- Wealth Distribution by Job ---');
        const jobWealth = { Police: 0, Councilor: 0, Mafia: 0, Citizen: 0 };
        const jobCount = { Police: 0, Councilor: 0, Mafia: 0, Citizen: 0 };
        
        users.forEach(u => {
            jobWealth[u.job] += u.coins;
            jobCount[u.job]++;
        });
        
        for (const job in jobWealth) {
            const pct = ((jobWealth[job] / totalCoins) * 100).toFixed(2);
            const avg = Math.floor(jobWealth[job] / (jobCount[job] || 1));
            console.log(`${job}: ${jobCount[job]} players, ${jobWealth[job].toLocaleString()} total coins (${pct}%), Avg: ${avg.toLocaleString()}`);
        }
        
    } catch (e) {
        console.error('Error querying DB:', e);
    }
    process.exit(0);
}

analyzeEconomy();
