/**
 * 多人遊戲全局賭桌管理器
 * 確保同一個群組內，同時間只能有一桌「多人遊戲」進行中
 */

const activeMultiTables = new Map(); // Key: groupId, Value: gameType (e.g. '百家樂', '射龍門')

function hasActiveTable(groupId) {
    return activeMultiTables.has(groupId);
}

function getActiveTableType(groupId) {
    return activeMultiTables.get(groupId);
}

function lockTable(groupId, gameType) {
    activeMultiTables.set(groupId, gameType);
}

function unlockTable(groupId) {
    activeMultiTables.delete(groupId);
    const persistenceService = require('../services/multiplayerPersistenceService');
    persistenceService.clearTable(groupId).catch(e => console.error(e));
}

module.exports = {
    hasActiveTable,
    getActiveTableType,
    lockTable,
    unlockTable
};
