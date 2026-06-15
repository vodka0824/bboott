require('dotenv').config();
const puppeteer = require('puppeteer-core');

async function getAries() {
    const browser = await puppeteer.launch({
        executablePath: '/usr/bin/chromium',
        headless: 'new',
        args: ['--no-sandbox', '--disable-gpu']
    });
    const page = await browser.newPage();
    await page.goto('https://www.cosmopolitan.com/tw/horoscopes/today/a32681177/aries-today/', { waitUntil: 'domcontentloaded' });
    
    const html = await page.evaluate(() => {
        return document.querySelector('.article-body-content') ? document.querySelector('.article-body-content').innerText : 'NO CONTENT';
    });
    
    console.log(html);
    await browser.close();
}

getAries().catch(console.error);
