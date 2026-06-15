const { MongoClient } = require('mongodb');
const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = process.env.MONGODB_DB_NAME || 'linebot';

async function run() {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db(dbName);
        
        const targetId = 'Ub9d430ac171216287573a0b9541494dd';
        
        console.log(`--- 調查玩家 ${targetId} 衝裝日誌 ---`);
        
        const logs = await db.collection('log_enchants').find({ userId: targetId }).sort({ timestamp: 1 }).toArray();
        
        console.log(`總共找到 ${logs.length} 筆強化紀錄。`);
        
        if (logs.length === 0) {
            console.log("沒有找到該玩家的強化紀錄。");
            return;
        }
        
        let success = 0;
        let fail = 0;
        let lastTimestamp = null;
        let continuousCheatSuccess = 0;
        
        const partStats = {};
        
        logs.forEach((log, index) => {
            if (log.isSuccess) success++;
            else fail++;
            
            if (!partStats[log.slot]) partStats[log.slot] = { maxLevel: 0, count: 0 };
            partStats[log.slot].count++;
            if (log.newLevel > partStats[log.slot].maxLevel) partStats[log.slot].maxLevel = log.newLevel;
            
            // Just peek at the first 10 and last 10 logs
            if (index < 5 || index > logs.length - 6) {
                const date = log.timestamp ? new Date(log.timestamp).toLocaleString() : 'Unknown Time';
                const resultStr = log.isSuccess ? '成功' : '失敗';
                console.log(`[${date}] ${log.equipName} (+${log.oldLevel} -> +${log.newLevel}) [${resultStr}]`);
                if (index === 4 && logs.length > 10) console.log('...\n[中間省略]\n...');
            }
            
            // Check speed of enchants (if timestamp difference is suspiciously small)
            if (lastTimestamp) {
                const diff = new Date(log.timestamp) - new Date(lastTimestamp);
                if (diff < 1000 && log.isSuccess) {
                    continuousCheatSuccess++;
                }
            }
            lastTimestamp = log.timestamp;
        });
        
        console.log(`\n統計：`);
        console.log(`成功: ${success} 次`);
        console.log(`失敗: ${fail} 次`);
        console.log(`成功率: ${((success / logs.length) * 100).toFixed(2)}%`);
        console.log(`異常連續秒級成功次數: ${continuousCheatSuccess} 次 (這代表使用連點器或腳本大量送出作弊封包)`);
        
        console.log(`\n各部位最高等級：`);
        for (const [slot, stat] of Object.entries(partStats)) {
            console.log(` - 欄位 ${slot}: 最高達到 +${stat.maxLevel} (強化次數: ${stat.count})`);
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

run();
