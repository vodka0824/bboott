require('dotenv').config();
const { db, connectDB } = require('../utils/db');
const economyHandler = require('../handlers/economy');
const profession = require('../handlers/profession');
const lineUtils = require('../utils/line');
const COLLECTION_NAME = 'economy_users';

// 備份原始的 Math.random
const originalRandom = Math.random;

// Mock LINE 回覆
let replyPayloads = [];
lineUtils.replyToLine = async (token, payloads) => {
    replyPayloads.push(...payloads);
};
lineUtils.getGroupMemberName = async (groupId, userId) => {
    const names = {
        'TEST_BOSS': '測試老大',
        'TEST_MAFIA_1': '黑幫小弟A',
        'TEST_CIVILIAN': '通緝平民'
    };
    return names[userId] || '玩家';
};

async function setupTestData() {
    await connectDB();
    const batch = db.batch();
    
    // 1. TEST_BOSS: 黑幫成員，通緝值 9999.0，有老大資格
    batch.set(db.collection(COLLECTION_NAME).doc('TEST_BOSS'), {
        wantedLevel: 9999.0,
        isMafia: true,
        crimeRecord: 5,
        displayName: '測試老大',
        kuCoin: 1000000
    });

    // 2. TEST_MAFIA_1: 黑幫成員，通緝值 0.5，普通成員
    batch.set(db.collection(COLLECTION_NAME).doc('TEST_MAFIA_1'), {
        wantedLevel: 0.5,
        isMafia: true,
        crimeRecord: 3,
        displayName: '黑幫小弟A',
        kuCoin: 500000
    });

    // 3. TEST_CIVILIAN: 平民，通緝值 10000.0 (全場最高)，無老大資格
    batch.set(db.collection(COLLECTION_NAME).doc('TEST_CIVILIAN'), {
        wantedLevel: 10000.0,
        isMafia: false,
        crimeRecord: 10,
        displayName: '通緝平民',
        kuCoin: 100000
    });

    await batch.commit();
    
    // Dump 真實資料庫的內容進行驗證
    const allUsers = await db.collection(COLLECTION_NAME).get();
    console.log(`[Debug DB] 目前資料庫中有 ${allUsers.size} 筆 users 文件:`);
    allUsers.forEach(doc => {
        console.log(`  - ID: ${doc.id}, data:`, doc.data());
    });
    // 清除快取，確保測試抓到真實資料
    profession.clearWantedListCache();
    profession.clearProfessionCache('TEST_BOSS');
    profession.clearProfessionCache('TEST_MAFIA_1');
    profession.clearProfessionCache('TEST_CIVILIAN');
    console.log('✅ 測試資料初始化與快取清理完成。');
}

async function cleanTestData() {
    await connectDB();
    const batch = db.batch();
    batch.delete(db.collection(COLLECTION_NAME).doc('TEST_BOSS'));
    batch.delete(db.collection(COLLECTION_NAME).doc('TEST_MAFIA_1'));
    batch.delete(db.collection(COLLECTION_NAME).doc('TEST_CIVILIAN'));
    await batch.commit();
    profession.clearWantedListCache();
    profession.clearProfessionCache('TEST_BOSS');
    profession.clearProfessionCache('TEST_MAFIA_1');
    profession.clearProfessionCache('TEST_CIVILIAN');
    console.log('🧹 測試資料清理完成。');
}

async function runTest() {
    try {
        await setupTestData();

        console.log('\n===== 測試 1：驗證老大資格篩選 (黑幫成員才具備資格) =====');
        const mafiaBoss = await profession.getMafiaBoss();
        
        console.log('🕵️ 讀取到的老大資料:');
        if (mafiaBoss) {
            console.log(`  - 用戶 ID: ${mafiaBoss.userId} (預期: TEST_BOSS)`);
            console.log(`  - 名字: ${mafiaBoss.name}`);
            console.log(`  - 通緝值: ${mafiaBoss.wantedLevel} (預期: 9999)`);
        } else {
            console.log('  - 無');
        }
        
        let bossCheckPassed = mafiaBoss && mafiaBoss.userId === 'TEST_BOSS';
        console.log(`  => 驗證結果: ${bossCheckPassed ? '🟢 通過' : '🔴 失敗'}`);

        console.log('\n===== 測試 2：驗證職業頭銜輸出 =====');
        const bossTitle = await profession.getProfessionTitle('TEST_BOSS');
        const civilianTitle = await profession.getProfessionTitle('TEST_CIVILIAN');
        const mafia1Title = await profession.getProfessionTitle('TEST_MAFIA_1');

        console.log(`  - TEST_BOSS 職業稱號: "${bossTitle}" (預期包含 "[黑道老大]")`);
        console.log(`  - TEST_CIVILIAN 職業稱號: "${civilianTitle}" (預期不包含 "[黑道老大]")`);
        console.log(`  - TEST_MAFIA_1 職業稱號: "${mafia1Title}" (預期為 "[黑道小弟]")`);

        let titlePassed = bossTitle.includes('[黑道老大]') && !civilianTitle.includes('[黑道老大]') && mafia1Title === '[黑道小弟]';
        console.log(`  => 驗證結果: ${titlePassed ? '🟢 通過' : '🔴 失敗'}`);

        console.log('\n===== 測試 3：驗證黑幫階級 (getMafiaRank) =====');
        const bossDoc = await db.collection(COLLECTION_NAME).doc('TEST_BOSS').get();
        const civilianDoc = await db.collection(COLLECTION_NAME).doc('TEST_CIVILIAN').get();
        const mafia1Doc = await db.collection(COLLECTION_NAME).doc('TEST_MAFIA_1').get();

        const bossRank = await profession.getMafiaRank('TEST_BOSS', bossDoc.data());
        const civilianRank = await profession.getMafiaRank('TEST_CIVILIAN', civilianDoc.data());
        const mafia1Rank = await profession.getMafiaRank('TEST_MAFIA_1', mafia1Doc.data());

        console.log(`  - TEST_BOSS 階級: ${bossRank} (預期: "boss")`);
        console.log(`  - TEST_CIVILIAN 階級: ${civilianRank} (預期: null)`);
        console.log(`  - TEST_MAFIA_1 階級: ${mafia1Rank} (預期: "thug")`);

        let rankPassed = bossRank === 'boss' && civilianRank === null && mafia1Rank === 'thug';
        console.log(`  => 驗證結果: ${rankPassed ? '🟢 通過' : '🔴 失敗'}`);

        console.log('\n===== 測試 4：聚賭被抓頂罪機制 (應由真實老大頂罪，非通緝最高之平民) =====');
        
        // 1. 更新 wantedLevel 為小於 1.0 的值，避免觸發「趁亂逃跑」
        const updateBatch = db.batch();
        updateBatch.update(db.collection(COLLECTION_NAME).doc('TEST_BOSS'), { wantedLevel: 0.8 });
        updateBatch.update(db.collection(COLLECTION_NAME).doc('TEST_CIVILIAN'), { wantedLevel: 0.9 });
        await updateBatch.commit();
        
        // 2. 清除快取並 Mock getMafiaBoss
        profession.clearWantedListCache();
        const originalGetMafiaBoss = profession.getMafiaBoss;
        profession.getMafiaBoss = async () => {
            return { userId: 'TEST_BOSS', name: '測試老大', crimeRecord: 5, wantedLevel: 0.8, isMafia: true };
        };

        // Mock Math.random() 回傳值
        // 1. 決定是否被捕：rand < totalWantedProbability (0.8 + 0.5 + 0.9 = 2.2)
        //    傳入 0.5 (< 2.2) -> 觸發被捕。
        // 2. 老大頂罪判定：Math.random() < 0.70
        //    傳入 0.2 (< 0.7) -> 觸發頂罪。
        // 3. 後續的玩家一般逃跑判定：
        //    傳入 0.99 (不逃跑)
        const randomMockSequence = [0.5, 0.2, 0.99, 0.99, 0.99, 0.99];
        let mockIdx = 0;
        Math.random = () => {
            const val = mockIdx < randomMockSequence.length ? randomMockSequence[mockIdx++] : originalRandom();
            return val;
        };

        replyPayloads = [];
        await economyHandler.triggerPublicGamblingEvent(
            'G_TEST_GROUP', 
            ['TEST_BOSS', 'TEST_MAFIA_1', 'TEST_CIVILIAN'], 
            'MOCK_REPLY_TOKEN'
        );

        // 還原 Math.random 與 getMafiaBoss Mock
        Math.random = originalRandom;
        profession.getMafiaBoss = originalGetMafiaBoss;

        // 讀取更新後資料
        const bossDocAfter = await db.collection(COLLECTION_NAME).doc('TEST_BOSS').get();
        const civilianDocAfter = await db.collection(COLLECTION_NAME).doc('TEST_CIVILIAN').get();
        const mafia1DocAfter = await db.collection(COLLECTION_NAME).doc('TEST_MAFIA_1').get();

        const bData = bossDocAfter.data();
        const cData = civilianDocAfter.data();
        const m1Data = mafia1DocAfter.data();

        console.log('  - TEST_BOSS (老大) 狀態:');
        console.log(`    * 通緝值: ${bData.wantedLevel} (預期: 0.8，因有人頂罪而未折半且未入獄)`);
        console.log(`    * 坐牢狀態: ${bData.jailedUntil ? '入獄' : '未入獄'} (預期: 未入獄)`);

        console.log('  - TEST_MAFIA_1 (頂罪小弟) 狀態:');
        console.log(`    * 通緝值: ${m1Data.wantedLevel} (預期: 0.25，入獄通緝折半)`);
        console.log(`    * 前科數: ${m1Data.crimeRecord} (預期: 4，因頂罪前科 +1)`);
        console.log(`    * 坐牢狀態: ${m1Data.jailedUntil ? '入獄' : '未入獄'} (預期: 入獄)`);

        console.log('  - TEST_CIVILIAN (平民犯罪者) 狀態:');
        console.log(`    * 通緝值: ${cData.wantedLevel} (預期: 0.45，平民聚賭入獄通緝折半)`);
        console.log(`    * 前科數: ${cData.crimeRecord} (預期: 10，一般入獄不加前科)`);
        console.log(`    * 坐牢狀態: ${cData.jailedUntil ? '入獄' : '未入獄'} (預期: 入獄)`);

        let eventPassed = (
            bData.wantedLevel === 0.8 && !bData.jailedUntil &&
            m1Data.wantedLevel === 0.25 && m1Data.jailedUntil && m1Data.crimeRecord === 4 &&
            cData.wantedLevel === 0.45 && cData.jailedUntil && cData.crimeRecord === 10
        );
        console.log(`  => 驗證結果: ${eventPassed ? '🟢 通過' : '🔴 失敗'}`);

        if (bossCheckPassed && titlePassed && rankPassed && eventPassed) {
            console.log('\n🎉 所有測試項目全部 🟢 通過！');
        } else {
            console.log('\n❌ 部份測試項目 🔴 失敗！');
        }

    } catch (e) {
        console.error('❌ 測試執行出錯:', e);
    } finally {
        await cleanTestData();
        process.exit(0);
    }
}

runTest();
