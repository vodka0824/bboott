// === 環境變數驗證（優先執行） ===
const { validateOrExit } = require('./utils/startup-check');
validateOrExit();

const { Firestore } = require('@google-cloud/firestore');
const axios = require('axios');

// === Axios 全域設定（防止請求阻塞，降低 Cloud Run CPU 消耗） ===
axios.defaults.timeout = 20000; // 20 秒 timeout (配合 Cloud Run 環境與 LINE Reply Token 30s 限制)
axios.defaults.headers.common['User-Agent'] = 'LINE-Bot/1.0';

// === 1. 設定區 (從設定檔讀取) ===
const {
  ADMIN_USER_ID,
  KEYWORD_MAP
} = require('./config/constants');
const lineUtils = require('./utils/line');
const authUtils = require('./utils/auth');
const { handleError } = require('./utils/errorHandler');

// === Global Error Handling (Stability) ===
process.on('unhandledRejection', (reason, promise) => {
  console.error('[System] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[System] Uncaught Exception:', error);
});

// === Handlers Imports ===
const crawlerHandler = require('./handlers/crawler');
const aiHandler = require('./handlers/ai');
const gameHandler = require('./handlers/game');
const weatherHandler = require('./handlers/weather');
const systemHandler = require('./handlers/system');
const lotteryHandler = require('./handlers/lottery');
const todoHandler = require('./handlers/todo');
const restaurantHandler = require('./handlers/restaurant');
const driveHandler = require('./handlers/drive');
const financeHandler = require('./handlers/finance');
const tcatHandler = require('./handlers/tcat');
const taigiHandler = require('./handlers/taigi');
const currencyHandler = require('./handlers/currency');
const leaderboardHandler = require('./handlers/leaderboard');
const settingsHandler = require('./handlers/settings');
const funHandler = require('./handlers/fun');
const welcomeHandler = require('./handlers/welcome');
const slotHandler = require('./handlers/slot');
const javdbHandler = require('./handlers/javdb');
const enchantHandler = require('./handlers/enchant'); // 天堂衝裝遊戲

// === Router Imports ===
const router = require('./utils/router');
const registerRoutes = require('./handlers/routes');

// === Firestore 初始化 ===
const db = new Firestore();

// === 路由註冊 ===
registerRoutes(router, {
  financeHandler,
  currencyHandler,
  systemHandler,
  weatherHandler,
  todoHandler,
  restaurantHandler,
  lotteryHandler,
  taigiHandler,
  leaderboardHandler,
  driveHandler,
  crawlerHandler,
  aiHandler,
  gameHandler,
  lineUtils,
  settingsHandler,
  funHandler,
  tcatHandler,
  welcomeHandler,
  slotHandler,
  javdbHandler,
  enchantHandler // Register Enchant Handler
});

async function handleCommonCommands(message, replyToken, sourceType, userId, groupId, messageObject = null) {
  console.log(`[Webhook] Received: "${message}" from ${userId} in ${groupId || 'DM'}`);
  const isSuper = authUtils.isSuperAdmin(userId);
  const isGroup = (sourceType === 'group' || sourceType === 'room');
  const isAuthorizedGroup = isGroup ? await authUtils.isGroupAuthorized(groupId) : false;

  // 0. 速率限制檢查（管理員除外）
  if (!isSuper) {
    const rateLimit = require('./utils/rateLimit');
    if (!rateLimit.checkLimit(userId, 'global')) {
      await lineUtils.replyText(replyToken, "⏱️ 您的操作過於頻繁，請稍後再試");
      return true; // Stop processing
    }
  }

  // 1. 黑名單檢查 (Global Ban)
  const isBanned = await authUtils.isBlacklisted(userId);
  if (isBanned) {
    await lineUtils.replyText(replyToken, "你已被關進小黑屋,請好好的反省!");
    return true; // Stop processing
  }

  // 1. 記錄群組發言 (用於排行榜) - 移至最外層，只要是授權群組的訊息都記錄
  if (isGroup && isAuthorizedGroup) {
    leaderboardHandler.recordMessage(groupId, userId).catch(() => { });
  }

  // 2. 構建路由上下文
  const context = {
    message,
    messageObject: messageObject, // 傳遞原始訊息物件（包含 mention 資訊）
    replyToken,
    sourceType,
    userId,
    groupId,
    isSuper,
    isGroup,
    isAuthorizedGroup,
    // 方便 handler 使用
    replyText: (text) => lineUtils.replyText(replyToken, text),
    replyFlex: (alt, contents) => lineUtils.replyFlex(replyToken, alt, contents)
  };

  // 3. 執行路由
  const handled = await router.execute(message, context);
  if (handled) return true;

  // 4. Fallback 或其他未納入路由的邏輯 (目前應該都在路由中了)
  // 如果有其他無法透過 router 處理的邏輯 (例如非指令的自然語言處理)，可以在這裡補充

  return false;
}

// === Line Bot Webhook Handler ===
async function lineBot(req, res) {
  try {
    const events = req.body.events;
    // 處理每個事件
    const results = await Promise.all(events.map(async (event) => {
      // 確保只處理文字訊息或 Postback
      if (event.type === 'message' && event.message.type === 'text') {
        const { replyToken, source, message } = event;
        const { text } = message;
        const userId = source.userId;
        const groupId = source.groupId || source.roomId;
        const sourceType = source.type;

        const handled = await handleCommonCommands(text, replyToken, sourceType, userId, groupId, message);
        if (!handled) {
          // Unhandled text message
        }
      } else if (event.type === 'message' && event.message.type === 'image') {
        // 處理圖片訊息（歡迎圖上傳）
        const { replyToken, source, message } = event;
        const userId = source.userId;
        const groupId = source.groupId || source.roomId;
        const messageId = message.id;

        // 檢查用戶狀態
        const userState = require('./utils/userState');
        const state = await userState.getUserState(userId);

        if (state && state.action === 'waiting_welcome_image') {
          try {
            // 處理圖片上傳
            const imageUpload = require('./utils/imageUpload');
            const result = await imageUpload.processWelcomeImage(
              messageId,
              state.groupId,
              process.env.LINE_TOKEN
            );

            if (result.success) {
              // 儲存到 Firestore
              const welcomeHandler = require('./handlers/welcome');
              await welcomeHandler.setWelcomeImage(state.groupId, result.url, userId, result.aspectRatio);

              // 清除狀態
              await userState.clearUserState(userId);

              await lineUtils.replyText(replyToken, '✅ 歡迎圖已上傳並設定完成！');
            } else {
              await lineUtils.replyText(replyToken, `❌ 圖片上傳失敗：${result.error}`);
            }
          } catch (error) {
            console.error('[Welcome Image Upload] Error:', error);
            await lineUtils.replyText(replyToken, '❌ 圖片處理失敗，請稍後再試');
          }
        }
      } else if (event.type === 'postback') {
        const { replyToken, source, postback } = event;
        const data = postback.data;
        const userId = source.userId;
        const groupId = source.groupId || source.roomId;
        const sourceType = source.type;

        // 建構 context
        const context = {
          replyToken,
          userId,
          groupId,
          sourceType,
          postbackData: data,
          // Helper flags
          isGroup: sourceType === 'group' || sourceType === 'room',
          // 注意: 這裡需要重新抓取權限資訊嗎？ router.executePostback 內好像沒有檢查權限
          // 但 handler 內部會檢查
        };

        // 執行 Postback 路由
        await router.executePostback(data, context);
      } else if (event.type === 'memberJoined') {
        // 處理新成員加入
        await welcomeHandler.handleMemberJoined(event);
      }
    }));

    res.status(200).json({
      status: 'success',
      results
    });
  } catch (error) {
    // 這裡 context 只有部分資訊，盡量提供
    await handleError(error, { message: 'Webhook Event Loop Error' });

    // 雖然發生錯誤，但仍回傳 200 給 LINE，避免無限重試
    res.status(200).json({
      status: 'error',
      message: error.message
    });
  }
}

// === 初始化預取作業 (Startup Prefetch) ===
// 這些是非同步的，不會阻塞伺服器啟動，但在 Cold Start 後不久即可完成
// funHandler.initImagePool().catch(e => console.error('Image Pool Init Failed', e)); // 已移除：改用 Google Drive
driveHandler.initDriveCache().catch(e => console.error('Drive Cache Init Failed', e));

module.exports = {
  lineBot,
  handleCommonCommands
};
