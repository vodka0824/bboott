require('dotenv').config();
const puppeteer = require('puppeteer-core');

async function checkClick108() {
    const browser = await puppeteer.launch({
        executablePath: '/usr/bin/chromium',
        headless: 'new',
        args: ['--no-sandbox', '--disable-gpu']
    });
    const page = await browser.newPage();
    await page.goto('https://astro.click108.com.tw/daily_0.php?iAstro=0', { waitUntil: 'domcontentloaded' });
    
    const text = await page.evaluate(() => {
        return document.querySelector('.TODAY_CONTENT') ? document.querySelector('.TODAY_CONTENT').innerText : 'NO CONTENT';
    });
    
    console.log(text);
    await browser.close();
}

checkClick108().catch(console.error);
