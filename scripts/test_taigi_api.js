const axios = require('axios');

const ITAIGI_AUDIO_API = 'https://hapsing.itaigi.tw/bangtsam';

async function testAudio() {
    const romanization = 'lí hó';
    const url = `${ITAIGI_AUDIO_API}?taibun=${encodeURIComponent(romanization)}`;
    console.log(`Testing Audio URL: ${url}`);

    try {
        const res = await axios.get(url, {
            responseType: 'arraybuffer', // get binary data
            timeout: 10000
        });

        console.log('Status:', res.status);
        console.log('Content-Type:', res.headers['content-type']);
        console.log('Content-Length:', res.headers['content-length']);
        console.log('Data length:', res.data.length);

    } catch (error) {
        console.error('Audio API Error:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
        }
    }
}

testAudio();
