/**
 * Google Drive 隨機圖片模組
 * 使用 Google Drive API Key 存取（不需服務帳號憑證）
 */
const axios = require('axios');
const { CACHE_DURATION, KEYWORD_MAP } = require('../config/constants');
const memoryCache = require('../utils/memoryCache');

const DRIVE_CACHE_DURATION = CACHE_DURATION.DRIVE; // 60 分鐘
const DRIVE_API_KEY = process.env.GOOGLE_DRIVE_API_KEY || '';

/**
 * 初始化快取 (預取所有關鍵字的檔案清單)
 */
async function initDriveCache() {
    if (!DRIVE_API_KEY) {
        console.warn('[Drive] GOOGLE_DRIVE_API_KEY 未設定，跳過預取快取。');
        return;
    }
    console.log('[Drive] Initializing Prefetch...');
    const folderIds = Object.values(KEYWORD_MAP);

    const promises = folderIds.map(async (folderId) => {
        await getRandomDriveImage(folderId);
    });

    await Promise.all(promises);
    console.log(`[Drive] Prefetch Complete. Cached ${folderIds.length} folders.`);
}

/**
 * 從指定 Drive 資料夾隨機取得一張圖片 URL
 */
async function getRandomDriveImage(folderId) {
    if (!DRIVE_API_KEY) {
        console.warn('[Drive] GOOGLE_DRIVE_API_KEY 未設定，無法取得圖片。');
        return null;
    }

    const cacheKey = `drive_files_${folderId}`;
    const now = Date.now();

    // 檢查 Memory Cache
    const cached = memoryCache.get(cacheKey);
    if (cached) {
        console.log(`[Drive] Memory Cache HIT: ${cacheKey}`);

        // Stale-While-Revalidate: 接近過期時後台刷新
        const cacheAge = now - cached.timestamp;
        if (cacheAge > DRIVE_CACHE_DURATION * 0.9) {
            console.log(`[Drive] Cache aging (${Math.round(cacheAge / 60000)}min), triggering background refresh`);
            fetchDriveList(folderId).catch(err => console.error('[Drive] Background Refresh Fail', err));
        }

        const files = cached.files;
        if (!files || files.length === 0) return null;

        const randomFile = files[Math.floor(Math.random() * files.length)];
        return buildDriveUrl(randomFile);
    }

    // Cache Miss: 同步等待 API 呼叫
    console.log(`[Drive] Cache MISS for ${cacheKey}. Fetching synchronously...`);
    const files = await fetchDriveList(folderId);

    if (!files || files.length === 0) {
        console.warn(`[Drive] No files found for ${folderId}`);
        return null;
    }

    const randomFile = files[Math.floor(Math.random() * files.length)];
    return buildDriveUrl(randomFile);
}

/**
 * 建構 Google Drive 圖片直連 URL
 */
function buildDriveUrl(file) {
    const ext = file.mimeType === 'image/png' ? '#.png' : '#.jpg';
    return `https://lh3.googleusercontent.com/u/0/d/${file.id}=w1000${ext}`;
}

/**
 * 使用 Google Drive API Key 取得資料夾內的圖片清單
 */
async function fetchDriveList(folderId) {
    const cacheKey = `drive_files_${folderId}`;

    try {
        console.log(`[Drive API] Fetching List: ${folderId}`);

        let allFiles = [];
        let pageToken = null;

        do {
            const params = {
                q: `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`,
                fields: 'nextPageToken, files(id, mimeType)',
                pageSize: 1000,
                key: DRIVE_API_KEY
            };
            if (pageToken) params.pageToken = pageToken;

            const response = await axios.get('https://www.googleapis.com/drive/v3/files', {
                params,
                timeout: 15000
            });

            const files = response.data.files;
            if (files && files.length > 0) {
                const fileData = files.map(f => ({ id: f.id, mimeType: f.mimeType }));
                allFiles = allFiles.concat(fileData);
            }

            pageToken = response.data.nextPageToken;
            if (pageToken) {
                console.log(`[Drive API] Fetching next page for ${folderId} (Current total: ${allFiles.length})...`);
            }

        } while (pageToken);

        if (allFiles.length === 0) {
            console.warn(`[Drive] Folder ${folderId} is empty or not publicly accessible.`);
            return null;
        }

        console.log(`[Drive API] Total files fetched for ${folderId}: ${allFiles.length}`);

        // 更新 Memory Cache（TTL 60 分鐘）
        memoryCache.set(cacheKey, {
            files: allFiles,
            timestamp: Date.now()
        }, DRIVE_CACHE_DURATION / 1000);

        console.log(`[Drive] Cached ${allFiles.length} files to Memory: ${cacheKey}`);
        return allFiles;

    } catch (error) {
        if (error.response) {
            const status = error.response.status;
            const msg = error.response.data?.error?.message || error.message;
            console.error(`[Drive API] HTTP ${status} Error for ${folderId}: ${msg}`);

            if (status === 403) {
                console.error('[Drive API] 403 Forbidden: 請確認 API Key 正確，且資料夾已設為「知道連結的人均可查看」');
            } else if (status === 400) {
                console.error('[Drive API] 400 Bad Request: 請確認 GOOGLE_DRIVE_API_KEY 已在 .env 設定');
            }
        } else {
            console.error('[Drive API] Network Error:', error.message);
        }
        return null;
    }
}

/**
 * 取得 Google Drive 即時檔案數量及狀態
 */
async function getRealTimeDriveStats() {
    if (!DRIVE_API_KEY) {
        return {};
    }
    console.log('[Drive] Starting real-time stats fetch...');
    const stats = {};

    const queries = Object.entries(KEYWORD_MAP).map(async ([key, folderId]) => {
        const files = await fetchDriveList(folderId);
        stats[key] = files ? files.length : 0;
    });

    try {
        await Promise.all(queries);
        console.log('[Drive] Real-time stats fetch complete.');
    } catch (error) {
        console.error('[Drive] Real-time stats fetch failed:', error);
    }

    return stats;
}

async function handleCheckDriveStats(replyToken) {
    const lineUtils = require('../utils/line');
    const flexUtils = require('../utils/flex');
    const stats = await getRealTimeDriveStats();
    
    if (Object.keys(stats).length === 0) {
        await lineUtils.replyText(replyToken, '❌ 無法取得數據，請稍後再試。'); return;
    }
    
    let totalCount = 0;
    const rows = Object.entries(stats).map(([name, count]) => {
        totalCount += count;
        return flexUtils.createBox('horizontal', [
            flexUtils.createText({ text: name, flex: 3, color: '#555555' }),
            flexUtils.createText({ text: `${count.toLocaleString()} 張`, flex: 2, align: 'end', weight: 'bold', color: flexUtils.COLORS.BG_CARD })
        ], { margin: 'sm' });
    });
    
    rows.push(flexUtils.createSeparator('md'));
    rows.push(flexUtils.createBox('horizontal', [
        flexUtils.createText({ text: '總計', flex: 3, weight: 'bold', color: '#1E90FF' }),
        flexUtils.createText({ text: `${totalCount.toLocaleString()} 張`, flex: 2, align: 'end', weight: 'bold', color: '#1E90FF' })
    ], { margin: 'md' }));

    const bubble = flexUtils.createBubble({
        size: 'kilo',
        header: flexUtils.createHeader('📊 Google Drive 庫存', '即時雲端數據', '#00B900'),
        body: flexUtils.createBox('vertical', rows, { backgroundColor: flexUtils.COLORS.BG_MAIN, paddingAll: 'xl' })
    });
    
    await lineUtils.replyFlex(replyToken, 'Google Drive 庫存狀態', bubble);
}

module.exports = {
    getRandomDriveImage,
    initDriveCache,
    getRealTimeDriveStats,
    handleCheckDriveStats
};
