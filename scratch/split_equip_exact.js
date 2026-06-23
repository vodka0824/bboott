const fs = require('fs');
const fileContent = fs.readFileSync('handlers/equipment.js', 'utf8');

const functions = [
    'function generateReqId() {',
    'const EQUIP_TYPES = {',
    'function getNextLevelInfo(currentLvl, lukBonus) {',
    'function getFinalEquipStat(type, variant, level) {',
    'function formatEquipStats(type, variant, level) {',
    'async function getEquipmentData(userId, t = null) {',
    'async function showEquipmentShop(replyToken) {',
    'async function buyEquipment(replyToken, text, userId, groupId) {',
    'async function buyScrolls(replyToken, text, userId, groupId) {',
    'async function showMyEquipments(replyToken, userId) {',
    'async function enchantEquipment(replyToken, text, userId, groupId) {',
    'async function buyEquipmentPostback(replyToken, type, grade, userId, groupId) {',
    'async function buyScrollsPostback(replyToken, scrollKey, amount, userId, groupId) {',
    "async function enchantEquipmentPostback(replyToken, type, slot, times, userId, reqId, groupId = 'direct') {",
    'function buildSingleEnchantBubble(isSuccess, type,',
    'async function buyAndSafeEnchantPostback(replyToken, type, slot, grade, userId, groupId, reqId) {',
    'async function swapEquipmentPostback(replyToken, type, userId) {',
    'module.exports = {'
];

const indices = functions.map(f => fileContent.indexOf(f));
const blocks = {};
for(let i=0; i<functions.length - 1; i++) {
    let startIndex = indices[i];
    let endIndex = indices[i+1];
    
    let commentStart = fileContent.lastIndexOf('/**', startIndex);
    if(commentStart !== -1) {
        let between = fileContent.substring(commentStart, startIndex);
        // Only accept the comment if there are no other functions or braces in between
        if(!between.includes('}') && !between.includes('{') && !between.includes('function ')) {
            startIndex = commentStart;
        }
    }
    
    let shortName = functions[i].replace('async function ', '').replace('function ', '').replace('const ', '').split('(')[0].split(' ')[0];
    blocks[shortName] = fileContent.substring(startIndex, endIndex);
}

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
        } else {
            console.log('BLOCK NOT FOUND:', fn);
        }
    }
    content += `\nmodule.exports = {\n    ${exportsList.join(',\n    ')}\n};\n`;
    fs.writeFileSync('services/' + serviceName, content, 'utf8');
    console.log(`Wrote services/${serviceName} (${exportsList.length} functions)`);
}

// Map short names to services
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

console.log('Equipment Split Exact Complete!');
