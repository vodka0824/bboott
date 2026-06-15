/**
 * Unified Cache System (LRU Memory + Redis Adapter)
 * 保留同步 API (.get, .set, .delete) 以相容舊程式碼
 * 提供非同步 API (.getAsync, .setAsync, .deleteAsync) 供全域狀態或需要 Redis 分散式的場景使用
 */

class LRUCache {
    constructor(maxSize = 2000) {
        this.cache = new Map();
        this.maxSize = maxSize;
        this.hits = 0;
        this.misses = 0;
    }

    get(key, allowStale = false) {
        if (!this.cache.has(key)) {
            this.misses++;
            return null;
        }

        const item = this.cache.get(key);
        if (Date.now() > item.expiry) {
            if (allowStale) {
                this.misses++;
                return { value: item.value, isStale: true };
            }
            this.cache.delete(key);
            this.misses++;
            return null;
        }

        this.cache.delete(key);
        this.cache.set(key, item);
        this.hits++;
        
        if (allowStale) return { value: item.value, isStale: false };
        return item.value;
    }

    set(key, value, ttlSeconds = 300) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }

        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }

        this.cache.set(key, {
            value,
            expiry: Date.now() + (ttlSeconds * 1000)
        });
    }

    delete(key) {
        this.cache.delete(key);
    }

    clear() {
        this.cache.clear();
        this.hits = 0;
        this.misses = 0;
    }
}

let redisClient = null;
let useRedis = false;

if (process.env.REDIS_URL) {
    try {
        const { createClient } = require('redis');
        redisClient = createClient({ url: process.env.REDIS_URL });
        redisClient.on('error', (err) => console.error('[Redis Error]', err));
        redisClient.connect().then(() => {
            console.log('✅ Connected to Redis');
            useRedis = true;
        }).catch(err => {
            console.error('❌ Failed to connect to Redis, falling back to LRU Cache:', err);
        });
    } catch (e) {
        console.warn('⚠️ Redis module not found or failed to initialize, falling back to LRU Cache.');
    }
}

const localCache = new LRUCache(2000);

const cacheInterface = {
    // 原始同步 API (僅操作本機記憶體)
    get: (key, allowStale = false) => localCache.get(key, allowStale),
    set: (key, value, ttlSeconds = 300) => localCache.set(key, value, ttlSeconds),
    delete: (key) => localCache.delete(key),
    clear: () => localCache.clear(),
    get cache() { return localCache.cache; }, // 讓某些偷吃步直接用 .has 的檔案不出錯

    // 擴充非同步 API (若有 Redis 則使用 Redis，否則使用本機記憶體)
    async getAsync(key, allowStale = false) {
        if (useRedis && redisClient) {
            try {
                const data = await redisClient.get(key);
                if (data === null) return null;
                const parsed = JSON.parse(data);
                if (allowStale) return { value: parsed, isStale: false };
                return parsed;
            } catch (e) {
                console.error('[Redis Get Error]', e);
                return localCache.get(key, allowStale);
            }
        }
        return localCache.get(key, allowStale);
    },

    async setAsync(key, value, ttlSeconds = 300) {
        if (useRedis && redisClient) {
            try {
                const data = JSON.stringify(value);
                await redisClient.setEx(key, ttlSeconds, data);
                return;
            } catch (e) {
                console.error('[Redis Set Error]', e);
            }
        }
        localCache.set(key, value, ttlSeconds);
    },

    async deleteAsync(key) {
        if (useRedis && redisClient) {
            try {
                await redisClient.del(key);
                return;
            } catch (e) {
                console.error('[Redis Delete Error]', e);
            }
        }
        localCache.delete(key);
    }
};

module.exports = cacheInterface;
