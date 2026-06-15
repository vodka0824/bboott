const axios = require('axios');

// Configuration
const SERVICES = [
    { name: 'Currency (Rate Bot)', url: 'https://rate.bot.com.tw/xrt/all/day' },
    { name: 'Weather (CWA API)', url: 'https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001' },
    { name: 'JavDB (Base)', url: 'https://javdb.com' }, // Assuming this based on common knowledge, waiting for file view to confirm
    { name: 'Google (Connectivity)', url: 'https://www.google.com' }
];

async function checkService(service) {
    try {
        const start = Date.now();
        // Use a simple GET with a short timeout
        // For CWA, it might return 401 without key, which is fine (means reachable)
        const res = await axios.get(service.url, {
            timeout: 5000,
            validateStatus: (status) => status < 500 // Accept 4xx as "reachable"
        });
        const duration = Date.now() - start;
        console.log(`[PASS] ${service.name}: ${res.status} (${duration}ms)`);
        return true;
    } catch (error) {
        console.error(`[FAIL] ${service.name}: ${error.message}`);
        if (error.response) {
            console.error(`       Status: ${error.response.status}`);
        }
        return false;
    }
}

async function runHealthCheck() {
    console.log('=== System Health Check ===');
    console.log(`Time: ${new Date().toISOString()}`);

    let passed = 0;
    for (const service of SERVICES) {
        if (await checkService(service)) passed++;
    }

    console.log('===========================');
    console.log(`Result: ${passed}/${SERVICES.length} services reachable.`);
}

runHealthCheck();
