require('dotenv').config();
const puppeteer = require('puppeteer-core');

async function testMonthly() {
    const browser = await puppeteer.launch({
        executablePath: '/usr/bin/chromium',
        headless: 'new',
        args: ['--no-sandbox', '--disable-gpu']
    });
    const page = await browser.newPage();
    await page.goto('https://astro.click108.com.tw/monthly_0.php?iType=2&iAstro=0', { waitUntil: 'domcontentloaded' });
    
    const html = await page.evaluate(() => {
        return document.querySelector('.TODAY_CONTENT') ? document.querySelector('.TODAY_CONTENT').innerText : 'NO CONTENT';
    });
    
    console.log(html);
    await browser.close();
}

testMonthly().catch(console.error);
