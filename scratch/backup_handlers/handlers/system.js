/**
 * 系統/管理員功能模組
 */
const authUtils = require('../utils/auth');
const lineUtils = require('../utils/line');
// Updated Manual Layout

// === Admin Only: 產生註冊碼 ===

async function handleGenerateCode(userId, replyToken) {
    if (!authUtils.isSuperAdmin(userId)) {
        await lineUtils.replyText(replyToken, '❌ 您沒有權限執行此操作');
        return;
    }
    const code = await authUtils.createRegistrationCode(userId);
    await lineUtils.replyText(replyToken, `✅ 群組註冊碼：\n${code}\n\n群組指令：\n註冊 ${code}`);
}

// Other generation handlers removed.

// === Group Admin Only: 功能開關 ===

async function handleToggleFeature(groupId, userId, feature, enable, replyToken) {
    // 檢查管理員權限 (一般管理員即可)
    const isAdmin = await authUtils.isAdmin(userId);
    if (!isAdmin) {
        await lineUtils.replyText(replyToken, '❌ 只有管理員可以開關群組功能');
        return;
    }

    const featureMap = {
        '生活': 'life',
        '娛樂': 'entertainment',
        'AI': 'ai',
        '天氣': 'weather',
        '抽圖': 'image',
        '遊戲': 'game',
        '銀行': 'bank',
        'RPG': 'rpg',
        'RGB': 'rpg'
    };

    const featureCode = featureMap[feature] || feature;

    if (!Object.values(featureMap).includes(featureCode)) {
        await lineUtils.replyText(replyToken, `❌ 無效的功能名稱。可用功能：\n${Object.keys(featureMap).join('、')}`);
        return;
    }

    const result = await authUtils.toggleGroupFeature(groupId, featureCode, enable);
    await lineUtils.replyText(replyToken, result.message);
}

async function handleCheckFeatures(groupId, replyToken) {
    if (!groupId) {
        await lineUtils.replyText(replyToken, '❌ 此指令只能在群組中使用');
        return;
    }
    const config = authUtils.getFeatureToggles(groupId);
    if (!config) {
        await lineUtils.replyText(replyToken, '❌ 尚無設定資料');
        return;
    }

    // Config.features is map { life: true, weather: false ... }
    const featureMapReverse = {
        'life': '生活',
        'entertainment': '娛樂',
        'ai': 'AI',
        'weather': '天氣',
        'image': '抽圖',
        'game': '遊戲',
        'rpg': 'RPG'
    };

    const statusList = [];
    for (const [code, name] of Object.entries(featureMapReverse)) {
        const isEnabled = config.features && config.features[code];
        statusList.push(`${name}: ${isEnabled ? '✅ 開啟' : '🔴 關閉'}`);
    }

    await lineUtils.replyText(replyToken, `📊 群組功能狀態：\n\n${statusList.join('\n')}`);
}

// === Group Only: 註冊指令 ===

async function handleRegisterGroup(groupId, userId, code, replyToken) {
    if (!groupId) {
        await lineUtils.replyText(replyToken, '❌ 此指令只能在群組中使用');
        return;
    }
    const cleanCode = code.trim().toUpperCase();
    const result = await authUtils.registerGroup(cleanCode, groupId, userId);
    await lineUtils.replyText(replyToken, result.message);
}

// Feature registration handlers removed.

// === Help Command ===

async function handleHelpCommand(userId, groupId, replyToken, sourceType) {
    const isSuper = authUtils.isSuperAdmin(userId);
    const isAdmin = await authUtils.isAdmin(userId);
    let isAuthorizedGroup = false;
    let isWeatherAuth = false;
    let isRestaurantAuth = false;
    let isTodoAuth = false;
    // Default to true for non-group (Public behavior), or false?
    // User requested "Limited Zone", implies control.
    // If private chat, we can show them.
    let isFinanceAuth = true;
    let isDeliveryAuth = true;

    if (sourceType === 'group' || sourceType === 'room') {
        isAuthorizedGroup = await authUtils.isGroupAuthorized(groupId);
        isWeatherAuth = await authUtils.isWeatherAuthorized(groupId);
        isRestaurantAuth = await authUtils.isRestaurantAuthorized(groupId);
        isTodoAuth = await authUtils.isTodoAuthorized(groupId);

        // Check generic features
        if (isAuthorizedGroup) {
            isFinanceAuth = await authUtils.isFeatureEnabled(groupId, 'finance');
            isDeliveryAuth = await authUtils.isFeatureEnabled(groupId, 'delivery');
        } else {
            // Not authorized group -> likely basic features only? 
            // If group is not registered at all, usually only public features work.
            // But Limited Zone is separate.
            // If group is NOT registered, `isFeatureEnabled` might return true if default is true?
            // But usually we restrict features to registered groups? 
            // "Public features" (Old Finance) worked in unregistered groups.
            // "Limited Zone" might imply restriction.
            // Let's assume if Group is Authorized (Registered), we check flags.
            // If Group is NOT Authorized, we default to... True? (Keep public behavior?)
            // user: "將分期功能...移至此專區,並可獨立...設定".
            // If I disable it by default for unregistered groups, it breaks existing usage.
            // But if I enable it, they can't turn it off (no settings).
            // Let's assume default True.
            isFinanceAuth = true;
            isDeliveryAuth = true;
        }
    }

    const flex = buildSystemHelpFlex(isSuper, isAdmin, isAuthorizedGroup);
    await lineUtils.replyToLine(replyToken, [flex]);
}

const flexUtils = require('../utils/flex');
const aiUtils = require('./ai');
const { HELP_HUB_CONFIG, DETAILED_MANUALS, KEYWORD_TO_TOPIC } = require('../config/manual');

function buildHelpSection(title, color, items, marginTop = "sm") {
    const contents = [
        flexUtils.createText({ text: title, weight: "bold", size: "sm", color, margin: marginTop })
    ];
    items.forEach(item => {
        contents.push(parseMarkdownText(item, "#666666", "xs", "xs", true));
    });
    return contents;
}

function parseMarkdownText(text, defaultColor, defaultSize, defaultMargin, wrap) {
    if (!text.includes('`') && !text.includes('**')) {
        return flexUtils.createText({ text, size: defaultSize, color: defaultColor, wrap, margin: defaultMargin, align: 'start' });
    }
    const spans = [];
    const parts = text.split(/(`.+?`|\*\*.+?\*\*)/g);
    for (const part of parts) {
        if (!part) continue;
        if (part.startsWith('`') && part.endsWith('`')) {
            spans.push({ type: 'span', text: part.slice(1, -1), color: '#1976D2', weight: 'bold', size: defaultSize });
        } else if (part.startsWith('**') && part.endsWith('**')) {
            spans.push({ type: 'span', text: part.slice(2, -2), color: '#D32F2F', weight: 'bold', size: defaultSize });
        } else {
            spans.push({ type: 'span', text: part, color: defaultColor, size: defaultSize });
        }
    }
    return flexUtils.createText({ contents: spans, size: defaultSize, wrap, margin: defaultMargin, align: 'start' });
}

function buildSystemHelpFlex(isSuper, isAdmin, isAuthorized) {
    const bubbles = [];

    HELP_HUB_CONFIG.mainCategories.forEach(cat => {
        if (cat.adminOnly && !isSuper && !isAdmin) return;

        const contents = [];
        contents.push(flexUtils.createText({ text: cat.description, size: "sm", color: "#666666", wrap: true, margin: "sm" }));
        contents.push(flexUtils.createSeparator("sm"));
        
        cat.items.forEach(item => {
            contents.push(flexUtils.createText({ text: item, size: "xs", color: "#444444", margin: "xs" }));
        });

        contents.push(flexUtils.createSeparator("md"));
        contents.push({
            type: 'button', style: 'primary', height: 'sm', margin: 'md', color: cat.color,
            action: { type: 'postback', label: '📂 開啟詳細選單', data: `action=submenu&id=${cat.id}`, displayText: `開啟 ${cat.title} 選單` }
        });

        bubbles.push(flexUtils.createBubble({
            size: "kilo",
            header: flexUtils.createHeader(cat.title, "系統分區目錄", cat.color),
            body: flexUtils.createBox("vertical", contents, { paddingAll: "15px", backgroundColor: "#FFFFFF" })
        }));
    });

    return flexUtils.createFlexMessage("系統服務中心", flexUtils.createCarousel(bubbles));
}

// === Detailed Manuals Handler ===

async function handleQueryCommand(context, match) {
    const { replyToken, userId, groupId, sourceType } = context;
    const rawTopic = match[2] ? match[2].trim() : '';

    if (!rawTopic) {
        await handleHelpCommand(userId, groupId, replyToken, sourceType);
        return;
    }

    let topicKey = null;
    if (DETAILED_MANUALS[rawTopic]) {
        topicKey = rawTopic;
    } else {
        // 先將關鍵字依長度排序 (長度長的優先匹配，避免誤判)
        const sortedKeywords = Object.keys(KEYWORD_TO_TOPIC).sort((a, b) => b.length - a.length);
        for (const kw of sortedKeywords) {
            if (rawTopic.includes(kw)) {
                topicKey = KEYWORD_TO_TOPIC[kw];
                break;
            }
        }
    }

    if (!topicKey) {
        // Natural Language Search via AI (優化版本)
        try {
            // 提供更詳細的選項給 AI 判斷
            const manualContext = Object.entries(DETAILED_MANUALS).map(([key, manual]) => {
                const subtopics = manual.sections.map(s => s.subtitle).join(' / ');
                return `ID: ${key} | 名稱: ${manual.title} | 內容包含: ${subtopics}`;
            }).join('\n');

            const customPrompt = `玩家想查詢遊戲系統指令。請從以下說明書中挑選「最符合玩家意圖」的一個 ID 回傳給我。\n\n【說明書列表】\n${manualContext}\n\n如果玩家問的問題跟上述內容都無關，請絕對要回答 UNKNOWN。只能回傳 ID 或 UNKNOWN，不要有任何其他廢話或解釋。`;
            
            const aiResponse = await aiUtils.getAIReply(rawTopic, null, customPrompt);
            const predictedKey = aiResponse.trim();
            if (DETAILED_MANUALS[predictedKey]) {
                topicKey = predictedKey;
            }
        } catch (e) {
            console.error('[System] NLP Search Error:', e);
        }
    }

    if (topicKey && DETAILED_MANUALS[topicKey]) {
        await sendTopicManual(context, topicKey);
    } else {
        await lineUtils.replyText(replyToken, `❌ 找不到關於「${rawTopic}」的說明。\n您可以輸入「說明」來查看選單。`);
    }
}

async function handleSubMenu(context, submenuId) {
    const { replyToken, sourceType } = context;
    
    if (sourceType !== 'user' && submenuId !== 'life') {
        await lineUtils.replyText(replyToken, '⚠️ 為避免洗版群組，生活與娛樂以外的遊戲系統說明，請【私訊機器人】查詢喔！\n(點擊我的頭像加入好友，並傳送「說明」即可查看！)');
        return;
    }

    const submenu = HELP_HUB_CONFIG.subMenus[submenuId];
    if (!submenu) return;

    const contents = [
        flexUtils.createText({ text: submenu.title, weight: 'bold', size: 'xl', color: submenu.color, align: 'start', margin: 'md' }),
        flexUtils.createSeparator('md')
    ];

    submenu.sections.forEach(sec => {
        contents.push(
            flexUtils.createText({ text: sec.title, weight: 'bold', size: 'md', color: '#111111', margin: 'lg', align: 'start' }),
            parseMarkdownText(sec.content, '#444444', 'sm', 'sm', true)
        );
    });

    contents.push(flexUtils.createSeparator('xl'));

    if (submenu.buttons && submenu.buttons.length > 0) {
        submenu.buttons.forEach(btn => {
            contents.push({
                type: 'button', style: 'secondary', height: 'sm', margin: 'sm',
                action: { type: 'postback', label: btn.label, data: `action=query&topic=${btn.action}`, displayText: `查詢 ${btn.label.replace('📖 ', '')}` }
            });
        });
    }

    contents.push({
        type: 'button', style: 'primary', action: { type: 'postback', label: '🏠 回到主目錄', data: 'action=query&topic=hub', displayText: '說明' }, margin: 'md', color: '#1DB446'
    });

    const bubble = flexUtils.createBubble({
        size: 'mega',
        body: flexUtils.createBox('vertical', contents, { backgroundColor: '#FFFFFF', paddingAll: 'xl' })
    });

    await lineUtils.replyFlex(replyToken, submenu.title, bubble);
}

async function handleQueryPostback(context) {
    const { replyToken, postbackData, userId, groupId, sourceType } = context;
    const params = new URLSearchParams(postbackData);
    const action = params.get('action');

    if (action === 'submenu') {
        const id = params.get('id');
        await handleSubMenu(context, id);
        return;
    }

    const topic = params.get('topic');

    if (topic && DETAILED_MANUALS[topic]) {
        await sendTopicManual(context, topic);
    } else {
        await handleHelpCommand(userId, groupId, replyToken, sourceType);
    }
}

async function sendTopicManual(context, topicKey) {
    const { replyToken, sourceType } = context;
    const manual = DETAILED_MANUALS[topicKey];
    if (!manual) return;

    if (sourceType !== 'user' && manual.parentMenu !== 'life' && topicKey !== 'life') {
        await lineUtils.replyText(replyToken, '⚠️ 為避免洗版群組，生活與娛樂以外的詳細說明手冊，請【私訊機器人】查詢喔！\n(點擊我的頭像加入好友，並傳送「說明」即可查看！)');
        return;
    }

    if (manual.pages) {
        const bubbles = [];
        manual.pages.forEach((page, index) => {
            const contents = [
                flexUtils.createText({ text: manual.title, weight: 'bold', size: 'xl', color: manual.color, align: 'start', margin: 'md' }),
                flexUtils.createSeparator('md')
            ];

            contents.push(flexUtils.createText({ text: page.subtitle, weight: 'bold', size: 'lg', color: '#111111', margin: 'lg', align: 'start' }));

            page.sections.forEach(sec => {
                contents.push(
                    flexUtils.createText({ text: sec.subtitle, weight: 'bold', size: 'md', color: '#111111', margin: 'lg', align: 'start' }),
                    parseMarkdownText(sec.content, '#444444', 'sm', 'sm', true)
                );
            });

            contents.push(flexUtils.createSeparator('xl'));

            const navButtons = [];
            if (manual.parentMenu) {
                navButtons.push({
                    type: 'button', style: 'secondary', height: 'sm', margin: 'sm',
                    action: { type: 'postback', label: '⬅️ 回上一層', data: `action=submenu&id=${manual.parentMenu}`, displayText: '回上一層' }
                });
            }
            navButtons.push({
                type: 'button', style: 'primary', height: 'sm', margin: 'sm', color: '#1DB446',
                action: { type: 'postback', label: '🏠 回主選單', data: 'action=query&topic=hub', displayText: '主選單' }
            });

            contents.push(flexUtils.createBox('horizontal', navButtons, { margin: 'md', spacing: 'sm' }));
            contents.push(flexUtils.createText({ text: `${index + 1} / ${manual.pages.length}`, size: 'xs', color: '#aaaaaa', align: 'center', margin: 'md' }));

            bubbles.push(flexUtils.createBubble({
                size: 'mega',
                body: flexUtils.createBox('vertical', contents, { backgroundColor: '#FFFFFF', paddingAll: 'xl' })
            }));
        });

        const flex = flexUtils.createFlexMessage(`說明: ${manual.title}`, flexUtils.createCarousel(bubbles));
        await lineUtils.replyToLine(replyToken, [flex]);

    } else {
        const contents = [
            flexUtils.createText({ text: manual.title, weight: 'bold', size: 'xl', color: manual.color, align: 'start', margin: 'md' }),
            flexUtils.createSeparator('md')
        ];

        for (const sec of manual.sections) {
            contents.push(
                flexUtils.createText({ text: sec.subtitle, weight: 'bold', size: 'md', color: '#111111', margin: 'lg', align: 'start' }),
                parseMarkdownText(sec.content, '#444444', 'sm', 'sm', true)
            );
        }

        contents.push(flexUtils.createSeparator('xl'));
        
        const navButtons = [];
        if (manual.parentMenu) {
            navButtons.push({
                type: 'button', style: 'secondary', height: 'sm', margin: 'sm',
                action: { type: 'postback', label: '⬅️ 回上一層', data: `action=submenu&id=${manual.parentMenu}`, displayText: '回上一層' }
            });
        }
        navButtons.push({
            type: 'button', style: 'primary', height: 'sm', margin: 'sm', color: '#1DB446',
            action: { type: 'postback', label: '🏠 回主選單', data: 'action=query&topic=hub', displayText: '說明' }
        });

        contents.push(flexUtils.createBox('horizontal', navButtons, { margin: 'md', spacing: 'sm' }));

        const bubble = flexUtils.createBubble({
            size: 'mega',
            body: flexUtils.createBox('vertical', contents, { backgroundColor: '#FFFFFF', paddingAll: 'xl' })
        });

        const flex = flexUtils.createFlexMessage(`說明: ${manual.title}`, bubble);
        await lineUtils.replyToLine(replyToken, [flex]);
    }
}




async function handleBlacklistCommand(context, match) {
    const { replyToken, messageObject, userId } = context;
    const mentionObj = messageObject && messageObject.mention;

    const targets = [];
    if (mentionObj && mentionObj.mentionees) {
        for (const m of mentionObj.mentionees) {
            if (m.userId) targets.push(m.userId);
        }
    }

    if (match && match[1]) {
        const idMatches = match[1].match(/U[a-f0-9]{32}/gi);
        if (idMatches) {
            targets.push(...idMatches);
        }
    }

    if (targets.length === 0) {
        await lineUtils.replyText(replyToken, '❌ 請 Tag 要關進小黑屋的對象，或直接輸入對方的 LINE ID (U開頭)。\n如果 Tag 失敗代表對方未加好友，需手動輸入 ID。');
        return;
    }

    const results = [];
    for (const targetId of targets) {
        const res = await authUtils.blacklistUser(targetId, 'Admin Command', userId);
        results.push(res.message);
    }

    await lineUtils.replyText(replyToken, results.join('\n'));
}

async function handleUnblacklistCommand(context, match) {
    const { replyToken, messageObject } = context;
    const mentionObj = messageObject && messageObject.mention;

    const targets = [];
    if (mentionObj && mentionObj.mentionees) {
        for (const m of mentionObj.mentionees) {
            if (m.userId) targets.push(m.userId);
        }
    }

    if (match && match[1]) {
        const idMatches = match[1].match(/U[a-f0-9]{32}/gi);
        if (idMatches) {
            targets.push(...idMatches);
        }
    }

    if (targets.length === 0) {
        await lineUtils.replyText(replyToken, '❌ 請 Tag 要解除黑名單的對象，或直接輸入對方的 LINE ID (U開頭)。\n如果 Tag 失敗代表對方未加好友，可從「黑名單列表」查詢 ID。');
        return;
    }

    const results = [];
    for (const targetId of targets) {
        const res = await authUtils.unblacklistUser(targetId);
        results.push(res.message);
    }

    await lineUtils.replyText(replyToken, results.join('\n'));
}

async function handleListBlacklist(replyToken) {
    const list = await authUtils.getBlacklist();
    if (list.length === 0) {
        await lineUtils.replyText(replyToken, '🟢 目前沒有黑名單使用者');
        return;
    }

    const textList = list.map((u, i) => `${i + 1}. ${u.userId} (${u.reason || '無原因'})`).join('\n');
    await lineUtils.replyText(replyToken, `🚫 黑名單列表 (${list.length}人)：\n\n${textList}`);
}


async function handleCheatEquip(replyToken, userId, targetUserId, equipTypeStr, level) {
    if (!authUtils.isSuperAdmin(userId)) {
        await lineUtils.replyText(replyToken, '❌ 您沒有權限執行此操作');
        return;
    }
    const { db } = require('../utils/db');
    
    const map = { '武器': 'weapon', '盾牌': 'shield', '翅膀': 'wings', '手套': 'gloves', '項鍊': 'necklace', '戒指': 'ring' };
    const type = map[equipTypeStr] || equipTypeStr;
    if (!['weapon', 'shield', 'wings', 'gloves', 'necklace', 'ring'].includes(type)) {
        await lineUtils.replyText(replyToken, `❌ 無效的裝備部位「${equipTypeStr}」。有效值為：武器、盾牌、翅膀、手套、項鍊、戒指。`);
        return;
    }
    
    try {
        const targetRef = db.collection('players').doc(targetUserId);
        const doc = await targetRef.get();
        let data = doc.exists ? doc.data() : {};
        let equipments = data.equipments || {};
        
        if (!equipments[type]) {
            equipments[type] = { name: `${equipTypeStr}`, grade: 1, level: 0 };
        }
        equipments[type].level = level;
        
        await targetRef.set({ equipments }, { merge: true });
        
        const targetName = targetUserId === userId ? '您自己' : '該玩家';
        await lineUtils.replyText(replyToken, `👽 [GM 指令] 成功將 ${targetName} 的【${equipTypeStr}】強化等級設定為 +${level}！`);
    } catch (e) {
        console.error('Cheat equip error:', e);
        await lineUtils.replyText(replyToken, `❌ 設定失敗：${e.message}`);
    }
}

async function handleCheatLevel(replyToken, userId, targetUserId, addLevel) {
    if (!authUtils.isSuperAdmin(userId)) {
        await lineUtils.replyText(replyToken, '❌ 您沒有權限執行此操作');
        return;
    }
    const { db } = require('../utils/db');
    
    try {
        const targetRef = db.collection('players').doc(targetUserId);
        const doc = await targetRef.get();
        let data = doc.exists ? doc.data() : {};
        
        let currentLevel = data.level || 1;
        let newLevel = currentLevel + addLevel;
        if (newLevel < 1) newLevel = 1;
        
        // 依照公式 chatExp = level^2 * 10 寫入經驗值，使其能持續正常運作
        let newChatExp = Math.pow(newLevel, 2) * 10;
        
        await targetRef.set({ level: newLevel, chatExp: newChatExp }, { merge: true });
        
        const targetName = targetUserId === userId ? '您自己' : '該玩家';
        await lineUtils.replyText(replyToken, `👽 [GM 指令] 成功將 ${targetName} 的等級增加了 ${addLevel} 級！\n目前等級：Lv.${newLevel}`);
    } catch (e) {
        console.error('Cheat level error:', e);
        await lineUtils.replyText(replyToken, `❌ 設定失敗：${e.message}`);
    }
}


module.exports = {
    handleGenerateCode,
    handleToggleFeature,
    handleRegisterGroup,
    handleHelpCommand,
    handleCheckFeatures,
    handleBlacklistCommand,
    handleUnblacklistCommand,
    handleListBlacklist,
    handleAdminDashboard,
    handleSimulateGeneralHelp,
    handleQueryCommand,
    handleQueryPostback,
    sendTopicManual,
    handleMachineConfig,
    handleResetRob,
    handleAmnesty,
    handleCheckFinance,
    handleRemovePlayer,
    handleCheatEquip,
    handleCheatLevel
};

// === Test: Simulate General User Help ===
async function handleSimulateGeneralHelp(userId, groupId, replyToken, sourceType) {
    // Force Non-Admin
    const isSuper = false;
    const isAdmin = false;

    let isAuthorizedGroup = false;
    let isWeatherAuth = false;
    let isRestaurantAuth = false;
    let isTodoAuth = false;

    if (sourceType === 'group' || sourceType === 'room') {
        isAuthorizedGroup = await authUtils.isGroupAuthorized(groupId);
        isWeatherAuth = await authUtils.isWeatherAuthorized(groupId);
        isRestaurantAuth = await authUtils.isRestaurantAuthorized(groupId);
        isTodoAuth = await authUtils.isTodoAuthorized(groupId);
    }

    const flex = buildSystemHelpFlex(isSuper, isAdmin, isAuthorizedGroup, isWeatherAuth, isRestaurantAuth, isTodoAuth, true, true, sourceType);
    await lineUtils.replyToLine(replyToken, [flex]);
}

// === Admin Dashboard ===

async function handleAdminDashboard(userId, replyToken) {
    if (!authUtils.isSuperAdmin(userId)) {
        return;
    }
    const flex = buildAdminDashboardFlex();
    await lineUtils.replyToLine(replyToken, [flex]);
}

function buildAdminDashboardFlex() {
    return flexUtils.createFlexMessage("管理員後台",
        flexUtils.createBubble({
            size: "mega",
            header: flexUtils.createHeader("🛡️ 超級管理員後台", "Super Admin Control Panel", "#CC0000"),
            body: flexUtils.createBox("vertical", [
                // 1. Generate Code
                flexUtils.createText({ text: "🔑 註冊碼生成", weight: "bold", size: "sm", color: "#888888", margin: "md" }),
                flexUtils.createSeparator("sm"),
                flexUtils.createBox("horizontal", [
                    {
                        type: "button",
                        action: { type: "message", label: "📋 群組代碼", text: "產生註冊碼" },
                        style: "secondary", height: "sm", color: "#666666"
                    }
                ], { margin: "md", spacing: "md" }),

                // 2. System Mgmt
                flexUtils.createText({ text: "⚙️ 系統管理", weight: "bold", size: "sm", color: "#888888", margin: "xl" }),
                flexUtils.createSeparator("sm"),
                {
                    type: "button",
                    action: { type: "message", label: "👥 查看管理員列表", text: "管理員列表" },
                    style: "primary", margin: "md", color: "#333333"
                }
            ])
        })
    );
}

async function handleMachineConfig(replyToken) {
    const contents = [];

    // --- 標題 ---
    contents.push(
        flexUtils.createText({ text: '🎰 賭場機台透明度報告 🎰', weight: 'bold', size: 'xl', color: '#FFD700', align: 'center', margin: 'md' }),
        flexUtils.createText({ text: '哭霸娛樂城致力於提供公平的遊戲環境\n以下為各機台核心設定與期望值(EV)', size: 'xs', color: '#AAAAAA', align: 'center', wrap: true, margin: 'sm' }),
        flexUtils.createSeparator('md')
    );

    // --- 各機台資料 ---
    const configs = [
        {
            title: '🎰 經典拉霸機 (Slot)',
            text: '• 玩法：5條連線，中獎賠率最高 180倍 (Lucky 7)。\n• 特色：由三組 20格實體滾輪隨機選取。\n• 期望值 (EV)：約 85.8% (包含多連線疊加)\n• 簡評：低中獎率、高爆發，適合喜歡驚喜的玩家。'
        },
        {
            title: '🎲 骰子比大小 (Dice)',
            text: '• 玩法：猜大小賠率 1:1，豹子通殺。\n• 期望值 (EV)：約 97.2%\n• 簡評：最經典的賭場遊戲，簡單直觀。'
        },
        {
            title: '🔫 俄羅斯輪盤 (Russian Roulette)',
            text: '• 玩法：6發彈匣1顆子彈，每過一槍倍率翻升。\n• 倍率：1.14x ➡️ 1.42x ➡️ 1.9x ➡️ 2.85x ➡️ 5.7x\n• 期望值 (EV)：約 95.0% (每階段非常穩定)\n• 簡評：穩定的死亡遊戲，但請注意見好就收。'
        },
        {
            title: '🐎 皇家賽馬 (Horse Racing)',
            text: '• 小紅馬 (2倍)：勝率 47.0% (EV: 94.0%)\n• 獨角星 (3倍)：勝率 31.0% (EV: 93.0%)\n• 霸王龍 (5倍)：勝率 18.0% (EV: 90.0%)\n• 忍者龜 (20倍)：勝率 4.0% (EV: 80.0%)\n• 簡評：低賠率馬匹的期望值最划算。'
        },
        {
            title: '👑 VIP 尊爵輪盤 (VIP Wheel)',
            text: '• 玩法：每次 100萬哭幣，其中 20萬注入大獎池。\n• 機率：0 (50%)、50萬 (25%)、100萬 (15%)、300萬 (8%)、1000萬 (1.9%)、大獎池 (0.1%)\n• 基礎期望值 (不含獎池)：70.5%\n• 簡評：極高風險，完全為了拼那 0.1% 的暴富機會。'
        },
        {
            title: '🃏 多人對戰與百家樂',
            text: '• 莊家優勢：所有多人賭桌，莊家獲利時需繳交 5% 手續費。\n• 百家樂 EV：莊家 98.9%、閒家 98.7%、和局 85.6%。\n• 簡評：多人對戰期望值接近 100%，最為公平。'
        }
    ];

    configs.forEach((item) => {
        contents.push(
            flexUtils.createBox('vertical', [
                flexUtils.createText({ text: item.title, weight: 'bold', size: 'md', color: '#FFFFFF' }),
                flexUtils.createText({ text: item.text, size: 'sm', color: '#CCCCCC', wrap: true, margin: 'sm' })
            ], { paddingAll: 'sm', margin: 'sm', backgroundColor: '#222222', cornerRadius: 'sm' })
        );
    });

    // --- Footer ---
    contents.push(
        flexUtils.createSeparator('md'),
        flexUtils.createText({ text: '* EV (Expected Value) 代表長期遊玩的預期回報率。EV越接近 100% 代表越公平。', size: 'xxs', color: '#666666', wrap: true, margin: 'md' })
    );

    const bubble = flexUtils.createBubble({
        size: 'giga',
        body: flexUtils.createBox('vertical', contents, { backgroundColor: '#111111', paddingAll: 'xl' })
    });

    await lineUtils.replyFlex(replyToken, '賭場機台透明度報告', bubble);
}

async function handleResetRob(replyToken) {
    const { getDb } = require('../utils/db');
    try {
        const db = await getDb();
        const coll = db.collection('economy_users');
        const result = await coll.updateMany(
            {}, 
            { 
                $set: { 
                    robCount: 0, 
                    lastRobDate: '', 
                    robSpamCount: 0, 
                    lastRobSpamDate: '' 
                } 
            }
        );
        await lineUtils.replyText(replyToken, `✅ [最高權限] 成功重置 ${result.modifiedCount} 名玩家的本日搶劫次數與懲罰紀錄！大家又可以開搶了！`);
    } catch (e) {
        console.error('Reset rob error:', e);
        await lineUtils.replyText(replyToken, `❌ 重置失敗：${e.message}`);
    }
}

async function handleAmnesty(replyToken) {
    const { getDb } = require('../utils/db');
    try {
        const db = await getDb();
        const coll = db.collection('economy_users');
        const now = Date.now();
        
        // 只針對正在坐牢的人進行特赦
        const result = await coll.updateMany(
            { jailedUntil: { $gt: now } }, 
            { 
                $set: { 
                    jailedUntil: 0,
                    wantedLevel: 0
                },
                $unset: {
                    jailbreakCooldownUntil: "" // 同時清除越獄冷卻
                }
            }
        );
        
        await lineUtils.replyText(replyToken, `🕊️ [最高權限] 總統特赦令頒布！\n總計有 ${result.modifiedCount} 名囚犯獲得無條件釋放！`);
    } catch (e) {
        console.error('Amnesty error:', e);
        await lineUtils.replyText(replyToken, `❌ 特赦失敗：${e.message}`);
    }
}

async function handleCheckFinance(replyToken, adminUserId) {
    const { getDb } = require('../utils/db');
    try {
        const db = await getDb();
        const coll = db.collection('economy_users');
        
        const docs = await coll.find({}).toArray();
        if (docs.length === 0) {
            await lineUtils.replyText(replyToken, '📊 目前沒有任何玩家經濟資料。');
            return;
        }

        let totalPositive = 0;
        let totalDebt = 0;
        let totalCirculation = 0;
        let validPlayerCount = 0;

        docs.forEach(doc => {
            if (doc._id === adminUserId) return; // 排除管理員自己
            
            const coin = doc.kuCoin || 0;
            
            if (coin > 0) totalPositive += coin;
            if (coin < 0) totalDebt += Math.abs(coin);
            
            totalCirculation += coin;
            validPlayerCount++;
        });

        const msg = `🏦 【群組金融總覽】\n\n` +
                    `👥 統計人數: ${validPlayerCount} 人\n` +
                    `💰 市場總資產: ${totalPositive.toLocaleString()} 哭幣\n` +
                    `📉 呆帳總負債: ${totalDebt.toLocaleString()} 哭幣\n` +
                    `------------------------\n` +
                    `💸 在外流通總量: ${totalCirculation.toLocaleString()} 哭幣\n\n` +
                    `(註：已扣除您本身的帳戶資產與負債)`;
                    
        await lineUtils.replyText(replyToken, msg);
    } catch (e) {
        console.error('Check finance error:', e);
        await lineUtils.replyText(replyToken, `❌ 查詢失敗：${e.message}`);
    }
}

async function handleRemovePlayer(replyToken, playerName) {
    try {
        const { getDb } = require('../utils/db');
        const lineUtils = require('../utils/line');
        const collName = process.env.ECONOMY_COLLECTION || 'economy_users';
        
        const db = await getDb();
        const coll = db.collection(collName);

        const query = {
            $or: [
                { displayName: playerName },
                { name: playerName }
            ]
        };

        const docs = await coll.find(query).toArray();

        if (docs.length === 0) {
            await lineUtils.replyText(replyToken, `❌ 找不到名稱為「${playerName}」的玩家。`);
            return;
        }

        const result = await coll.updateMany(query, { $set: { kuCoin: 0 } });

        await lineUtils.replyText(replyToken, `✅ 已將 ${result.modifiedCount} 名名稱為「${playerName}」的玩家財產強制歸零，他們將從財富排行榜中消失。`);
    } catch (e) {
        console.error('Remove player error:', e);
        const lineUtils = require('../utils/line');
        await lineUtils.replyText(replyToken, `❌ 移除失敗：${e.message}`);
    }
}
