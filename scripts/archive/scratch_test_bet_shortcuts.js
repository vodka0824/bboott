require('dotenv').config();

// 準備 mock handlers
const mockNiuNiuTable = { status: 'waiting' };
const mockBlackjackTable = { status: 'waiting' };
const calls = [];

const mockMultiNiuNiu = {
    getActiveTable: (groupId) => {
        return groupId === 'niuniu_group' ? mockNiuNiuTable : null;
    },
    placeBet: async (replyToken, ctx, amt) => {
        calls.push(`niuniu_placeBet_${amt}`);
        console.log(`[Mock MultiNiuNiu] placeBet called with amount: ${amt}`);
    },
    dealCards: async (replyToken, ctx) => {
        calls.push('niuniu_dealCards');
        console.log('[Mock MultiNiuNiu] dealCards called');
    }
};

const mockMultiBlackjack = {
    getActiveTable: (groupId) => {
        return groupId === 'blackjack_group' ? mockBlackjackTable : null;
    },
    placeBet: async (replyToken, ctx, amt) => {
        calls.push(`blackjack_placeBet_${amt}`);
        console.log(`[Mock MultiBlackjack] placeBet called with amount: ${amt}`);
    },
    dealCards: async (replyToken, ctx) => {
        calls.push('blackjack_dealCards');
        console.log('[Mock MultiBlackjack] dealCards called');
    },
    playerHit: async (replyToken, ctx) => {
        calls.push('blackjack_playerHit');
        console.log('[Mock MultiBlackjack] playerHit called');
    }
};

const mockBlackjack = {
    hit: async (replyToken, ctx) => {
        calls.push('single_blackjack_hit');
        console.log('[Mock SingleBlackjack] hit called');
    }
};

// 搶先寫入 require.cache 進行 Mock
const multiNiuNiuPath = require.resolve('./handlers/multi_niuniu');
const multiBlackjackPath = require.resolve('./handlers/multi_blackjack');
const blackjackPath = require.resolve('./handlers/blackjack');

require.cache[multiNiuNiuPath] = {
    id: multiNiuNiuPath,
    filename: multiNiuNiuPath,
    loaded: true,
    exports: mockMultiNiuNiu
};
require.cache[multiBlackjackPath] = {
    id: multiBlackjackPath,
    filename: multiBlackjackPath,
    loaded: true,
    exports: mockMultiBlackjack
};
require.cache[blackjackPath] = {
    id: blackjackPath,
    filename: blackjackPath,
    loaded: true,
    exports: mockBlackjack
};

const router = require('./utils/router');
const lineUtils = require('./utils/line');

// Mock lineUtils
lineUtils.replyText = async (replyToken, text) => {
    console.log(`[MOCK LINE REPLY - ${replyToken}]: ${text}`);
    return true;
};

// 載入 casinoRoutes.js
const registerCasinoRoutes = require('./routes/casinoRoutes');
registerCasinoRoutes(router, {
    lotteryHandler: {},
    slotHandler: {},
    enchantHandler: {},
    lineUtils: lineUtils
});

async function runTests() {
    console.log('=== 開始測試下注、發牌、補牌快捷指令 (與 cache mock 結合) ===\n');

    // 1. 測試下注 +100 / + 100
    console.log('--- 測試 1.1: 群組內下注 +100 (黑傑克) ---');
    await router.execute('+100', {
        message: '+100',
        replyToken: 'bet_1',
        groupId: 'blackjack_group',
        isGroup: true,
        isAuthorizedGroup: true,
        userId: 'user_1'
    });

    console.log('\n--- 測試 1.2: 群組內下注 + 250 (帶空格) (妞妞) ---');
    await router.execute('+ 250', {
        message: '+ 250',
        replyToken: 'bet_2',
        groupId: 'niuniu_group',
        isGroup: true,
        isAuthorizedGroup: true,
        userId: 'user_2'
    });

    // 2. 測試發牌指令 + (等待發牌狀態)
    console.log('\n--- 測試 2.1: 妞妞等待狀態下打 + 發牌 ---');
    mockNiuNiuTable.status = 'waiting';
    await router.execute('+', {
        message: '+',
        replyToken: 'deal_1',
        groupId: 'niuniu_group',
        isGroup: true,
        isAuthorizedGroup: true,
        userId: 'user_3'
    });

    console.log('\n--- 測試 2.2: 21點等待狀態下打 + 發牌 ---');
    mockBlackjackTable.status = 'waiting';
    await router.execute('+', {
        message: '+',
        replyToken: 'deal_2',
        groupId: 'blackjack_group',
        isGroup: true,
        isAuthorizedGroup: true,
        userId: 'user_4'
    });

    // 3. 測試補牌指令 + (遊戲進行狀態)
    console.log('\n--- 測試 3.1: 21點進行狀態下打 + 補牌 ---');
    mockBlackjackTable.status = 'playing';
    await router.execute('+', {
        message: '+',
        replyToken: 'hit_1',
        groupId: 'blackjack_group',
        isGroup: true,
        isAuthorizedGroup: true,
        userId: 'user_5'
    });

    // 4. 測試單機版補牌指令 +
    console.log('\n--- 測試 4.1: 私訊(無群組牌桌)下打 + 補牌 ---');
    await router.execute('+', {
        message: '+',
        replyToken: 'hit_2',
        groupId: 'dm_group',
        isGroup: false,
        userId: 'user_6'
    });

    console.log('\n=== 測試結果驗證 ===');
    console.log('呼叫歷程:', JSON.stringify(calls, null, 2));

    const expectedCalls = [
        'blackjack_placeBet_100',
        'niuniu_placeBet_250',
        'niuniu_dealCards',
        'blackjack_dealCards',
        'blackjack_playerHit',
        'single_blackjack_hit'
    ];

    let passed = true;
    for (let i = 0; i < expectedCalls.length; i++) {
        if (calls[i] !== expectedCalls[i]) {
            passed = false;
            console.log(`❌ 差異：索引 ${i} 預期為 ${expectedCalls[i]}，實際為 ${calls[i]}`);
        }
    }

    if (passed && calls.length === expectedCalls.length) {
        console.log('✅ 測試成功：所有快捷下注、發牌與補牌分支完全正確匹配！');
        process.exit(0);
    } else {
        console.log('❌ 測試失敗：呼叫順序或呼叫次數不符合預期！');
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('測試發生錯誤:', err);
    process.exit(1);
});
