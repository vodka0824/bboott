require('dotenv').config();
const { db, connectDB } = require('../utils/db'); 

// 頂層集合名稱，確保與您的環境一致
const COLLECTION_NAME = process.env.COLLECTION_NAME || 'users';

async function resetRobCounts() {
    console.log('開始重置所有人的搶劫次數...');
    try {
        await connectDB();
        const snapshot = await db.collection(COLLECTION_NAME).get();
        const batch = db.batch();
        let updateCount = 0;

        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.robCount !== undefined || data.robSpamCount !== undefined || data.lastRobDate !== undefined) {
                batch.update(doc.ref, {
                    robCount: db.FieldValue.delete(),
                    robSpamCount: db.FieldValue.delete(),
                    lastRobDate: db.FieldValue.delete(),
                    lastRobSpamDate: db.FieldValue.delete()
                });
                updateCount++;
            }
        });

        if (updateCount > 0) {
            await batch.commit();
            console.log(`✅ 成功重置了 ${updateCount} 位玩家的搶劫次數。`);
        } else {
            console.log('沒有需要重置的玩家資料。');
        }
    } catch (e) {
        console.error('重置失敗:', e);
    }
}

resetRobCounts().then(() => process.exit(0));
