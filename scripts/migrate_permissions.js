const { db } = require('../utils/db');

const DRY_RUN = process.argv.includes('--dry-run');

async function migratePermissions() {
    console.log(`=== Permission Migration Started (Dry Run: ${DRY_RUN}) ===`);

    try {
        // 1. Read all source collections
        console.log('Reading legacy collections...');
        const authSnapshot = await db.collection('authorizedGroups').get();
        const weatherSnapshot = await db.collection('weatherAuthorized').get();
        const restaurantSnapshot = await db.collection('restaurantAuthorized').get();
        const todoSnapshot = await db.collection('todoAuthorized').get();

        // 2. Build Maps for O(1) properties lookup
        const weatherMap = new Map();
        weatherSnapshot.forEach(doc => weatherMap.set(doc.id, doc.data()));

        const restaurantMap = new Map();
        restaurantSnapshot.forEach(doc => restaurantMap.set(doc.id, doc.data()));

        const todoMap = new Map();
        todoSnapshot.forEach(doc => todoMap.set(doc.id, doc.data()));

        console.log(`Found:
        - Authorized Groups: ${authSnapshot.size}
        - Weather Licensed: ${weatherSnapshot.size}
        - Restaurant Licensed: ${restaurantSnapshot.size}
        - Todo Licensed: ${todoSnapshot.size}`);

        // 3. Process each group
        let processedCount = 0;
        const batchSize = 500;
        let batch = db.batch();
        let batchCount = 0;

        for (const doc of authSnapshot.docs) {
            const groupId = doc.id;
            const authData = doc.data();
            const disabledFeatures = authData.disabledFeatures || [];

            // Base Group Data
            const newGroupData = {
                status: 'active', // Default to active
                authorizedAt: authData.authorizedAt,
                authorizedBy: authData.authorizedBy,
                codeUsed: authData.codeUsed,
                updatedAt: new Date(),

                features: {
                    // Default Features
                    ai: { enabled: !disabledFeatures.includes('ai') },
                    game: { enabled: !disabledFeatures.includes('game') },

                    // Licensed Features
                    weather: {
                        licensed: weatherMap.has(groupId),
                        enabled: weatherMap.has(groupId) && !disabledFeatures.includes('weather'),
                        licenseData: weatherMap.get(groupId) || null
                    },
                    restaurant: {
                        licensed: restaurantMap.has(groupId),
                        enabled: restaurantMap.has(groupId) && !disabledFeatures.includes('restaurant'),
                        licenseData: restaurantMap.get(groupId) || null
                    },
                    todo: {
                        licensed: todoMap.has(groupId),
                        enabled: todoMap.has(groupId) && !disabledFeatures.includes('todo'),
                        licenseData: todoMap.get(groupId) || null
                    }
                }
            };

            if (DRY_RUN) {
                console.log(`[DryRun] Group ${groupId}:`, JSON.stringify(newGroupData, null, 2));
            } else {
                const docRef = db.collection('groups').doc(groupId);
                batch.set(docRef, newGroupData);
                batchCount++;

                if (batchCount >= batchSize) {
                    await batch.commit();
                    batch = db.batch();
                    batchCount = 0;
                }
            }
            processedCount++;
        }

        if (!DRY_RUN && batchCount > 0) {
            await batch.commit();
        }

        console.log(`=== Migration Completed. Processed ${processedCount} groups. ===`);

    } catch (error) {
        console.error('Migration Failed:', error);
        process.exit(1);
    }
}

migratePermissions();
