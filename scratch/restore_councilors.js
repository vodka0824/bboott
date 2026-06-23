const { db } = require('../utils/db');

async function main() {
    console.log('Restoring councilor status...');
    
    const userIdsToRestore = [
        'U9e72d794955d37efc8241ecec4ef293c', // 林智盛
        'Ub5aaf1fddcd9fccfd09b04f289e2801d', // 謝承晏
        'Uf449b5374cc8a84f1ae53aece3171a6e', // 杜.(´･Д･)」
        'Uf4ca61e00314a58b867ce843139a37e9', // Chen
        'U6e535b56328743743861a67e3ba1fb76', // 嘉瑋
        'U175ea957c81f2e3ff4fa67a568f6028f', // 珩哥
        'Ua5a09e87f13b3f512f478194bf60241b'  // Stanyan王訢諺
    ];

    const batch = db.batch();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const newUntil = Date.now() + sevenDaysMs;

    for (const uid of userIdsToRestore) {
        const docRef = db.collection('economy_users').doc(uid);
        batch.update(docRef, {
            councilorUntil: newUntil,
            councilorPressureToken: 1
        });
        console.log(`Prepared restoration for user: ${uid}`);
    }

    try {
        await batch.commit();
        console.log(`Successfully restored councilor status for ${userIdsToRestore.length} users.`);
    } catch (err) {
        console.error('Failed to restore:', err);
    }
    process.exit(0);
}

main();
