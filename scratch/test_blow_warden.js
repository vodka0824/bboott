require('dotenv').config();
const { handleBlowWarden } = require('./services/jailLifeService');
const lineUtils = require('./utils/line');
const dbUtils = require('./utils/db');
const { ADMIN_USER_ID } = require('./config/constants');

// Mock lineUtils
let flexOutput = null;
lineUtils.replyFlex = async (replyToken, altText, flexMessage) => {
    flexOutput = flexMessage;
    console.log(JSON.stringify(flexMessage, null, 2));
};
lineUtils.replyText = async (replyToken, text) => {
    console.log('Text Reply:', text);
};
lineUtils.getGroupMemberName = async () => 'Test User';

async function run() {
    await dbUtils.connectDb();
    const db = dbUtils.getDb();
    
    const testId = 'U_test_blow_warden';
    
    // Test 1: Good
    await db.collection('economy_users').doc(testId).set({
        jailedUntil: Date.now() + 60 * 60 * 1000,
        blowCooldownUntil: 0
    });
    
    // We can't guarantee 'good' because of random, but we can patch Math.random
    const origRandom = Math.random;
    
    console.log('--- GOOD OUTCOME ---');
    Math.random = () => 0.8; // > 50 -> Good
    await handleBlowWarden('mock_token', { userId: testId, groupId: 'mock_group' });
    
    // Reset DB
    await db.collection('economy_users').doc(testId).set({
        jailedUntil: Date.now() + 60 * 60 * 1000,
        blowCooldownUntil: 0
    });
    
    console.log('--- BAD OUTCOME (ADD) ---');
    Math.random = () => 0.05; // < 10 -> Bad Add
    await handleBlowWarden('mock_token', { userId: testId, groupId: 'mock_group' });
    
    console.log('--- SPAM OUTCOME ---');
    await handleBlowWarden('mock_token', { userId: testId, groupId: 'mock_group' });
    
    Math.random = origRandom;
    process.exit(0);
}

run();
