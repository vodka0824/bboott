require('dotenv').config();
const { db, connectDB } = require('../utils/db');
const economyRoutes = require('../routes/economyRoutes');
const Router = require('../utils/router');
const handlers = {
    economyHandler: require('../handlers/economy'),
    financeHandler: require('../handlers/finance'),
    currencyHandler: require('../handlers/currency'),
    systemHandler: require('../handlers/system')
};
const lineUtils = require('../utils/line');

let replyMessages = [];
lineUtils.replyText = async (token, msg) => {
    replyMessages.push(msg);
};

async function runTest() {
    await connectDB();
    const router = new Router(process.env.LINE_TOKEN);
    economyRoutes(router, handlers);

    const ctx = {
        userId: process.env.ADMIN_USER_ID,
        replyToken: 'mock_token',
        isGroup: false, // DM
        message: '補充哭幣 1000'
    };
    
    console.log('Testing regex manually...');
    const regex = /^\s*(?:補充哭幣|加錢|充值)(?:\s*(\d+|歐印|all\s*in))?\s*$/i;
    const match = regex.exec(ctx.message);
    console.log('Regex match:', match);
    
    console.log('Testing routing...');
    await router.handle(ctx.message, ctx.replyToken, 'user', ctx.userId, null);
    
    console.log('🤖 Bot 回覆:\n' + replyMessages.join('\n'));
    process.exit(0);
}

runTest();
