const { db } = require('../utils/db');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');

const DEFAULT_STATS = { level: 1, exp: 0, hp: 100, attack: 10, defense: 5 };

function getPlayerTitle(level) {
    if (level >= 80) return { title: '神域の領主 ‧ 世界終結者 ✨', color: '#FF4500' };
    if (level >= 70) return { title: '以太の法則 ‧ 天地封印者 ⚡', color: '#9C27B0' };
    if (level >= 60) return { title: '深淵廣宇 ‧ 混沌統御者 🌌', color: '#673AB7' };
    if (level >= 50) return { title: '起源の力 ‧ 死神杀戮者 🔥', color: '#F44336' };
    if (level >= 40) return { title: '破滅之刃 ‧ 命運選擇者 ☄️', color: '#FF5722' };
    if (level >= 30) return { title: '絕境覺醒 ‧ 黑暗預言者 ⚠️', color: flexUtils.COLORS.SECONDARY };
    if (level >= 20) return { title: '天煌の黎明 ‧ 黑狼之牙 ⚔️', color: '#607D8B' };
    if (level >= 10) return { title: '陰影の囚人 ‧ 被流放的靈魂 🌑', color: '#455A64' };
    return { title: '平民 ‧ 尚未覺醒的存在 🌟', color: flexUtils.COLORS.TEXT_MUTED };
}

async function getOrInitPlayerStats(userId) {
    const userRef = db.collection('players').doc(userId);
    const doc = await userRef.get();

    let rpgStats = {};
    let needsUpdate = false;

    if (!doc.exists) {
        rpgStats = { ...DEFAULT_STATS };
        needsUpdate = true;
    } else {
        const data = doc.data();
        if (data.rpg) {
            rpgStats = { ...DEFAULT_STATS, ...data.rpg };
        } else {
            rpgStats = { ...DEFAULT_STATS };
            needsUpdate = true;
        }
    }

    if (needsUpdate) {
        await userRef.set({
            rpg: rpgStats,
            chatExp: (doc.exists ? (doc.data().chatExp || 0) : 0),
            level: (doc.exists ? (doc.data().level || 1) : 1),
            lastActive: Date.now()
        }, { merge: true });
    }

    return { 
        ...rpgStats, 
        chatExp: doc.exists && doc.data().chatExp !== undefined ? doc.data().chatExp : 0, 
        level: doc.exists && doc.data().level !== undefined ? doc.data().level : 1 
    };
}

async function addExp(userId, amount) {
    const userRef = db.collection('players').doc(userId);
    
    // 使用 transaction 確保正確
    return await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(userRef);
        let chatExp = 0;
        let level = 1;
        
        if (doc.exists) {
            const data = doc.data();
            chatExp = data.chatExp || 0;
            level = data.level || 1;
        }
        
        chatExp += amount;
        
        // 總需求 EXP = 10 * Level^2
        // 反推目前 Level: sqrt(chatExp / 10)
        let newLevel = Math.max(1, Math.floor(Math.sqrt(chatExp / 10)));
        if (newLevel < level) newLevel = level; // 防止掉級
        
        const leveledUp = newLevel > level;
        
        transaction.set(userRef, {
            chatExp: chatExp,
            level: newLevel,
            lastActive: Date.now()
        }, { merge: true });
        
        return { leveledUp, oldLevel: level, newLevel, chatExp };
    });
}

module.exports = {
    getPlayerTitle,
    getOrInitPlayerStats,
    addExp
};
