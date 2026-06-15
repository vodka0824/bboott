require('dotenv').config();
const puppeteer = require('puppeteer-core');

async function checkClick108Full() {
    const browser = await puppeteer.launch({
        executablePath: '/usr/bin/chromium',
        headless: 'new',
        args: ['--no-sandbox', '--disable-gpu']
    });
    const page = await browser.newPage();
    await page.goto('https://astro.click108.com.tw/daily_0.php?iAstro=0', { waitUntil: 'domcontentloaded' });
    
    const html = await page.evaluate(() => {
        return document.querySelector('.main').innerText;
    });
    
    console.log(html);
    await browser.close();
}

checkClick108Full().catch(console.error);
