require('dotenv').config();
const { db } = require('./utils/db');
const { queryPlayerProfile, queryWantedLevel, showWantedLeaderboard } = require('./handlers/economy');
const router = require('./utils/router');
const lineUtils = require('./utils/line');
const economyRoutes = require('./routes/economyRoutes');

// Mock reply token and ctx
const mockToken = 'mock-reply-token';
const mockGroupId = 'test-group';
const mockUserId = 'test-wanted-user';
const adminUserId = require('./config/constants').ADMIN_USER_ID;

// Mock lineUtils replyFlex/replyText
lineUtils.replyFlex = async (token, altText, flex) => {
    console.log(`[Mock replyFlex] ${altText}`);
    console.dir(flex, { depth: null });
};
lineUtils.replyText = async (token, text) => {
    console.log(`[Mock replyText] ${text}`);
};
lineUtils.getGroupMemberName = async (groupId, userId) => {
    return 'Test User';
};

async function test() {
    console.log("=== Setting up test data ===");
    await db.collection('economy_users').doc(mockUserId).set({ 
        kuCoin: 5000, 
        wantedLevel: 0.15,
        title: '通緝犯',
        devilContractUntil: Date.now() + 1000 * 60 * 60 * 24 // 1 day
    }, { merge: true });

    await db.collection('economy_users').doc('another-user').set({
        kuCoin: 100,
        wantedLevel: 0.8,
        title: '狂徒'
    }, { merge: true });

    console.log("\n=== Test 1: queryPlayerProfile ===");
    await queryPlayerProfile(mockToken, mockGroupId, mockUserId, mockUserId);

    console.log("\n=== Test 2: queryWantedLevel ===");
    await queryWantedLevel(mockToken, mockGroupId, mockUserId);

    console.log("\n=== Test 3: queryWantedLevel (Admin) ===");
    await queryWantedLevel(mockToken, mockGroupId, adminUserId);

    console.log("\n=== Test 4: showWantedLeaderboard ===");
    await showWantedLeaderboard(mockToken, mockGroupId);

    console.log("Done.");
}

test();
