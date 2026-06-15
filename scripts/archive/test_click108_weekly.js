require('dotenv').config();
const puppeteer = require('puppeteer-core');

async function testWeekly() {
    const browser = await puppeteer.launch({
        executablePath: '/usr/bin/chromium',
        headless: 'new',
        args: ['--no-sandbox', '--disable-gpu']
    });
    const page = await browser.newPage();
    await page.goto('https://astro.click108.com.tw/weekly_0.php?iAstro=0', { waitUntil: 'domcontentloaded' });
    
    const html = await page.evaluate(() => {
        return document.querySelector('.main') ? document.querySelector('.main').innerText : document.body.innerText.substring(0, 500);
    });
    
    console.log(html);
    await browser.close();
}

testWeekly().catch(console.error);
