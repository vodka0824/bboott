const fs = require('fs');

const fileContent = fs.readFileSync('handlers/equipment.js', 'utf8');

function extractCode(startStr, nextStr) {
    const startIndex = fileContent.indexOf(startStr);
    if(startIndex === -1) {
        console.log('NOT FOUND:', startStr);
        return '';
    }
    
    let endIndex = fileContent.length;
    if (nextStr) {
        endIndex = fileContent.indexOf(nextStr);
        if(endIndex === -1) endIndex = fileContent.length;
    } else {
        endIndex = fileContent.indexOf('module.exports = {');
    }
    
    let commentStart = fileContent.lastIndexOf('/**', startIndex);
    if(commentStart === -1 || !fileContent.substring(commentStart, startIndex).trim().startsWith('/**')) {
        commentStart = startIndex;
    }
    
    return fileContent.substring(commentStart, endIndex);
}

const blocks = {
    'generateReqId': extractCode('function generateReqId() {', 'const EQUIP_TYPES = {'),
    'EQUIP_TYPES': extractCode('const EQUIP_TYPES = {', 'function getNextLevelInfo(currentLvl, lukBonus) {'),
    'getNextLevelInfo': extractCode('function getNextLevelInfo(currentLvl, lukBonus) {', 'function getFinalEquipStat(type, variant, level) {'),
    'getFinalEquipStat': extractCode('function getFinalEquipStat(type, variant, level) {', 'function formatEquipStats(type, variant, level) {'),
    'formatEquipStats': extractCode('function formatEquipStats(type, variant, level) {', 'async function getEquipmentData(userId, t = null) {'),
    'getEquipmentData': extractCode('async function getEquipmentData(userId, t = null) {', 'async function showEquipmentShop(replyToken) {'),
    'buildSingleEnchantBubble': extractCode('function buildSingleEnchantBubble(isSuccess, type,', 'async function buyAndSafeEnchantPostback(replyToken, type, slot, grade, userId, groupId, reqId) {'),
    
    'showEquipmentShop': extractCode('async function showEquipmentShop(replyToken) {', 'async function buyEquipment(replyToken, text, userId, groupId) {'),
    'buyEquipment': extractCode('async function buyEquipment(replyToken, text, userId, groupId) {', 'async function buyScrolls(replyToken, text, userId, groupId) {'),
    'buyScrolls': extractCode('async function buyScrolls(replyToken, text, userId, groupId) {', 'async function showMyEquipments(replyToken, userId) {'),
    'buyEquipmentPostback': extractCode('async function buyEquipmentPostback(replyToken, type, grade, userId, groupId) {', 'async function buyScrollsPostback(replyToken, scrollKey, amount, userId, groupId) {'),
    'buyScrollsPostback': extractCode('async function buyScrollsPostback(replyToken, scrollKey, amount, userId, groupId) {', "async function enchantEquipmentPostback(replyToken, type, slot, times, userId, reqId, groupId = 'direct') {"),
    
    'showMyEquipments': extractCode('async function showMyEquipments(replyToken, userId) {', 'async function enchantEquipment(replyToken, text, userId, groupId) {'),
    'swapEquipmentPostback': extractCode('async function swapEquipmentPostback(replyToken, type, userId) {', null),
    
    'enchantEquipment': extractCode('async function enchantEquipment(replyToken, text, userId, groupId) {', 'async function buyEquipmentPostback(replyToken, type, grade, userId, groupId) {'),
    'enchantEquipmentPostback': extractCode("async function enchantEquipmentPostback(replyToken, type, slot, times, userId, reqId, groupId = 'direct') {", 'function buildSingleEnchantBubble(isSuccess, type,'),
    'buyAndSafeEnchantPostback': extractCode('async function buyAndSafeEnchantPostback(replyToken, type, slot, grade, userId, groupId, reqId) {', 'async function swapEquipmentPostback(replyToken, type, userId) {')
};

const header = `const { Firestore } = require('@google-cloud/firestore');
const { getDb } = require('../utils/db');
const db = getDb();
const COLLECTION_NAME = 'economy_users';
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const authUtils = require('../utils/auth');
const economyHandler = require('../handlers/economy');
const professionHandler = require('../handlers/profession');
const rpgHandler = require('../handlers/rpg');\n\n`;

function writeService(serviceName, fnList, extraHeader = '') {
    let content = header + extraHeader;
    let exportsList = [];
    for(const fn of fnList) {
        if(blocks[fn]) {
            content += blocks[fn] + '\n';
            exportsList.push(fn);
        }
    }
    content += `\nmodule.exports = {\n    ${exportsList.join(',\n    ')}\n};\n`;
    fs.writeFileSync('services/' + serviceName, content, 'utf8');
    console.log(`Wrote services/${serviceName} (${exportsList.length} functions)`);
}

writeService('equipmentCoreService.js', [
    'generateReqId', 'EQUIP_TYPES', 'getNextLevelInfo', 'getFinalEquipStat', 
    'formatEquipStats', 'getEquipmentData', 'buildSingleEnchantBubble'
]);

const coreRequire = `const { EQUIP_TYPES, generateReqId, getNextLevelInfo, getFinalEquipStat, formatEquipStats, getEquipmentData, buildSingleEnchantBubble } = require('./equipmentCoreService');\n\n`;

writeService('equipmentShopService.js', [
    'showEquipmentShop', 'buyEquipment', 'buyScrolls', 'buyEquipmentPostback', 'buyScrollsPostback'
], coreRequire);

writeService('equipmentManageService.js', [
    'showMyEquipments', 'swapEquipmentPostback'
], coreRequire);

writeService('equipmentEnchantService.js', [
    'enchantEquipment', 'enchantEquipmentPostback', 'buyAndSafeEnchantPostback'
], coreRequire);

console.log('Equipment Split Complete!');
