const authUtils = require('../utils/auth');
const lineUtils = require('../utils/line');
const rateLimit = require('../utils/rateLimit');
const cache = require('../utils/memoryCache');

let casinoHandler = null;
let multiBlackjackHandler = null;

// 1. 私訊洗頻檢查
async function checkDMMW(context, message, route) {
    const { isGroup, isSuper, userId, replyToken } = context;
    const { isDMOnly } = route.options;

    if (isDMOnly && isGroup) {
        const now = new Date();
        const todayStr = now.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
        
        let tracker = await cache.getAsync(`dm_spam_${userId}`);
        if (!tracker || tracker.date !== todayStr) {
            tracker = { date: todayStr, count: 0 };
        }
        
        tracker.count += 1;
        await cache.setAsync(`dm_spam_${userId}`, tracker, 86400); // 快取一天
        
        if (tracker.count === 1) {
            await lineUtils.replyText(replyToken, '❌ 為避免洗頻，單機遊戲與個人專屬功能 (如：拉霸、21點、懺悔) 請私訊機器人使用！');
        } else if (tracker.count === 2) {
            const sarcasticReplies = [
                "你是看不懂中文嗎？就說要私訊了，還在群組洗頻，是眼睛脫窗還是耳朵長繭？",
                "我都說了要私訊機器人，你是理解能力有問題，還是手指有自己的想法？",
                "非要在群組暴露你聽不懂人話的事實嗎？私訊！私訊！聽得懂嗎？",
                "又來？叫你私訊是會要你的命，還是你的鍵盤不支援私訊功能？",
                "警告一次還不聽，你是故意來挑戰我的耐性，還是純粹智商不在線？",
                "笑死，真的有人聽不懂人話。請。私。訊。機。器。人。用！",
                "在群組一直按，你是洗頻洗上癮了是不是？滾去私訊啦！"
            ];
            const randomReply = sarcasticReplies[Math.floor(Math.random() * sarcasticReplies.length)];
            await lineUtils.replyText(replyToken, `😒 ${randomReply}`);
        }
        return true; // Blocked
    }
    return false; // Continue
}

// 2. 基礎權限與白名單檢查
async function checkBasicAuthMW(context, message, route) {
    const { isGroup, isAuthorizedGroup, isSuper, allowDM } = context;
    const { isGroupOnly, isDMOnly, needAuth, adminOnly, allowDM: routeAllowDM } = route.options;

    if (isSuper && !isGroup) {
        if (isGroupOnly) return true; // Blocked
    } else {
        if (isGroupOnly && !isGroup) return true;
        if (needAuth && isGroup && !isAuthorizedGroup) return true;
        if (!isGroup && !allowDM && !routeAllowDM && !isDMOnly) return true;
    }

    if (adminOnly && !isSuper) return true;

    return false;
}

// 3. 功能開關檢查
async function checkFeatureToggleMW(context, message, route) {
    const { isGroup, isAuthorizedGroup, groupId } = context;
    const { feature } = route.options;

    if (feature && isGroup && isAuthorizedGroup) {
        const featureEnabled = await authUtils.isFeatureEnabled(groupId, feature);
        if (!featureEnabled) {
            return true; // Blocked implicitly without message
        }
    }
    return false;
}

// 4. 賭場專屬權限檢查
async function checkCasinoMW(context, message, route) {
    const { isGroup, userId, replyToken, groupId } = context;
    if (route.options.feature === 'casino' && isGroup) {
        if (!casinoHandler) casinoHandler = require('../handlers/casino');
        const access = await casinoHandler.checkAccess(groupId);
        if (!access.allowed) {
            await lineUtils.replyText(replyToken, access.message);
            return true;
        }

        try {
            const { db } = require('./db');
            const policeDoc = await db.collection('economy_users').doc(userId).get();
            if (policeDoc.exists && policeDoc.data().isPolice) {
                await lineUtils.replyText(replyToken, '❌ 你是【警察】，嚴禁參與賭博！\n知法犯法罪加一等，想賭就先「辭職」吧！');
                return true;
            }
        } catch (e) { /* ignore */ }

        if (!route.options.isMultiplayer) {
            if (!multiBlackjackHandler) multiBlackjackHandler = require('../handlers/multi_blackjack');
            const activeTable = multiBlackjackHandler.getActiveTable(groupId);
            if (activeTable) {
                await lineUtils.replyText(replyToken, `❌ 群組內目前有進行中的「多人 21 點」牌桌，為避免洗頻，請先結束後再玩其他遊戲！`);
                return true;
            }
        }
    }
    return false;
}

// 5. 全域禁玩狀態檢查
async function checkStatusBlockMW(context, message, route) {
    const { isSuper, replyToken } = context;
    if ((route.options.feature === 'casino' || route.options.feature === 'bank') && !isSuper) {
        const jailRedemption = require('../handlers/jail_redemption');
        if (jailRedemption.checkStatusBlock) {
            const blockResult = await jailRedemption.checkStatusBlock(context, route.options.feature);
            if (blockResult.blocked) {
                if (blockResult.message) {
                    await lineUtils.replyText(replyToken, blockResult.message);
                }
                return true;
            }
        }
    }
    return false;
}

// 6. 監獄狀態檢查
async function checkJailMW(context, message, route) {
    const { isSuper, userId } = context;
    if (!isSuper && typeof route.pattern !== 'function') {
        const jailHandler = require('../handlers/jail');
        const jailStatus = await jailHandler.checkJailStatus(userId);
        if (jailStatus.isJailed) {
            const isAllowedCommand = /^(查詢|說明|交保|保釋|越獄|撿肥皂|勞動|勞動改造|探監|暴動|發起暴動|吹喇叭|幫典獄長吹喇叭|監獄名單|探監名單|查監獄|狀態|屬性|我的屬性|我的狀態|擺平|施壓|收割韭菜|拖下水)/.test(message);
            if (!isAllowedCommand) {
                if (rateLimit.checkRateLimit(userId, 'jail_warn', 1, 60000)) {
                    const remainingMins = Math.ceil((jailStatus.jailedUntil - Date.now()) / 60000);
                    await jailHandler.replyJailMenu(context, remainingMins);
                }
                return true;
            }
        }
    }
    return false;
}

// 7. 管理員身分檢查
async function checkAdminMW(context, message, route) {
    const { userId } = context;
    const { needAdmin } = route.options;
    if (needAdmin) {
        const isAdmin = await authUtils.isAdmin(userId);
        if (!isAdmin) return true;
    }
    return false;
}

module.exports = {
    checkDMMW,
    checkBasicAuthMW,
    checkFeatureToggleMW,
    checkCasinoMW,
    checkStatusBlockMW,
    checkJailMW,
    checkAdminMW
};
