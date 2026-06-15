require('dotenv').config();
const { db } = require('./config/firebase');

async function clearDebts() {
    console.log('開始清除債務...');
    const usersRef = db.collection('line_bot_users');
    const snapshot = await usersRef.where('kuCoin', '<', 0).get();

    if (snapshot.empty) {
        console.log('沒有找到負債玩家。');
        return;
    }

    let batch = db.batch();
    let count = 0;
    
    snapshot.forEach(doc => {
        batch.update(doc.ref, { kuCoin: 0 });
        count++;
    });

    await batch.commit();
    console.log(`成功將 ${count} 名玩家的債務清零！`);
}

clearDebts().then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(1);
});
