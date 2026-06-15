require('dotenv').config();
const horoscope = require('./handlers/horoscope');

async function test() {
    console.log('Testing horoscope fetch...');
    try {
        const res = await horoscope.getHoroscope('獅子座');
        console.log('Success!', res.name, res.content ? 'Content OK' : 'No Content');
    } catch (e) {
        console.error('Failed:', e);
    }
}
test().then(() => process.exit(0));
