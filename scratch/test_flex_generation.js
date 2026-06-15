const path = require('path');

// 設定測試環境變數以防常數驗證錯誤
process.env.CHANNEL_ACCESS_TOKEN = 'mock_channel_access_token';
process.env.ADMIN_USER_ID = 'mock_admin_user_id';

// 1. 劫持 lineUtils
const lineMockPath = path.resolve(__dirname, '../utils/line.js');
const lineMock = {
    getGroupMemberName: async () => '測試玩家[一般市民]',
    replyFlex: async (token, alt, flex) => {
        console.log(`\n==================================================`);
        console.log(`🟢 REPLY FLEX [AltText: ${alt}]`);
        console.log(`==================================================`);
        console.log(JSON.stringify(flex, null, 2));
    },
    replyText: async (token, text) => {
        console.log(`\n==================================================`);
        console.log(`💬 REPLY TEXT`);
        console.log(`==================================================`);
        console.log(text);
    },
    replyToLine: async (token, messages) => {
        console.log(`\n==================================================`);
        console.log(`🟢 REPLY TO LINE [Messages Count: ${messages.length}]`);
        console.log(`==================================================`);
        console.log(JSON.stringify(messages, null, 2));
    }
};
require.cache[lineMockPath] = {
    id: lineMockPath,
    filename: lineMockPath,
    loaded: true,
    exports: lineMock
};

// 2. 劫持 db
const dbMockPath = path.resolve(__dirname, '../utils/db.js');
const dbMock = {
    db: {
        runTransaction: async (fn) => {
            const t = {
                get: async () => ({
                    exists: true,
                    data: () => ({
                        kuCoin: 100000000,
                        isMafia: true,
                        isPolice: true,
                        crimeRecord: 5,
                        wantedLevel: 1.5,
                        jailedUntil: Date.now() + 60 * 60 * 1000, // 剩餘 60 分鐘
                        displayName: '測試玩家',
                        blowCooldownUntil: 0,
                        laborCooldownUntil: 0,
                        soapCooldownUntil: 0,
                        councilorUntil: Date.now() + 10 * 24 * 60 * 60 * 1000, // 10天後到期
                        councilorPressureToken: 1
                    })
                }),
                update: () => {},
                delete: () => {},
                set: () => {}
            };
            return fn(t);
        },
        collection: (colName) => ({
            doc: () => ({
                get: async () => ({
                    exists: true,
                    data: () => {
                        if (colName === 'groups') {
                            return {
                                welcomeConfig: {
                                    imageUrl: 'http://localhost:8080/public/welcome-images/custom_hero.png',
                                    aspectRatio: '1:1',
                                    text: '歡迎 {user} 加入我們！'
                                }
                            };
                        }
                        return {
                            kuCoin: 100000000,
                            isMafia: true,
                            isPolice: true,
                            crimeRecord: 5,
                            wantedLevel: 1.5,
                            jailedUntil: Date.now() + 60 * 60 * 1000,
                            displayName: '測試玩家',
                            hasShiv: true,
                            councilorUntil: Date.now() + 10 * 24 * 60 * 60 * 1000,
                            councilorPressureToken: 1
                        };
                    }
                }),
                update: async () => {}
            }),
            orderBy: () => ({
                limit: () => ({
                    get: async () => {
                        const docs = [
                            {
                                id: 'player1',
                                data: () => ({
                                    displayName: '富豪玩家',
                                    kuCoin: 200000000,
                                    totalBetAmount: 50000000,
                                    gambleCount: 15,
                                    isMafia: false,
                                    isPolice: false
                                })
                            }
                        ];
                        docs.forEach = (cb) => docs.forEach(cb);
                        return { empty: false, docs };
                    }
                })
            }),
            where: () => ({
                limit: () => ({
                    get: async () => {
                        const docs = [];
                        // 模擬被收保護費的普通市民
                        const mockDoc = {
                            id: 'victim123',
                            data: () => ({
                                displayName: '受害者小明',
                                kuCoin: 5000000,
                                isPolice: false,
                                isMafia: false
                            })
                        };
                        docs.push(mockDoc);
                        docs.forEach = (cb) => docs.forEach(cb);
                        return docs;
                    }
                }),
                orderBy: () => ({
                    limit: () => ({
                        get: async () => {
                            const docs = [
                                {
                                    id: 'debtor1',
                                    data: () => ({
                                        displayName: '欠債玩家',
                                        kuCoin: -5000000,
                                        isMafia: true,
                                        crimeRecord: 4
                                    })
                                }
                            ];
                            docs.forEach = (cb) => docs.forEach(cb);
                            return { empty: false, docs };
                        }
                    })
                })
            })
        }),
        FieldValue: {
            increment: (val) => val,
            delete: () => 'DELETE_FIELD'
        }
    }
};
require.cache[dbMockPath] = {
    id: dbMockPath,
    filename: dbMockPath,
    loaded: true,
    exports: dbMock
};

// 3. 劫持 profession
const profMockPath = path.resolve(__dirname, '../handlers/profession.js');
const profMock = {
    getMafiaRank: async () => 'boss',
    getWantedList: async () => [{ userId: 'user123', displayName: '黑道老大' }],
    clearProfessionCache: () => {},
    clearWantedListCache: () => {},
    getMafiaBoss: async () => ({ userId: 'user123', displayName: '黑道老大' }),
    getProfessionTitle: async () => '[黑道老大]'
};
require.cache[profMockPath] = {
    id: profMockPath,
    filename: profMockPath,
    loaded: true,
    exports: profMock
};

// 載入處理器
const mafiaHandler = require('../handlers/mafia');
const jailHandler = require('../handlers/jail');
const policeHandler = require('../handlers/police');

async function runTests() {
    const mockContext = {
        userId: 'user123',
        groupId: 'group123',
        replyToken: 'mockToken'
    };

    console.log('🚀 開始 Flex Message UI 生成測試...');

    // === Mafia ===
    console.log('\n--- 測試：收保護費 ---');
    await mafiaHandler.handleProtectionFee('mockToken', mockContext);

    console.log('\n--- 測試：勒索政客 ---');
    await mafiaHandler.handleExtortCouncilors('mockToken', mockContext);

    // === Police ===
    console.log('\n--- 測試：警察辭職 ---');
    await policeHandler.handleResignPolice('mockToken', mockContext);

    // === Jail ===
    console.log('\n--- 測試：吹喇叭 (減刑) ---');
    // 修改 mock 交易，使其必定減刑
    await jailHandler.handleBlowWarden('mockToken', mockContext);

    console.log('\n--- 測試：勞動改造 ---');
    await jailHandler.handleLabor('mockToken', mockContext);

    console.log('\n--- 測試：撿肥皂 ---');
    await jailHandler.handleDropSoap('mockToken', mockContext);

    console.log('\n--- 測試：探監 ---');
    // Mock messageObject 帶標記
    const mockMsgObj = {
        mention: {
            mentionees: [{ userId: 'target123' }]
        }
    };
    await jailHandler.handleVisit('mockToken', mockContext, mockMsgObj);

    console.log('\n--- 測試：交保成功 ---');
    await jailHandler.confirmBail('mockToken', mockContext, 5000000);

    console.log('\n--- 測試：保釋他人成功 ---');
    await jailHandler.confirmBailOther('mockToken', mockContext, 'target123', 5000000);

    console.log('\n--- 測試：賄賂成功/失敗 ---');
    await jailHandler.confirmBribe('mockToken', mockContext, 5000000);

    console.log('\n--- 測試：施壓出獄 ---');
    await jailHandler.handlePressure('mockToken', mockContext);

    console.log('\n--- 測試：歡迎新成員 (本地開發/無 BASE_URL) ---');
    process.env.BASE_URL = 'http://localhost:8080';
    const welcomeHandler = require('../handlers/welcome');
    await welcomeHandler.sendTestWelcome('mockToken', 'group123', 'user123');

    console.log('\n--- 測試：歡迎新成員 (帶 http 的 ngrok 網址) ---');
    process.env.BASE_URL = 'http://myngrok.ngrok-free.app';
    await welcomeHandler.sendTestWelcome('mockToken', 'group123', 'user123');

    console.log('\n--- 測試：歡迎新成員 (帶 https 的正規 ngrok 網址) ---');
    process.env.BASE_URL = 'https://myngrok.ngrok-free.app';
    await welcomeHandler.sendTestWelcome('mockToken', 'group123', 'user123');

    console.log('\n--- 測試：個人通緝狀態 ---');
    const economyHandler = require('../handlers/economy');
    await economyHandler.queryWantedLevel('mockToken', 'group123', 'user123');

    console.log('\n--- 測試：議員圍標 (handleRigBidding) ---');
    await economyHandler.handleRigBidding('mockToken', mockContext);

    console.log('\n--- 測試：議員詐領助理費 (handleEmbezzle) ---');
    await economyHandler.handleEmbezzle('mockToken', mockContext);

    console.log('\n--- 測試：購買裝備 (buyEquipmentPostback) ---');
    const equipmentHandler = require('../handlers/equipment');
    await equipmentHandler.buyEquipmentPostback('mockToken', 'weapon', 'sword', 'user123', 'group123');

    console.log('\n--- 測試：購買卷軸 (buyScrollsPostback) ---');
    await equipmentHandler.buyScrollsPostback('mockToken', 'weapon', 5, 'user123', 'group123');

    console.log('\n--- 測試：買回並直升+4 (buyAndSafeEnchantPostback) ---');
    await equipmentHandler.buyAndSafeEnchantPostback('mockToken', 'weapon', 'main', 'sword', 'user123', 'group123', 'req123');

    console.log('\n--- 測試：21點開始遊戲 (startGame) ---');
    const blackjackHandler = require('../handlers/blackjack');
    await blackjackHandler.startGame('mockToken', mockContext, '1000');

    console.log('\n--- 測試：綜合排行榜 (showAllLeaderboards) ---');
    await economyHandler.showAllLeaderboards('mockToken');

    console.log('\n--- 測試：冷卻時間查詢 (checkCooldowns) ---');
    await economyHandler.checkCooldowns('mockToken', 'group123', 'user123');

    console.log('\n🏁 測試完成！');
}

runTests().catch(console.error);
