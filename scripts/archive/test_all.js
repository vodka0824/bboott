require('dotenv').config();
const horoscope = require('./handlers/horoscope');
const INDEX_TO_NAME = [
    '牡羊座', '金牛座', '雙子座', '巨蟹座', '獅子座', '處女座',
    '天秤座', '天蠍座', '射手座', '摩羯座', '水瓶座', '雙魚座'
];

async function testAll() {
    for (let sign of INDEX_TO_NAME) {
        try {
            console.log(`\nTesting ${sign}...`);
            const data = await horoscope.getHoroscope(sign);
            if (data && data.content) {
                console.log(`[OK] ${sign} - ${data.content.substring(0, 20)}...`);
            } else {
                console.log(`[FAIL] ${sign} - Data or content is missing`);
            }
        } catch(e) {
            console.error(`[ERROR] ${sign}: ${e.message}`);
        }
    }
}
testAll().then(() => process.exit(0));
