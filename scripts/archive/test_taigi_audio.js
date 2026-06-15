const axios = require('axios');

const ITAIGI_AUDIO_API = 'https://hapsing.itaigi.tw/bangtsam';

async function test() {
    try {
        const taibun = 'lí hó';
        const url = `${ITAIGI_AUDIO_API}?taibun=${encodeURIComponent(taibun)}`;
        console.log('Fetching Audio URL:', url);
        const res = await axios.head(url, { timeout: 10000 });
        console.log('Status:', res.status);
        console.log('Headers:', res.headers);
    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.log('Response status:', error.response.status);
            console.log('Response headers:', error.response.headers);
        }
    }
}

test();
