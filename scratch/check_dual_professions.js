const { db } = require('../utils/db');

async function checkDualProfessions() {
    console.log('開始清查雙重職業玩家...');
    const snapshot = await db.collection('economy_users').get();
    
    let report = {
        totalChecked: snapshot.size,
        dualProfessionUsers: [],
        militaryCount: 0,
        monkCount: 0,
        policeCount: 0,
        mafiaCount: 0,
        councilorCount: 0
    };

    const now = Date.now();

    snapshot.forEach(doc => {
        const data = doc.data();
        const userId = doc.id;
        const name = data.name || data.displayName || '未知玩家';

        let roles = [];

        // 檢查各種職業狀態
        if (data.militaryUntil && data.militaryUntil > now) {
            roles.push('軍人');
            report.militaryCount++;
        }
        if (data.profession === 'monk') {
            roles.push('出家人');
            report.monkCount++;
        }
        if (data.isPolice) {
            roles.push('警察');
            report.policeCount++;
        }
        if (data.isMafia) {
            roles.push('黑幫');
            report.mafiaCount++;
        }
        if (data.councilorUntil && data.councilorUntil > now) {
            roles.push('市議員');
            report.councilorCount++;
        }

        if (roles.length > 1) {
            report.dualProfessionUsers.push({
                userId,
                name,
                roles: roles.join(', ')
            });
        }
    });

    console.log(`\n清查完畢，共檢查了 ${report.totalChecked} 位玩家資料。`);
    console.log(`軍人總數: ${report.militaryCount}`);
    console.log(`出家人總數: ${report.monkCount}`);
    console.log(`警察總數: ${report.policeCount}`);
    console.log(`黑幫總數: ${report.mafiaCount}`);
    console.log(`市議員總數: ${report.councilorCount}`);
    console.log(`\n發現 ${report.dualProfessionUsers.length} 位玩家擁有雙重(或多重)職業：`);
    
    report.dualProfessionUsers.forEach((u, i) => {
        console.log(`${i + 1}. [${u.name}] (ID: ${u.userId}) - 擁有職業: ${u.roles}`);
    });
    
    process.exit(0);
}

checkDualProfessions().catch(e => {
    console.error('查詢發生錯誤:', e);
    process.exit(1);
});
