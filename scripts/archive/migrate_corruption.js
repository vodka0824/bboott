const { db, connectDB } = require('./utils/db');

async function run() {
    try {
        await connectDB();
        console.log('--- 🚀 開始執行議員貪污值資料遷移 🚀 ---');
        
        const snapshot = await db.collection('economy_users').get();
        const now = Date.now();
        let totalUpdated = 0;
        
        const batch = db.batch();
        
        snapshot.forEach(doc => {
            const data = doc.data();
            const hasCouncilor = data.councilorUntil && data.councilorUntil > now;
            
            // 只有現任議員需要補上
            if (hasCouncilor) {
                // 如果已經有 corruptionLevel，我們就不覆蓋，除非它是 undefined
                if (data.corruptionLevel !== undefined) {
                    console.log(`[跳過] 玩家 ${data.displayName || data.name || doc.id} 已有貪污值: ${(data.corruptionLevel * 100).toFixed(0)}%`);
                    return;
                }
                
                let corruption = 0;
                let reasons = [];
                
                // 1. 詐領助理費歷史 (embezzleRisk.rate 每次成功增加 5%，貪污值每次增加 3%)
                if (data.embezzleRisk && data.embezzleRisk.rate > 0) {
                    const rate = data.embezzleRisk.rate;
                    const count = Math.round(rate / 0.05);
                    const embezzleCorruption = count * 0.03;
                    corruption += embezzleCorruption;
                    reasons.push(`詐領助理費風險 ${Math.round(rate * 100)}% (反推成功 ${count} 次, 貪污值 +${(embezzleCorruption * 100).toFixed(0)}%)`);
                }
                
                // 2. 圍標歷史 (因為以往沒有計數器，如果 lastRigBid 存在，我們至少補 1 次圍標，即 10%)
                if (data.lastRigBid && data.lastRigBid > 0) {
                    corruption += 0.10;
                    reasons.push(`有圍標工程記錄 (貪污值 +10%)`);
                }
                
                if (corruption > 0) {
                    // 控制在合理的浮點數精度
                    corruption = parseFloat(corruption.toFixed(4));
                    const docRef = db.collection('economy_users').doc(doc.id);
                    batch.update(docRef, { corruptionLevel: corruption });
                    totalUpdated++;
                    console.log(`[更新] 玩家: ${data.displayName || data.name || doc.id}`);
                    console.log(`  - 原因: ${reasons.join(' ＋ ')}`);
                    console.log(`  - 補齊貪污值為: ${(corruption * 100).toFixed(0)}%`);
                } else {
                    console.log(`[略過] 議員: ${data.displayName || data.name || doc.id} 無歷史貪污行為，貪污值保持為 0%`);
                }
            }
        });
        
        if (totalUpdated > 0) {
            await batch.commit();
            console.log(`\n✅ 遷移完成！共更新了 ${totalUpdated} 位議員的貪污值。`);
        } else {
            console.log('\n無須更新任何議員的資料。');
        }
        
        process.exit(0);
    } catch (e) {
        console.error('❌ 執行資料遷移失敗:', e);
        process.exit(1);
    }
}

run();
