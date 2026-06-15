const { db } = require('../utils/db');
const memoryCache = require('../utils/memoryCache');
const COLLECTION_NAME = 'economy_users';

/**
 * 取得通緝值最高的前 5 名名單 (快取 5 分鐘)
 */
async function getWantedList() {
    const cacheKey = 'wanted_list_top5';
    let topList = memoryCache.get(cacheKey);
    if (topList) return topList;

    try {
        const snapshot = await db.collection(COLLECTION_NAME)
            .where('wantedLevel', '>', 0)
            .orderBy('wantedLevel', 'desc')
            .orderBy('crimeRecord', 'desc')
            .limit(10)
            .get();

        topList = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            topList.push({
                userId: doc.id,
                name: data.displayName || data.name || '無名氏',
                crimeRecord: data.crimeRecord || 0,
                wantedLevel: data.wantedLevel || 0,
                isMafia: data.isMafia || false,
                kuCoin: data.kuCoin || 0
            });
        });

        memoryCache.set(cacheKey, topList, 300); // 5 分鐘
        return topList;
    } catch (e) {
        console.error('[Profession] getWantedList error:', e);
        return [];
    }
}

/**
 * 取得目前黑道老大的資訊 (快取 5 分鐘)
 * 資格：已加入黑幫 (isMafia: true)，且通緝值 > 0。
 * 排序依 wantedLevel 降序、crimeRecord 降序，取第一名。
 */
async function getMafiaBoss() {
    const cacheKey = 'mafia_boss_info';
    let bossInfo = memoryCache.get(cacheKey);
    if (bossInfo !== null || memoryCache.cache.has(cacheKey)) return bossInfo;

    try {
        // 在記憶體中進行排序，避免 Firestore 複合索引未建立引發錯誤
        const snapshot = await db.collection(COLLECTION_NAME)
            .where('isMafia', '==', true)
            .get();

        if (snapshot.empty) {
            bossInfo = null;
        } else {
            const { ADMIN_USER_ID } = require('../config/constants');
            const members = [];
            snapshot.forEach(doc => {
                if (doc.id === ADMIN_USER_ID) return; // 超級管理員排除在黑道老大競爭之外
                const d = doc.data();
                members.push({
                    userId: doc.id,
                    name: d.displayName || d.name || '無名氏',
                    crimeRecord: d.crimeRecord || 0,
                    wantedLevel: d.wantedLevel || 0
                });
            });

            // 排序：前科次數第一優先 (降序)，通緝值第二優先 (降序)
            members.sort((a, b) => {
                if (b.crimeRecord !== a.crimeRecord) {
                    return b.crimeRecord - a.crimeRecord;
                }
                return b.wantedLevel - a.wantedLevel;
            });

            const top = members[0];
            // 必須至少有 1 次前科或通緝值大於 0，才算作黑道老大 (新加入未犯案者排除)
            if (top && (top.crimeRecord > 0 || top.wantedLevel > 0)) {
                bossInfo = {
                    userId: top.userId,
                    name: top.name,
                    crimeRecord: top.crimeRecord,
                    wantedLevel: top.wantedLevel,
                    isMafia: true
                };
            } else {
                bossInfo = null;
            }
        }
        memoryCache.set(cacheKey, bossInfo, 300); // 5 分鐘
        return bossInfo;
    } catch (e) {
        console.error('[Profession] getMafiaBoss error:', e);
        return null;
    }
}

/**
 * 清除通緝榜快取 (當有人前科變動時呼叫)
 */
function clearWantedListCache() {
    memoryCache.delete('wanted_list_top5');
    memoryCache.delete('mafia_boss_info');
    memoryCache.delete('leaderboard:all');
}

/**
 * 取得玩家的完整職業稱號
 * 快取玩家資料 1 分鐘，減少頻繁查 DB
 */
async function getProfessionTitle(userId) {
    const cacheKey = `profession_${userId}`;
    let title = memoryCache.get(cacheKey);
    if (title !== null) return title;

    try {
        const doc = await db.collection(COLLECTION_NAME).doc(userId).get();
        if (!doc.exists) {
            memoryCache.set(cacheKey, '', 60);
            return '';
        }

        const data = doc.data();
        const now = Date.now();
        let currentProfession = '';

        // 1. 黑道老大 (檢查是否為通緝值最高的黑幫成員)
        const mafiaBoss = await getMafiaBoss();
        const isMafiaBoss = mafiaBoss && mafiaBoss.userId === userId;

        if (isMafiaBoss) {
            currentProfession = '[黑道老大]';
        } 
        // 1.5. 堂主與小弟 (需加入黑幫 isMafia: true 且前科達標)
        else if (data.isMafia && (data.crimeRecord || 0) > 0) {
            if (data.crimeRecord >= 11) {
                currentProfession = '[黑幫堂主]';
            } else if (data.crimeRecord >= 3) {
                currentProfession = '[黑道小弟]';
            } else {
                currentProfession = '[黑道泊車小弟]'; // 前科不足但加入了
            }
        }
        // 2. 市議員
        else if (data.councilorUntil && now < data.councilorUntil) {
            currentProfession = '[市議員]';
        } 
        // 3. 軍人
        else if (data.militaryUntil && now < data.militaryUntil) {
            currentProfession = '[軍人]';
        }
        // 4. 警察
        else if (data.isPolice) {
            currentProfession = '[警察]';
        }

        // 惡魔契約 (追加稱號)
        if (data.devilContractUntil && now < data.devilContractUntil) {
            currentProfession += '(出賣靈魂的賭狗)';
        }

        memoryCache.set(cacheKey, currentProfession, 60); // 1 分鐘
        return currentProfession;
    } catch (e) {
        console.error('[Profession] getProfessionTitle error:', e);
        return '';
    }
}

/**
 * 清除個人職業快取 (當職業變動時呼叫)
 */
function clearProfessionCache(userId) {
    memoryCache.delete(`profession_${userId}`);
    memoryCache.delete('leaderboard:all');
}

/**
 * 取得玩家的黑幫階級
 * @param {string} userId
 * @param {Object} data - economy_users doc data
 * @param {Array} topList - (可選) 預先抓好的 topList 減少 DB query
 * @returns {string|null} 'boss', 'capo', 'thug', 或 null
 */
async function getMafiaRank(userId, data, topList = null) {
    const { ADMIN_USER_ID } = require('../config/constants');
    if (userId === ADMIN_USER_ID) return null; // 超級管理員不帶黑道階級

    const mafiaBoss = await getMafiaBoss();
    const isBoss = mafiaBoss && mafiaBoss.userId === userId;
    if (isBoss) return 'boss';

    if (data && data.isMafia) {
        const crimeRecord = data.crimeRecord || 0;
        if (crimeRecord >= 11) return 'capo';
        if (crimeRecord >= 3) return 'thug';
    }
    return null;
}

module.exports = {
    getProfessionTitle,
    getWantedList,
    getMafiaBoss,
    clearWantedListCache,
    clearProfessionCache,
    getMafiaRank
};
