const { db } = require('./utils/db');

async function findNegative() {
    try {
        const usersSnapshot = await db.collection('economy_users').get();
        const users = [];
        let totalNegative = 0;
        let totalPositive = 0;
        
        usersSnapshot.forEach(doc => {
            const data = doc.data();
            const coins = data.kuCoin || 0;
            if (coins < 0) {
                totalNegative += coins;
                users.push({
                    id: doc.id,
                    name: data.displayName || data.name || 'Unknown',
                    coins: coins
                });
            } else {
                totalPositive += coins;
            }
        });
        
        users.sort((a, b) => a.coins - b.coins);
        
        console.log('=== Debt Analysis ===');
        console.log(`Total Positive Coins: ${totalPositive.toLocaleString()}`);
        console.log(`Total Negative Coins (Debt): ${totalNegative.toLocaleString()}`);
        console.log(`Net Economy Total: ${(totalPositive + totalNegative).toLocaleString()}`);
        
        console.log('\n--- Players in Debt ---');
        for (let i = 0; i < users.length; i++) {
            const u = users[i];
            console.log(`${i+1}. ${u.name} - ${u.coins.toLocaleString()} coins`);
        }
        
    } catch (e) {
        console.error('Error querying DB:', e);
    }
    process.exit(0);
}

findNegative();
