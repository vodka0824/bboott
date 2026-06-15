const { connectDB, getDb, db } = require('../utils/db');

async function clearEquipments() {
    console.log('連線至資料庫...');
    await connectDB();
    const database = await getDb();
    
    console.log('開始清空所有玩家裝備...');
    // equipment_users collection
    const result = await database.collection('equipment_users').updateMany(
        {}, 
        { $set: { equipments: {}, backupEquips: {} } }
    );
    
    console.log(`成功清空了 ${result.modifiedCount} 位玩家的裝備！(掃描了 ${result.matchedCount} 筆資料)`);
    process.exit(0);
}

clearEquipments().catch(err => {
    console.error('執行失敗:', err);
    process.exit(1);
});
