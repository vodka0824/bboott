const { connectDB, getDb } = require('../utils/db');

async function clearEquips() {
    console.log('連線至資料庫...');
    await connectDB();
    const database = await getDb();
    const emptyEquip = {
        weapon: null, shield: null, wings: null,
        gloves: null, necklace: null, ring: null
    };
    const result = await database.collection('players').updateMany(
        {},
        { $set: { equipments: emptyEquip, backupEquips: emptyEquip, scrolls: { weapon: 0, armor: 0, accessory: 0 }, enchantCount: 0 } }
    );
    console.log(`成功清空了 ${result.modifiedCount} 位玩家的裝備！`);
    process.exit(0);
}
clearEquips().catch(e => { console.error(e); process.exit(1); });
