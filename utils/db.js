/**
 * MongoDB 本機資料庫操作模組
 * 完整模擬 Google Cloud Firestore 的子集合、批次寫入、條件查詢等語法
 * 讓所有業務邏輯程式碼可以零改動或最小改動移植至本機環境
 */
const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = process.env.MONGODB_DB_NAME || 'linebot';

let client;
let db;
let connectingPromise = null; // 並發鎖：防止 Thunder Herd 多次建立連線

async function connectDB() {
    if (db) return db;
    // 若已有進行中的連線請求，等待其完成而非重複建立
    if (connectingPromise) return connectingPromise;
    connectingPromise = (async () => {
        try {
            client = new MongoClient(uri);
            await client.connect();
            db = client.db(dbName);
            console.log('✅ Connected to MongoDB');

            // 建立 processed_events 的 TTL Index (5分鐘過期)
            db.collection('processed_events').createIndex(
                { "processedAt": 1 },
                { expireAfterSeconds: 300 }
            ).catch(err => console.error('Failed to create TTL index for processed_events:', err));

            return db;
        } catch (error) {
            console.error('❌ MongoDB Connection Error:', error);
            connectingPromise = null; // 連線失敗時重置，允許下次重試
            throw error;
        }
    })();
    return connectingPromise;
}

/**
 * 將 Firestore 路徑轉換為 MongoDB 集合名稱與文件 ID
 * 
 * 規則：
 * - 頂層集合: 'groups' -> collectionName='groups', docId=<id>
 * - 子集合路徑: 'groups/{groupId}/leaderboard' -> collectionName='groups__leaderboard', docId=<id>
 *   (文件以 `{groupId}_{docId}` 的 _id 儲存)
 * - 三層以上子集合: 'a/1/b/2/c' -> collectionName='a__b__c', docId='1_2_<id>'
 * 
 * @param {string[]} pathSegments ['groups', groupId, 'leaderboard', userId]
 * @returns {{ collectionName: string, docId: string | null }}
 */
function parsePath(pathSegments) {
    // pathSegments: ['groups', 'G001', 'leaderboard', 'U001']
    // collections: ['groups', 'leaderboard'] -> 'groups__leaderboard'
    // docIds: ['G001', 'U001'] -> 'G001_U001'
    const collections = [];
    const docIds = [];

    for (let i = 0; i < pathSegments.length; i++) {
        if (i % 2 === 0) {
            collections.push(pathSegments[i]);
        } else {
            docIds.push(pathSegments[i]);
        }
    }

    return {
        collectionName: collections.join('__'),
        // 若偶數段落（最後一段是集合名稱），docId = null
        docId: docIds.length > 0 ? docIds.join('_') : null,
    };
}

/**
 * 取得或等待資料庫連線
 */
async function getDb() {
    if (!db) await connectDB();
    return db;
}

// ====================================================
// Query Builder (模擬 Firestore where().get() 語法)
// ====================================================
class QueryBuilder {
    constructor(collectionPath, parentDocIds = []) {
        this._collectionPath = collectionPath; // 例如 ['groups']
        this._parentDocIds = parentDocIds;      // 已走過的文件 ID
        this._filters = [];
        this._limit = null;
        this._sort = null;
    }

    where(field, op, value) {
        const clone = new QueryBuilder(this._collectionPath, this._parentDocIds);
        clone._filters = [...this._filters, { field, op, value }];
        clone._limit = this._limit;
        clone._sort = this._sort ? { ...this._sort } : null;
        return clone;
    }

    limit(n) {
        const clone = new QueryBuilder(this._collectionPath, this._parentDocIds);
        clone._filters = [...this._filters];
        clone._limit = n;
        clone._sort = this._sort ? { ...this._sort } : null;
        return clone;
    }

    orderBy(field, direction = 'asc') {
        const clone = new QueryBuilder(this._collectionPath, this._parentDocIds);
        clone._filters = [...this._filters];
        clone._limit = this._limit;
        clone._sort = this._sort ? { ...this._sort } : {};
        clone._sort[field] = direction === 'desc' ? -1 : 1;
        return clone;
    }

    count() {
        return {
            get: async () => {
                const database = await getDb();
                const { collectionName, docId } = parsePath(this._collectionPath);
                const coll = database.collection(collectionName);
                const query = {};
                if (docId) {
                    query._id = { $regex: `^${escapeRegex(docId)}_` };
                }
                for (const { field, op, value } of this._filters) {
                    if (op === '==') query[field] = value;
                    else if (op === '!=') query[field] = { $ne: value };
                    else if (op === '>') query[field] = { $gt: value };
                    else if (op === '>=') query[field] = { $gte: value };
                    else if (op === '<') query[field] = { $lt: value };
                    else if (op === '<=') query[field] = { $lte: value };
                    else if (op === 'in') query[field] = { $in: value };
                    else if (op === 'array-contains') query[field] = value;
                }
                const c = await coll.countDocuments(query);
                return { data: () => ({ count: c }) };
            }
        };
    }

    async get() {
        const database = await getDb();
        const { collectionName, docId } = parsePath(this._collectionPath);
        const coll = database.collection(collectionName);

        // 建立 MongoDB 查詢條件
        const query = {};
        
        // 如果有父文件 ID 前綴，加入前綴過濾以避免跨群組查詢
        if (docId) {
            query._id = { $regex: `^${escapeRegex(docId)}_` };
        }

        for (const { field, op, value } of this._filters) {
            if (op === '==') query[field] = value;
            else if (op === '!=') query[field] = { $ne: value };
            else if (op === '>') query[field] = { $gt: value };
            else if (op === '>=') query[field] = { $gte: value };
            else if (op === '<') query[field] = { $lt: value };
            else if (op === '<=') query[field] = { $lte: value };
            else if (op === 'in') query[field] = { $in: value };
            else if (op === 'array-contains') query[field] = value;
        }

        let cursor = coll.find(query);
        if (this._sort) cursor = cursor.sort(this._sort);
        if (this._limit) cursor = cursor.limit(this._limit);

        const docs = await cursor.toArray();

        return {
            empty: docs.length === 0,
            size: docs.length,
            docs: docs.map(d => ({
                id: d._id,
                ref: new DocumentRef([...this._collectionPath, d._id]),
                exists: true,
                data: () => {
                    const { _id, ...rest } = d;
                    return rest;
                }
            })),
            forEach: (cb) => docs.forEach(d => cb({
                id: d._id,
                ref: new DocumentRef([...this._collectionPath, d._id]),
                exists: true,
                data: () => {
                    const { _id, ...rest } = d;
                    return rest;
                }
            }))
        };
    }
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ====================================================
// Document Reference (模擬 Firestore doc() 語法)
// ====================================================
class DocumentRef {
    constructor(pathSegments) {
        // pathSegments 例如：['groups', 'G001'] 或 ['groups', 'G001', 'leaderboard', 'U001']
        this._pathSegments = pathSegments;
    }

    collection(name) {
        // 回傳子集合
        return new CollectionRef([...this._pathSegments, name]);
    }

    async get() {
        const database = await getDb();
        const { collectionName, docId } = parsePath(this._pathSegments);
        const coll = database.collection(collectionName);
        const data = await coll.findOne({ _id: docId });
        return {
            exists: !!data,
            id: docId,
            ref: this,
            data: () => {
                if (!data) return undefined;
                const { _id, ...rest } = data;
                return rest;
            }
        };
    }

    async set(data, options = {}) {
        const database = await getDb();
        const { collectionName, docId } = parsePath(this._pathSegments);
        const coll = database.collection(collectionName);

        if (options.merge) {
            // merge 模式：使用 $set 只更新指定欄位，不覆蓋其他欄位
            const updateDoc = buildUpdateDoc(data);
            await coll.updateOne(
                { _id: docId },
                updateDoc,
                { upsert: true }
            );
        } else {
            // 完整覆蓋
            await coll.replaceOne(
                { _id: docId },
                { ...processFieldValues(data), _id: docId },
                { upsert: true }
            );
        }
    }

    async update(data) {
        const database = await getDb();
        const { collectionName, docId } = parsePath(this._pathSegments);
        const coll = database.collection(collectionName);
        const updateDoc = buildUpdateDoc(data);
        await coll.updateOne({ _id: docId }, updateDoc);
    }

    async delete() {
        const database = await getDb();
        const { collectionName, docId } = parsePath(this._pathSegments);
        const coll = database.collection(collectionName);
        await coll.deleteOne({ _id: docId });
    }

    /**
     * 原子性建立（若文件已存在則拋出錯誤，code=6）
     * 用於 dedup 機制
     */
    async create(data) {
        const database = await getDb();
        const { collectionName, docId } = parsePath(this._pathSegments);
        const coll = database.collection(collectionName);
        try {
            await coll.insertOne({ ...processFieldValues(data), _id: docId });
        } catch (error) {
            if (error.code === 11000) {
                // MongoDB 重複 Key 錯誤 -> 模擬 Firestore ALREADY_EXISTS (code=6)
                const alreadyExistsError = new Error('ALREADY_EXISTS');
                alreadyExistsError.code = 6;
                throw alreadyExistsError;
            }
            throw error;
        }
    }
}

// ====================================================
// Collection Reference (模擬 Firestore collection() 語法)
// ====================================================
class CollectionRef {
    constructor(pathSegments) {
        this._pathSegments = pathSegments;
    }

    doc(id) {
        if (!id) {
            // Generate a random ID like Firestore does (20 chars)
            id = Math.random().toString(36).substring(2, 12) + Math.random().toString(36).substring(2, 12);
        }
        return new DocumentRef([...this._pathSegments, id]);
    }

    where(field, op, value) {
        const qb = new QueryBuilder(this._pathSegments, []);
        return qb.where(field, op, value);
    }

    limit(n) {
        const qb = new QueryBuilder(this._pathSegments, []);
        return qb.limit(n);
    }

    orderBy(field, direction) {
        const qb = new QueryBuilder(this._pathSegments, []);
        return qb.orderBy(field, direction);
    }

    async get() {
        const qb = new QueryBuilder(this._pathSegments, []);
        return await qb.get();
    }
}

// ====================================================
// WriteBatch (模擬 Firestore batch() 語法)
// ====================================================
class WriteBatch {
    constructor() {
        this._operations = [];
    }

    set(docRef, data, options = {}) {
        this._operations.push({ type: 'set', docRef, data, options });
        return this;
    }

    update(docRef, data) {
        this._operations.push({ type: 'update', docRef, data });
        return this;
    }

    delete(docRef) {
        this._operations.push({ type: 'delete', docRef });
        return this;
    }

    async commit() {
        for (const op of this._operations) {
            if (op.type === 'set') {
                await op.docRef.set(op.data, op.options);
            } else if (op.type === 'update') {
                await op.docRef.update(op.data);
            } else if (op.type === 'delete') {
                await op.docRef.delete();
            }
        }
        this._operations = [];
    }
}

// ====================================================
// 工具函式
// ====================================================

/**
 * 將含有 FieldValue 特殊標記的資料，展開為 MongoDB 更新指令
 */
function buildUpdateDoc(data) {
    const $set = {};
    const $inc = {};
    const $push = {};
    const $pull = {};
    const $unset = {};

    for (const [key, val] of Object.entries(data)) {
        if (val && typeof val === 'object' && val.__op) {
            if (val.__op === 'arrayUnion') {
                $push[key] = { $each: val.elements || [val.value] };
            } else if (val.__op === 'arrayRemove') {
                $pull[key] = { $in: val.elements || [val.value] };
            } else if (val.__op === 'increment') {
                $inc[key] = val.n !== undefined ? val.n : val.value;
            } else if (val.__op === 'serverTimestamp') {
                $set[key] = new Date();
            } else if (val.__op === 'delete') {
                $unset[key] = ""; // MongoDB $unset expects an empty string or 1
            }
        } else {
            $set[key] = val;
        }
    }

    const updateDoc = {};
    if (Object.keys($set).length > 0) updateDoc.$set = $set;
    if (Object.keys($inc).length > 0) updateDoc.$inc = $inc;
    if (Object.keys($push).length > 0) updateDoc.$push = $push;
    if (Object.keys($pull).length > 0) updateDoc.$pull = $pull;
    if (Object.keys($unset).length > 0) updateDoc.$unset = $unset;

    // 若完全沒有操作（空物件），至少設一個 $set 以避免 MongoDB 報錯
    if (Object.keys(updateDoc).length === 0) updateDoc.$set = {};

    return updateDoc;
}

/**
 * 處理資料中的 FieldValue 標記（用於完整覆蓋 set 的場景）
 */
function processFieldValues(data) {
    const result = {};
    for (const [key, val] of Object.entries(data)) {
        if (val && typeof val === 'object' && val.__op) {
            if (val.__op === 'serverTimestamp') {
                result[key] = new Date();
            } else if (val.__op === 'increment') {
                // 完整覆蓋時，increment 無法直接運算，設為 0
                result[key] = val.n !== undefined ? val.n : val.value;
            } else {
                result[key] = val;
            }
        } else {
            result[key] = val;
        }
    }
    return result;
}

// ====================================================
// Transaction (模擬 Firestore runTransaction 語法)
// ====================================================
class Transaction {
    constructor() {
        this._operations = [];
    }

    async get(ref) {
        // ref 可以是 DocumentRef 或是 QueryBuilder
        return await ref.get();
    }

    set(docRef, data, options = {}) {
        this._operations.push({ type: 'set', docRef, data, options });
        return this;
    }

    update(docRef, data) {
        this._operations.push({ type: 'update', docRef, data });
        return this;
    }

    delete(docRef) {
        this._operations.push({ type: 'delete', docRef });
        return this;
    }

    async commit() {
        for (const op of this._operations) {
            if (op.type === 'set') {
                await op.docRef.set(op.data, op.options);
            } else if (op.type === 'update') {
                await op.docRef.update(op.data);
            } else if (op.type === 'delete') {
                await op.docRef.delete();
            }
        }
        this._operations = [];
    }
}

// ====================================================
// 主要對外介面 (模擬 Firestore 靜態類別)
// ====================================================
const firestoreEmulator = {
    collection: (name) => new CollectionRef([name]),

    batch: () => new WriteBatch(),

    runTransaction: async (callback) => {
        const t = new Transaction();
        const result = await callback(t);
        await t.commit();
        return result;
    },

    FieldValue: {
        arrayUnion: (...elements) => ({ __op: 'arrayUnion', elements }),
        arrayRemove: (...elements) => ({ __op: 'arrayRemove', elements }),
        increment: (n) => ({ __op: 'increment', n }),
        serverTimestamp: () => ({ __op: 'serverTimestamp' }),
        delete: () => ({ __op: 'delete' })
    },

    Timestamp: {
        fromDate: (date) => date,
        now: () => new Date()
    }
};

module.exports = {
    connectDB,
    getDb,
    db: firestoreEmulator,
    getClient: () => client, // 供 Graceful Shutdown 使用
    Firestore: {
        FieldValue: firestoreEmulator.FieldValue,
        Timestamp: firestoreEmulator.Timestamp
    }
};
