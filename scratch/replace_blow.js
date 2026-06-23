const fs = require('fs');

function replaceIt() {
    let content = fs.readFileSync('services/jailLifeService.js', 'utf8');
    const lines = content.split('\n');

    const startIndex = lines.findIndex(l => l.includes('async function handleBlowWarden(replyToken, context) {'));
    if (startIndex === -1) {
        console.log('Failed to find start index');
        return;
    }

    const endIndex = lines.findIndex((l, i) => i > startIndex && l.includes('console.error(') && lines[i-1].includes('catch (e)')) + 2;
    if (endIndex < 2) {
        console.log('Failed to find end index');
        return;
    }

    const newCode = `async function handleBlowWarden(replyToken, context) {
    const { userId, groupId } = context;

    try {
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);
        const result = await db.runTransaction(async (t) => {
            const docRef = db.collection('economy_users').doc(userId);
            const doc = await t.get(docRef);
            if (!doc.exists) return { success: false, message: '找不到資料。' };
            const data = doc.data();
            
            if (!data.jailedUntil || Date.now() >= data.jailedUntil) {
                const spam = getSpamResponse(data, 'not_jailed', '你又沒坐牢，跑來吹什麼喇叭？');
                t.update(docRef, { spamTracker: spam.newTracker });
                return { success: false, message: spam.message, ignore: spam.ignore };
            }

            if (data.blowCooldownUntil && Date.now() < data.blowCooldownUntil) {
                const remaining = Math.ceil((data.blowCooldownUntil - Date.now()) / 60000);
                const spam = getSpamResponse(data, 'blow_cd', \`典獄長現在進入聖人模式，請休息 \${remaining} 分鐘後再來！\`);
                t.update(docRef, { spamTracker: spam.newTracker });
                return { success: false, message: spam.message, ignore: spam.ignore };
            }

            const rand = Math.random() * 100;
            const cooldownTime = Date.now() + 30 * 60 * 1000;
            
            let isFree = false;
            let finalJailedUntil = data.jailedUntil;
            let eventMsg = '';
            let outcomeType = ''; // 'good', 'bad_add', 'bad_none'
            let timeChangeMsg = '';

            if (rand < 10) {
                // 10% 典獄長覺得不舒服，加刑 30 分鐘
                finalJailedUntil = Math.max(Date.now(), data.jailedUntil) + (30 * 60 * 1000);
                eventMsg = '你牙齒撞到典獄長，他不舒服一怒之下給你加刑！';
                timeChangeMsg = '加刑 30 分鐘';
                outcomeType = 'bad_add';
            } else if (rand < 50) {
                // 40% 白嫖
                eventMsg = '你賣力服務了半天，典獄長爽完提上褲子就不認人了！';
                timeChangeMsg = '毫無減免 (被白嫖)';
                outcomeType = 'bad_none';
            } else {
                // 50% 扣除一半剩餘刑期
                const remainingMins = Math.ceil((data.jailedUntil - Date.now()) / 60000);
                const deductMins = Math.floor(remainingMins / 2);
                finalJailedUntil = data.jailedUntil - (deductMins * 60 * 1000);
                eventMsg = \`典獄長龍心大悅！直接幫你減去了大量刑期！\`;
                timeChangeMsg = \`減免 \${deductMins} 分鐘\`;
                outcomeType = 'good';
                if (finalJailedUntil <= Date.now()) isFree = true;
            }

            if (isFree) {
                t.update(docRef, { jailedUntil: db.FieldValue.delete(), blowCooldownUntil: cooldownTime });
            } else {
                t.update(docRef, { jailedUntil: finalJailedUntil, blowCooldownUntil: cooldownTime });
            }

            return { success: true, isFree, eventMsg, outcomeType, timeChangeMsg, name: memberName || data.displayName || data.name || '未知', finalJailedUntil };
        });

        if (!result.success) {
            if (result.ignore) return;
            await lineUtils.replyText(replyToken, \`❌ \${result.message}\`);
            return;
        }

        const now = Date.now();
        const cdText = \`⏳ 冷卻時間：30 分鐘\\n（可於 \${new Date(now + 30 * 60 * 1000).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })} 後再次服務）\`;
        
        let headerColor, bgColor, headerIcon, headerTitle, headerSubtitle, resultColor;
        
        if (result.outcomeType === 'good') {
            headerIcon = '👄';
            headerTitle = '特殊服務';
            headerSubtitle = '龍心大悅';
            headerColor = '#8E24AA'; // Purple
            bgColor = '#F3E5F5';
            resultColor = '#8E24AA';
        } else if (result.outcomeType === 'bad_add') {
            headerIcon = '💥';
            headerTitle = '服務失敗';
            headerSubtitle = '惹怒長官';
            headerColor = '#C62828'; // Red
            bgColor = '#FFEBEE';
            resultColor = '#C62828';
        } else {
            headerIcon = '💦';
            headerTitle = '服務完畢';
            headerSubtitle = '提褲不認人';
            headerColor = '#E65100'; // Orange
            bgColor = '#FFF3E0';
            resultColor = '#E65100';
        }

        const remainingMins = Math.ceil((result.finalJailedUntil - now) / 60000);
        
        const bodyContents = [
            flexUtils.createText({ text: \`\${result.name} 敲開了典獄長的辦公室...\\n\\n\${result.eventMsg}\`, size: 'sm', color: '#666666', wrap: true }),
            flexUtils.createSeparator('md'),
            flexUtils.createText({ text: \`⚖️ 判決結果：\${result.timeChangeMsg}\`, size: 'sm', weight: 'bold', color: resultColor, margin: 'md' }),
            flexUtils.createSeparator('md')
        ];

        if (result.isFree) {
            bodyContents.push(flexUtils.createText({ text: \`🎉 由於刑期歸零，\${result.name} 順利出獄！\`, size: 'md', weight: 'bold', color: '#2E7D32', margin: 'md', wrap: true }));
        } else {
            bodyContents.push(flexUtils.createText({ text: \`⏱️ 目前剩餘刑期：\${remainingMins} 分鐘。\`, size: 'sm', color: '#333333', margin: 'md', wrap: true }));
        }
        
        bodyContents.push(flexUtils.createText({ text: cdText, size: 'xs', color: resultColor, margin: 'md', wrap: true }));

        const bubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader(\`\${headerIcon} \${headerTitle}\`, headerSubtitle, headerColor, bgColor),
            body: flexUtils.createBox('vertical', bodyContents, { paddingAll: 'xl', backgroundColor: '#FFFFFF' })
        });

        await lineUtils.replyFlex(replyToken, '吹喇叭結果', bubble);

    } catch (e) {
        console.error('[Jail] handleBlowWarden Error:', e);
        await lineUtils.replyText(replyToken, '❌ 服務失敗。');
    }
}`;

    lines.splice(startIndex, endIndex - startIndex, newCode);
    fs.writeFileSync('services/jailLifeService.js', lines.join('\n'));
    console.log('REPLACEMENT SUCCESSFUL!');
}

replaceIt();
