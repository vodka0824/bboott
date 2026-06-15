const { db } = require('../utils/db');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const memoryCache = require('../utils/memoryCache');
const { getFinalPlayerStats } = require('../handlers/rpg');

const COLLECTION_NAME = 'economy_users';

const EQUIP_TYPES = {
    weapon: { id: 'weapon', name: '武器', typeName: 'weapon', emoji: '⚔️' },
    gloves: { id: 'gloves', name: '手套', typeName: 'gloves', emoji: '🥊' },
    ring: { id: 'ring', name: '戒指', typeName: 'ring', emoji: '💍' },
    shield: { id: 'shield', name: '盾牌', typeName: 'shield', emoji: '🛡️' },
    wings: { id: 'wings', name: '翅膀', typeName: 'wings', emoji: '🦅' }
};

function generateReqId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}
null
null

const { getEquipmentData, getFinalEquipStat } = require('./equipmentInfoService.js');

module.exports = {
    
};
