require('dotenv').config();

// === 統一日誌系統 (W-26) ===
const logger = require('./utils/logger');
console.log = (...args) => logger.info(...args);
console.error = (...args) => logger.error(...args);
console.warn = (...args) => logger.warn(...args);
console.debug = (...args) => logger.debug(...args);

// === 環境變數驗證（最優先執行） ===
const { validateOrExit } = require('./utils/startup-check');
validateOrExit();

const express = require('express');
const path = require('path');
const { middleware: lineBotMiddleware } = require('@line/bot-sdk');
const { connectDB, getClient } = require('./utils/db');

const { lineBot } = require('./index');
const leaderboardHandler = require('./handlers/leaderboard'); // For Graceful Shutdown


const app = express();
app.use((req, res, next) => {
  console.log(`[Request] ${req.method} ${req.url} from ${req.ip}`);
  next();
});
// LINE Webhook 路由（必須在 express.json() 之前）
// P0-1 修復：使用 @line/bot-sdk middleware 驗證 HMAC-SHA256 簽名
const lineMiddlewareConfig = process.env.LINE_CHANNEL_SECRET
    ? lineBotMiddleware({ channelSecret: process.env.LINE_CHANNEL_SECRET })
    : express.json(); // 若未設定 SECRET，至少解析 JSON 讓本機測試能運作

app.post('/webhook', lineMiddlewareConfig, (req, res, next) => {
    if (!process.env.LINE_CHANNEL_SECRET) {
        console.warn('[Security] LINE_CHANNEL_SECRET 未設定，跳過 Webhook 簽名驗證（僅限本地開發）');
    }
    next();
}, lineBot);

// 全域 JSON 解析（排除 webhook）
app.use(express.json());

// 靜態檔案路由
app.use('/public', express.static(path.join(__dirname, 'public')));

// 健康檢查端點
app.get('/', (req, res) => res.send('LINE Bot is running!'));



// Cron Endpoints (Replaced with node-cron)
const cronHandler = require('./handlers/cron');


const PORT = process.env.PORT || 8080;

async function startServer() {
  try {
    await connectDB();
    
    // 多人賭桌防吃錢退款機制 (不阻塞啟動)
    const persistenceService = require('./services/multiplayerPersistenceService');
    persistenceService.refundAndNotifyOnStartup().catch(e => console.error('[Startup] Failed to run refundAndNotifyOnStartup', e));

    cronHandler.initCronJobs(); // 啟動背景排程
    app.listen(PORT, '127.0.0.1', () => {
      console.log(`Server running on 127.0.0.1:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server due to DB connection failure:', error);
    process.exit(1);
  }
}

startServer();

// === Graceful Shutdown ===
async function gracefulShutdown(signal) {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  try {
    // 1. Flush Leaderboard Buffer
    await leaderboardHandler.flushBuffer();
    console.log('Leaderboard Buffer flushed.');

    // 2. 關閉 MongoDB 連線（W-S18 修復）
    const mongoClient = getClient();
    if (mongoClient) {
      await mongoClient.close();
      console.log('MongoDB connection closed.');
    }

    console.log('Cleanup finished. Exiting.');
    process.exit(0);
  } catch (error) {
    console.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
