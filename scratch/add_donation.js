const fs = require('fs');
const path = require('path');

const economyPath = path.join(__dirname, '../handlers/economy.js');
let economyCode = fs.readFileSync(economyPath, 'utf8');

const newFunctions = `
/**
 * 處理捐款/贖罪提示
 */
async function handleDonationPrompt(replyToken, groupId, userId) {
    try {
        const lineUtils = require('../utils/line');
        const flexUtils = require('../utils/flex');
        
        const docRef = db.collection(COLLECTION_NAME).doc(userId);
        const doc = await docRef.get();
        if (!doc.exists) {
            await lineUtils.replyText(replyToken, '❌ 找不到您的資料，請先簽到。');
            return;
        }

        const data = doc.data();
        const wantedLevel = data.wantedLevel || 0;
        
        if (wantedLevel <= 0) {
            await lineUtils.replyText(replyToken, '👼 您目前沒有任何通緝值，不需要贖罪！');
            return;
        }

        const balance = data.kuCoin || 0;
        if (balance <= 0) {
            await lineUtils.replyText(replyToken, '❌ 您的餘額不足，無法捐款贖罪。');
            return;
        }

        // 計算贖罪費用：每消除 1% (0.01) 通緝值需要 1,000,000 哭幣
        // 若餘額不足則以 All In 方式盡量消除
        const costPerPercent = 1000000;
        const requiredAmount = Math.ceil(wantedLevel * 100 * costPerPercent);
        
        const wantedPercent = (wantedLevel * 100).toFixed(1) + '%';
        
        let promptText = \`您目前的通緝值為 \${wantedPercent}。\\n\`;
        promptText += \`完全消除需要 \${requiredAmount.toLocaleString()} 哭幣。\\n\`;
        promptText += \`您目前有 \${balance.toLocaleString()} 哭幣。\\n\`;
        
        let confirmLabel = '💸 全額贖罪';
        let isAllIn = false;
        
        if (balance < requiredAmount) {
            promptText += \`⚠️ 您的餘額不足以完全消除通緝值，是否要 All In 盡可能消除？\`;
            confirmLabel = '💸 All In 贖罪';
            isAllIn = true;
        } else {
            promptText += \`是否確定要支付 \${requiredAmount.toLocaleString()} 哭幣來完全消除通緝值？\`;
        }

        const bubble = flexUtils.createBubble({
            size: 'mega',
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: '⛪ 捐款贖罪', size: 'xl', weight: 'bold', color: '#FFD700', align: 'center' }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: promptText, size: 'sm', wrap: true, margin: 'md', color: '#FFFFFF' })
            ], { backgroundColor: '#1A1A1A', paddingAll: 'xl' }),
            footer: flexUtils.createBox('vertical', [
                flexUtils.createButton({ 
                    action: { type: 'postback', label: confirmLabel, data: \`action=confirmDonation&allIn=\${isAllIn ? '1' : '0'}\` },
                    style: 'primary', color: '#4CAF50', margin: 'sm' 
                })
            ], { backgroundColor: '#1A1A1A', paddingAll: 'md' })
        });

        await lineUtils.replyFlex(replyToken, '捐款贖罪確認', bubble);
    } catch (e) {
        console.error('[Economy] handleDonationPrompt Error:', e);
        const lineUtils = require('../utils/line');
        await lineUtils.replyText(replyToken, '❌ 系統錯誤');
    }
}

/**
 * 確認捐款/贖罪
 */
async function handleDonationConfirm(replyToken, groupId, userId, isAllIn) {
    try {
        const lineUtils = require('../utils/line');
        const costPerPercent = 1000000;
        
        await db.runTransaction(async (t) => {
            const docRef = db.collection(COLLECTION_NAME).doc(userId);
            const doc = await t.get(docRef);
            if (!doc.exists) throw new Error('NOT_FOUND');
            
            const data = doc.data();
            let wantedLevel = data.wantedLevel || 0;
            let balance = data.kuCoin || 0;
            
            if (wantedLevel <= 0) {
                t.set(docRef, {}, { merge: true }); // Dummy update
                return { success: false, reason: 'NO_WANTED' };
            }
            if (balance <= 0) {
                return { success: false, reason: 'NO_MONEY' };
            }

            const requiredAmount = Math.ceil(wantedLevel * 100 * costPerPercent);
            let deductAmount = 0;
            let reduceLevel = 0;
            
            if (balance >= requiredAmount) {
                deductAmount = requiredAmount;
                reduceLevel = wantedLevel;
            } else {
                deductAmount = balance;
                reduceLevel = (balance / costPerPercent) / 100;
            }
            
            let newWantedLevel = Math.max(0, wantedLevel - reduceLevel);
            
            t.update(docRef, {
                kuCoin: db.FieldValue.increment(-deductAmount),
                wantedLevel: parseFloat(newWantedLevel.toFixed(4))
            });
            
            return { 
                success: true, 
                deductAmount, 
                oldWanted: wantedLevel, 
                newWanted: newWantedLevel 
            };
        }).then(async (result) => {
            if (!result.success) {
                if (result.reason === 'NO_WANTED') await lineUtils.replyText(replyToken, '👼 您目前沒有通緝值，不需贖罪！');
                else if (result.reason === 'NO_MONEY') await lineUtils.replyText(replyToken, '❌ 餘額不足。');
                return;
            }
            
            const reducedPercent = ((result.oldWanted - result.newWanted) * 100).toFixed(1) + '%';
            const newPercent = (result.newWanted * 100).toFixed(1) + '%';
            
            let msg = \`⛪ 贖罪成功！\\n\`;
            msg += \`您捐獻了 \${result.deductAmount.toLocaleString()} 哭幣，消除了 \${reducedPercent} 的通緝值。\\n\`;
            msg += \`目前剩餘通緝值：\${newPercent}\`;
            
            if (result.newWanted <= 0) {
                msg += \`\\n👼 恭喜您重獲自由，洗白成功！\`;
            }
            
            await lineUtils.replyText(replyToken, msg);
        }).catch(async (e) => {
            if (e.message === 'NOT_FOUND') await lineUtils.replyText(replyToken, '❌ 找不到您的資料。');
            else throw e;
        });
        
    } catch (e) {
        console.error('[Economy] handleDonationConfirm Error:', e);
        const lineUtils = require('../utils/line');
        await lineUtils.replyText(replyToken, '❌ 系統錯誤');
    }
}
`;

if (!economyCode.includes('handleDonationPrompt')) {
    economyCode = economyCode.replace('module.exports = {', newFunctions + '\nmodule.exports = {\n    handleDonationPrompt,\n    handleDonationConfirm,');
    fs.writeFileSync(economyPath, economyCode, 'utf8');
    console.log('Appended handleDonation functions to economy.js');
} else {
    console.log('Already exists');
}
