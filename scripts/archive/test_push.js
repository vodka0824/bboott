require('dotenv').config();
const lineUtils = require('./utils/line');
const horoscope = require('./handlers/horoscope');

async function testPush() {
    const userId = process.env.ADMIN_USER_ID;
    try {
        const data = await horoscope.getHoroscope('獅子座');
        const flex = horoscope.buildHoroscopeFlex(data, 'daily');
        
        console.log('Pushing flex message to admin...');
        await lineUtils.pushFlex(userId, 'Horoscope Test', flex);
        console.log('Success!');
    } catch(e) { 
        console.error('Error:', e.response ? JSON.stringify(e.response.data, null, 2) : e.message); 
    }
}
testPush().then(() => process.exit(0));
