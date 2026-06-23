const rateLimit = require('../utils/rateLimit');
const authUtils = require('../utils/auth');
const lineUtils = require('../utils/line');
const leaderboardHandler = require('../handlers/leaderboard');
const economyHandler = require('../handlers/economy');
const rpgHandler = require('../handlers/rpg');
const { checkAndDischargeMilitary } = require('../services/jailRedemptionService');
const router = require('../utils/router');

const cache = require('../utils/memoryCache');
const notificationService = require('../services/notificationService');

// 定期清理已由 memoryCache / Redis 的 TTL 自動處理，不需手動 interval

async function checkRateLimitMW(ctx) {
  if (ctx.isGroup && !ctx.isAuthorizedGroup) return false;
  if (ctx.isSuper) return false;
  if (!rateLimit.checkLimit(ctx.userId, 'global')) {
    await ctx.replyText("⏱️ 您的操作過於頻繁，請稍後再試");
    return true;
  }
  return false;
}

async function checkSpamMW(ctx) {
  if (ctx.isGroup && !ctx.isAuthorizedGroup) return false;
  if (ctx.isSuper) return false;
  
  // 排除賭博相關指令，因為賭博本來就會高頻率下注
  const cleanMsg = ctx.message.replace(/^[!/！]/, '').trim();
  const isGamblingCommand = /^(下注|開牌|發牌|補牌|停牌|歐印|加注|跟注|過牌|棄牌|21點|骰子|老虎機|拉霸|輪盤|賽馬|百家樂|射龍門|推筒子|十點半|十八啦|妞妞|炸金花|開桌|\+)/.test(cleanMsg);
  if (isGamblingCommand) return false;

  const isSticker = ctx.messageObject && ctx.messageObject.type === 'sticker';
  const isCommandLike = ctx.isExplicitCommand || /^(錢包|簽到|抽圖|搶劫|轉帳|查)/.test(ctx.message) || isSticker;
  
  if (!isCommandLike) return false;

  const now = Date.now();
  let userSpamState = (await cache.getAsync(`spam_${ctx.userId}`)) || { history: [], warnCount: 0, lastWarnReset: now, mutedUntil: 0, lastMuteNotify: 0 };
  
  if (now < userSpamState.mutedUntil) {
      if (now - userSpamState.lastMuteNotify > 60000) {
          userSpamState.lastMuteNotify = now;
          await cache.setAsync(`spam_${ctx.userId}`, userSpamState, 86400); // 24小時 TTL
          const remainingMins = Math.ceil((userSpamState.mutedUntil - now) / 60000);
          await ctx.replyText(`🔇 您因連續快速發送指令，目前處於禁言狀態。\n請安靜等待 ${remainingMins} 分鐘後再試。(此期間發言不計入經驗值)`);
      }
      return true;
  }

  if (now - userSpamState.lastWarnReset > 86400000) {
      userSpamState.warnCount = 0;
      userSpamState.lastWarnReset = now;
  }

  userSpamState.history = userSpamState.history.filter(h => now - h.timestamp < 10000);
  
  let isSpam = false;
  let spamReason = '';

  const lastAction = userSpamState.history.length > 0 ? userSpamState.history[userSpamState.history.length - 1] : null;
  if (lastAction && lastAction.text === ctx.originalMessage && (now - lastAction.timestamp) < 3000) {
      isSpam = true;
      spamReason = isSticker ? '連續發送貼圖 (3秒)' : '相同指令冷卻中 (3秒)';
  }

  if (!isSpam && userSpamState.history.length >= 3) { 
      isSpam = true;
      spamReason = isSticker ? '發送貼圖過快 (10秒內4次)' : '發送指令過快 (10秒內4次)';
  }

  if (isSpam) {
      if (rateLimit.checkRateLimit(ctx.userId, 'spam_warn', 1, 3000)) {
          userSpamState.warnCount += 1;
          
          if (userSpamState.warnCount >= 2) {
              await authUtils.blacklistUser(ctx.userId, '惡意洗頻自動封鎖', 'system');
              if (ctx.isGroup) {
                  try {
                      const name = await lineUtils.getGroupMemberName(ctx.groupId, ctx.userId) || '該名玩家';
                      await ctx.replyText(`🚨 系統公告：【${name}】因無視警告持續惡意洗頻，已遭系統自動遣送小黑屋！(永久封鎖)`);
                  } catch(e) {
                      await ctx.replyText(`🚨 系統公告：因無視警告持續惡意洗頻，已將該玩家遣送小黑屋！(永久封鎖)`);
                  }
              } else {
                  await ctx.replyText("🚨 你因持續惡意洗頻，已被系統自動關進小黑屋！");
              }
              return true;
          } else if (spamReason.includes('10秒內4次')) {
              userSpamState.mutedUntil = now + 10 * 60 * 1000;
              userSpamState.lastMuteNotify = now;
              await ctx.replyText(`⚠️ 系統偵測到您惡意連點洗頻 (${spamReason})！\n您已被禁言 10 分鐘，期間機器人將完全無視您的指令！`);
          } else {
              await ctx.replyText(`⏱️ 請勿連點或重複發送相同指令洗頻！(${spamReason})\n⚠️ 警告：一天內累計 2 次將被自動關進小黑屋！(${userSpamState.warnCount}/2)`);
          }
          await cache.setAsync(`spam_${ctx.userId}`, userSpamState, 86400);
      }
      return true;
  }

  userSpamState.history.push({ text: ctx.originalMessage, timestamp: now });
  await cache.setAsync(`spam_${ctx.userId}`, userSpamState, 86400);
  return false;
}

async function checkBlacklistMW(ctx) {
  if (ctx.isGroup && !ctx.isAuthorizedGroup) return false;
  const isBanned = await authUtils.isBlacklisted(ctx.userId);
  if (isBanned) {
    await ctx.replyText("你已被關進小黑屋,請好好的反省!");
    return true;
  }
  return false;
}

async function recordActivityMW(ctx) {
  if (ctx.isGroup && ctx.isAuthorizedGroup) {
    leaderboardHandler.recordMessage(ctx.groupId, ctx.userId).catch(() => { });
    economyHandler.addCoinQuietly(ctx.groupId, ctx.userId, 100).catch(() => { });
    lineUtils.registerReplyToken(ctx.replyToken, ctx.groupId);
  }
  return false;
}

async function routeMessageMW(ctx) {
  ctx.handled = await router.execute(ctx.message, ctx);
  return false;
}

let lastDischargeCheck = 0;
async function checkMilitaryDischargeMW(ctx) {
  if (ctx.isGroup && Date.now() - lastDischargeCheck > 60000) {
    lastDischargeCheck = Date.now();
    checkAndDischargeMilitary().catch(e => console.error('[Military Discharge Check Error]', e));
  }
  return false;
}

async function addExpMW(ctx) {
  const userSpamState = (await cache.getAsync(`spam_${ctx.userId}`)) || {};
  const isMuted = Date.now() < (userSpamState.mutedUntil || 0);
  const isSticker = ctx.messageObject && ctx.messageObject.type === 'sticker';

  if (ctx.isGroup && ctx.isAuthorizedGroup && !ctx.isExplicitCommand && !ctx.handled && !isMuted && !isSticker) {
      const expGain = Math.floor(Math.random() * 3) + 1;
      rpgHandler.addExp(ctx.userId, expGain).then(async ({ leveledUp, newLevel }) => {
          if (leveledUp) {
              let playerName = '某位冒險者';
              try {
                  playerName = await lineUtils.getGroupMemberName(ctx.groupId, ctx.userId) || playerName;
              } catch (e) { /* 取不到名稱時靜默失敗 */ }
              
              const msg = `👑 恭喜 ${playerName}！冒險等級提升為 Lv.${newLevel}！\n（攻擊/防禦 大幅增強）`;
              notificationService.queueNotification(ctx.groupId, [{ type: 'text', text: msg }]).catch(e => {
                  console.error('[RPG] Queue LevelUp Message Error:', e.message);
              });
          }
      }).catch(e => console.error('[RPG] addExp Error:', e));
  }
  return false;
}

async function flushPendingMessagesMW(ctx) {
  if (ctx.handled) return true;
  if (ctx.isGroup && ctx.isAuthorizedGroup && !ctx.handled) {
      const flushed = await lineUtils.flushPendingMessages(ctx.replyToken, ctx.groupId);
      if (flushed) return true;
  }
  return false;
}

module.exports = {
    checkRateLimitMW,
    checkSpamMW,
    checkBlacklistMW,
    recordActivityMW,
    routeMessageMW,
    checkMilitaryDischargeMW,
    addExpMW,
    flushPendingMessagesMW
};
