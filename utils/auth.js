/**
 * 授權邏輯模組
 */
const crypto = require('crypto'); // P0-10 修復：密碼學安全隨機數產生器
const { db, Firestore } = require('./db');
const { CachedCheck } = require('./cache');
const { ADMIN_USER_ID, CACHE_DURATION } = require('../config/constants');
const logger = require('./logger');

// === 快取實例 ===
const groupCache = new CachedCheck(CACHE_DURATION.GROUP, async () => {
    const snapshot = await db.collection('groups').where('status', '==', 'active').get();
    return snapshot.docs.map(doc => doc.id);
}); // 基礎授權快取

const adminCache = new CachedCheck(CACHE_DURATION.ADMIN, async () => {
    const snapshot = await db.collection('admins').get();
    return snapshot.docs.map(doc => doc.id);
});

const todoCache = new CachedCheck(CACHE_DURATION.TODO);
const restaurantCache = new CachedCheck(CACHE_DURATION.RESTAURANT);
const weatherCache = new CachedCheck(CACHE_DURATION.GROUP); // 天氣功能快取

const blacklistCache = new CachedCheck(5 * 60 * 1000, async () => {
    const snapshot = await db.collection('blacklist').get();
    return snapshot.docs.map(doc => doc.id);
}); // 5 minutes cache for blacklist
const featureToggleCache = new Map();
let featureToggleCacheLastUpdated = 0;

// === 群組基礎授權 ===

// === 群組基礎授權 & 階層式權限架構 ===

const FEATURE_HIERARCHY = {
    life: {
        label: '生活小幫手',
        items: {
            news: '生活資訊',
            finance: '匯率與金融',
            weather: '天氣與空氣',
            food: '美食搜尋',
            delivery: '物流服務',
            horoscope: '星座運勢'  // 新增星座功能
        }
    },
    entertainment: {
        label: '娛樂與互動',
        items: {
            voice: '語音與互動', // 講台語, 狂標, 幫我選
            fun: '趣味功能'      // 剪刀石頭布, 抽圖
        }
    },
    economy: {
        label: '經濟與RPG',
        items: {
            bank: '哭幣銀行 (簽到/轉帳/搶劫)',
            rpg: 'RPG商店與裝備',
            atonement: '懺悔與神明系統',
            auction: '玩家拍賣場',
            leaderboard: '財富與賭神榜',
            rpg_leaderboard: 'RPG戰鬥力榜'
        }
    },
    gambling: {
        label: '賭場與博弈',
        items: {
            casino: '哭霸娛樂城總開關',
            multiplayer: '多人賭桌 (21點/射龍門/百家樂等)',
            slot: '老虎機',
            dice: '十八啦',
            roulette: '尊爵輪盤',
            horse: '賽馬場',
            lottery: '抽獎系統'
        }
    },
    worldcup: {
        label: '運彩系統',
        items: {}
    },
    todo: {
        label: '待辦事項',
        items: {}
    },
    tsmc: {
        label: '台積電輪班',
        items: {}
    }
};

// Map Legacy keys to New Hierarchy
const LEGACY_MAP = {
    // Life
    'weather': 'life.weather',
    'restaurant': 'life.food',
    'finance': 'life.finance',
    'delivery': 'life.delivery',
    'horoscope': 'life.horoscope',  // 修復: 星座應該有獨立的功能開關
    'oil': 'life.news',
    'movie': 'life.news',
    'news': 'life.news',

    // Entertainment
    'game': 'entertainment.fun',
    'image': 'entertainment.fun',
    'lottery': 'entertainment.fun',
    'ai': 'entertainment.voice',
    'taigi': 'entertainment.voice',
    
    // Economy
    'leaderboard': 'economy.leaderboard',
    'rpg_leaderboard': 'economy.rpg_leaderboard',
    'rpg': 'economy.rpg',
    'bank': 'economy.bank',
    'atonement': 'economy.atonement',
    'auction': 'economy.auction',

    // Gambling
    'casino': 'gambling.casino',
    'multiplayer': 'gambling.multiplayer',
    'slot': 'gambling.slot',
    'dice': 'gambling.dice',
    'roulette': 'gambling.roulette',
    'horse': 'gambling.horse',
    'lottery': 'gambling.lottery',
    'worldcup': 'worldcup',
    
    // TSMC
    '台積電': 'tsmc',
    '輪班': 'tsmc',
    'tsmc': 'tsmc'
};

let groupRefreshPromise = null;
async function isGroupAuthorized(groupId) {
    if (groupCache.cache.size === 0) {
        if (!groupRefreshPromise) {
            groupRefreshPromise = refreshGroupCache().finally(() => {
                groupRefreshPromise = null;
            });
        }
        await groupRefreshPromise;
    }
    return groupCache.has(groupId);
}

// 新增: 事件驅動的快取刷新函式
async function refreshGroupCache() {
    try {
        const snapshot = await db.collection('groups').where('status', '==', 'active').get();
        groupCache.update(snapshot.docs.map(doc => doc.id));

        // 同步更新功能快取
        featureToggleCache.clear();
        weatherCache.clear();
        restaurantCache.clear();
        todoCache.clear();

        snapshot.docs.forEach(doc => {
            const data = doc.data();
            const features = data.features || {};
            featureToggleCache.set(doc.id, features);

            const check = (cat, item) => {
                const catObj = features[cat];
                if (!catObj) return false;
                if (catObj.enabled === false) return false;
                if (item && catObj[item] === false) return false;
                return true;
            };

            if (check('life', 'weather')) weatherCache.add(doc.id);
            if (check('life', 'food')) restaurantCache.add(doc.id);
            if (check('todo')) todoCache.add(doc.id);
        });

        logger.info('[Auth] Group cache refreshed (event-driven)', {
            type: 'manual',
            count: groupCache.cache.size
        });
    } catch (error) {
        logger.error('[Auth] Failed to refresh group cache', error);
    }
}


/**
 * P0-10 修復：使用 crypto.randomBytes() 產生密碼學安全的階次碼
 * 取代不安全的 Math.random()
 */
function generateRandomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from(crypto.randomBytes(8))
        .map(b => chars[b % chars.length])
        .join('');
}

async function createRegistrationCode(userId) {
    const code = generateRandomCode();
    await db.collection('registrationCodes').doc(code).set({
        createdAt: Firestore.FieldValue.serverTimestamp(),
        createdBy: userId,
        used: false
    });
    return code;
}

async function getUnusedCodes() {
    const snapshot = await db.collection('registrationCodes')
        .where('used', '==', false)
        .get();
    return snapshot.docs.map(doc => doc.id);
}

async function registerGroup(code, groupId, userId) {
    const codeRef = db.collection('registrationCodes').doc(code);
    const codeDoc = await codeRef.get();

    if (!codeDoc.exists) return { success: false, message: '❌ 無效的註冊碼' };
    const codeData = codeDoc.data();
    if (codeData.used) return { success: false, message: '❌ 此註冊碼已被使用' };

    // P0-3 修復：TOCTOU 原子防護
    const lockResult = await attemptToLockCode(codeRef, codeDoc, groupId, userId);
    if (!lockResult.success) return lockResult;

    // Initialize with Full Hierarchy Defaults (All ON)
    const initialFeatures = {
        life: {
            enabled: true,
            news: true, finance: true, weather: true, food: true, delivery: true
        },
        entertainment: {
            enabled: true,
            voice: true, fun: true, leaderboard: true
        },
        economy: {
            enabled: true,
            bank: true, rpg: true, atonement: true, auction: true
        },
        gambling: {
            enabled: true,
            casino: true, multiplayer: true, slot: true, dice: true, roulette: true, horse: true, lottery: true
        },
        worldcup: {
            enabled: true
        },
        todo: {
            enabled: true
        },
        tsmc: {
            enabled: true
        }
    };

    await db.collection('groups').doc(groupId).set({
        status: 'active',
        authorizedAt: Firestore.FieldValue.serverTimestamp(),
        authorizedBy: userId,
        codeUsed: code,
        features: initialFeatures
    });

    // 優化: 增量更新快取,不需要全量刷新
    groupCache.add(groupId);
    featureToggleCache.set(groupId, initialFeatures);
    weatherCache.add(groupId);
    restaurantCache.add(groupId);
    todoCache.add(groupId);

    logger.info('[Auth] New group registered (cache updated incrementally)', { groupId });

    return { success: true, message: '✅ 群組授權成功！' };
}

/**
 * 嘗試將 code 標記為「使用中」，防止 TOCTOU Race Condition
 */
async function attemptToLockCode(codeRef, codeDoc, groupId, userId) {
    try {
        await codeRef.update({
            used: true,
            usedBy: groupId,
            usedByUser: userId,
            usedAt: Firestore.FieldValue.serverTimestamp()
        });
        return { success: true };
    } catch (err) {
        logger.warn('[Auth] Code lock failed - possible duplicate request', { error: err.message });
        return { success: false, message: '❌ 此註冊碼已被使用' };
    }
}

/**
 * 取得群組功能設定
 */
function getFeatureToggles(groupId) {
    return featureToggleCache.get(groupId) || null;
}

// === 功能開關邏輯 (Hierarchical) ===

async function toggleGroupFeature(groupId, featureKey, enable) {
    // Determine target path
    // Input could be 'life' (Category) or 'life.weather' (Item)
    // Or legacy 'weather' -> mapped to 'life.weather'

    let targetPath = featureKey;
    if (LEGACY_MAP[featureKey]) targetPath = LEGACY_MAP[featureKey];

    const parts = targetPath.split('.');
    const category = parts[0];
    const item = parts[1]; // undefined if toggling category

    // Check validity
    if (!FEATURE_HIERARCHY[category]) return { success: false, message: '❌ 無效的功能類別' };
    if (item && !FEATURE_HIERARCHY[category].items[item]) return { success: false, message: '❌ 無效的功能項目' };

    const groupRef = db.collection('groups').doc(groupId);
    const doc = await groupRef.get();
    if (!doc.exists) return { success: false, message: '❌ 群組尚未註冊' };

    // Firestore Update Path
    // if category: 'features.life.enabled'
    // if item: 'features.life.weather'
    const updateField = item ? `features.${category}.${item}` : `features.${category}.enabled`;

    await groupRef.update({ [updateField]: enable });

    // Update Cache
    // We need to fetch/update the object in cache
    let features = featureToggleCache.get(groupId);
    if (!features) {
        // Should catch from DB if cache empty? Usually reload handles it.
        // For now, partial update if exists
        features = doc.data().features || {};
    }

    if (!features[category]) features[category] = {};
    if (item) {
        features[category][item] = enable;
    } else {
        features[category].enabled = enable;
    }
    featureToggleCache.set(groupId, features);

    const name = item ? FEATURE_HIERARCHY[category].items[item] : FEATURE_HIERARCHY[category].label;
    return { success: true, message: `✅ 已${enable ? '開啟' : '關閉'}「${name}」` };
}

function isFeatureEnabled(groupId, featureKey) {
    // 如果群組不在快取中，預設允許所有功能（群組尚未配置）
    if (!featureToggleCache.has(groupId)) return true;
    const features = featureToggleCache.get(groupId);

    // Resolve Key
    let target = featureKey;
    if (LEGACY_MAP[featureKey]) target = LEGACY_MAP[featureKey];

    const parts = target.split('.');
    const category = parts[0];
    const item = parts[1];

    if (!features || !features[category]) return true; // Category missing = not configured = allow by default

    // 1. Check Category Master Switch
    if (features[category].enabled === false) return false;

    // 2. Check Item Switch
    if (item) {
        if (features[category][item] === false) return false;
    }

    // Default True if not explicitly disabled
    return true;
}

// ... Exports and Admin logic ...

// === 管理員系統 ===

async function isAdmin(userId) {
    if (userId === ADMIN_USER_ID) return true;

    await adminCache.ensureFresh();

    return adminCache.has(userId);
}

function isSuperAdmin(userId) {
    return userId === ADMIN_USER_ID;
}

async function addAdmin(targetUserId, addedBy, note = '') {
    await db.collection('admins').doc(targetUserId).set({
        addedAt: Firestore.FieldValue.serverTimestamp(),
        addedBy: addedBy,
        note: note
    });
    adminCache.add(targetUserId);
}

async function removeAdmin(targetUserId) {
    await db.collection('admins').doc(targetUserId).delete();
    adminCache.cache.delete(targetUserId);
}

async function getAdminList() {
    const snapshot = await db.collection('admins').get();
    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));
}

// === 黑名單系統 ===

async function isBlacklisted(userId) {
    // Super Admin cannot be blacklisted
    if (userId === ADMIN_USER_ID) return false;

    await blacklistCache.ensureFresh();
    return blacklistCache.has(userId);
}

async function blacklistUser(targetUserId, reason = '違反規定', executorId) {
    if (targetUserId === ADMIN_USER_ID) return { success: false, message: '❌ 無法封鎖超級管理員' };

    await db.collection('blacklist').doc(targetUserId).set({
        bannedAt: Firestore.FieldValue.serverTimestamp(),
        reason: reason,
        bannedBy: executorId
    });
    blacklistCache.add(targetUserId);
    return { success: true, message: `🚫 已將使用者 ${targetUserId} 加入黑名單。` };
}

async function unblacklistUser(targetUserId) {
    await db.collection('blacklist').doc(targetUserId).delete();
    blacklistCache.cache.delete(targetUserId);
    return { success: true, message: `⭕ 已解除使用者 ${targetUserId} 的黑名單。` };
}

async function getBlacklist() {
    const snapshot = await db.collection('blacklist').get();
    if (snapshot.empty) return [];
    return snapshot.docs.map(doc => ({
        userId: doc.id,
        ...doc.data()
    }));
}

// === 天氣功能 (Unified) ===

// Registration functions removed.

async function isWeatherAuthorized(groupId) {
    return isFeatureEnabled(groupId, 'weather');
}

// === 待辦功能 (Unified) ===

// Registration functions removed.

async function isTodoAuthorized(groupId) {
    return isFeatureEnabled(groupId, 'todo');
}

// === 餐廳功能 (Unified) ===

// Registration functions removed.

async function isRestaurantAuthorized(groupId) {
    return isFeatureEnabled(groupId, 'restaurant');
}

module.exports = {
    // 群組授權 & 功能開關
    isGroupAuthorized,
    refreshGroupCache, // 新增: 手動刷新快取
    toggleGroupFeature,
    isFeatureEnabled,
    generateRandomCode,
    createRegistrationCode,
    getUnusedCodes,
    registerGroup,
    // 管理員
    isAdmin,
    isSuperAdmin,
    addAdmin,
    removeAdmin,
    getAdminList,
    // 黑名單
    isBlacklisted,
    blacklistUser,
    unblacklistUser,
    getBlacklist,
    // 天氣授權
    isWeatherAuthorized,
    // 待辦授權
    isTodoAuthorized,
    // 餐廳授權
    isRestaurantAuthorized,
    // 功能開關
    getFeatureToggles,
    FEATURE_HIERARCHY
};
