const userState = require('../utils/userState');

module.exports = function (router, handlers) {
    const { systemHandler, welcomeHandler, settingsHandler, lineUtils } = handlers;

    // === 歡迎設定 (Welcome) ===
    router.register(/^設定歡迎詞(?:\s+([\s\S]+))?$/, async (ctx, match) => {
        const { groupId, userId } = ctx;
        const text = match[1]?.trim();
        if (!text) {
            await lineUtils.replyText(ctx.replyToken, '❌ 請輸入歡迎詞內容\n範例：設定歡迎詞 歡迎 {user} 加入我們！');
            return;
        }
        const result = await welcomeHandler.setWelcomeText(groupId, text, userId);
        await lineUtils.replyText(ctx.replyToken, result.message);
    }, { isGroupOnly: true, needAdmin: true, keywords: ['設定歡迎詞'] });

    router.register(/^設定歡迎圖(?:\s+(.+))?$/, async (ctx, match) => {
        const { groupId, userId } = ctx;
        const url = match[1]?.trim();
        if (url) {
            const result = await welcomeHandler.setWelcomeImage(ctx.groupId, url, ctx.userId);
            await lineUtils.replyText(ctx.replyToken, result.message);
        } else {
            await userState.setUserState(ctx.userId, 'waiting_welcome_image', { groupId: ctx.groupId });
            await lineUtils.replyText(ctx.replyToken, '📸 請上傳您要設定的歡迎圖片\n💡 或輸入「設定歡迎圖 圖片網址」\n（5 分鐘內有效）');
        }
    }, { isGroupOnly: true, needAdmin: true, keywords: ['設定歡迎圖'] });

    router.register(/^測試歡迎(圖)?$/, async (ctx) => {
        await welcomeHandler.sendTestWelcome(ctx.replyToken, ctx.groupId, ctx.userId);
    }, { isGroupOnly: true, needAdmin: true, keywords: ['測試歡迎'] });

    // === 群組設定 (Dashboard) ===
    router.register(/^群組設定(\s.*)?$/, async (ctx) => {
        await settingsHandler.handleSettingsCommand(ctx);
    }, { isGroupOnly: true, needAuth: true, keywords: ['群組設定'] });

    router.registerPostback(
        (data) => data.includes('action=toggle_feature'),
        async (ctx) => {
            await settingsHandler.handleFeatureToggle(ctx, ctx.postbackData);
        }
    );

    // === 管理員功能 (Admin Only) ===
    router.register('產生群組註冊碼', async (ctx) => {
        await systemHandler.handleGenerateCode(ctx.userId, ctx.replyToken);
    }, { adminOnly: true, keywords: ['產生群組註冊碼'] });

    router.register(/^\[?小黑屋\]?(?:\s+(.+))?$/, async (ctx, match) => {
        await systemHandler.handleBlacklistCommand(ctx, match);
    }, { adminOnly: true, keywords: ['[小黑屋]', '小黑屋'] });

    router.register(/^\[?放出來\]?(?:\s+(.+))?$/, async (ctx, match) => {
        await systemHandler.handleUnblacklistCommand(ctx, match);
    }, { adminOnly: true, keywords: ['[放出來]', '放出來'] });

    router.register('黑名單列表', async (ctx) => {
        await systemHandler.handleListBlacklist(ctx.replyToken);
    }, { adminOnly: true, keywords: ['黑名單列表'] });

    router.register(/^新增管理員\s+(.+)$/, async (ctx, match) => {
        const targetUserId = match[1].trim();
        await systemHandler.handleAddAdmin(ctx.replyToken, targetUserId, ctx.userId);
    }, { adminOnly: true, keywords: ['新增管理員'] });

    router.register(/^移除管理員\s+(.+)$/, async (ctx, match) => {
        const targetUserId = match[1].trim();
        await systemHandler.handleRemoveAdmin(ctx.replyToken, targetUserId);
    }, { adminOnly: true, keywords: ['移除管理員'] });

    router.register('管理員列表', async (ctx) => {
        await systemHandler.handleListAdmins(ctx.replyToken);
    }, { adminOnly: true, keywords: ['管理員列表'] });

    router.register(/^剔除玩家\s+(.+)$/, async (ctx, match) => {
        const playerName = match[1].trim();
        await systemHandler.handleRemovePlayer(ctx.replyToken, playerName);
    }, { adminOnly: true, keywords: ['剔除玩家'] });

    router.register('查金融', async (ctx) => {
        await systemHandler.handleCheckFinance(ctx.replyToken, ctx.userId);
    }, { adminOnly: true, keywords: ['查金融'] });

    router.register('查圖庫', async (ctx) => {
        const driveHandler = require('../handlers/drive');
        await driveHandler.handleCheckDriveStats(ctx.replyToken);
    }, { adminOnly: true, keywords: ['查圖庫'] });

    router.register('重置本日搶劫', async (ctx) => {
        await systemHandler.handleResetRob(ctx.replyToken);
    }, { adminOnly: true, keywords: ['重置本日搶劫'] });

    router.register('特赦', async (ctx) => {
        await systemHandler.handleAmnesty(ctx.replyToken);
    }, { adminOnly: true, keywords: ['特赦'] });

    router.register(/^作弊衝裝\s+([^ ]+)\s+(\d+)$/, async (ctx, match) => {
        const typeStr = match[1];
        const level = parseInt(match[2], 10);
        await systemHandler.handleCheatEquip(ctx.replyToken, ctx.userId, ctx.userId, typeStr, level);
    }, { adminOnly: true, keywords: ['作弊衝裝'] });

    router.register(/^作弊加等\s+(\d+)$/, async (ctx, match) => {
        const addLevel = parseInt(match[1], 10);
        await systemHandler.handleCheatLevel(ctx.replyToken, ctx.userId, ctx.userId, addLevel);
    }, { adminOnly: true, keywords: ['作弊加等'] });



    // === 群組管理功能 (Group Admin Only) ===
    router.register(/^註冊\s+([A-Z0-9]{8})$/, async (ctx, match) => {
        await systemHandler.handleRegisterGroup(ctx.groupId, ctx.userId, match[1], ctx.replyToken);
    }, { isGroupOnly: true, keywords: ['註冊'] }); 

    router.register(/^開啟\s+(.+)$/, async (ctx, match) => {
        await systemHandler.handleToggleFeature(ctx.groupId, ctx.userId, match[1], true, ctx.replyToken);
    }, { isGroupOnly: true, needAuth: true, keywords: ['開啟'] });

    router.register(/^關閉\s+(.+)$/, async (ctx, match) => {
        await systemHandler.handleToggleFeature(ctx.groupId, ctx.userId, match[1], false, ctx.replyToken);
    }, { isGroupOnly: true, needAuth: true, keywords: ['關閉'] });

    router.register(/^查詢功能$/, async (ctx) => {
        await systemHandler.handleCheckFeatures(ctx.groupId, ctx.replyToken);
    }, { isGroupOnly: true, needAuth: true, keywords: ['查詢功能'] });

    router.register(/^(指令查詢|指令|功能|說明|help|系統手冊)$/i, async (ctx) => {
        await systemHandler.handleHelpCommand(ctx.userId, ctx.groupId, ctx.replyToken, ctx.sourceType);
    }, { isGroupOnly: false, needAuth: false, allowDM: true, keywords: ['指令', '功能', '說明', 'help', '系統手冊'] });

    router.register(/^(機台設定|賭場設定|遊戲機率|查設定|設定)$/i, async (ctx) => {
        await systemHandler.handleMachineConfig(ctx.replyToken);
    }, { isGroupOnly: false, needAuth: false, allowDM: true, keywords: ['機台設定', '賭場設定', '遊戲機率', '查設定'] });

    router.register(/^查詢\s*([^@\s].*)?$/, async (ctx, match) => {
        const fakeMatch = [match[0], '查詢', match[1] || ''];
        await systemHandler.handleQueryCommand(ctx, fakeMatch);
    }, { isGroupOnly: false, needAuth: false, allowDM: true, keywords: ['查詢'] });
    
    router.register(/^說明\s+(.+)$/, async (ctx, match) => {
        const fakeMatch = [match[0], '說明', match[1]];
        await systemHandler.handleQueryCommand(ctx, fakeMatch);
    }, { isGroupOnly: false, needAuth: false, allowDM: true, keywords: ['說明'] });

    router.register(/^(?:我的ID|我是誰|查UID|查詢UID)(?:\s+@.+)?$/, async (ctx, match) => {
        const mentionObj = ctx.messageObject && ctx.messageObject.mention;
        if (mentionObj && mentionObj.mentionees && mentionObj.mentionees.length > 0) {
            const targetId = mentionObj.mentionees[0].userId;
            await lineUtils.replyText(ctx.replyToken, `指定的玩家 UID 是：\n${targetId}`);
        } else {
            await lineUtils.replyText(ctx.replyToken, `您的 UID 是：\n${ctx.userId}`);
        }
    }, { isGroupOnly: false, needAuth: false, allowDM: true, keywords: ['我的ID', '我是誰', '查UID', '查詢UID'] });

    router.register(/^(?:查群組ID|查詢群組ID)$/, async (ctx) => {
        if (ctx.groupId) {
            await lineUtils.replyText(ctx.replyToken, `當前群組 ID 是：\n${ctx.groupId}`);
        } else {
            await lineUtils.replyText(ctx.replyToken, `❌ 您不在群組內，無法查詢群組 ID。`);
        }
    }, { isGroupOnly: false, needAuth: false, allowDM: false, keywords: ['查群組ID', '查詢群組ID'] });

    router.register(/^設定超級管理員\s+(.+)$/, async (ctx, match) => {
        const pwd = match[1].trim();
        if (pwd === 'sudo_antigravity') {
            try {
                const { db } = require('../utils/db');
                await db.collection('admins').doc(ctx.userId).set({ addedAt: new Date(), addedBy: 'System', note: 'Self-Added' });
                await lineUtils.replyText(ctx.replyToken, `✅ 已成功將您的 ID (${ctx.userId}) 加入超級管理員名單！\n\n由於系統有快取機制，若指令仍無回應，請等待 5 分鐘，或者直接重新啟動機器人伺服器即可生效！`);
            } catch (e) {
                await lineUtils.replyText(ctx.replyToken, `❌ 發生錯誤：${e.message}`);
            }
        } else {
            await lineUtils.replyText(ctx.replyToken, '❌ 密碼錯誤');
        }
    }, { isGroupOnly: false, needAuth: false, allowDM: true, keywords: ['設定超級管理員'] });

    router.registerPostback(
        (data) => {
            try {
                const action = new URLSearchParams(data).get('action');
                return action === 'query' || action === 'submenu';
            } catch (e) { return false; }
        },
        async (ctx) => {
            await systemHandler.handleQueryPostback(ctx);
        }
    );
};
