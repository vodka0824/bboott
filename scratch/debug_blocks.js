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
    if(commentStart !== -1 && fileContent.substring(commentStart, startIndex).trim().startsWith('/**')) {
        startIndex = commentStart;
    }
    let shortName = functions[i].replace('async function ', '').replace('function ', '').replace('const ', '').split('(')[0].split(' ')[0];
    blocks[shortName] = fileContent.substring(startIndex, endIndex);
    console.log(shortName, 'length:', blocks[shortName].length, 'start:', startIndex, 'end:', endIndex);
}
