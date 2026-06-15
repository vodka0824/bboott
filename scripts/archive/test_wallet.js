require('dotenv').config();
const { router } = require('./utils/router');
const { economyHandler } = require('./handlers/economy');
// Mock what server.js does to initialize routes
require('./routes/economyRoutes')(router, { economyHandler });

async function test() {
    const ctx = {
        replyToken: 'test-token',
        userId: 'Ucf8e01b60972571bd9b5d09a65030c8b',
        groupId: 'test-group',
        isGroup: true,
        isAuthorizedGroup: true,
        isSuper: true,
        messageObject: { text: '錢包' }
    };
    
    console.log('Testing routing for 錢包');
    try {
        const handled = await router.execute('錢包', ctx);
        console.log('Handled:', handled);
    } catch (err) {
        console.error('Error during routing:', err);
    }
}
test();
