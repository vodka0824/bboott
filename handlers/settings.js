const lineUtils = require('../utils/line');
const authUtils = require('../utils/auth');
const flexUtils = require('../utils/flex');

// Definition of Settings UI Structure
const SETTINGS_STRUCT = {
    life: {
        label: '🛠️ 生活小幫手',
        color: '#1DB446',
        items: {
            news: '生活資訊', // Oil, Movie, News
            finance: '匯率金融', // Shortened
            weather: '天氣空氣', // Shortened
            food: '美食搜尋',
            delivery: '物流服務'
        }
    },
    entertainment: {
        label: '🎮 娛樂與互動',
        color: '#FF334B',
        items: {
            voice: '語音互動', // Shortened
            fun: '趣味功能',     // RPS, Draw
            leaderboard: '群組排行' // Shortened (Removed '榜' to match 4 chars if needed, or keep 5? '群組排行榜' is 5. '群組排行' is 4. '積分排行' is 4. Let's use '群組排行')
        }
    },
    todo: {
        label: '📝 待辦事項',
        color: '#AA33FF',
        items: {} // Standalone toggle
    },
    tsmc: {
        label: '🧑‍💻 台積電輪班星人',
        color: '#F44336',
        items: {} // Standalone toggle
    }
};

/**
 * 處理「群組設定」指令
 * 顯示功能開關儀表板
 */
async function handleSettingsCommand(context) {
    const { replyToken, userId, groupId, sourceType } = context;

    // 1. 權限檢查 (僅限 Admin 可操作)
    const isAdmin = await authUtils.isAdmin(userId);
    if (!isAdmin) {
        await lineUtils.replyText(replyToken, '❌ 權限不足：僅限機器人管理員可操作設定。');
        return;
    }

    if (sourceType !== 'group' && sourceType !== 'room') {
        await lineUtils.replyText(replyToken, '❌ 請在群組內使用此指令以讀取群組設定。');
        return;
    }

    // 2. 或是群組尚未授權
    const isAuthorized = await authUtils.isGroupAuthorized(groupId);
    if (!isAuthorized) {
        await lineUtils.replyText(replyToken, '❌ 此群組尚未註冊，無法設定功能。');
        return;
    }

    const bubble = await buildSettingsFlex(groupId);
    const flexMsg = flexUtils.createFlexMessage('⚙️ 群組功能設定', bubble);
    try {
        await lineUtils.replyToLine(replyToken, [flexMsg]);
    } catch (error) {
        console.error('[Settings] Error sending flex settings:', JSON.stringify(error.response?.data || error.message));
        await lineUtils.replyText(replyToken, '❌ 設定面板載入失敗');
    }
}

/**
 * 處理 Toggle Postback
 */
async function handleFeatureToggle(context, data) {
    const { replyToken, userId, groupId: currentGroupId } = context;

    // 1. 權限檢查 (僅限 Admin 可操作，非管理員點擊無反應)
    if (!await authUtils.isAdmin(userId)) {
        return;
    }

    const params = new URLSearchParams(data);
    const targetGroupId = params.get('groupId');
    const feature = params.get('feature');
    const enable = params.get('enable') === 'true';

    // 確保只操作當前群組
    if (context.isGroup && targetGroupId !== currentGroupId) {
        return;
    }

    // 執行切換
    const result = await authUtils.toggleGroupFeature(targetGroupId, feature, enable);

    if (result.success) {
        // 重新產生 Flex Message
        const bubble = await buildSettingsFlex(targetGroupId);
        const flexMsg = flexUtils.createFlexMessage('設定已更新', bubble);
        try {
            await lineUtils.replyToLine(replyToken, [flexMsg]);
        } catch (error) {
            console.error('[Settings] Error sending flex toggle:', JSON.stringify(error.response?.data || error.message));
            await lineUtils.replyText(replyToken, '❌ 更新面板失敗');
        }
    } else {
        await lineUtils.replyText(replyToken, `❌ 設定失敗: ${result.message}`);
    }
}

async function buildSettingsFlex(groupId) {
    const bodyContents = [];

    // Iterate Top-Level Categories
    for (const [catKey, config] of Object.entries(SETTINGS_STRUCT)) {
        // 1. Get Master Switch Status
        const isMasterEnabled = await authUtils.isFeatureEnabled(groupId, catKey);

        // Header Row (Category Label + Master Toggle)
        // Using createBox for custom layout (Label + Status Button)
        const masterToggle = flexUtils.createBox('horizontal', [
            flexUtils.createText({ text: config.label, weight: 'bold', size: 'md', color: config.color, flex: 1, gravity: 'center' }),
            {
                type: 'text',
                text: isMasterEnabled ? '✅ 全區開啟' : '🔴 全區關閉',
                size: 'xs',
                color: isMasterEnabled ? '#1DB446' : '#FF334B',
                align: 'end',
                gravity: 'center',
                action: {
                    type: 'postback',
                    data: `action=toggle_feature&feature=${catKey}&enable=${!isMasterEnabled}&groupId=${groupId}`
                }
            }
        ], { margin: 'lg', paddingAll: '5px', backgroundColor: flexUtils.COLORS.TEXT_SUB, cornerRadius: '4px' });

        bodyContents.push(masterToggle);

        // 2. Sub-Items Grid
        const itemKeys = Object.keys(config.items);
        if (itemKeys.length > 0) {
            let currentRow = [];
            for (let i = 0; i < itemKeys.length; i++) {
                const itemKey = itemKeys[i];
                const itemLabel = config.items[itemKey];
                const fullKey = `${catKey}.${itemKey}`;
                const isItemEnabled = await authUtils.isFeatureEnabled(groupId, fullKey);
                const nextState = !isItemEnabled;

                const itemBox = flexUtils.createBox('horizontal', [
                    flexUtils.createText({ text: itemLabel, size: 'sm', color: '#555555', flex: 1, gravity: 'center' }),
                    flexUtils.createText({ text: isItemEnabled ? 'ON' : 'OFF', size: 'xxs', weight: 'bold', color: isItemEnabled ? '#1DB446' : flexUtils.COLORS.TEXT_SUB, align: 'end', gravity: 'center' })
                ], {
                    backgroundColor: flexUtils.COLORS.BG_MAIN,
                    cornerRadius: '4px',
                    paddingAll: '4px',
                    margin: 'xs',
                    borderColor: '#EFEFEF',
                    borderWidth: '1px',
                    action: {
                        type: 'postback',
                        data: `action=toggle_feature&feature=${fullKey}&enable=${nextState}&groupId=${groupId}`
                    },
                    flex: 1
                });

                currentRow.push(itemBox);

                // Row constraints (2 items per row)
                if (currentRow.length === 2 || i === itemKeys.length - 1) {
                    bodyContents.push(flexUtils.createBox('horizontal', [...currentRow], { spacing: 'xs', margin: 'xs' }));
                    currentRow = [];
                }
            }
        }
    }

    // Build Final Bubble
    const header = flexUtils.createBox('vertical', [
        flexUtils.createText({ text: '⚙️ 群組功能設定', weight: 'bold', size: 'lg', color: flexUtils.COLORS.TEXT_MAIN }),
        flexUtils.createText({ text: '點擊標題切換全區，點擊按鈕切換細項', size: 'xxs', color: flexUtils.COLORS.TEXT_SUB })
    ], { backgroundColor: '#333333' });

    return flexUtils.createBubble({
        size: 'mega',
        header: header,
        body: flexUtils.createBox('vertical', bodyContents, { paddingAll: '12px', backgroundColor: flexUtils.COLORS.BG_MAIN })
    });
}

module.exports = {
    handleSettingsCommand,
    handleFeatureToggle
};
