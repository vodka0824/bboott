require('dotenv').config();
const puppeteer = require('puppeteer-core');

async function explore() {
    const browser = await puppeteer.launch({
        executablePath: '/usr/bin/chromium',
        headless: 'new',
        args: ['--no-sandbox', '--disable-gpu']
    });
    const page = await browser.newPage();
    await page.goto('https://www.cosmopolitan.com/tw/horoscopes/');
    
    const articles = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'));
        return links.map(a => ({ text: a.innerText.trim(), href: a.href }))
            .filter(a => a.text.includes('運勢') || a.href.includes('horoscopes'));
    });
    
    console.log(JSON.stringify(articles.slice(0, 20), null, 2));
    await browser.close();
}

explore().catch(console.error);
