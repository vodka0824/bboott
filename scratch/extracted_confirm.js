async function confirmJailbreak(replyToken, context) {
    const { userId, groupId } = context;

    try {
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);
        
        // 獲取玩家 LUK & EVA
        const { getFinalPlayerStats } = require('./rpg');
        const stats = await getFinalPlayerStats(userId);
        
        const result = await db.runTransaction(async (t) => {
            const docRef = db.collection(COLLECTION_NAME).doc(userId);
            const doc = await t.get(docRef);
            
            if (!doc.exists) {
                return { success: false, message: '找不到您的資料。' };
            }
            
            const data = doc.data();
            if (!data.jailedUntil || Date.now() >= data.jailedUntil) {
                return { success: false, message: '你又沒坐牢，越什麼獄？想進來嗎？' };
            }

            if (data.jailbreakCooldownUntil && Date.now() < data.jailbreakCooldownUntil) {
                const remaining = Math.ceil((data.jailbreakCooldownUntil - Date.now()) / 60000);
                return { success: false, message: \`你才剛被獄警毒打一頓，腿還在發抖！請休息 \${remaining} 分鐘後再嘗試越獄。\` };
            }

            const rand = Math.random() * 100;
            
            // 越獄成功基礎機率 5% + (EVA * 1.0625)%
            const eva = stats.final.eva || 0;
            let finalChance = 5 + (eva * 1.0625);

            // 黑道監獄地頭蛇加成
            const { getWantedList, getMafiaRank } = require('./profession');
            const wantedList = await getWantedList();
            const mafiaRank = await getMafiaRank(userId, data, wantedList);
            
            if (mafiaRank === 'boss') {
                finalChance += 20;
            } else if (mafiaRank === 'capo') {
                finalChance += 10;
            } else if (mafiaRank === 'enforcer') {
                finalChance += 5;
            }

            let isSuccess = rand < finalChance; 
            let usedShiv = false;
            
            if (data.hasShiv) {
                isSuccess = true;
                usedShiv = true;
            }

            if (isSuccess) {
                // 計算通緝值影響 (方案D)
                const remainingMins = Math.ceil((data.jailedUntil - Date.now()) / 60000);
                const currentWanted = data.wantedLevel || 0;
                const wantedAdd = remainingMins / 300;
                let newWantedLevel = currentWanted + wantedAdd;
                if (newWantedLevel > 1.0) newWantedLevel = 1.0;

                const updateData = { jailedUntil: db.FieldValue.delete(), wantedLevel: newWantedLevel };
                if (usedShiv) updateData.hasShiv = db.FieldValue.delete();
                t.update(docRef, updateData);
                return { success: true, jailbreak: true, usedShiv, newWantedLevel, name: memberName || data.displayName || data.name };
            } else {
                // 失敗
                const newJailedUntil = Math.max(data.jailedUntil, Date.now()) + (60 * 60 * 1000);
                const cooldownTime = Date.now() + 10 * 60 * 1000;
                t.update(docRef, { 
                    jailedUntil: newJailedUntil,
                    jailbreakCooldownUntil: cooldownTime
                });
                return { success: true, jailbreak: false, name: memberName || data.displayName || data.name, newJailedUntil };
            }
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, \`❌ \${result.message}\`);
            return;
        }

        if (result.jailbreak) {
            const shivMsg = result.usedShiv ? \`\\n(使用了偷藏的【銼刀】，不費吹灰之力鋸開了鐵窗！)\` : '';
            const wantedPercent = (result.newWantedLevel * 100).toFixed(1);
            
            let wantedWarning = result.newWantedLevel >= 1.0 
                ? \`🚨 警告：你已成為全國頭號通緝犯 (通緝值 \${wantedPercent}%)！警方將全面追緝！\`
                : (result.newWantedLevel >= 0.5 
                    ? \`⚠️ 警告：你的通緝值上升至 \${wantedPercent}%，黑道護體已開啟，但警方正在追緝你！\`
                    : \`📋 通緝值上升至 \${wantedPercent}%，保持低調！\`);

            const bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader(\`🏃‍♂️💨 越獄成功\`, '', flexUtils.COLORS.BG_MAIN, '#4CAF50'),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: \`\${result.name} 趁著警衛打瞌睡，成功翻過高牆逃出去了！重獲自由！\${shivMsg}\`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, wrap: true }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: wantedWarning, size: 'xs', weight: 'bold', color: '#D32F2F', margin: 'md', wrap: true })
                ], { paddingAll: 'xl', backgroundColor: '#FAFAFA' })
            });
            
            const quickReply = {
                items: [
                    { type: 'action', action: { type: 'message', label: '⛓️ 勞改', text: '勞改' } },
                    { type: 'action', action: { type: 'message', label: '🤝 保釋', text: '保釋金' } },
                    { type: 'action', action: { type: 'message', label: '🚪 越獄', text: '越獄' } }
                ]
            };
            await lineUtils.replyFlex(replyToken, '越獄成功', bubble, [], quickReply);
        } else {
            const remainingMins = Math.ceil((result.newJailedUntil - Date.now()) / 60000);
            const bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader(\`🚨 越獄失敗\`, '', flexUtils.COLORS.BG_MAIN, '#B71C1C'),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: \`警報聲大作！\${result.name} 卡在通風管被警衛抓個正著！\`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, wrap: true }),
                    flexUtils.createText({ text: \`👮 獄警：「還敢逃？把你打到腿斷掉！」\`, size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'md', wrap: true }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: \`您的刑期增加 60 分鐘！\\n目前剩餘刑期：\${remainingMins} 分鐘。\`, size: 'sm', color: '#333333', margin: 'md', wrap: true }),
                    flexUtils.createText({ text: \`⏳ 冷卻時間：10 分鐘\\n（可於 \${new Date(Date.now() + 10 * 60 * 1000).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })} 後再次越獄）\`, size: 'xs', color: '#B71C1C', margin: 'md', wrap: true })
                ], { paddingAll: 'xl', backgroundColor: '#FFEBEE' })
            });
            
            const quickReply = {
                items: [
                    { type: 'action', action: { type: 'message', label: '⛓️ 勞改', text: '勞改' } },
                    { type: 'action', action: { type: 'message', label: '🤝 保釋', text: '保釋金' } },
                    { type: 'action', action: { type: 'message', label: '🚪 越獄', text: '越獄' } }
                ]
            };
            await lineUtils.replyFlex(replyToken, '越獄失敗', bubble, [], quickReply);
        }

    } catch (e) {
        console.error('[Jail] confirmJailbreak Error:', e);
        await lineUtils.replyText(replyToken, '❌ 越獄行動發生意外，請稍後再試。');
    }
}`;