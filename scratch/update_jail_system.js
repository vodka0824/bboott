const fs = require('fs');
const path = require('path');

const jailFile = path.join(__dirname, 'handlers/jail.js');
let jailCode = fs.readFileSync(jailFile, 'utf8');

// 1. 替換 handleBail 與 handleBailOther 區塊 (從行 38 到 176)
const bailRegex = /\/\*\*\s*\n\s*\*\s*自己交保\s*\n\s*\*\/[\s\S]*?(?=\/\*\*\s*\n\s*\*\s*越獄\s*\n\s*\*\/)/;

const newBailCode = `/**
 * 產生交保確認面板
 */
async function handleBail(replyToken, context) {
    const { userId } = context;

    try {
        const docRef = db.collection(COLLECTION_NAME).doc(userId);
        const doc = await docRef.get();
        if (!doc.exists) {
            await lineUtils.replyText(replyToken, '❌ 找不到您的資料。');
            return;
        }
        
        const data = doc.data();
        if (!data.jailedUntil || Date.now() >= data.jailedUntil) {
            await lineUtils.replyText(replyToken, '❌ 您目前沒有在坐牢，不用交保啦！');
            return;
        }

        const crimeRecord = data.crimeRecord || 0;
        const bailAmount = 50000 + (crimeRecord * 100000);
        
        const header = flexUtils.createHeader('📜 交保確認', '重獲自由的代價', flexUtils.COLORS.WARNING);
        const body = flexUtils.createBox('vertical', [
            flexUtils.createText({ text: \`您的前科次數：\${crimeRecord} 次\`, size: 'sm', color: flexUtils.COLORS.GRAY }),
            flexUtils.createSeparator('sm'),
            flexUtils.createText({ text: \`應繳保釋金：\${bailAmount.toLocaleString()} 哭幣\`, weight: 'bold', size: 'md', color: flexUtils.COLORS.DANGER, margin: 'md' })
        ], { paddingAll: 'xl' });
        
        const footer = flexUtils.createBox('horizontal', [
            flexUtils.createButton({ action: { type: 'message', label: '確認交保', text: '確認交保' }, style: 'primary', color: flexUtils.COLORS.WARNING })
        ], { paddingAll: 'md' });
        
        const flexBubble = flexUtils.createBubble({ size: 'kilo', header, body, footer });
        await lineUtils.replyFlex(replyToken, '交保確認', flexBubble);

    } catch (e) {
        console.error('[Jail] handleBail Error:', e);
        await lineUtils.replyText(replyToken, '❌ 系統發生錯誤。');
    }
}

/**
 * 執行自己交保扣款
 */
async function confirmBail(replyToken, context) {
    const { userId, groupId } = context;

    try {
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);
        
        const result = await db.runTransaction(async (t) => {
            const docRef = db.collection(COLLECTION_NAME).doc(userId);
            const doc = await t.get(docRef);
            
            if (!doc.exists) return { success: false, message: '找不到資料。' };
            
            const data = doc.data();
            if (!data.jailedUntil || Date.now() >= data.jailedUntil) {
                return { success: false, message: '您已經出獄了。' };
            }

            const kuCoin = data.kuCoin || 0;
            const crimeRecord = data.crimeRecord || 0;
            const bailAmount = 50000 + (crimeRecord * 100000);
            
            if (kuCoin < bailAmount) {
                return { success: false, message: \`你的錢包只有 \${kuCoin.toLocaleString()} 哭幣，連保釋金 \${bailAmount.toLocaleString()} 都付不起，繼續蹲吧！\` };
            }

            t.update(docRef, {
                kuCoin: db.FieldValue.increment(-bailAmount),
                jailedUntil: db.FieldValue.delete(),
                wantedLevel: 0
            });

            return { success: true, bailAmount, name: memberName || data.displayName || data.name };
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, \`❌ \${result.message}\`);
            return;
        }

        const msg = \`💸 【交保成功】\\n\${result.name} 繳交了 \${result.bailAmount.toLocaleString()} 哭幣保釋金！\\n大門為您敞開，通緝值已全數歸零！\`;
        await lineUtils.replyText(replyToken, msg);

    } catch (e) {
        console.error('[Jail] confirmBail Error:', e);
        await lineUtils.replyText(replyToken, '❌ 交保失敗，請稍後再試。');
    }
}

/**
 * 產生幫人保釋確認面板
 */
async function handleBailOther(replyToken, context, messageObject) {
    const { userId: fromUserId } = context;
    const mentionObj = messageObject && messageObject.mention;
    
    if (!mentionObj || !mentionObj.mentionees || mentionObj.mentionees.length === 0) {
        await lineUtils.replyText(replyToken, '❌ 請 @標記 你要保釋的對象！');
        return;
    }

    const targetUserId = mentionObj.mentionees[0].userId;
    if (fromUserId === targetUserId) {
        await lineUtils.replyText(replyToken, '❌ 要保釋自己請使用 交保');
        return;
    }

    try {
        const targetDocRef = db.collection(COLLECTION_NAME).doc(targetUserId);
        const targetDoc = await targetDocRef.get();
        if (!targetDoc.exists) {
            await lineUtils.replyText(replyToken, '❌ 找不到該玩家資料。');
            return;
        }

        const targetData = targetDoc.data();
        if (!targetData.jailedUntil || Date.now() >= targetData.jailedUntil) {
            await lineUtils.replyText(replyToken, '❌ 對方目前沒有在坐牢。');
            return;
        }

        const crimeRecord = targetData.crimeRecord || 0;
        const bailAmount = 50000 + (crimeRecord * 100000);
        const targetName = targetData.displayName || targetData.name || '該名犯人';
        
        const header = flexUtils.createHeader('📜 保釋確認', '義氣相挺的代價', flexUtils.COLORS.PRIMARY);
        const body = flexUtils.createBox('vertical', [
            flexUtils.createText({ text: \`保釋對象：\${targetName}\`, size: 'sm', weight: 'bold' }),
            flexUtils.createText({ text: \`對方前科：\${crimeRecord} 次\`, size: 'sm', color: flexUtils.COLORS.GRAY }),
            flexUtils.createSeparator('sm'),
            flexUtils.createText({ text: \`應付保釋金：\${bailAmount.toLocaleString()} 哭幣\`, weight: 'bold', size: 'md', color: flexUtils.COLORS.DANGER, margin: 'md' })
        ], { paddingAll: 'xl' });
        
        const footer = flexUtils.createBox('horizontal', [
            flexUtils.createButton({ action: { type: 'message', label: '確認保釋', text: \`確認保釋 \${targetUserId}\` }, style: 'primary' })
        ], { paddingAll: 'md' });
        
        const flexBubble = flexUtils.createBubble({ size: 'kilo', header, body, footer });
        await lineUtils.replyFlex(replyToken, '保釋確認', flexBubble);

    } catch (e) {
        console.error('[Jail] handleBailOther Error:', e);
        await lineUtils.replyText(replyToken, '❌ 系統錯誤。');
    }
}

/**
 * 執行幫人保釋扣款
 */
async function confirmBailOther(replyToken, context, targetUserId) {
    const { userId: fromUserId, groupId } = context;
    targetUserId = targetUserId.trim();

    try {
        const fromMemberName = await lineUtils.getGroupMemberName(groupId, fromUserId);
        const targetMemberName = await lineUtils.getGroupMemberName(groupId, targetUserId);

        const result = await db.runTransaction(async (t) => {
            const fromDocRef = db.collection(COLLECTION_NAME).doc(fromUserId);
            const targetDocRef = db.collection(COLLECTION_NAME).doc(targetUserId);
            
            const fromDoc = await t.get(fromDocRef);
            const targetDoc = await t.get(targetDocRef);
            
            if (!fromDoc.exists || !targetDoc.exists) return { success: false, message: '找不到玩家資料。' };

            const fromData = fromDoc.data();
            const targetData = targetDoc.data();

            if (!targetData.jailedUntil || Date.now() >= targetData.jailedUntil) {
                return { success: false, message: '對方已經出獄了。' };
            }

            const fromCoin = fromData.kuCoin || 0;
            const crimeRecord = targetData.crimeRecord || 0;
            const bailAmount = 50000 + (crimeRecord * 100000);

            if (fromCoin < bailAmount) {
                return { success: false, message: \`兄弟情深也要看錢包啊！保釋他需要 \${bailAmount.toLocaleString()}，你只有 \${fromCoin.toLocaleString()} 哭幣。\` };
            }

            t.update(fromDocRef, {
                kuCoin: db.FieldValue.increment(-bailAmount)
            });
            
            t.update(targetDocRef, {
                jailedUntil: db.FieldValue.delete(),
                wantedLevel: 0
            });

            return { 
                success: true, 
                bailAmount, 
                fromName: fromMemberName || fromData.displayName || fromData.name,
                targetName: targetMemberName || targetData.displayName || targetData.name
            };
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, \`❌ \${result.message}\`);
            return;
        }

        const msg = \`🤝 【兄弟情深】\\n\${result.fromName} 霸氣地甩出 \${result.bailAmount.toLocaleString()} 哭幣，成功保釋了 \${result.targetName}！\\n\\n大門為您敞開，通緝值已全數歸零，快說謝謝乾爹！\`;
        await lineUtils.replyText(replyToken, msg);

    } catch (e) {
        console.error('[Jail] confirmBailOther Error:', e);
        await lineUtils.replyText(replyToken, '❌ 保釋失敗。');
    }
}

/**
 * 賄賂提示
 */
async function handleBribePrompt(replyToken) {
    await lineUtils.replyText(replyToken, \`💰 想要用錢解決問題嗎？\\n請輸入「賄賂 [金額]」來進行賄賂，例如「賄賂 100000」。\\n每 100,000 哭幣可提升 1% 出獄機率，最高可賄賂 10,000,000 哭幣 (100% 成功)。\`);
}

/**
 * 產生賄賂確認面板
 */
async function handleBribe(replyToken, context, amount) {
    const { userId } = context;

    if (isNaN(amount) || amount <= 0) {
        await lineUtils.replyText(replyToken, '❌ 金額無效。');
        return;
    }

    if (amount > 10000000) {
        amount = 10000000; // 上限 1千萬
    }

    try {
        const docRef = db.collection(COLLECTION_NAME).doc(userId);
        const doc = await docRef.get();
        if (!doc.exists) return;
        
        const data = doc.data();
        if (!data.jailedUntil || Date.now() >= data.jailedUntil) {
            await lineUtils.replyText(replyToken, '❌ 您目前沒有在坐牢，賄賂個頭！');
            return;
        }

        const kuCoin = data.kuCoin || 0;
        if (kuCoin < amount) {
            await lineUtils.replyText(replyToken, \`❌ 你的錢包只有 \${kuCoin.toLocaleString()} 哭幣，連賄款都湊不齊！\`);
            return;
        }

        const successChance = (amount / 100000).toFixed(1);
        
        const header = flexUtils.createHeader('💼 賄賂確認', '賭一把自由', flexUtils.COLORS.DARK_GRAY);
        const body = flexUtils.createBox('vertical', [
            flexUtils.createText({ text: \`打算塞給局長的金額：\`, size: 'sm', color: flexUtils.COLORS.GRAY }),
            flexUtils.createText({ text: \`\${amount.toLocaleString()} 哭幣\`, weight: 'bold', size: 'lg', color: flexUtils.COLORS.WARNING, margin: 'sm' }),
            flexUtils.createSeparator('md'),
            flexUtils.createText({ text: \`預估出獄成功率：\${successChance}%\`, weight: 'bold', size: 'md', color: flexUtils.COLORS.SUCCESS, margin: 'md' }),
            flexUtils.createText({ text: \`(失敗將沒收賄款且繼續服刑)\`, size: 'xs', color: flexUtils.COLORS.DANGER, margin: 'sm' })
        ], { paddingAll: 'xl' });
        
        const footer = flexUtils.createBox('horizontal', [
            flexUtils.createButton({ action: { type: 'message', label: '確認賄賂', text: \`確認賄賂 \${amount}\` }, style: 'primary', color: flexUtils.COLORS.WARNING })
        ], { paddingAll: 'md' });
        
        const flexBubble = flexUtils.createBubble({ size: 'kilo', header, body, footer });
        await lineUtils.replyFlex(replyToken, '賄賂確認', flexBubble);

    } catch (e) {
        console.error('[Jail] handleBribe Error:', e);
    }
}

/**
 * 執行賄賂與擲骰子
 */
async function confirmBribe(replyToken, context, amount) {
    const { userId, groupId } = context;

    if (isNaN(amount) || amount <= 0) return;
    if (amount > 10000000) amount = 10000000;

    try {
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);
        
        const result = await db.runTransaction(async (t) => {
            const docRef = db.collection(COLLECTION_NAME).doc(userId);
            const doc = await t.get(docRef);
            
            if (!doc.exists) return { success: false, message: '找不到資料。' };
            
            const data = doc.data();
            if (!data.jailedUntil || Date.now() >= data.jailedUntil) {
                return { success: false, message: '您已經出獄了。' };
            }

            const kuCoin = data.kuCoin || 0;
            if (kuCoin < amount) {
                return { success: false, message: \`你的錢包餘額不足！\` };
            }

            // 扣除賄款
            t.update(docRef, { kuCoin: db.FieldValue.increment(-amount) });

            // 判定是否成功
            const chance = amount / 100000;
            const roll = Math.random() * 100;
            const isSuccess = roll < chance;

            if (isSuccess) {
                t.update(docRef, {
                    jailedUntil: db.FieldValue.delete(),
                    wantedLevel: 0
                });
                return { success: true, isBribed: true, amount, name: memberName || data.displayName || data.name };
            } else {
                return { success: true, isBribed: false, amount, name: memberName || data.displayName || data.name };
            }
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, \`❌ \${result.message}\`);
            return;
        }

        if (result.isBribed) {
            const msg = \`💼 【賄賂成功】\\n\${result.name} 偷偷塞了 \${result.amount.toLocaleString()} 哭幣給局長！\\n局長笑得合不攏嘴，直接把你的案底全清了！通緝值歸零，恭喜出獄！\`;
            await lineUtils.replyText(replyToken, msg);
        } else {
            const msg = \`💀 【賄賂失敗】\\n\${result.name} 塞了 \${result.amount.toLocaleString()} 哭幣給局長...\\n局長：「就這點錢也想出來？當我乞丐啊！」\\n你的賄款被沒收了，回去繼續蹲吧！\`;
            await lineUtils.replyText(replyToken, msg);
        }

    } catch (e) {
        console.error('[Jail] confirmBribe Error:', e);
        await lineUtils.replyText(replyToken, '❌ 系統發生錯誤。');
    }
}
`;

jailCode = jailCode.replace(bailRegex, newBailCode);

// 2. 替換 handleJailbreak 的成功邏輯與訊息
jailCode = jailCode.replace(
    /jailedUntil: db\.FieldValue\.delete\(\),\s*jailbreakCooldownUntil: cooldownUntil,\s*hasShiv: false\s*\}\);/,
    \`jailedUntil: db.FieldValue.delete(),
                jailbreakCooldownUntil: cooldownUntil,
                hasShiv: false,
                wantedLevel: 1.0 // 越獄成功，通緝值 100%
            });\`
);

jailCode = jailCode.replace(
    /await lineUtils\.replyText\(replyToken,\s*\`🏃‍♂️💨 【越獄成功】\\n\$\{result\.name\} 趁著警衛打瞌睡，成功翻過高牆逃出去了！重獲自由！\$\{shivMsg\}\`\);/,
    \`await lineUtils.replyText(replyToken, \\\`🏃‍♂️💨 【越獄成功】\\n\${result.name} 趁著警衛打瞌睡，成功翻過高牆逃出去了！重獲自由！\${shivMsg}\\n\\n⚠️ 警告：該犯人現已成為全國頭號通緝犯，警方將全面追緝！\\\`);\`
);

// 3. Export 匯出新函式
jailCode = jailCode.replace(
    /module\.exports = \{/,
    \`module.exports = {
    confirmBail,
    confirmBailOther,
    handleBribePrompt,
    handleBribe,
    confirmBribe,\`
);

fs.writeFileSync(jailFile, jailCode, 'utf8');
console.log('Jail logic updated successfully.');
