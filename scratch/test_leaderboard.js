require('dotenv').config();
const lineUtils = require('../utils/line');
// Mock replyFlex to see what's being sent
lineUtils.replyFlex = async (replyToken, altText, flexMessage) => {
    console.log('Sending Flex Message:', JSON.stringify(flexMessage, null, 2));
    if (flexMessage.type !== 'carousel' && flexMessage.type !== 'bubble') {
        throw new Error('Invalid Flex Message Type: ' + flexMessage.type);
    }
};

const { showAllLeaderboards } = require('../handlers/economy');

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
