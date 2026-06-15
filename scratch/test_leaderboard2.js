require('dotenv').config();
const { showAllLeaderboards } = require('../handlers/economy');
const lineUtils = require('../utils/line');
const fs = require('fs');

lineUtils.replyFlex = async (token, text, msg) => {
    fs.writeFileSync('C:\\Users\\USER\\.gemini\\antigravity\\scratch\\lineBot\\scratch\\flex.json', JSON.stringify(msg, null, 2));
    console.log('Saved flex.json');
    return true; // Skip LINE API call
};

async function test() {
    try {
        console.log('Testing showAllLeaderboards...');
        await showAllLeaderboards('test_reply_token');
        console.log('Done.');
    } catch (e) {
        console.error(e);
    }
}

test();
