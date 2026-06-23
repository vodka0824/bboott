const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../services/jailRedemptionService.js');
let code = fs.readFileSync(filePath, 'utf8');

const newCode = `

/**
 * 驗退 (Medical Discharge)
 */
async function handleMedicalDischarge(replyToken, context) {
    const { userId, groupId } = context;
    const lineUtils = require('../utils/line');
    
    try {
        const { db } = require('../utils/db');
        const COLLECTION_NAME = 'economy_users';
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);
        
        const result = await db.runTransaction(async (t) => {
            const docRef = db.collection(COLLECTION_NAME).doc(userId);
            const doc = await t.get(docRef);
            if (!doc.exists) return { success: false, message: '找不到資料。' };
            const data = doc.data();

            const isMilitary = data.militaryUntil && Date.now() < data.militaryUntil;
            if (!isMilitary) {
                return { success: false, message: '❌ 你不是現役軍人，驗什麼退？' };
            }

            const now = Date.now();
            const cdTime = 12 * 60 * 60 * 1000; // 12H 冷卻
            if (data.lastMedicalDischarge && now - data.lastMedicalDischarge < cdTime) {
                const remainMs = cdTime - (now - data.lastMedicalDischarge);
                const remainHours = Math.floor(remainMs / 3600000);
                const remainMins = Math.floor((remainMs % 3600000) / 60000);
                return { success: false, message: \`❌ 你最近才剛裝病過！\\n請等待 \${remainHours} 小時 \${remainMins} 分鐘後再嘗試驗退！\` };
            }

            const rand = Math.random() * 100;
            const name = memberName || data.displayName || data.name || '無名氏';

            if (rand < 40) {
                // 40% 成功：直接退伍，軍階 - 1
                const currentCount = data.militaryEnlistCount || 1;
                const newCount = Math.max(0, currentCount - 1);
                
                t.update(docRef, {
                    militaryUntil: db.FieldValue.delete(),
                    militaryEnlistCount: newCount,
                    lastMedicalDischarge: now
                });
                return { success: true, outcome: 'success', name, newCount, currentCount };
            } else {
                // 60% 失敗：扣除 30% 資產
                const currentCoins = data.kuCoin || 0;
                const penalty = Math.floor(currentCoins * 0.3);
                
                t.update(docRef, {
                    kuCoin: Math.max(0, currentCoins - penalty),
                    lastMedicalDischarge: now
                });
                return { success: true, outcome: 'fail', name, penalty };
            }
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, result.message);
            return;
        }

        if (result.outcome === 'success') {
            let msg = \`🏥 【驗退成功】\\n\${result.name} 靠著精湛的演技，成功騙過了軍醫，獲得免役證明，當天晚上立刻打包走人！\\n\\n✨ 你的現役軍人身分已解除！\\n📉 由於提早落跑，你的入伍次數/軍階退回了 1 級！(目前入伍次數: \${result.newCount})\`;
            await lineUtils.replyText(replyToken, msg);
        } else {
            let msg = \`🏥 【裝病失敗】\\n\${result.name} 試圖裝病驗退，結果被醫官一眼識破！\\n\\n😡 長官勃然大怒，以「意圖免除兵役」為由，對你開出了天價罰單！\\n💸 你被扣除了 30% 的個人資產 (損失 \${result.penalty.toLocaleString()} 哭幣)！\\n\\n(冷卻時間：12 小時)\`;
            await lineUtils.replyText(replyToken, msg);
        }
    } catch (e) {
        console.error('[Military] handleMedicalDischarge Error:', e);
        await lineUtils.replyText(replyToken, '驗退機制發生異常，請稍後再試！');
    }
}
`;

// Insert before module.exports
const insertPos = code.lastIndexOf('module.exports = {');
if (insertPos === -1) throw new Error('Could not find module.exports');

code = code.substring(0, insertPos) + newCode + code.substring(insertPos);

// Export it
const exportStr = '    handleMedicalDischarge,';
const exportPos = code.lastIndexOf('};');
code = code.substring(0, exportPos) + exportStr + '\n' + code.substring(exportPos);

fs.writeFileSync(filePath, code);
console.log('Added handleMedicalDischarge successfully');
