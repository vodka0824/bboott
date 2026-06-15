/**
 * 餐廳搜尋模組
 */
const axios = require('axios');
const { GOOGLE_PLACES_API_KEY } = require('../config/constants');
const { db, Firestore } = require('../utils/db');

// 等待位置分享的用戶
const pendingLocationRequests = {};

const memoryCache = require('../utils/memoryCache');

// 搜尋附近餐廳
async function searchNearbyRestaurants(lat, lng, radius = 500) {
    // Geo-Caching: Round to 3 decimal places (approx 111m precision)
    // Key: `rest_25.123_121.456`
    const roundedLat = parseFloat(lat).toFixed(3);
    const roundedLng = parseFloat(lng).toFixed(3);
    const cacheKey = `rest_${roundedLat}_${roundedLng}`;

    const cached = memoryCache.get(cacheKey);
    if (cached) {
        // console.log(`[Restaurant] Cache Hit: ${cacheKey}`);
        return cached;
    }

    try {
        const url = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';
        const params = {
            location: `${lat},${lng}`,
            radius: radius,
            type: 'restaurant',
            language: 'zh-TW',
            key: GOOGLE_PLACES_API_KEY
        };

        const res = await axios.get(url, { params, timeout: 10000 });

        if (res.data.status !== 'OK' && res.data.status !== 'ZERO_RESULTS') {
            console.error('Places API 錯誤:', res.data.status);
            return null;
        }

        const results = res.data.results || [];

        const finalResults = results
            .filter(r => r.rating)
            .sort((a, b) => b.rating - a.rating)
            .slice(0, 5)
            .map(r => ({
                name: r.name,
                rating: r.rating || 0,
                userRatingsTotal: r.user_ratings_total || 0,
                vicinity: r.vicinity || '',
                priceLevel: r.price_level,
                isOpen: r.opening_hours?.open_now,
                types: r.types || [],
                placeId: r.place_id
            }));

        if (finalResults.length > 0) {
            memoryCache.set(cacheKey, finalResults, 60 * 60);
        }

        return finalResults;

    } catch (error) {
        console.error('搜尋附近餐廳錯誤:', error);
        return null;
    }
}

// 建立餐廳 Flex Message
function buildRestaurantFlex(restaurants, address) {
    const bubbles = restaurants.map((r, index) => {
        const priceText = r.priceLevel ? '💰'.repeat(r.priceLevel) : '';
        const openText = r.isOpen === true ? '🟢 營業中' : (r.isOpen === false ? '🔴 休息中' : '');

        return {
            type: 'bubble',
            size: 'kilo',
            body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    {
                        type: 'text',
                        text: `${index + 1}. ${r.name}`,
                        weight: 'bold',
                        size: 'md',
                        wrap: true
                    },
                    {
                        type: 'box',
                        layout: 'horizontal',
                        contents: [
                            { type: 'text', text: `⭐ ${r.rating}`, size: 'sm', color: '#FF8C00' },
                            { type: 'text', text: `(${r.userRatingsTotal} 則)`, size: 'sm', color: '#888888' },
                            { type: 'text', text: priceText || '-', size: 'sm', align: 'end' }
                        ],
                        margin: 'sm'
                    },
                    {
                        type: 'text',
                        text: r.vicinity,
                        size: 'xs',
                        color: '#666666',
                        wrap: true,
                        margin: 'sm'
                    },
                    {
                        type: 'text',
                        text: openText,
                        size: 'xs',
                        color: r.isOpen ? '#00AA00' : '#CC0000',
                        margin: 'sm'
                    }
                ]
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    {
                        type: 'button',
                        action: {
                            type: 'uri',
                            label: '📍 Google 地圖',
                            uri: `https://www.google.com/maps/place/?q=place_id:${r.placeId}`
                        },
                        style: 'primary',
                        height: 'sm',
                        color: '#4285F4'
                    }
                ]
            }
        };
    });

    return {
        type: 'carousel',
        contents: bubbles
    };
}

// 設置等待位置請求
function setPendingLocation(userId, groupId) {
    pendingLocationRequests[userId] = {
        groupId: groupId,
        timestamp: Date.now()
    };
}

// 取得等待位置請求
function getPendingLocation(userId) {
    const request = pendingLocationRequests[userId];
    if (!request || (Date.now() - request.timestamp > 5 * 60 * 1000)) {
        delete pendingLocationRequests[userId];
        return null;
    }
    return request;
}

// 清除等待位置請求
function clearPendingLocation(userId) {
    delete pendingLocationRequests[userId];
}

// === DB Operations for Custom Restaurants ===

// === DB Operations for Custom Restaurants ===

async function addRestaurant(groupId, name, city, userId) {
    const ref = db.collection('restaurants').doc(groupId);
    const doc = await ref.get();
    const newItem = { name, city: city || '未分類', createdBy: userId, createdAt: Date.now() };

    if (doc.exists) {
        await ref.update({
            items: Firestore.FieldValue.arrayUnion(newItem)
        });
    } else {
        await ref.set({ items: [newItem] });
    }
    return newItem;
}

async function removeRestaurant(groupId, name) {
    const ref = db.collection('restaurants').doc(groupId);

    try {
        return await db.runTransaction(async (t) => {
            const doc = await t.get(ref);
            if (!doc.exists) return false;

            const items = doc.data().items || [];
            // Relaxed: remove first match by name.
            const newItems = items.filter(r => r.name !== name);

            if (items.length === newItems.length) return false;

            t.update(ref, { items: newItems });
            return true;
        });
    } catch (e) {
        console.error('[Restaurant] Remove Error:', e);
        return false;
    }
}

async function getRestaurantList(groupId) {
    const doc = await db.collection('restaurants').doc(groupId).get();
    if (!doc.exists) return [];
    return doc.data().items || [];
}

// === Queue Handlers ===

async function handleAddRestaurant(replyToken, groupId, userId, rawArgs) {
    const lineUtils = require('../utils/line');
    if (!rawArgs) return lineUtils.replyText(replyToken, '❌ 請輸入：新增餐廳 [縣市] [名稱]');

    // Parse: City Name
    // Strategy: First token is city, rest is name.
    // If only one token, default city = '未分類'
    const parts = rawArgs.trim().split(/\s+/);
    let city = '未分類';
    let name = '';

    if (parts.length >= 2) {
        city = parts[0];
        name = parts.slice(1).join(' ');
    } else {
        name = parts[0];
        // Optional: Prompt user to include city?
        // return lineUtils.replyText(replyToken, '⚠️ 請包含縣市分類，例如：新增餐廳 台北 鼎泰豐');
    }

    await addRestaurant(groupId, name, city, userId);
    await lineUtils.replyText(replyToken, `✅ 已新增餐廳：${name} (${city})`);
}

async function handleRemoveRestaurant(replyToken, groupId, userId, name) {
    const lineUtils = require('../utils/line');
    if (!name) return lineUtils.replyText(replyToken, '❌ 請輸入餐廳名稱');

    const success = await removeRestaurant(groupId, name.trim());
    if (success) {
        await lineUtils.replyText(replyToken, `🗑️ 已移除餐廳：${name}`);
    } else {
        await lineUtils.replyText(replyToken, `❌ 找不到餐廳：${name}`);
    }
}

async function handleListRestaurants(replyToken, groupId) {
    const lineUtils = require('../utils/line');
    const list = await getRestaurantList(groupId);

    if (list.length === 0) {
        await lineUtils.replyText(replyToken, '📝 清單是空的');
    } else {
        // Group by City
        const grouped = {};
        list.forEach(r => {
            const c = r.city || '未分類';
            if (!grouped[c]) grouped[c] = [];
            grouped[c].push(r);
        });

        // Build Text
        let response = '🍽️ 餐廳口袋名單：\n';
        for (const [city, items] of Object.entries(grouped)) {
            response += `\n【${city}】\n`;
            response += items.map(r => `• ${r.name}`).join('\n');
            response += '\n';
        }

        await lineUtils.replyText(replyToken, response.trim());
    }
}

async function handleEatCommand(replyToken, groupId, userId, query) {
    const lineUtils = require('../utils/line');

    if (!query) {
        // Random from ALL
        const list = await getRestaurantList(groupId);
        if (list.length > 0) {
            const random = list[Math.floor(Math.random() * list.length)];
            await lineUtils.replyText(replyToken, `🎰 命運的選擇 (${random.city || '未分類'})：${random.name}`);
            return;
        }
        await lineUtils.replyText(replyToken, '📝 清單是空的，請先「新增餐廳 [縣市] [名]」');
        return;
    }

    // Handle Query
    if (query.includes('附近')) {
        setPendingLocation(userId, groupId);
        await lineUtils.replyText(replyToken, '📍 請傳送位置訊息給我，幫你找附近的餐廳！', [
            { action: { type: 'location', label: '📍 傳送位置' } }
        ]);
    } else {
        // Assume Query is City or Keyowrd
        const list = await getRestaurantList(groupId);
        // Filter by City (Exact) or Name (Partial)
        const targetCity = query.trim();
        const cityMatches = list.filter(r => (r.city || '未分類') === targetCity);

        if (cityMatches.length > 0) {
            const random = cityMatches[Math.floor(Math.random() * cityMatches.length)];
            await lineUtils.replyText(replyToken, `🎰 [${targetCity}] 命運的選擇：${random.name}`);
        } else {
            // Fallback: Name search? Or just tell no result in that city.
            await lineUtils.replyText(replyToken, `❓ 找不到「${targetCity}」分類的餐廳，或嘗試搜尋附近。`);
        }
    }
}

module.exports = {
    searchNearbyRestaurants,
    buildRestaurantFlex,
    setPendingLocation,
    getPendingLocation,
    clearPendingLocation,
    pendingLocationRequests,
    // New
    handleAddRestaurant,
    handleRemoveRestaurant,
    handleListRestaurants,
    handleEatCommand
};
