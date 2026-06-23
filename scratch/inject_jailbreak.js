const { Firestore } = require('@google-cloud/firestore');
const { getDb } = require('../utils/db');
const db = getDb();
const COLLECTION_NAME = 'economy_users';
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const authUtils = require('../utils/auth');

async function handleJailbreak(replyToken, context) {
    const { userId, groupId } = context;

    try {
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);
        const docRef = db.collection(COLLECTION_NAME).doc(userId);
        const doc = await docRef.get();
        if (!doc.exists) return await lineUtils.replyText(replyToken, '找不到您的資料。');
        
        const data = doc.data();
        if (!data.jailedUntil || Date.now() >= data.jailedUntil) {
            return await lineUtils.replyText(replyToken, '你又沒坐牢，越什麼獄？想進來嗎？');
        }

        if (data.jailbreakCooldownUntil && Date.now() < data.jailbreakCooldownUntil) {
            const remaining = Math.ceil((data.jailbreakCooldownUntil - Date.now()) / 60000);
            return await lineUtils.replyText(replyToken, `你才剛被獄警毒打一頓，腿還在發抖！請休息 ${remaining} 分鐘後再嘗試越獄。`);
        }

        const remainingMins = Math.ceil((data.jailedUntil - Date.now()) / 60000);
        const wantedAdd = remainingMins / 300;
        const addPercent = (wantedAdd * 100).toFixed(1);
        const shivMsg = data.hasShiv ? '\\n✅ 已裝備：銼刀 (保證越獄成功)' : '';

        const bubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader('🏃‍♂️ 越獄確認', '高風險行動', flexUtils.COLORS.BG_DANGER, flexUtils.COLORS.TEXT_DANGER),
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: '越獄失敗將會受到嚴厲懲罰，並進入 10 分鐘冷卻狀態。', wrap: true, color: flexUtils.COLORS.TEXT_MUTED, size: 'sm' }),
                flexUtils.createText({ text: `⚠️ 成功越獄將增加 ${addPercent}% 通緝值！${shivMsg}`, wrap: true, color: '#FF9800', size: 'sm', weight: 'bold', margin: 'md' }),
            ]),
            footer: flexUtils.createBox('vertical', [
                flexUtils.createButton('確認越獄', flexUtils.createPostbackAction('確認越獄', `action=confirmJailbreak&targetId=${userId}`), 'primary', 'md'),
            ])
        });

        await lineUtils.replyFlex(replyToken, '越獄確認', bubble);
    } catch (e) {
        console.error('[Jail] handleJailbreak Error:', e);
    }
}

async function confirmJailbreak(replyToken, context) {
    const { userId, groupId } = context;

    try {
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);
        
        const { getFinalPlayerStats } = require('../handlers/rpg');
        const stats = await getFinalPlayerStats(userId);
        
        const result = await db.runTransaction(async (t) => {
            const docRef = db.collection(COLLECTION_NAME).doc(userId);
            const doc = await t.get(docRef);
            if (!doc.exists) return { success: false, message: '找不到您的資料。' };
            const data = doc.data();
            
            if (!data.jailedUntil || Date.now() >= data.jailedUntil) return { success: false, message: '你又沒坐牢，越什麼獄？' };
            if (data.jailbreakCooldownUntil && Date.now() < data.jailbreakCooldownUntil) return { success: false, message: '冷卻中！' };

            const rand = Math.random() * 100;
            const eva = stats.final.eva || 0;
            let finalChance = 5 + (eva * 1.0625);

            const { getWantedList, getMafiaRank } = require('../handlers/profession');
            const wantedList = await getWantedList();
            const mafiaRank = await getMafiaRank(userId, data, wantedList);
            
            if (mafiaRank === 'boss') finalChance += 20;
            else if (mafiaRank === 'capo') finalChance += 10;
            else if (mafiaRank === 'enforcer') finalChance += 5;

            let isSuccess = rand < finalChance; 
            let usedShiv = false;
            if (data.hasShiv) {
                isSuccess = true;
                usedShiv = true;
            }

            if (isSuccess) {
                const remainingMins = Math.ceil((data.jailedUntil - Date.now()) / 60000);
                const currentWanted = data.wantedLevel || 0;
                const wantedAdd = remainingMins / 300;
                let newWantedLevel = currentWanted + wantedAdd;

                const updateData = { jailedUntil: db.FieldValue.delete(), wantedLevel: newWantedLevel };
                if (usedShiv) updateData.hasShiv = db.FieldValue.delete();
                t.update(docRef, updateData);
                return { success: true, jailbreak: true, usedShiv, newWantedLevel, name: memberName || data.name };
            } else {
                const newJailedUntil = Math.max(data.jailedUntil, Date.now()) + (60 * 60 * 1000);
                const cooldownTime = Date.now() + 10 * 60 * 1000;
                t.update(docRef, { jailedUntil: newJailedUntil, jailbreakCooldownUntil: cooldownTime });
                return { success: true, jailbreak: false, name: memberName || data.name, newJailedUntil };
            }
        });

        if (!result.success) return await lineUtils.replyText(replyToken, `❌ ${result.message}`);

        if (result.jailbreak) {
            const shivMsg = result.usedShiv ? `\\n(使用了偷藏的【銼刀】，不費吹灰之力鋸開了鐵窗！)` : '';
            const wantedPercent = (result.newWantedLevel * 100).toFixed(1);
            let wantedWarning = result.newWantedLevel >= 1.0 ? `🚨 警告：你已成為全國頭號通緝犯 (通緝值 ${wantedPercent}%)！警方將全面追緝！` : (result.newWantedLevel >= 0.5 ? `⚠️ 警告：你的通緝值上升至 ${wantedPercent}%，黑道護體已開啟！` : `📋 通緝值上升至 ${wantedPercent}%`);

            const bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('🏃‍♂️💨 越獄成功', '', flexUtils.COLORS.BG_MAIN, '#4CAF50'),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `${result.name} 趁著警衛打瞌睡，成功翻過高牆逃出去了！${shivMsg}`, size: 'sm', wrap: true }),
                    flexUtils.createText({ text: wantedWarning, size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'md', wrap: true }),
                ])
            });
            await lineUtils.replyFlex(replyToken, '越獄成功', bubble);
        } else {
            const remainingMins = Math.ceil((result.newJailedUntil - Date.now()) / 60000);
            const bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('💥 越獄失敗', '', flexUtils.COLORS.BG_DANGER, flexUtils.COLORS.TEXT_DANGER),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `${result.name} 剛爬上牆頭就被探照燈發現，遭警衛持棍棒圍毆一頓後拖回牢房！`, size: 'sm', wrap: true }),
                    flexUtils.createText({ text: `🚨 刑期增加 60 分鐘！\\n⏱️ 剩餘刑期：${remainingMins} 分鐘。`, size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'md', wrap: true }),
                ])
            });
            await lineUtils.replyFlex(replyToken, '越獄失敗', bubble);
        }
    } catch (e) {
        console.error('[Jail] confirmJailbreak Error:', e);
    }
}

// 覆寫 jailbreakService.js 內的原始函數
const fs = require('fs');
let breakContent = fs.readFileSync('services/jailbreakService.js', 'utf8');

// 移除原有的 handleJailbreak 
const oldStartRegex = /(?:\/\*\*[\s\S]*?\*\/[\s\r\n]*)?(?:async )?function handleJailbreak\([\s\S]*?(?=async function )/;
breakContent = breakContent.replace(oldStartRegex, '');

// 準備注入
const injectStr = handleJailbreak.toString() + '\n\n' + confirmJailbreak.toString() + '\n\nmodule.exports = {';
breakContent = breakContent.replace('module.exports = {', injectStr);

// 確保 confirmJailbreak 有匯出
if(!breakContent.includes('confirmJailbreak,')) {
    breakContent = breakContent.replace('module.exports = {', 'module.exports = {\n    confirmJailbreak,');
}

fs.writeFileSync('services/jailbreakService.js', breakContent, 'utf8');
console.log('Successfully injected handleJailbreak and confirmJailbreak!');
