require('dotenv').config();
const puppeteer = require('puppeteer-core');

async function checkClick108Links() {
    const browser = await puppeteer.launch({
        executablePath: '/usr/bin/chromium',
        headless: 'new',
        args: ['--no-sandbox', '--disable-gpu']
    });
    const page = await browser.newPage();
    await page.goto('https://astro.click108.com.tw/daily_0.php?iAstro=0', { waitUntil: 'domcontentloaded' });
    
    const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a')).map(a => ({ text: a.innerText.trim(), href: a.href })).filter(a => a.text.includes('本周') || a.text.includes('本月'));
    });
    
    console.log(links);
    await browser.close();
}

checkClick108Links().catch(console.error);
