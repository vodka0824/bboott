require('dotenv').config();
const axios = require('axios');

async function test() {
    const { MOENV_API_KEY } = require('./config/constants');
    const url = `https://data.moenv.gov.tw/api/v2/aqx_p_432?api_key=${MOENV_API_KEY}&limit=5&format=JSON`;
    
    try {
        const res = await axios.get(url);
        console.log('Keys:', Object.keys(res.data));
        if (res.data.records) {
            console.log('Has records, length:', res.data.records.length);
        } else {
            console.log('NO RECORDS!', res.data);
        }
    } catch(e) {
        console.error('Fetch failed:', e.message);
        if (e.response) {
            console.error('Response data:', e.response.data);
        }
    }
}
test();
