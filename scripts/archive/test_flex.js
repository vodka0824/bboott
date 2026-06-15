const horoscope = require('./handlers/horoscope');
async function test() {
    try {
        const data = await horoscope.getHoroscope('獅子座');
        const flex = horoscope.buildHoroscopeFlex(data, 'daily');
        console.log(JSON.stringify(flex, null, 2));
    } catch(e) { console.error(e); }
}
test().then(() => process.exit(0));
