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

functions.forEach(f => {
    console.log(fileContent.indexOf(f) + ' : ' + f.substring(0, 50));
});
