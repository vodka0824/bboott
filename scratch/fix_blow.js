const fs = require('fs');
let content = fs.readFileSync('services/jailLifeService.js', 'utf8');

const newLogic = `            const rand = Math.random() * 100;
            const cooldownTime = Date.now() + 30 * 60 * 1000;
            
            let isFree = false;
            let finalJailedUntil = data.jailedUntil;
            let eventMsg = '';
            let outcomeType = ''; // 'perfect', 'good', 'bad_none', 'bad_add'
            let timeChangeMsg = '';
            let reward = 0;

            if (rand < 10) {
                // 10% 惹怒典獄長
                const addMins = Math.floor(Math.random() * 31) + 30; // 30~60
                finalJailedUntil = Math.max(Date.now(), data.jailedUntil) + (addMins * 60 * 1000);
                eventMsg = '你服務時不小心牙齒撞到典獄長，他不舒服一怒之下叫人把你拖出去毒打！';
                timeChangeMsg = \`加刑 \${addMins} 分鐘\`;
                outcomeType = 'bad_add';
            } else if (rand < 50) {
                // 40% 白嫖
                eventMsg = '你賣力服務了半天，弄得口乾舌燥，結果典獄長爽完提上褲子就不認人了！';
                timeChangeMsg = '毫無減免 (被白嫖)';
                outcomeType = 'bad_none';
            } else if (rand < 90) {
                // 40% 減刑 + 小費
                const deductMins = Math.floor(Math.random() * 31) + 30; // 30~60
                reward = Math.floor(Math.random() * 40001) + 20000; // 20k~60k
                finalJailedUntil = data.jailedUntil - (deductMins * 60 * 1000);
                eventMsg = '典獄長龍心大悅！不但幫你減去大量刑期，還從錢包裡抽了一疊鈔票塞進你嘴裡！';
                timeChangeMsg = \`減免 \${deductMins} 分鐘\`;
                outcomeType = 'good';
                if (finalJailedUntil <= Date.now()) isFree = true;
            } else {
                // 10% 完美服務 (立即釋放 + 封口費)
                reward = Math.floor(Math.random() * 50001) + 50000; // 50k~100k
                finalJailedUntil = Date.now() - 1000;
                eventMsg = '你的服務簡直是神乎其技！典獄長爽到靈魂出竅，醒來後立刻簽發了特赦令，並給了你一筆豐厚的封口費！';
                timeChangeMsg = '刑期全免 (特赦)';
                outcomeType = 'perfect';
                isFree = true;
            }

            if (reward > 0) {
                t.update(docRef, { kuCoin: db.FieldValue.increment(reward) });
            }

            if (isFree) {
                t.update(docRef, { jailedUntil: db.FieldValue.delete(), blowCooldownUntil: cooldownTime });
            } else {
                t.update(docRef, { jailedUntil: finalJailedUntil, blowCooldownUntil: cooldownTime });
            }

            return { success: true, isFree, eventMsg, outcomeType, timeChangeMsg, reward, name: memberName || data.displayName || data.name || '未知', finalJailedUntil, newBalance: (data.kuCoin || 0) + reward };`;

const newUI = `        const now = Date.now();
        const cdText = \`⏳ 冷卻時間：30 分鐘\\n（可於 \${new Date(now + 30 * 60 * 1000).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })} 後再次服務）\`;
        
        let headerColor, bgColor, headerIcon, headerTitle, headerSubtitle, resultColor;
        
        if (result.outcomeType === 'perfect') {
            headerIcon = '🌟';
            headerTitle = '神之服務';
            headerSubtitle = '特赦令降臨';
            headerColor = '#FBC02D'; // Gold
            bgColor = '#FFF9C4';
            resultColor = '#F57F17';
        } else if (result.outcomeType === 'good') {
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
            flexUtils.createText({ text: \`⚖️ 判決結果：\${result.timeChangeMsg}\`, size: 'sm', weight: 'bold', color: resultColor, margin: 'md' })
        ];

        if (result.reward > 0) {
            bodyContents.push(flexUtils.createText({ text: \`💰 獲得小費：+\${result.reward.toLocaleString()} 哭幣\`, size: 'sm', weight: 'bold', color: '#2E7D32', margin: 'sm' }));
            bodyContents.push(flexUtils.createText({ text: \`💰 結算總資產：\${result.newBalance.toLocaleString()} 哭幣\`, size: 'sm', weight: 'bold', color: '#1A1A1A', margin: 'sm' }));
        }

        bodyContents.push(flexUtils.createSeparator('md'));

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

        await lineUtils.replyFlex(replyToken, '吹喇叭結果', bubble);`;

content = content.replace(/const rand = Math\.random\(\) \* 100;[\s\S]*?return \{ success: true, isFree, eventMsg, outcomeType, timeChangeMsg, name: memberName \|\| data\.displayName \|\| data\.name \|\| '未知', finalJailedUntil \};/, newLogic);
content = content.replace(/const now = Date\.now\(\);[\s\S]*?await lineUtils\.replyFlex\(replyToken, '吹喇叭結果', bubble\);/, newUI);

fs.writeFileSync('services/jailLifeService.js', content);
