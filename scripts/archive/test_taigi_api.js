const axios = require('axios');

const ITAIGI_API = 'https://itaigi.tw/%E5%B9%B3%E8%87%BA%E9%A0%85%E7%9B%AE%E5%88%97%E8%A1%A8/%E6%8F%A3%E5%88%97%E8%A1%A8';

async function test() {
    try {
        const keyword = '你好';
        const url = `${ITAIGI_API}?%E9%97%9C%E9%8D%B5%E5%AD%97=${encodeURIComponent(keyword)}`;
        console.log('Fetching:', url);
        const res = await axios.get(url, { timeout: 10000 });
        console.log('Status:', res.status);
        console.log('DataKeys:', Object.keys(res.data));
        console.log('Results length:', res.data?.列表?.length);
        console.log('First result:', JSON.stringify(res.data?.列表?.[0], null, 2));
    } catch (error) {
        console.error('Error:', error.message);
    }
}

test();
