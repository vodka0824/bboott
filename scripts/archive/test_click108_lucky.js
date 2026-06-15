require('dotenv').config();
const puppeteer = require('puppeteer-core');

async function testLucky() {
    const browser = await puppeteer.launch({
        executablePath: '/usr/bin/chromium',
        headless: 'new',
        args: ['--no-sandbox', '--disable-gpu']
    });
    const page = await browser.newPage();
    await page.goto('https://astro.click108.com.tw/daily_0.php?iAstro=0', { waitUntil: 'domcontentloaded' });
    
    const html = await page.evaluate(() => {
        return document.querySelector('.TODAY_LUCKY') ? document.querySelector('.TODAY_LUCKY').innerText : document.body.innerText.substring(0, 500);
    });
    
    console.log(html);
    await browser.close();
}

testLucky().catch(console.error);
