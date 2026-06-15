/**
 * Unified Cache System (LRU Memory + Redis Adapter)
 * 支援非同步 API，若有設定 REDIS_URL 則使用 Redis，否則使用記憶體 LRU 快取
 */

class LRUCache {
    constructor(maxSize = 1000) {
        this.cache = new Map();
        this.maxSize = maxSize;
        this.hits = 0;
        this.misses = 0;
    }

    async getAsync(key, allowStale = false) {
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

    async setAsync(key, value, ttlSeconds = 300) {
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

    async deleteAsync(key) {
        this.cache.delete(key);
    }

    async clearAsync() {
        this.cache.clear();
        this.hits = 0;
        this.misses = 0;
    }
}

let redisClient = null;
let useRedis = false;

// 嘗試載入 Redis (如果系統有安裝 npm redis 且設定了 REDIS_URL)
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

const localCache = new LRUCache(2000); // 增加容量到 2000 供全域狀態使用

const cacheInterface = {
    async get(key, allowStale = false) {
        if (useRedis && redisClient) {
            try {
                const data = await redisClient.get(key);
                if (data === null) return null;
                const parsed = JSON.parse(data);
                if (allowStale) return { value: parsed, isStale: false }; // Redis automatically drops stale data via TTL
                return parsed;
            } catch (e) {
                console.error('[Redis Get Error]', e);
                return await localCache.getAsync(key, allowStale); // Fallback
            }
        }
        return await localCache.getAsync(key, allowStale);
    },

    async set(key, value, ttlSeconds = 300) {
        if (useRedis && redisClient) {
            try {
                const data = JSON.stringify(value);
                await redisClient.setEx(key, ttlSeconds, data);
                return;
            } catch (e) {
                console.error('[Redis Set Error]', e);
                // Fallback
            }
        }
        await localCache.setAsync(key, value, ttlSeconds);
    },

    async delete(key) {
        if (useRedis && redisClient) {
            try {
                await redisClient.del(key);
                return;
            } catch (e) {
                console.error('[Redis Delete Error]', e);
            }
        }
        await localCache.deleteAsync(key);
    },

    // Backward compatibility for synchronous usages (Note: Synchronous methods WILL NOT use Redis!)
    getSync(key, allowStale = false) {
        const item = localCache.cache.get(key);
        if (!item) return null;
        if (Date.now() > item.expiry) {
            localCache.cache.delete(key);
            return null;
        }
        return item.value;
    },
    setSync(key, value, ttlSeconds = 300) {
        // Sets to local cache directly, then asynchronously sets to Redis if applicable
        localCache.cache.set(key, { value, expiry: Date.now() + (ttlSeconds * 1000) });
        if (useRedis && redisClient) {
            const data = JSON.stringify(value);
            redisClient.setEx(key, ttlSeconds, data).catch(() => {});
        }
    }
};

class CachedCheck {
    constructor(duration, fetchFn = null) {
        this.cache = new Set();
        this.lastUpdated = 0;
        this.duration = duration;
        this.fetchFn = fetchFn;
    }

    isExpired() {
        return Date.now() - this.lastUpdated > this.duration;
    }

    clear() {
        this.cache.clear();
        this.lastUpdated = 0;
    }

    update(items) {
        this.cache = new Set(items);
        this.lastUpdated = Date.now();
    }
    
    add(item) {
        this.cache.add(item);
    }

    has(item) {
        return this.cache.has(item);
    }
    
    async ensureFresh() {
        if (this.isExpired() && this.fetchFn) {
            const items = await this.fetchFn();
            this.update(items);
        }
    }
}

cacheInterface.CachedCheck = CachedCheck;
module.exports = cacheInterface;
