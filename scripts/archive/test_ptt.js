require('dotenv').config();
const crawler = require('./handlers/crawler');

async function test() {
    try {
        const ptt = await crawler.crawlPttHot();
        console.log(JSON.stringify(ptt, null, 2));
    } catch (e) {
        console.error('Error:', e);
    }
}
test().then(() => process.exit(0));
