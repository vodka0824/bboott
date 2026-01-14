require('dotenv').config();
const express = require('express');

const { lineBot } = require('./index');
const leaderboardHandler = require('./handlers/leaderboard'); // For Graceful Shutdown

const app = express();
app.use(express.json());

// LINE Webhook 路由
app.post('/webhook', lineBot);

// 健康檢查端點
app.get('/', (req, res) => res.send('LINE Bot is running!'));


// Cron Endpoints
// const cronHandler = require('./handlers/cron'); // Removed
// const horoscopeHandler = require('./handlers/horoscope'); // Removed

// app.get('/api/cron/horoscope', cronHandler.handleHoroscopePrefetch); // Removed

// prefetch endpoint removed


const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// === Graceful Shutdown ===
async function gracefulShutdown(signal) {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  try {
    // 1. Flush Leaderboard Buffer
    await leaderboardHandler.flushBuffer();
    console.log('Leaderboard Buffer flused.');

    // 2. Close Server (Optional if we want to stop accepting specific requests, but Cloud Run handles traffic draining)
    // process.exit(0); 
    // Wait... usually we should exit after cleanup.
    console.log('Cleanup finished. Exiting.');
    process.exit(0);
  } catch (error) {
    console.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
