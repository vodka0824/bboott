require('dotenv').config();
const puppeteer = require('puppeteer-core');

async function testLuckyParse() {
    const browser = await puppeteer.launch({
        executablePath: '/usr/bin/chromium',
        headless: 'new',
        args: ['--no-sandbox', '--disable-gpu']
    });
    const page = await browser.newPage();
    await page.goto('https://astro.click108.com.tw/daily_0.php?iAstro=0', { waitUntil: 'domcontentloaded' });
    
    const data = await page.evaluate(() => {
        const result = {};
        const luckyDiv = document.querySelector('.TODAY_LUCKY');
        if (luckyDiv) {
            const h4s = luckyDiv.querySelectorAll('h4');
            h4s.forEach(h4 => {
                const label = h4.innerText.trim();
                const value = h4.nextElementSibling ? h4.nextElementSibling.innerText.trim() : '';
                if (label.includes('幸運數字')) result.luckyNumber = value;
                if (label.includes('吉時')) result.luckyTime = value;
                if (label.includes('幸運顏色')) result.luckyColor = value;
                if (label.includes('方位')) result.luckyDirection = value;
                if (label.includes('幸運星座')) result.luckySign = value;
            });
        }
        return result;
    });
    
    console.log(data);
    await browser.close();
}

testLuckyParse().catch(console.error);
