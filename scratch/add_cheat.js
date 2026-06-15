const fs = require('fs');
const path = require('path');

const rpgPath = path.join(__dirname, '../handlers/rpg.js');
let code = fs.readFileSync(rpgPath, 'utf8');

const cheatCode = `
/**
 * 內部測試用指令：!無敵開掛
 * 把自己的裝備全 +15，等級變 100
 */
async function handleCheatCode(context) {
    const { replyToken, userId } = context;

    try {
        const { getEquipmentData, EQUIP_VARIANTS } = require('./equipment');
        const db = require('../utils/db').db;
        
        // 1. 等級提升至 100
        const userRef = db.collection('players').doc(userId);
        
        // 設定 EXP 為 100 級所需
        const neededExp = 10 * Math.pow(100, 2); 
        await userRef.set({
            level: 100,
            chatExp: neededExp
        }, { merge: true });

        // 2. 裝備全部 +15
        const equipData = await getEquipmentData(userId);
        const parts = ['weapon', 'shield', 'wings', 'gloves', 'necklace', 'ring'];
        
        const newEquipments = { ...equipData.equipments };
        
        for (const p of parts) {
            // 使用 grade 5 的裝備
            const equipName = {
                weapon: '破甲槍',
                shield: '破防巨盾',
                wings: '虛空之翼',
                gloves: '破甲拳套',
                necklace: '破甲墜飾',
                ring: '幸運戒指'
            }[p];
            
            newEquipments[p] = {
                name: equipName,
                grade: 5,
                level: 15
            };
        }

        await userRef.set({
            equipments: newEquipments
        }, { merge: true });

        const lineUtils = require('../utils/line');
        await lineUtils.replyText(replyToken, '🔥 [系統管理員權限] 啟動！\\n您的等級已提升至 100 級，全套裝備已替換為最高階並強化至 +15，請輸入「!狀態」查看最新戰鬥力！');

    } catch (e) {
        console.error('[RPG] handleCheatCode Error:', e);
        const lineUtils = require('../utils/line');
        await lineUtils.replyText(replyToken, '❌ 開掛失敗。');
    }
}
`;

if (code.includes('handleCheatCode')) {
    // replace it
    const startStr = 'async function handleCheatCode(context) {';
    const endStr = '\n    } catch (e) {';
    const catchEndStr = "await lineUtils.replyText(replyToken, '❌ 開掛失敗。');\n    }\n}";
    
    const startIdx = code.indexOf('/**\n * 內部測試用指令：!無敵開掛');
    const endIdx = code.indexOf(catchEndStr) + catchEndStr.length;
    if (startIdx !== -1 && endIdx !== -1) {
        code = code.substring(0, startIdx) + cheatCode.trim() + code.substring(endIdx);
        fs.writeFileSync(rpgPath, code, 'utf8');
        console.log('Replaced handleCheatCode in rpg.js');
    }
} else {
    code = code.replace('module.exports = {', cheatCode + '\nmodule.exports = {');
    code = code.replace('handleRpgRank\n};', 'handleRpgRank,\n    handleCheatCode\n};');
    fs.writeFileSync(rpgPath, code, 'utf8');
    console.log('Appended handleCheatCode to rpg.js');
}

const routePath = path.join(__dirname, '../routes/rpgRoutes.js');
let routeCode = fs.readFileSync(routePath, 'utf8');
const newRoute = `
    // 測試指令：開掛
    router.register(
        /^\\s*!?(無敵開掛|開掛)\\s*$/i,
        (context) => rpgHandler.handleCheatCode(context),
        { isGroupOnly: false, allowDM: true, needAuth: false, feature: 'rpg_cheat' }
    );
`;

if (!routeCode.includes('無敵開掛')) {
    routeCode = routeCode.replace('};', newRoute + '\n};');
    fs.writeFileSync(routePath, routeCode, 'utf8');
    console.log('Appended cheat route to rpgRoutes.js');
}
