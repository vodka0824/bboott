require('dotenv').config();
const crawler = require('./handlers/crawler');

async function testCrawler() {
    console.log('Testing Oil...');
    const oil = await crawler.crawlOilPrice();
    console.log('Oil:', oil ? 'OK' : 'Failed');

    console.log('Testing Movies...');
    const movies = await crawler.crawlNewMovies();
    console.log('Movies:', movies ? 'OK' : 'Failed');

    console.log('Testing Apple News...');
    const apple = await crawler.crawlAppleNews();
    console.log('Apple News:', apple ? 'OK' : 'Failed');

    console.log('Testing Tech News...');
    const tech = await crawler.crawlTechNews();
    console.log('Tech News:', tech ? 'OK' : 'Failed');

    console.log('Testing PTT Hot...');
    const ptt = await crawler.crawlPttHot();
    console.log('PTT Hot:', ptt ? 'OK' : 'Failed');

    console.log('Testing JAV...');
    const jav = await crawler.getRandomJav();
    console.log('JAV:', jav ? 'OK' : 'Failed');
}

testCrawler().then(() => console.log('Done'));
