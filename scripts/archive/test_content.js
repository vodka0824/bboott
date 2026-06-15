require('dotenv').config();
const horoscope = require('./handlers/horoscope');

async function run() {
    const data = await horoscope.getHoroscope('牡羊座');
    console.log(JSON.stringify(data, null, 2));
}

run().then(() => process.exit(0));
