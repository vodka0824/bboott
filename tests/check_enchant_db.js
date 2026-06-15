const { db } = require('../utils/db');

async function checkDB() {
    try {
        console.log('🔍 Checking [lineage_users] collection...');

        // 1. Check raw data count
        const snapshot = await db.collection('lineage_users').get();
        console.log(`✅ Total documents: ${snapshot.size}`);

        if (snapshot.empty) {
            console.log('⚠️ No users found in database.');
            return;
        }

        snapshot.forEach(doc => {
            const data = doc.data();
            const weapon = data.weapon ? `+${data.weapon.level} ${data.weapon.name}` : 'None';
            console.log(`- User [${doc.id}]: Weapon=${weapon}, Max=${data.history?.maxLevel}, Broken=${data.history?.broken}`);
        });

        // 2. Check Leaderboard Query (Index Check)
        console.log('\n📊 Testing Leaderboard Query (Index Check)...');
        const leaderboard = await db.collection('lineage_users')
            .orderBy('weapon.level', 'desc')
            .limit(5)
            .get();

        console.log('✅ Leaderboard Query Success!');
        leaderboard.forEach((doc, index) => {
            const d = doc.data();
            console.log(`   #${index + 1} User [${doc.id}]: +${d.weapon?.level || 0}`);
        });

    } catch (error) {
        console.error('❌ Database Check Failed:', error.message);
        if (error.message.includes('requires an index')) {
            console.error('💡 ACTION REQUIRED: You need to create a Firestore Index.');
            console.error('   Please check the error URL above (if provided) or go to Firebase Console.');
        }
    }
}

checkDB();
