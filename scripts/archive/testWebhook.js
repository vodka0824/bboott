require('dotenv').config();
const { handleCommonCommands } = require('./index');

async function test() {
    console.log('Testing 狀態...');
    const result = await handleCommonCommands('狀態', 'dummy_token', 'group', 'Ucf8e01b60972571bd9b5d09a65030c8b', 'C147ac337a28d4e0d7a85dc323c30878a', { type: 'text', text: '狀態' }, 'botUserId');
    console.log('handleCommonCommands result:', result);
    console.log('Test complete.');
}

test().catch(console.error);
