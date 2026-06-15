const { db, connectDB } = require('../utils/db');

async function run() {
    await connectDB();
    console.log('--- 掃描議員資料與歷史記錄 ---');
    const snapshot = await db.collection('economy_users').get();
    const now = Date.now();
    
    let count = 0;
    snapshot.forEach(doc => {
        const data = doc.data();
        const hasCouncilor = data.councilorUntil && data.councilorUntil > now;
        
        // 只要有 councilorUntil 或是 embezzlement/bidding 相關歷史欄位的人都列出來看
        if (hasCouncilor || data.embezzleRisk || data.corruptionLevel || data.lastRigBid || data.lastEmbezzle) {
            count++;
            console.log(`\n玩家ID: ${doc.id}`);
            console.log(`名字: ${data.displayName || data.name || '未命名'}`);
            console.log(`是否為現任議員: ${hasCouncilor ? '是' : '否'} (到期時間: ${data.councilorUntil ? new Date(data.councilorUntil).toLocaleString() : '無'})`);
            console.log(`目前貪污值 (corruptionLevel): ${data.corruptionLevel !== undefined ? data.corruptionLevel : '未設定'}`);
            console.log(`詐領風險 (embezzleRisk): ${data.embezzleRisk ? JSON.stringify(data.embezzleRisk) : '無'}`);
            console.log(`最後圍標時間 (lastRigBid): ${data.lastRigBid ? new Date(data.lastRigBid).toLocaleString() : '無'}`);
            console.log(`最後詐領時間 (lastEmbezzle): ${data.lastEmbezzle ? new Date(data.lastEmbezzle).toLocaleString() : '無'}`);
            
            // 印出所有其他可能是計數器或相關的欄位
            const keys = Object.keys(data).filter(k => k.toLowerCase().includes('bid') || k.toLowerCase().includes('embezzle') || k.toLowerCase().includes('corrupt') || k.toLowerCase().includes('councilor'));
            if (keys.length > 0) {
                console.log('相關欄位:');
                keys.forEach(k => {
                    console.log(`  - ${k}: ${JSON.stringify(data[k])}`);
                });
            }
        }
    });
    
    console.log(`\n符合條件的玩家數: ${count}`);
    process.exit(0);
}

run().catch(console.error);
