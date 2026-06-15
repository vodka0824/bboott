require('dotenv').config();
const { db } = require('./utils/db');
const equipmentHandler = require('./handlers/equipment');
const rpgHandler = require('./handlers/rpg');
const lineUtils = require('./utils/line');

const TEST_USER = 'Utestrpguser99999999999999999999';
const TEST_GROUP = 'Gtestrpggroup999999999999999999';

// Mock lineUtils
lineUtils.replyText = async (replyToken, text) => {
    console.log(`========================================`);
    console.log(`[MOCK LINE REPLY - ${replyToken}]`);
    console.log(text);
    console.log(`========================================\n`);
    return true;
};

lineUtils.replyFlex = async (replyToken, altText, flex) => {
    console.log(`========================================`);
    console.log(`[MOCK LINE FLEX REPLY - ${replyToken}]`);
    console.log(JSON.stringify(flex, null, 2));
    console.log(`========================================\n`);
    return true;
};

async function setupTestUser() {
    console.log('正在初始化測試玩家的哭幣、屬性與裝備資訊...');
    
    // 初始化哭幣 (給予 1,000 元)
    await db.collection('economy_users').doc(TEST_USER).set({
        kuCoin: 1000,
        name: '測試裝備勇者'
    }, { merge: true });

    // 初始化 RPG 基礎屬性 (ATK: 10, DEF: 5, EVA: 5, CRIT: 5)
    await db.collection('players').doc(TEST_USER).set({
        rpg: {
            atk: 10,
            def: 5,
            eva: 5,
            crit: 5
        },
        equipments: {
            weapon: null,
            shield: null,
            wings: null,
            gloves: null
        },
        scrolls: {
            weapon: 0,
            armor: 0,
            accessory: 0
        }
    }, { merge: true });

    console.log('測試玩家初始化完成。\n');
}

async function runTests() {
    await setupTestUser();

    console.log('--- 測試 1: 顯示裝備店文字目錄 ---');
    await equipmentHandler.showEquipmentShop('shop_reply');

    console.log('--- 測試 2: 購買武器3 (價格 3 元，初始攻擊 +3) ---');
    await equipmentHandler.buyEquipment('buy_reply_1', '購買 武器3', TEST_USER, TEST_GROUP);

    let doc = await db.collection('players').doc(TEST_USER).get();
    let data = doc.data();
    console.log(`[購買後] 武器：`, data.equipments.weapon);

    console.log('\n--- 測試 3: 購買武器5 (覆蓋原本武器3，價格 5 元) ---');
    await equipmentHandler.buyEquipment('buy_reply_2', '購買 武器5', TEST_USER, TEST_GROUP);
    
    doc = await db.collection('players').doc(TEST_USER).get();
    data = doc.data();
    console.log(`[購買後] 武器：`, data.equipments.weapon);

    console.log('\n--- 測試 4: 買武器卷軸 10 張 (價格 10 元) ---');
    await equipmentHandler.buyScrolls('buy_scrolls_reply', '買卷軸 武卷 10', TEST_USER, TEST_GROUP);

    console.log('\n--- 測試 5: 連續強化武器 4 次 (安全期，應 100% 成功至 +4) ---');
    for (let i = 0; i < 4; i++) {
        console.log(`>> 進行第 ${i + 1} 次強化...`);
        await equipmentHandler.enchantEquipment(`enchant_reply_${i + 1}`, '強化 武器', TEST_USER);
    }

    doc = await db.collection('players').doc(TEST_USER).get();
    data = doc.data();
    console.log(`[四次強化後] 武器：`, data.equipments.weapon);
    console.log(`[四次強化後] 剩餘卷軸：`, data.scrolls.weapon);

    console.log('\n--- 測試 6: 驗證 RPG 狀態屬性累加與上限防禦 ---');
    // 此時武器是 +4 武器5，攻擊力加成應為 5 + 4 = 9。
    // 基礎攻擊為 10，所以最終攻擊應為 10 + 9 = 19。
    // 讓我們順便買一件 +0 手套5 (爆擊+5，基礎 5，最終 10)
    await equipmentHandler.buyEquipment('buy_gloves_reply', '購買 手套5', TEST_USER, TEST_GROUP);
    
    const finalStats = await rpgHandler.getFinalPlayerStats(TEST_USER);
    console.log('計算所得之最終屬性數據：');
    console.log('- 攻擊力 (ATK)：', finalStats.final.atk, `(預期: 19 = 基礎 10 + 裝備 9)`);
    console.log('- 爆擊率 (CRT)：', finalStats.final.crit, `(預期: 10 = 基礎 5 + 裝備 5)`);
    
    console.log('\n--- 測試 7: 顯示個人狀態面板 flex ---');
    await rpgHandler.handleMyStats({
        replyToken: 'status_reply',
        userId: TEST_USER,
        groupId: TEST_GROUP
    });

    console.log('\n--- 測試 8: 繼續強化直到爆裝 (測試爆裝邏輯) ---');
    let broken = false;
    for (let i = 0; i < 15; i++) {
        doc = await db.collection('players').doc(TEST_USER).get();
        if (!doc.data().equipments.weapon) {
            broken = true;
            console.log('💥 武器已被強化碎裂消失！爆裝邏輯驗證成功！');
            break;
        }
        console.log(`>> 進行挑戰更高強化 (+${doc.data().equipments.weapon.level} 衝 +${doc.data().equipments.weapon.level + 1})...`);
        await equipmentHandler.enchantEquipment(`high_enchant_${i}`, '強化 武器', TEST_USER);
    }
    
    if (!broken) {
        // 運氣太好，衝到了極高
        doc = await db.collection('players').doc(TEST_USER).get();
        console.log('🍀 玩家運氣逆天，最終武器強化狀態為：', doc.data().equipments.weapon);
    }

    // 清理測試帳號
    console.log('\n正在清理測試帳號資料...');
    await db.collection('economy_users').doc(TEST_USER).delete();
    await db.collection('players').doc(TEST_USER).delete();
    console.log('測試完成！');
    process.exit(0);
}

runTests().catch(err => {
    console.error('測試發生錯誤:', err);
    process.exit(1);
});
