/**
 * 群組排行榜模組
 */
const { db, Firestore } = require('../utils/db');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');

// 抽圖類型列表
const IMAGE_TYPES = ['奶子', '美尻', '絕對領域', '黑絲', '白絲', '腳控', 'JK'];

// In-Memory Write Buffer
// Map<string, Object> -> Key: `${groupId}_${userId}`
const MESSAGE_BUFFER = new Map();
const FLUSH_INTERVAL = 5 * 1000; // 5 Seconds (Optimized for local MongoDB)

/**
 * Flush Buffer to Firestore
 */
async function flushBuffer() {
    if (MESSAGE_BUFFER.size === 0) return;

    console.log(`[Leaderboard] Flushing buffer... (${MESSAGE_BUFFER.size} users)`);
    let batch = db.batch();
    let opCount = 0;
    const MAX_BATCH_SIZE = 450; // Safety margin below 500

    const entries = Array.from(MESSAGE_BUFFER.entries());
    MESSAGE_BUFFER.clear(); // Clear immediately to avoid double-write race

    for (const [key, data] of entries) {
        if (opCount >= MAX_BATCH_SIZE) {
            await batch.commit();
            console.log(`[Leaderboard] Batch committed (${opCount} ops)`);
            batch = db.batch();
            opCount = 0;
        }

        // 使用本機模擬器支援的子集合路徑：groups/{groupId}/leaderboard/{userId}
        const ref = db.collection('groups').doc(data.groupId)
            .collection('leaderboard').doc(data.userId);

        const updateData = {
            lastActive: new Date(data.lastActive),
            displayName: data.displayName
        };

        if (data.messageCount > 0) {
            updateData.messageCount = Firestore.FieldValue.increment(data.messageCount);
        }

        if (data.totalImageCount > 0) {
            updateData.totalImageCount = Firestore.FieldValue.increment(data.totalImageCount);
        }

        // Image types
        for (const [imgType, count] of Object.entries(data.imageCounts)) {
            if (count > 0) {
                updateData[`image_${imgType}`] = Firestore.FieldValue.increment(count);
            }
        }

        batch.set(ref, updateData, { merge: true });
        opCount++;
    }

    if (opCount > 0) {
        await batch.commit();
        console.log(`[Leaderboard] Final Batch committed (${opCount} ops)`);
    }
}

// Start Timer
setInterval(flushBuffer, FLUSH_INTERVAL);

/**
 * 記錄用戶發言 (Buffered)
 */
async function recordMessage(groupId, userId, displayName = null) {
    if (!groupId || !userId) return;

    const key = `${groupId}_${userId}`;
    let entry = MESSAGE_BUFFER.get(key);

    if (!entry) {
        // Try to resolve name if missing (Async inside sync-like flow? We can just fire and forget sort of)
        // If we await here, we slow down the chat.
        // Let's use provided displayName or '未知用戶' and let flush handle eventual correctness or name update.
        // Or fetch name only if not in buffer?

        let finalName = displayName;
        if (!finalName) {
            // Check cache or just use 'Unknown' and let next update fix it?
            // To be safe and quick: Don't await API here.
            // But prompts say `recordMessage` is async.
            // Current `displayName` from buffer might be stale if we don't update.
        }

        entry = {
            groupId,
            userId,
            displayName: displayName, // Can be null, flush will just use what we have
            messageCount: 0,
            imageCounts: {},
            totalImageCount: 0,
            lastActive: Date.now(),
            nameFetchAttempted: false // Optimization: Prevent spam
        };
        MESSAGE_BUFFER.set(key, entry);
    }

    // Update Buffer
    entry.messageCount += 1;
    entry.lastActive = Date.now();
    if (displayName) entry.displayName = displayName; // Update name if provided

    // If name is still missing and this is a new entry, maybe fetch it?
    // Cost tradeoff: API call vs DB write. API call is free-ish (rate limit).
    // Let's only fetch if we really don't have a name and random chance? 
    // Or just fetch in `recordMessage` before buffer update if needed.
    // Original code fetched name. Let's keep fetching name if missing, then update buffer.

    // Optimization: Check if already attempted to prevent API spam
    if (!entry.displayName && !entry.nameFetchAttempted) {
        entry.nameFetchAttempted = true;
        try {
            // Only fetch if not already fetching? 
            // Simplification: Fetch and update entry
            const name = await lineUtils.getGroupMemberName(groupId, userId);
            if (name) entry.displayName = name;
        } catch (e) { }
    }
}

/**
 * 記錄用戶抽圖 (Buffered)
 */
async function recordImageUsage(groupId, userId, imageType, displayName = null) {
    if (!groupId || !userId || !imageType) return;

    const key = `${groupId}_${userId}`;
    let entry = MESSAGE_BUFFER.get(key);

    if (!entry) {
        entry = {
            groupId,
            userId,
            displayName: displayName,
            messageCount: 0,
            imageCounts: {},
            totalImageCount: 0,
            lastActive: Date.now(),
            nameFetchAttempted: false
        };
        MESSAGE_BUFFER.set(key, entry);
    }

    entry.totalImageCount += 1;
    entry.imageCounts[imageType] = (entry.imageCounts[imageType] || 0) + 1;
    entry.lastActive = Date.now();

    if (displayName) entry.displayName = displayName;

    if (!entry.displayName && !entry.nameFetchAttempted) {
        entry.nameFetchAttempted = true;
        try {
            const name = await lineUtils.getGroupMemberName(groupId, userId);
            if (name) entry.displayName = name;
        } catch (e) { }
    }
}

// Cache Settings
const CACHE_DURATION = 5 * 1000; // 5 Seconds (Optimized for local MongoDB)
const leaderboardCache = new Map();

/**
 * Helper: Fetch and Cache Leaderboard Data
 */
async function fetchAndCacheLeaderboard(groupId) {
    const cached = leaderboardCache.get(groupId);
    const now = Date.now();

    if (cached && (now - cached.timestamp < CACHE_DURATION)) {
        console.log(`[Leaderboard] Cache Hit for Group: ${groupId}`);
        return cached.data;
    }

    console.log(`[Leaderboard] Cache Miss/Expired. Fetching from DB for Group: ${groupId}`);
    try {
        // 使用子集合路徑取得排行榜資料
        const snapshot = await db.collection('groups').doc(groupId)
            .collection('leaderboard')
            .get();

        const leaders = [];
        snapshot.forEach(doc => {
            // 子集合文件的 id 格式為 `{groupId}_{userId}`，需要擷取出原始 userId
            const rawId = doc.id;
            const userId = rawId.startsWith(groupId + '_')
                ? rawId.slice(groupId.length + 1)
                : rawId;
            leaders.push({
                id: userId,
                ...doc.data()
            });
        });

        leaderboardCache.set(groupId, {
            timestamp: now,
            data: leaders
        });

        return leaders;
    } catch (error) {
        console.error('[Leaderboard] Fetch failed:', error.message);
        return cached ? cached.data : [];
    }
}

/**
 * 取得群組排行榜 (Top 10) - Cached
 * @deprecated Use fetchAndCacheLeaderboard directly
 */
async function getLeaderboard(groupId) {
    const leaders = await fetchAndCacheLeaderboard(groupId);
    return [...leaders]
        .sort((a, b) => (b.messageCount || 0) - (a.messageCount || 0))
        .slice(0, 10);
}

/**
 * 取得用戶排名 - Cached
 */
async function getUserRank(groupId, userId) {
    const leaders = await fetchAndCacheLeaderboard(groupId);

    // Calculate Rank based on messageCount
    const validLeaders = leaders.filter(l => (l.messageCount || 0) > 0);
    const sortedLeaders = validLeaders.sort((a, b) => b.messageCount - a.messageCount);

    const index = sortedLeaders.findIndex(u => u.id === userId);

    // Retrieve userStats whether ranked or not
    const fullIndex = leaders.findIndex(u => u.id === userId);
    const userStats = fullIndex !== -1 ? leaders[fullIndex] : null;

    let rank = 0;
    if (index !== -1) {
        rank = index + 1;
    }

    return { rank, stats: userStats };
}

/**
 * 建構排行榜 Flex Message
 */
/**
 * 建構單一排行榜 Bubble
 */
function buildRankBubble(title, leaders, userRank, valueKey, unit, color, userId) {
    if (!leaders || leaders.length === 0) {
        return flexUtils.createBubble({
            size: 'micro',
            header: flexUtils.createHeader(title, "", color),
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: '尚無記錄', size: 'xs', color: flexUtils.COLORS.TEXT_MUTED, align: 'center' })
            ], { backgroundColor: flexUtils.COLORS.BG_MAIN, paddingAll: '10px'  })
        });
    }

    const medals = ['🥇', '🥈', '🥉'];
    const rows = leaders.slice(0, 5).map((leader, i) =>
        flexUtils.createBox('horizontal', [
            flexUtils.createText({ text: medals[i] || `${i + 1}.`, size: 'xs', flex: 1, color: i < 3 ? flexUtils.COLORS.PRIMARY : flexUtils.COLORS.TEXT_MUTED, gravity: 'center' }),
            flexUtils.createText({ text: leader.displayName || '未知', size: 'xs', flex: 4, weight: leader.id === userId ? 'bold' : 'regular', color: leader.id === userId ? '#1E88E5' : '#333333', gravity: 'center', wrap: true }),
            flexUtils.createText({ text: `${leader[valueKey] || 0}`, size: 'xs', flex: 2, align: 'end', color: '#E65100', gravity: 'center' })
        ], { margin: 'xs' })
    );

    let footer = undefined;
    if (userRank.rank > 0) {
        footer = flexUtils.createBox('vertical', [
            flexUtils.createText({ text: `📊 你的排名: 第 ${userRank.rank} 名 (${userRank.stats?.[valueKey] || 0} ${unit})`, size: 'xxs', color: '#1E88E5', align: 'center' })
        ], { paddingAll: '6px', backgroundColor: '#E3F2FD' });
    }

    // Custom Header to include Unity (e.g., '則', '次') aligned to right
    // Standard createHeader doesn't support right-aligned unit text easily without modification.
    // So I will construct header manually using createBox but helper for text.
    const customHeader = flexUtils.createBox('horizontal', [
        flexUtils.createText({ text: title, weight: 'bold', size: 'md', color: flexUtils.COLORS.TEXT_MAIN, flex: 4 }),
        flexUtils.createText({ text: unit, size: 'xxs', color: flexUtils.COLORS.TEXT_MAIN, align: 'end', flex: 1, gravity: 'bottom' })
    ], { backgroundColor: color, paddingAll: '8px' });

    const bubbleOpts = {
        size: 'micro',
        header: customHeader,
        body: flexUtils.createBox('vertical', rows, { backgroundColor: flexUtils.COLORS.BG_MAIN, paddingAll: '6px'  })
    };
    if (footer) bubbleOpts.footer = footer;

    return flexUtils.createBubble(bubbleOpts);
}

/**
 * 建構排行榜 Flex Message (Carousel)
 */
function buildLeaderboardFlex(leaders, userRank, userId) {
    const bubbles = [];

    // Helper to get sorted and filtered lists
    const getValidLeaders = (key) => leaders.filter(l => (l[key] || 0) > 0).sort((a, b) => b[key] - a[key]);

    // 1. 發言排行榜
    const msgLeaders = leaders.messageCount || [];
    bubbles.push(buildRankBubble('🏆 發言榜', msgLeaders,
        { rank: getRank(msgLeaders, userId), stats: userRank.stats },
        'messageCount', '則', flexUtils.COLORS.PRIMARY, userId));

    // 2. 抽圖總榜
    const imgLeaders = leaders.totalImageCount || [];
    bubbles.push(buildRankBubble('📸 抽圖總榜', imgLeaders,
        { rank: getRank(imgLeaders, userId), stats: userRank.stats },
        'totalImageCount', '次', '#FF334B', userId));

    // 3. 各類別分開
    const breastLeaders = leaders['image_奶子'] || [];
    bubbles.push(buildRankBubble('👙 奶子榜', breastLeaders,
        { rank: getRank(breastLeaders, userId), stats: userRank.stats },
        'image_奶子', '次', '#FF69B4', userId));

    const buttLeaders = leaders['image_美尻'] || [];
    bubbles.push(buildRankBubble('🍑 美尻榜', buttLeaders,
        { rank: getRank(buttLeaders, userId), stats: userRank.stats },
        'image_美尻', '次', '#FF8da1', userId));

    const zettaiLeaders = leaders['image_絕對領域'] || [];
    bubbles.push(buildRankBubble('👗 絕對領域', zettaiLeaders,
        { rank: getRank(zettaiLeaders, userId), stats: userRank.stats },
        'image_絕對領域', '次', '#9C27B0', userId));

    const heisiLeaders = leaders['image_黑絲'] || [];
    bubbles.push(buildRankBubble('🦵 黑絲榜', heisiLeaders,
        { rank: getRank(heisiLeaders, userId), stats: userRank.stats },
        'image_黑絲', '次', '#333333', userId));

    const baisiLeaders = leaders['image_白絲'] || [];
    bubbles.push(buildRankBubble('🦶 白絲榜', baisiLeaders,
        { rank: getRank(baisiLeaders, userId), stats: userRank.stats },
        'image_白絲', '次', flexUtils.COLORS.TEXT_SUB, userId));

    const jkLeaders = leaders['image_JK'] || [];
    bubbles.push(buildRankBubble('🎀 JK榜', jkLeaders,
        { rank: getRank(jkLeaders, userId), stats: userRank.stats },
        'image_JK', '次', flexUtils.COLORS.BG_CARD, userId));

    return {
        type: 'carousel',
        contents: bubbles
    };
}

function getRank(validList, userId) {
    const index = validList.findIndex(u => u.id === userId);
    return index >= 0 ? index + 1 : 0;
}

/**
 * 處理排行榜查詢
 */
async function handleLeaderboard(replyToken, groupId, userId) {
    const allLeaders = await fetchAndCacheLeaderboard(groupId);
    const userRank = await getUserRank(groupId, userId);
    
    // We need to filter and get top 5/10 for each category dynamically
    const categories = ['messageCount', 'totalImageCount', 'image_奶子', 'image_美尻', 'image_絕對領域', 'image_黑絲', 'image_白絲', 'image_JK'];
    const filteredLeaders = {};
    const membershipCache = new Map(); // cache to avoid duplicate API calls
    
    const isMember = async (uid) => {
        if (membershipCache.has(uid)) return membershipCache.get(uid);
        try {
            const profile = await lineUtils.getGroupMemberProfile(groupId, uid);
            const valid = profile.inGroup !== false;
            membershipCache.set(uid, valid);
            return valid;
        } catch (e) {
            membershipCache.set(uid, false);
            return false;
        }
    };

    for (const cat of categories) {
        const validList = allLeaders.filter(l => (l[cat] || 0) > 0).sort((a, b) => b[cat] - a[cat]);
        const topInCat = [];
        for (const item of validList) {
            if (await isMember(item.id)) {
                topInCat.push(item);
                if (topInCat.length >= 10) break;
            }
        }
        filteredLeaders[cat] = topInCat;
    }

    const flex = buildLeaderboardFlex(filteredLeaders, userRank, userId);

    await lineUtils.replyFlex(replyToken, '群組排行榜', flex);
}

/**
 * 處理我的排名查詢
 */
async function handleMyRank(replyToken, groupId, userId) {
    const { rank, stats } = await getUserRank(groupId, userId);

    if (!stats) {
        await lineUtils.replyText(replyToken, '❌ 你尚未有互動記錄');
        return;
    }

    await lineUtils.replyFlex(replyToken, '我的排名', {
        type: 'bubble',
        size: 'kilo',
        body: {
            type: 'box',
            layout: 'vertical',
            contents: [
                { type: 'text', text: '📊 我的發言統計', weight: 'bold', size: 'lg', color: '#1E88E5' },
                { type: 'separator', margin: 'md' },
                {
                    type: 'box',
                    layout: 'horizontal',
                    margin: 'lg',
                    contents: [
                        { type: 'text', text: '排名', size: 'md', color: flexUtils.COLORS.TEXT_MUTED },
                        { type: 'text', text: rank > 0 ? `第 ${rank} 名` : '未上榜', size: 'md', weight: 'bold', align: 'end', color: flexUtils.COLORS.PRIMARY }
                    ]
                },
                {
                    type: 'box',
                    layout: 'horizontal',
                    margin: 'md',
                    contents: [
                        { type: 'text', text: '發言次數', size: 'md', color: flexUtils.COLORS.TEXT_MUTED },
                        { type: 'text', text: `${stats.messageCount || 0} 則`, size: 'md', weight: 'bold', align: 'end', color: '#E65100' }
                    ]
                }
            ],
            paddingAll: '15px'
        }
    });
}

module.exports = {
    recordMessage,
    recordImageUsage,
    getLeaderboard,
    getUserRank,
    handleLeaderboard,
    handleMyRank,
    flushBuffer // Exported for Graceful Shutdown
};
