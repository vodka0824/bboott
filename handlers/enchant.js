const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const { db } = require('../utils/db');
const notificationService = require('../services/notificationService');

// --- Game Config ---
const COLLECTION_NAME = 'lineage_users';
const INITIAL_WEAPON = { name: '木劍', level: 0, safe: 0, max: 99 }; // Safe 0 = No Safe Zone
const PROBABILITY = {
    // Hardcore Mode (No Safe Zone)
    0: 0.80,  // +0 -> +1 (20% chance to break instantly!)
    1: 0.80,
    2: 0.70,
    3: 0.70,
    4: 0.60,
    5: 0.50,  // +5 -> +6 (50/50)
    6: 0.33,  // +6 -> +7 (Classic Hell)
    7: 0.33,
    8: 0.33,
    9: 0.20,  // +9 -> +10
    10: 0.10  // +10 -> +11
    // Default 10% for anything higher
};

// --- Images ---
const IMG = {
    SWORD_NORMAL: 'https://cdn-icons-png.flaticon.com/512/3014/3014521.png', // Fallback
    SWORD_WOOD: 'https://static.wikia.nocookie.net/minecraft_gamepedia/images/d/d5/Wooden_Sword_JE2_BE2.png', // Minecraft Wooden Sword
    SWORD_BROKEN: 'https://cdn-icons-png.flaticon.com/512/3233/3233503.png',
    SCROLL: 'https://cdn-icons-png.flaticon.com/512/2534/2534164.png'
};

const COLORS = {
    SAFE: '#4CAF50',
    DANGER: '#D32F2F',
    GOLD: '#FFD700',
    BG_DARK: '#263238'
};

/**
 * Get User Data (or init)
 */
async function getUserData(userId) {
    const ref = db.collection(COLLECTION_NAME).doc(userId);
    const doc = await ref.get();

    if (!doc.exists) {
        const newUser = {
            weapon: { ...INITIAL_WEAPON },
            scrolls: 999, // Infinite for Phase 1
            history: { maxLevel: 0, broken: 0 }
        };
        await ref.set(newUser);
        return newUser;
    }
    return doc.data();
}

/**
 * Check Enchant Probability
 * Returns: 'success' | 'fail'
 */
function calculateResult(level) {
    // No safe zone in Phase 2
    const rate = PROBABILITY[level] || 0.05; // Default 5% for anything higher
    return Math.random() < rate ? 'success' : 'fail';
}

/**
 * Helper to get Owner Name
 */
async function getOwnerName(userId, groupId) {
    if (groupId) {
        const name = await lineUtils.getGroupMemberName(groupId, userId);
        if (name && name !== '成員') return name;
    }
    // Fallback to direct profile (for DM or failed group fetch)
    const profile = await lineUtils.getProfile(userId);
    return profile && profile.displayName ? profile.displayName : '冒險者';
}

/**
 * Build Dashboard Flex
 */
async function buildDashboardFlex(user, userId, groupId) {
    const { weapon } = user;
    const isSafe = weapon.level < 0; // No safe zone
    const rateText = `⚠️ 危險! 成功率 ${(PROBABILITY[weapon.level] || 0.05) * 100}%`;

    const ownerName = await getOwnerName(userId, groupId);

    // Choose Icon
    const iconUrl = (weapon.name === '木劍' && weapon.level < 7) ? IMG.SWORD_WOOD : IMG.SWORD_NORMAL;

    return flexUtils.createBubble({
        size: 'mega',
        header: {
            type: 'box',
            layout: 'vertical',
            contents: [
                { type: 'text', text: `${ownerName} 的鐵匠舖`, weight: 'bold', color: '#FFFFFF', size: 'lg' }
            ],
            backgroundColor: COLORS.BG_DARK
        },
        body: flexUtils.createBox('vertical', [
            // Weapon Icon
            {
                type: 'image',
                url: iconUrl,
                size: 'xl',
                aspectRatio: '1:1',
                aspectMode: 'fit'
            },
            // Weapon Name & Level
            flexUtils.createText({ text: `+${weapon.level}`, size: '4xl', weight: 'bold', color: COLORS.GOLD, align: 'center' }),
            flexUtils.createText({ text: `${weapon.name}`, size: 'xl', weight: 'bold', color: '#333333', align: 'center', margin: 'sm' }),

            // Stats
            flexUtils.createSeparator('md'),
            flexUtils.createText({ text: rateText, size: 'sm', color: isSafe ? COLORS.SAFE : COLORS.DANGER, align: 'center', margin: 'md' }),
            flexUtils.createText({ text: `📜 卷軸: 無限`, size: 'xs', color: '#999999', align: 'center', margin: 'sm' }),

            // Button
            flexUtils.createButton({
                label: '🔥 強化!',
                style: 'primary',
                color: isSafe ? COLORS.SAFE : COLORS.DANGER,
                action: { type: 'message', label: '強化', text: '衝裝-執行' },
                margin: 'lg'
            })
        ])
    });
}

/**
 * Build Result Flex
 */
async function buildResultFlex(result, oldLevel, newLevel, weaponName, userId, groupId) {
    const isSuccess = result !== 'fail';

    const ownerName = await getOwnerName(userId, groupId);

    const title = isSuccess ? '🎉 強化成功!' : '💀 強化失敗...';
    const color = isSuccess ? COLORS.GOLD : '#9E9E9E';

    // Icon logic
    let icon = IMG.SWORD_BROKEN;
    if (isSuccess) {
        icon = (weaponName === '木劍' && newLevel < 7) ? IMG.SWORD_WOOD : IMG.SWORD_NORMAL;
    }

    const msg = isSuccess
        ? `${ownerName} 的 ${weaponName} 升級為 +${newLevel}!`
        : `${ownerName} 的 +${oldLevel} ${weaponName} 產生了激烈的銀色光芒後消失了...`;

    const contents = [
        { type: 'image', url: icon, size: 'xl', aspectRatio: '1:1', aspectMode: 'fit' },
        flexUtils.createText({ text: title, size: 'xxl', weight: 'bold', color: color, align: 'center' }),
        flexUtils.createText({ text: msg, size: 'md', weight: 'bold', color: isSuccess ? COLORS.SAFE : COLORS.DANGER, align: 'center', wrap: true, margin: 'md' })
    ];

    // Buttons
    if (!isSuccess) {
        // Failed -> Reset Button
        contents.push(flexUtils.createButton({
            label: '🔄 領取新武器',
            style: 'secondary',
            action: { type: 'message', label: '重來', text: '衝裝-重置' },
            margin: 'lg'
        }));
    } else {
        // Success -> Enchant Again (Direct Action)
        // Show next probability
        const nextRate = PROBABILITY[newLevel] !== undefined ? PROBABILITY[newLevel] : 0.1;
        // Logic for next safe check
        // const isNextSafe = newLevel < 6; // Logic removed since safe zone removed
        const btnColor = COLORS.DANGER; // Always dangerous now

        contents.push(flexUtils.createButton({
            label: `🔥 繼續強化 (+${newLevel}->+${newLevel + 1})`,
            style: 'primary',
            color: btnColor,
            action: { type: 'message', label: '繼續', text: '衝裝-執行' }, // Direct Action
            margin: 'lg'
        }));
    }

    return flexUtils.createBubble({
        body: flexUtils.createBox('vertical', contents, { paddingAll: '20px' }),
        styles: { body: { backgroundColor: isSuccess ? '#FFF8E1' : '#ECEFF1' } }
    });
}

/**
 * Handle Leaderboard
 */
async function handleLeaderboard(replyToken) {
    try {
        const snapshot = await db.collection(COLLECTION_NAME)
            .orderBy('weapon.level', 'desc')
            .limit(10)
            .get();

        if (snapshot.empty) {
            await lineUtils.replyText(replyToken, '🏆 目前還沒有人衝裝，快來當第一名！');
            return;
        }

        const rows = [];
        let rank = 1;

        for (const doc of snapshot.docs) {
            const data = doc.data();
            const profile = await lineUtils.getUserProfile(doc.id);
            const name = profile ? profile.displayName : `勇者${doc.id.substring(0, 4)}`;
            const weapon = data.weapon || { name: '無', level: 0 };

            // Rank Icon
            let rankIcon = '▫️';
            if (rank === 1) rankIcon = '🥇';
            if (rank === 2) rankIcon = '🥈';
            if (rank === 3) rankIcon = '🥉';

            rows.push(flexUtils.createBox('horizontal', [
                flexUtils.createText({ text: `${rankIcon} ${rank}`, flex: 1, color: '#333333', weight: 'bold' }),
                flexUtils.createText({ text: name, flex: 4, color: '#555555', wrap: true }),
                flexUtils.createText({ text: `+${weapon.level} ${weapon.name}`, flex: 3, align: 'end', color: COLORS.DANGER, weight: 'bold' })
            ], { margin: 'sm' }));
            rank++;
        }

        const bubble = flexUtils.createBubble({
            header: flexUtils.createHeader('🏆 衝裝排行榜', '全服十大神兵', COLORS.GOLD),
            body: flexUtils.createBox('vertical', rows)
        });

        await lineUtils.replyFlex(replyToken, '衝裝排行榜', bubble);

    } catch (e) {
        console.error('[Leaderboard] Error:', e);
        // Fallback for missing index
        if (e.code === 9 || (e.message && e.message.includes('index'))) {
            await lineUtils.replyText(replyToken, '🚧 排行榜初始化中 (Missing Index)，請建立索引後再試。');
        } else {
            await lineUtils.replyText(replyToken, '❌ 讀取排行榜失敗');
        }
    }
}

/**
 * Main Handler
 */
async function handleEnchant(replyToken, text, userId, groupId) {
    const userRef = db.collection(COLLECTION_NAME).doc(userId);
    let userData = await getUserData(userId);

    // 0. Leaderboard
    if (text === '衝裝排行') {
        await handleLeaderboard(replyToken);
        return;
    }

    // 1. Dashboard / Check
    if (text === '衝裝' || text === '衝裝-查看') {
        if (!userData.weapon) {
            userData.weapon = { ...INITIAL_WEAPON };
            await userRef.set(userData);
        }
        const flex = await buildDashboardFlex(userData, userId);
        await lineUtils.replyFlex(replyToken, '鐵匠舖', flex);
        return;
    }

    // 2. Execute Enchant
    if (text === '衝裝-執行') {
        if (!userData.weapon) {
            return lineUtils.replyText(replyToken, '你沒有武器！輸入「衝裝-重置」領取一把。');
        }

        const currentLvl = userData.weapon.level;
        const result = calculateResult(currentLvl);

        if (result === 'safe' || result === 'success') {
            // Level Up
            const newLvl = currentLvl + 1;
            userData.weapon.level = newLvl;
            if (newLvl > (userData.history.maxLevel || 0)) {
                userData.history.maxLevel = newLvl;
            }
            await userRef.set(userData);

            // Broadcast if high level
            if (newLvl >= 9 && groupId) {
                await notificationService.queueNotification(groupId, { type: 'text', text: `📢 全服廣播: 恭喜玩家衝出了 +${newLvl} 的神兵！` });
            }

            const flex = await buildResultFlex('success', currentLvl, newLvl, userData.weapon.name, userId);
            await lineUtils.replyFlex(replyToken, '強化結果', flex);

        } else {
            // Failed (Break)
            userData.weapon = null;
            userData.history.broken = (userData.history.broken || 0) + 1;
            await userRef.set(userData);

            const flex = await buildResultFlex('fail', currentLvl, 0, INITIAL_WEAPON.name, userId);
            await lineUtils.replyFlex(replyToken, '強化結果', flex);
        }
    }

    // 3. Reset
    if (text === '衝裝-重置') {
        userData.weapon = { ...INITIAL_WEAPON };
        await userRef.set(userData);
        await lineUtils.replyText(replyToken, '鐵匠給了你一把新的 +0 木劍。請好好珍惜。');
    }
}

module.exports = { handleEnchant };
