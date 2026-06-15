require('dotenv').config();
const crawler = require('./utils/click108_crawler');

async function testAllTypes() {
    const daily = await crawler.fetchSignData('獅子座', 'daily');
    console.log('--- DAILY ---');
    console.log(JSON.stringify(daily, null, 2));

    const weekly = await crawler.fetchSignData('獅子座', 'weekly');
    console.log('--- WEEKLY ---');
    console.log(JSON.stringify(weekly, null, 2));

    const monthly = await crawler.fetchSignData('獅子座', 'monthly');
    console.log('--- MONTHLY ---');
    console.log(JSON.stringify(monthly, null, 2));

    await crawler.closeBrowser();
}

testAllTypes().catch(console.error);
