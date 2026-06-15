require('dotenv').config();
const authUtils = require('./utils/auth');

async function testAuth() {
    try {
        const groupId = 'C147ac337a28d4e0d7a85dc323c30878a';
        await authUtils.init(); // Load from DB
        
        const isAuth = authUtils.isGroupAuthorized(groupId);
        console.log('isAuthorizedGroup:', isAuth);
        
        const featureEnabled = await authUtils.isFeatureEnabled(groupId, 'game');
        console.log('featureEnabled (game):', featureEnabled);

        const groupData = await authUtils.getGroupConfig(groupId);
        console.log('Group Data:', JSON.stringify(groupData, null, 2));

    } catch (e) {
        console.error(e);
    }
}

testAuth();
