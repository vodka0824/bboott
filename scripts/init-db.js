#!/usr/bin/env node
/**
 * 本機資料庫一鍵初始化腳本
 * 
 * 用途：在本機 Docker 環境中，直接建立管理員帳號與群組授權，
 *       省去「產生註冊碼 → 輸入註冊碼」的繁瑣手動步驟。
 * 
 * 使用方式（在 Ubuntu 終端機執行）：
 *   基本初始化（僅設定管理員）：
 *     docker compose exec app node scripts/init-db.js
 * 
 *   同時開通特定群組：
 *     docker compose exec app node scripts/init-db.js C1234567890abcdef
 * 
 *   開通多個群組：
 *     docker compose exec app node scripts/init-db.js C111 C222 C333
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://db:27017';
const DB_NAME = process.env.MONGODB_DB_NAME || 'linebot';
const ADMIN_USER_ID = process.env.ADMIN_USER_ID;

if (!ADMIN_USER_ID) {
    console.error('❌ 錯誤：未設定 ADMIN_USER_ID 環境變數！請檢查 .env 檔案。');
    process.exit(1);
}

// 群組的預設功能開關（所有功能全部開啟）
const DEFAULT_FEATURES = {
    life: {
        enabled: true,
        news: true,
        finance: true,
        weather: true,
        food: true,
        delivery: true,
        horoscope: true
    },
    entertainment: {
        enabled: true,
        voice: true,
        fun: true,
        leaderboard: true
    },
    todo: {
        enabled: true
    }
};

async function main() {
    const client = new MongoClient(MONGODB_URI);
    
    try {
        await client.connect();
        console.log('✅ 成功連線至 MongoDB\n');
        
        const db = client.db(DB_NAME);
        const now = new Date();

        // =============================================
        // 1. 設定超級管理員
        // =============================================
        console.log(`📋 步驟 1：設定超級管理員 (${ADMIN_USER_ID})`);
        await db.collection('admins').updateOne(
            { _id: ADMIN_USER_ID },
            {
                $set: {
                    addedAt: now,
                    addedBy: 'init-script',
                    note: '系統初始化時自動建立的超級管理員'
                }
            },
            { upsert: true }
        );
        console.log(`   ✅ 管理員 ${ADMIN_USER_ID} 已設定完成\n`);

        // =============================================
        // 2. 開通指定群組
        // =============================================
        const groupIds = process.argv.slice(2); // 從命令列引數取得群組 ID

        if (groupIds.length === 0) {
            console.log('📋 步驟 2：未指定群組 ID，跳過群組授權。');
            console.log('   💡 提示：若要開通群組，請執行：');
            console.log('      docker compose exec app node scripts/init-db.js <你的GROUP_ID>\n');
        } else {
            console.log(`📋 步驟 2：開通 ${groupIds.length} 個群組`);
            
            for (const groupId of groupIds) {
                await db.collection('groups').updateOne(
                    { _id: groupId },
                    {
                        $set: {
                            status: 'active',
                            authorizedAt: now,
                            authorizedBy: ADMIN_USER_ID,
                            codeUsed: 'init-script',
                            features: DEFAULT_FEATURES
                        }
                    },
                    { upsert: true }
                );
                console.log(`   ✅ 群組 ${groupId} 已授權開通（所有功能已啟用）`);
            }
            console.log('');
        }

        // =============================================
        // 3. 確認目前資料庫狀態
        // =============================================
        console.log('📊 目前資料庫狀態：');

        const adminCount = await db.collection('admins').countDocuments();
        console.log(`   👑 管理員數量：${adminCount}`);

        const activeGroups = await db.collection('groups').find({ status: 'active' }).toArray();
        console.log(`   🏠 已授權群組數量：${activeGroups.length}`);
        
        if (activeGroups.length > 0) {
            activeGroups.forEach(g => {
                console.log(`      - ${g._id}`);
            });
        }

        console.log('\n🎉 初始化完成！LINE Bot 本機資料庫已就緒。');
        console.log('');
        console.log('接下來的步驟：');
        console.log('  1. 確認 ngrok 仍在運行');
        console.log('  2. 在 LINE Developers Console 確認 Webhook URL 已設定');
        console.log('  3. 進入已授權的 LINE 群組，輸入「查詢功能」確認是否正常回應');

    } catch (error) {
        console.error('❌ 初始化失敗：', error.message);
        console.error(error);
        process.exit(1);
    } finally {
        await client.close();
    }
}

main();
