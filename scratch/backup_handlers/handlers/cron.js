const cron = require('node-cron');
const horoscopeHandler = require('./horoscope');

function initCronJobs() {
    console.log('[Cron] Initializing scheduled jobs...');

    // 每日凌晨 00:05 執行預取 12 星座運勢
    cron.schedule('5 0 * * *', async () => {
        console.log('[Cron] Triggered Daily Horoscope Prefetch');
        try {
            await horoscopeHandler.prefetchAll('daily');
            console.log('[Cron] Daily Horoscope Prefetch Completed');
        } catch (error) {
            console.error('[Cron] Daily Horoscope Prefetch Failed:', error);
        }
    }, {
        scheduled: true,
        timezone: "Asia/Taipei"
    });



    console.log('[Cron] Scheduled jobs initialized successfully.');
}

module.exports = {
    initCronJobs
};
