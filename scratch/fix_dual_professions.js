const { db } = require('../utils/db');

async function fixDualProfessions() {
    console.log('開始修復雙重職業異常...');
    const targetUserIds = ['Ue3a49ab0e4bd2bc31994c8d17d5a5790', 'U181a8a4761f6fcb05923676433a0573a'];
    
    const batch = db.batch();
    const COLLECTION_NAME = 'economy_users';

    for (const userId of targetUserIds) {
        const docRef = db.collection(COLLECTION_NAME).doc(userId);
        const doc = await docRef.get();
        
        if (doc.exists) {
            const data = doc.data();
            console.log(`正在處理玩家: ${data.name || data.displayName || userId}`);
            console.log(`  - 原始軍役到期時間: ${data.militaryUntil ? new Date(data.militaryUntil).toLocaleString() : '無'}`);
            console.log(`  - 原始入伍次數: ${data.militaryEnlistCount || 0}`);
            
            // 拔除現役軍人狀態 (清除 militaryUntil)，但不改動軍階/入伍次數
            batch.update(docRef, {
                militaryUntil: db.FieldValue.delete()
            });
            console.log(`  => 已排定強制退伍處理 (保留入伍次數)`);
        }
    }

    await batch.commit();
    console.log('\n修復完成！所有目標玩家已強制剝奪現役軍人身分。');
    process.exit(0);
}

fixDualProfessions().catch(e => {
    console.error('修復發生錯誤:', e);
    process.exit(1);
});
