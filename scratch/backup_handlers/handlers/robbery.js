async function robCoin(replyToken, groupId, fromUserId, messageObject) {
    const mentionObj = messageObject && messageObject.mention;
    if (!mentionObj || !mentionObj.mentionees || mentionObj.mentionees.length === 0) {
        await lineUtils.replyText(replyToken, '❌ 想搶誰？請 @標記 你要搶劫的對象！');
        return;
    }

    const targetUserId = mentionObj.mentionees[0].userId;

    if (fromUserId === targetUserId) {
        await lineUtils.replyText(replyToken, '❌ 你有病嗎？搶劫自己幹嘛？');
        return;
    }

    if (targetUserId === ADMIN_USER_ID) {
        const punishments = [
            async () => {
                const docRef = db.collection(COLLECTION_NAME).doc(fromUserId);
                await docRef.set({ kuCoin: 0 }, { merge: true });
                return '⚡️ 愚蠢的蟲子，你竟敢試圖搶劫賭場老闆？\n【神罰降臨：資產歸零】\n老闆彈了個響指，你的帳戶瞬間被清空，現在你一無所有了！';
            },
            async () => {
                const docRef = db.collection(COLLECTION_NAME).doc(fromUserId);
                await docRef.set({ wantedLevel: db.FieldValue.increment(10) }, { merge: true });
                return '⚡️ 你膽子不小，竟敢把歪腦筋動到老闆頭上？\n【神罰降臨：全城通緝】\n老闆笑著打了一通電話，你現在的通緝值暴增 1000%！出門小心點！';
            },
            async () => {
                const docRef = db.collection(COLLECTION_NAME).doc(fromUserId);
                await docRef.set({ kuCoin: db.FieldValue.increment(-10000) }, { merge: true });
                return '⚡️ 老闆只是看了你一眼，你的錢包就自動飛過去了。\n【神罰降臨：強制保護費】\n你的帳戶被強制扣除 10,000 哭幣當作給老闆的壓驚費！';
            },
            async () => {
                const docRef = db.collection(COLLECTION_NAME).doc(fromUserId);
                const jailedUntil = Date.now() + (30 * 60 * 1000); // 30 minutes
                await docRef.set({ jailedUntil, jailbreakCooldownUntil: db.FieldValue.delete() }, { merge: true });
                return '⚡️ 搶劫老闆？你是不是沒睡醒？\n【神罰降臨：強制勞動】\n老闆的保鑣直接把你拖進地下室，你將面臨 30 分鐘的禁閉！';
            }
        ];
        
        const randomPunishment = punishments[Math.floor(Math.random() * punishments.length)];
        const msg = await randomPunishment();
        
        await lineUtils.replyText(replyToken, msg);
        return;
    }

    try {
        const fromMemberName = await lineUtils.getGroupMemberName(groupId, fromUserId);
        const targetMemberName = await lineUtils.getGroupMemberName(groupId, targetUserId);

        const { getFinalPlayerStats } = require('./rpg');
        const robberStatsObj = await getFinalPlayerStats(fromUserId);
        const targetStatsObj = await getFinalPlayerStats(targetUserId);
        const robberStats = robberStatsObj.final;
        const targetStats = targetStatsObj.final;

        const result = await db.runTransaction(async (t) => {
            const fromProfile = await getUserProfile(t, fromUserId, fromMemberName);
            const targetProfile = await getUserProfile(t, targetUserId, targetMemberName);

            const isCouncilor = fromProfile.data.councilorUntil && Date.now() < fromProfile.data.councilorUntil;
            let displayFromName = fromMemberName || fromProfile.data.displayName || fromProfile.data.name || '無名氏';
            if (isCouncilor) {
                displayFromName = `【尊貴的市議員】${displayFromName}`;
            }

            // 讀取並檢查冷卻時間 (2 小時)
            const now = new Date();
            const lastRob = fromProfile.data.lastRob || 0;
            const cooldownMs = 2 * 60 * 60 * 1000;
            
            if (now.getTime() - lastRob < cooldownMs) {
                const remainMin = Math.ceil((cooldownMs - (now.getTime() - lastRob)) / 60000);
                const spam = getSpamResponse(fromProfile.data, 'rob_cd', `⏳ 【避風頭】\n你剛作案不久，外面風聲還很緊！請等待 ${remainMin} 分鐘後再行動。`);
                t.update(fromProfile.docRef, { spamTracker: spam.newTracker });
                return { success: false, reason: 'limit', message: spam.message, ignore: spam.ignore };
            }

            const targetCoins = targetProfile.data.kuCoin || 0;
            if (targetCoins <= 0) {
                return { success: false, reason: 'poor', message: `😒 對方窮到連一塊錢都沒有，你搶個屁啊！` };
            }

            const crimeRecord = fromProfile.data.crimeRecord || 0;
            const wantedLevel = fromProfile.data.wantedLevel || 0;
            
            // 動態抓捕機率計算
            let baseJailChance = 20; 
            let wantedPenalty = (wantedLevel * 100) * 0.4; 
            let crimePenalty = Math.min(30, crimeRecord * 1.5); 
            
            let jailChance = baseJailChance + wantedPenalty + crimePenalty;
            let counterChance = 5; 
            
            let robRatioMin = 0.1; 
            let robRatioMax = 0.3; 
            
            // 爆擊判定 (CRT) -> 破甲必中
            const isCrit = (Math.random() * 100) < (robberStats.crit || 0);
            let isDodge = false;
            
            // 目標閃避判定 (EVA)
            if (!isCrit) {
                if ((Math.random() * 100) < (targetStats.eva || 0)) {
                    isDodge = true;
                }
            }
            
            const newWantedLevel = Number((wantedLevel + 0.15).toFixed(2));

            if (isDodge) {
                t.update(fromProfile.docRef, { 
                    lastRob: now.getTime(),
                    wantedLevel: newWantedLevel,
                    displayName: fromMemberName || fromProfile.data.displayName || fromProfile.data.name
                });
                return {
                    success: true,
                    outcome: 'dodged',
                    fromName: displayFromName,
                    targetName: targetMemberName || targetProfile.data.displayName
                };
            }

            // 套用搶匪 EVA 減輕反殺風險 (最大減免 50%)
            const evaReduction = 1 - Math.min(0.5, (robberStats.eva || 0) / 100);
            counterChance = counterChance * evaReduction;
            
            // 套用 LUK 額外減輕危險機率 (每點 0.2%，最高減免 10%)
            const lukRiskReduction = Math.min(10, (robberStats.luk || 0) * 0.2);
            counterChance = Math.max(1, counterChance - (counterChance * (lukRiskReduction / 100)));
            jailChance = Math.max(5, jailChance - (jailChance * (lukRiskReduction / 100)));
            
            const rand = Math.random() * 100;

            if (rand < counterChance) {
                // Counter-Attack
                let lostCoins = fromProfile.data.kuCoin || 0;
                let actualLost = 0;

                if (lostCoins > 0) {
                    actualLost = lostCoins;
                    t.update(fromProfile.docRef, { 
                        kuCoin: 0,
                        lastRob: now.getTime(),
                        wantedLevel: newWantedLevel,
                        displayName: fromMemberName || fromProfile.data.displayName || fromProfile.data.name
                    });
                    t.update(targetProfile.docRef, { 
                        kuCoin: db.FieldValue.increment(actualLost),
                        displayName: targetMemberName || targetProfile.data.displayName || targetProfile.data.name
                    });
                } else {
                    t.update(fromProfile.docRef, { 
                        lastRob: now.getTime(),
                        wantedLevel: newWantedLevel,
                        displayName: fromMemberName || fromProfile.data.displayName || fromProfile.data.name
                    });
                }
                
                return { 
                    success: true, 
                    outcome: 'counterAttack', 
                    lostCoins: actualLost, 
                    fromName: displayFromName,
                    targetName: targetMemberName || targetProfile.data.displayName
                };
            } else if (rand < counterChance + jailChance) {
                // 極限逃脫判定 (LUK)
                const escapeChance = Math.min(40, (robberStats.luk || 0) * 0.5); // 上限 40%
                if (Math.random() * 100 < escapeChance) {
                    t.update(fromProfile.docRef, { 
                        lastRob: now.getTime(),
                        wantedLevel: newWantedLevel,
                        displayName: fromMemberName || fromProfile.data.displayName || fromProfile.data.name
                    });
                    return {
                        success: true,
                        outcome: 'lukEscape',
                        fromName: displayFromName,
                        targetName: targetMemberName || targetProfile.data.displayName
                    };
                }

                if (isCouncilor && Math.random() < 0.3) {
                    const compensation = 500000;
                    t.update(fromProfile.docRef, { 
                        kuCoin: db.FieldValue.increment(compensation),
                        lastRob: now.getTime(),
                        wantedLevel: newWantedLevel,
                        displayName: fromMemberName || fromProfile.data.displayName || fromProfile.data.name
                    });
                    return {
                        success: true,
                        outcome: 'councilorEvade',
                        compensation,
                        fromName: displayFromName,
                        targetName: targetMemberName || targetProfile.data.displayName
                    };
                }

                // Jail (caught by police)
                const newCrimeRecord = crimeRecord + 1;
                const penaltyMins = 60 + (newCrimeRecord * 10);
                const jailedUntil = Date.now() + (penaltyMins * 60 * 1000); 
                
                t.update(fromProfile.docRef, {
                    jailedUntil,
                    jailbreakCooldownUntil: db.FieldValue.delete(),
                    crimeRecord: newCrimeRecord,
                    lastRob: now.getTime(),
                    wantedLevel: newWantedLevel,
                    displayName: fromMemberName || fromProfile.data.displayName || fromProfile.data.name
                });
                return {
                    success: true,
                    outcome: 'jailed',
                    penaltyMins,
                    fromName: displayFromName,
                    targetName: targetMemberName || targetProfile.data.displayName
                };
            } else {
                // Success
                let baseRobRatioMax = robRatioMax;
                let baseRobRatioMin = robRatioMin;
                
                let effectiveAtk = Math.max(1, robberStats.atk || 1);
                let effectiveDef = Math.max(0, targetStats.def || 0);
                
                // 套用戒指穿透率 (PEN%)
                const pen = Math.max(0, Math.min(30, robberStats.pen || 0));
                effectiveDef = effectiveDef * (1 - (pen / 100));

                if (isCrit) {
                    // 爆擊時無視 50% 防禦，且第1、2搶的基礎比例加倍 (最大不超過 100%)
                    baseRobRatioMax = Math.min(1.0, baseRobRatioMax * 1.5);
                    baseRobRatioMin = Math.min(1.0, baseRobRatioMin * 1.5);
                    effectiveDef = effectiveDef * 0.5;
                }

                let mitigation = effectiveAtk / (effectiveAtk + effectiveDef);
                if (mitigation < 0.01) mitigation = 0.01;

                let robRatio = Math.random() * (baseRobRatioMax - baseRobRatioMin) + baseRobRatioMin; 
                robRatio = robRatio * mitigation;
                
                if (robRatio < 0.01) robRatio = 0.01; // 最低保障 1%
                if (robRatio > 1.0) robRatio = 1.0;   // 最高 100%
                
                const atkDefDiff = (robberStats.atk || 0) - (targetStats.def || 0);
                
                let robAmount = Math.floor(targetCoins * robRatio);
                if (robAmount < 1) robAmount = 1;

                t.update(fromProfile.docRef, { 
                    kuCoin: db.FieldValue.increment(robAmount),
                    lastRob: now.getTime(),
                    wantedLevel: newWantedLevel,
                    displayName: fromMemberName || fromProfile.data.displayName || fromProfile.data.name
                });
                t.update(targetProfile.docRef, { 
                    kuCoin: db.FieldValue.increment(-robAmount),
                    displayName: targetMemberName || targetProfile.data.displayName || targetProfile.data.name
                });

                return { 
                    success: true, 
                    outcome: 'success', 
                    robAmount,
                    robRatio,
                    isCrit,
                    atkDefDiff,
                    pen,
                    fromName: displayFromName,
                    targetName: targetMemberName || targetProfile.data.displayName
                };
            }
        });

        if (!result.success) {
            if (result.ignore) return;
            if (result.message) await lineUtils.replyText(replyToken, result.message);
            return;
        }

        // 裝備顏色定義
        const eqColors = {
            weapon: '#E53935', // 紅
            gloves: '#FF9800', // 橘
            ring: '#9C27B0',   // 紫
            shield: '#795548', // 棕
            wings: '#00BCD4'   // 青
        };

        const robWeapon = robberStatsObj.equipments.weapon ? `[+${robberStatsObj.equipments.weapon.level} ${robberStatsObj.equipments.weapon.name}]` : '拳頭';
        const robGloves = robberStatsObj.equipments.gloves ? `[+${robberStatsObj.equipments.gloves.level} ${robberStatsObj.equipments.gloves.name}]` : '肉身';
        const robRing = robberStatsObj.equipments.ring ? `[+${robberStatsObj.equipments.ring.level} ${robberStatsObj.equipments.ring.name}]` : '徒手';
        const targetShield = targetStatsObj.equipments.shield ? `[+${targetStatsObj.equipments.shield.level} ${targetStatsObj.equipments.shield.name}]` : '肉身';
        const targetWings = targetStatsObj.equipments.wings ? `[+${targetStatsObj.equipments.wings.level} ${targetStatsObj.equipments.wings.name}]` : '雙腳';

        // Span Helper
        const sp = (txt, color, weight = 'regular') => ({ type: 'span', text: txt, color, weight });
        const eqSp = (name, type) => sp(name, eqColors[type] || '#333333', 'bold');

        // 隨機選取器
        const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

        if (result.outcome === 'dodged') {
            let dodgeContents = [];
            if (targetStatsObj.equipments.wings) {
                const dodgeActs = [
                    [sp(`展開背上的 `), eqSp(targetWings, 'wings'), sp(` 化作一道殘影，像鬼魅般完美閃過了你的攻擊！`)],
                    [sp(`施展了「飛燕流・神速步」，`), eqSp(targetWings, 'wings'), sp(` 帶動身軀，讓你的攻擊完全落空！`)],
                    [sp(`冷笑一聲，`), eqSp(targetWings, 'wings'), sp(` 輕輕一揮，整個人化為一團煙霧消失在原地！`)],
                    [sp(`使用了「幻影瞬身術」，你的攻擊穿透了他的殘影，`), eqSp(targetWings, 'wings'), sp(` 在遠處發出嘲諷的聲響！`)],
                    [sp(`突然進入「超負荷模式」，`), eqSp(targetWings, 'wings'), sp(` 噴發出湛藍尾焰，以馬赫速度閃過了攻擊！`)],
                    [sp(`輕蔑地哼了一聲，`), eqSp(targetWings, 'wings'), sp(` 展開形成了「絕對領域」，把你的攻擊彈開了！`)],
                    [sp(`大喊「你太慢了！」，`), eqSp(targetWings, 'wings'), sp(` 留下了空間殘像，本體早就在你背後了！`)]
                ];
                dodgeContents = pick(dodgeActs);
            } else {
                const dodgeActs = [
                    [sp(`身法極其敏捷，一溜煙就跑得無影無蹤，只留下一陣風！`)],
                    [sp(`施展了失傳已久的「凌波微步」，你連他的衣角都沒碰到！`)],
                    [sp(`突然大喊「看我的閃電五連鞭！」，然後趁你傻眼時光速逃離了現場！`)],
                    [sp(`一個滑步接後空翻，姿態滿分地躲開了你的笨拙攻擊！`)],
                    [sp(`大喊一聲「神威！」，身體瞬間虛化，你的攻擊直接穿透了過去！`)],
                    [sp(`施展了「替身術」，留在原地的只剩下一截木頭，本人已經逃之夭夭！`)],
                    [sp(`使用了「薛丁格的貓」狀態，處於存在與不存在之間，強行規避了傷害！`)],
                    [sp(`冷酷地推了一下眼鏡：「我已經看穿了你的未來。」然後以 0.1 毫米的差距躲開了！`)]
                ];
                dodgeContents = pick(dodgeActs);
            }

            const bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader(`💨 殘影閃避 (EVA)`, '', '#FFFFFF', '#9E9E9E'),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `你氣勢洶洶地試圖搶劫 ${result.targetName}，但他...`, size: 'sm', color: '#666666', wrap: true }),
                    flexUtils.createText({ contents: dodgeContents, size: 'sm', wrap: true, margin: 'sm' }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: `你撲了個空，只留下一陣尷尬！`, size: 'xs', color: '#E91E63', margin: 'md', wrap: true })
                ], { paddingAll: 'xl', backgroundColor: '#FAFAFA' })
            });
            await lineUtils.replyFlex(replyToken, '殘影閃避', bubble);
        } else if (result.outcome === 'counterAttack') {
            const counterActs = [
                `沒想到對方是有練過的！一記精準的「超究武神霸斬」直接把你踹飛到街角！👊`,
                `對方大喊一聲「歐拉歐拉歐拉！」，一套連續拳打得你毫無還手之力！🥊`,
                `對方嘴角上揚，使用了「百分之百被空手接白刃」，然後順勢給你一個過肩摔！💢`,
                `對方竟然是隱藏的武林高手！一招「降龍十八掌」把你轟飛了十幾公尺！💥`,
                `對方竟然暗藏了「王之財寶」，無數兵器從虛空中射出，把你射成了蜂窩！⚔️`,
                `對方覺醒了「替身使者」的能力，背後浮現出神秘幽靈，一頓「無駄無駄！」將你痛毆！👻`,
                `對方眼神一冷，施展出「卍解」！強大的靈壓直接把你震飛，連拔刀的機會都沒有！🌪️`,
                `對方默默結印，大喊「地爆天星！」，強大的引力直接把你砸進地底！☄️`
            ];
            const bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader(`🚨 搶劫大失敗`, '', '#FFFFFF', '#B71C1C'),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `${result.fromName} 蒙上面罩，準備搶劫 ${result.targetName}！`, size: 'sm', color: '#666666', wrap: true }),
                    flexUtils.createText({ text: pick(counterActs), size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'md', wrap: true }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: `你被殘忍地反殺了！身上的 ${result.lostCoins.toLocaleString()} 哭幣全部被搜括一空！💸`, size: 'md', weight: 'bold', color: '#B71C1C', margin: 'md', wrap: true })
                ], { paddingAll: 'xl', backgroundColor: '#FFEBEE' })
            });
            await lineUtils.replyFlex(replyToken, '搶劫反殺', bubble);
        } else if (result.outcome === 'jailed') {
            const jailActs = [
                `結果剛好撞見正在巡邏的霹靂小組！`,
                `沒想到對方是釣魚執法的便衣警察！`,
                `路過的熱心大媽大喊「抓賊啊！」，瞬間衝出十幾個便衣警察把你壓在地上！`,
                `你正準備動手，才發現自己走進了警察局大廳...`,
                `轉角突然遇到大批特警正在進行「反恐演習」，你直接成了最佳人質扮演者！`,
                `結果對方大喊「FBI Open Up!」，四面八方的窗戶瞬間被破開，武裝部隊把你團團包圍！`,
                `你沒注意到身後跟著「名偵探柯南」，他用麻醉手錶將你放倒，醒來時已經在看守所了！`,
                `你才剛拔出武器，天上突然降下一道聖光，某個光頭超級英雄一拳把你打進了局子裡！`
            ];
            const bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader(`🚓 遭到逮捕`, '', '#FFFFFF', '#1976D2'),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `${result.fromName} 準備搶劫 ${result.targetName}，${pick(jailActs)}`, size: 'sm', color: '#666666', wrap: true }),
                    flexUtils.createText({ text: `👮 警察：「把武器放下！雙手抱頭！你被捕了！」`, size: 'sm', weight: 'bold', color: '#1976D2', margin: 'md', wrap: true }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: `你被上銬關進了監獄，刑期 ${result.penaltyMins} 分鐘！\n(期間無法使用各種功能)`, size: 'xs', color: '#333333', margin: 'md', wrap: true })
                ], { paddingAll: 'xl', backgroundColor: '#E3F2FD' })
            });
            await lineUtils.replyFlex(replyToken, '遭到逮捕', bubble);
        } else if (result.outcome === 'lukEscape') {
            const escapeActs = [
                `帶頭的警察剛好踩到香蕉皮滑倒，你趁亂逃跑了！🏃💨`,
                `一台失控的卡車突然衝撞警車，你抓緊機會溜進了暗巷！`,
                `天空突然降下大雷雨，警方的視線被完全遮擋，你奇蹟般地脫身了！`,
                `你剛好撿到一個煙霧彈，大喊「忍法・煙遁！」後成功開溜！`,
                `突然有一群飆車族呼嘯而過，你趁亂跳上了其中一輛重機的後座，揚長而去！🏍️`,
                `你急中生智，對著警察大喊「看！是飛碟！」，然後趁他們抬頭時光速土遁！🛸`,
                `就在千鈞一髮之際，你發動了「時光機」回到五分鐘前，及時終止了這場愚蠢的搶劫！⏳`,
                `一個神秘的魔法陣突然在腳下展開，你被召喚到了異世界，躲過了這次牢獄之災！✨`
            ];
            const bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader(`🍀 極限逃脫`, '', '#FFFFFF', '#f39c12'),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `警察本來已經包圍了 ${result.fromName}...`, size: 'sm', color: '#666666', wrap: true }),
                    flexUtils.createText({ text: `但幸運女神的眷顧，${pick(escapeActs)}`, size: 'sm', weight: 'bold', color: '#f39c12', margin: 'md', wrap: true }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: `你驚險地躲過了牢獄之災，但必須先去避避風頭！`, size: 'xs', color: '#888888', margin: 'md', wrap: true })
                ], { paddingAll: 'xl', backgroundColor: '#FFF9C4' })
            });
            await lineUtils.replyFlex(replyToken, '極限逃脫', bubble);
        } else if (result.outcome === 'councilorEvade') {
            const bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader(`☎️ 關說特權`, '議員專屬', '#FFFFFF', '#673AB7'),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `警察本來已經把 ${result.fromName} 壓在地上...`, size: 'sm', color: '#666666', wrap: true }),
                    flexUtils.createText({ text: `但你立刻打了通電話給警察局長：「我是市議員！你這個局長是不想幹了是不是？」`, size: 'sm', weight: 'bold', color: '#673AB7', margin: 'md', wrap: true }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: `局長嚇得連忙叫警察放人，並親自拿了 ${result.compensation.toLocaleString()} 哭幣作為精神賠償金！你大搖大擺地離開了現場！`, size: 'xs', color: '#333333', margin: 'md', wrap: true })
                ], { paddingAll: 'xl', backgroundColor: '#EDE7F6' })
            });
            await lineUtils.replyFlex(replyToken, '關說特權', bubble);
        } else {
            let comboTitle = '🦹‍♂️ 搶劫成功';
            let headerColor = '#4CAF50';

            const bodyContents = [];
            
            if (result.isCrit) {
                let critContents = [];
                if (robberStatsObj.equipments.gloves) {
                    const skillName = pick(['「星爆氣流斬」', '「天照」', '「認真拳」', '「超魔王烈風拳」', '「無量空處」', '「黑閃」', '「超電磁砲」', '「王之虛閃」']);
                    critContents = [
                        sp(`你戴著 `), eqSp(robGloves, 'gloves'), sp(` 爆發出驚人的力量，配合 `), eqSp(robWeapon, 'weapon'), sp(` 施展了${skillName}！`)
                    ];
                } else {
                    const skillName = pick(['「燃燒小宇宙」', '「霸王色霸氣」', '「界王拳二十倍」', '「八門遁甲・第八死門」', '「自在極意功」', '「超級賽亞人模式」', '「須佐能乎」']);
                    critContents = [ sp(`你使用了${skillName}，使出了全力一擊！`) ];
                }
                bodyContents.push(flexUtils.createText({ text: `💥 【破甲爆擊 (CRT)】`, size: 'sm', weight: 'bold', color: '#E91E63', wrap: true }));
                bodyContents.push(flexUtils.createText({ contents: [...critContents, sp(`\n瞬間貫穿了 `, '#E91E63'), sp(result.targetName, '#E91E63', 'bold'), sp(` 的最後防線！`, '#E91E63')], size: 'sm', color: '#666666', wrap: true, margin: 'sm' }));
            } else {
                const threatLines = [
                    `「少廢話，把錢交出來！」🔪`,
                    `「此路是我開，此樹是我栽！」🪓`,
                    `「打劫！男的站左邊，女的站右邊，人妖站中間！」🔫`,
                    `「為了維持宇宙的和平，你的錢就由我來保管吧！」🌌`,
                    `「把錢交出來！我可是要成為海賊王的男人！」🏴‍☠️`,
                    `「乖乖交出錢包，否則我就代表月亮懲罰你！」🌙`,
                    `「你的錢已經死了。(You are already dead.)」☠️`,
                    `「這不是搶劫，這叫『強制財富重分配』！」💼`,
                    `「我只數三聲，錢包還是性命，自己選一個！」💣`
                ];
                bodyContents.push(flexUtils.createText({ text: `${result.fromName} 拿著武器逼近 ${result.targetName}！\n${pick(threatLines)}`, size: 'sm', color: '#666666', wrap: true }));
                bodyContents.push(flexUtils.createSeparator('md'));

                let battleContents = [];
                if (result.atkDefDiff > 0) {
                    const crushDesc = pick(['像切豆腐一樣', '如同秋風掃落葉般', '以壓倒性的氣魄', '帶著毀天滅地的氣勢', '宛如破壞神降臨般', '伴隨著震耳欲聾的龍嘯聲']);
                    battleContents = [
                        sp(`你的 `), eqSp(robWeapon, 'weapon'), sp(` 鋒芒畢露，${crushDesc}劈開了對方的 `), eqSp(targetShield, 'shield'), sp(`，對方嚇得把隱藏財產都交了出來！`)
                    ];
                    bodyContents.push(flexUtils.createText({ text: `⚔️ 【強勢碾壓】`, size: 'xs', weight: 'bold', color: '#4CAF50', margin: 'md', wrap: true }));
                } else if (result.atkDefDiff < 0) {
                    const blockDesc = pick(['只留下幾道刮痕...', '甚至連火花都沒擦出來...', '反而震得你虎口發麻！', '卻像是砍在振金上一樣毫無作用...', '被一股神秘的 AT 力場完全擋下...', '只造成了象徵性的 1 點傷害...']);
                    battleContents = [
                        sp(`對方舉起 `), eqSp(targetShield, 'shield'), sp(` 頑強抵抗，你的 `), eqSp(robWeapon, 'weapon'), sp(` 斬在上面${blockDesc} 對方成功保住了多數財產！`)
                    ];
                    bodyContents.push(flexUtils.createText({ text: `🛡️ 【銅牆鐵壁】`, size: 'xs', weight: 'bold', color: '#795548', margin: 'md', wrap: true }));
                } else {
                    const tieDesc = pick([
                        `雙方裝備不相上下，在街頭展開了一場激烈的拉鋸戰！雙方互飆垃圾話高達三百回合！`,
                        `兩人爆發了千日戰爭，拳頭與盾牌激烈碰撞，整條街都被你們的戰鬥波及了！`,
                        `你一刀我一盾，彷彿在上演經典武俠片，周圍的群眾紛紛拿爆米花出來看戲！`
                    ]);
                    battleContents = [ sp(tieDesc) ];
                    bodyContents.push(flexUtils.createText({ text: `⚔️ 【勢均力敵】`, size: 'xs', weight: 'bold', color: '#607D8B', margin: 'md', wrap: true }));
                }
                bodyContents.push(flexUtils.createText({ contents: battleContents, size: 'xs', color: '#666666', wrap: true, margin: 'sm' }));
            }

            if (result.pen && result.pen > 0) {
                let penContents = [];
                if (robberStatsObj.equipments.ring) {
                    const ringActs = ['散發出奇異的詛咒光芒', '產生了空間扭曲', '釋放了腐蝕性毒氣', '展開了「固有結界」', '發動了「萬花筒寫輪眼」', '釋放了「霸王色霸氣」'];
                    penContents = [
                        sp(`戒指 `), eqSp(robRing, 'ring'), sp(` ${pick(ringActs)}`)
                    ];
                } else {
                    penContents = [ sp(`你掌握了精準的暗殺技巧`) ];
                }
                bodyContents.push(flexUtils.createText({ contents: [
                    sp(`🌀 【穿甲穿透 (PEN)】\n`, '#9C27B0', 'bold'),
                    ...penContents, sp(`，無視了對方 ${result.pen.toFixed(1)}% 的防禦力！`)
                ], size: 'xs', color: '#666666', margin: 'md', wrap: true }));
            }

            bodyContents.push(flexUtils.createSeparator('md'));
            bodyContents.push(flexUtils.createText({ text: `你成功掠奪了 ${result.robAmount.toLocaleString()} 哭幣！💰`, size: 'xl', weight: 'bold', color: '#FF9800', margin: 'md', wrap: true }));
            bodyContents.push(flexUtils.createText({ text: `(搶劫讓你增加了 15% 通緝值，請注意條子！)`, size: 'xxs', color: '#E91E63', margin: 'sm', wrap: true }));

            const bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader(comboTitle, '', '#FFFFFF', headerColor),
                body: flexUtils.createBox('vertical', bodyContents, { paddingAll: 'xl', backgroundColor: '#FAFAFA' })
            });
            await lineUtils.replyFlex(replyToken, comboTitle, bubble);
        }

        // 寫入分析 Log
        if (result && result.success && result.outcome) {
            db.collection('log_robberies').doc().set({
                robberId: fromUserId,
                targetId: targetUserId,
                groupId: groupId || 'direct',
                robCount: result.robCount || 0,
                outcome: result.outcome,
                isCrit: result.isCrit || false,
                robAmount: result.robAmount || 0,
                lostCoins: result.lostCoins || 0,
                penaltyMins: result.penaltyMins || 0,
                timestamp: db.FieldValue.serverTimestamp()
            }).catch(e => console.error('[Economy] Log robbery error:', e));
        }

    } catch (e) {
        console.error('[Economy] robCoin Error:', e);
        await lineUtils.replyText(replyToken, '❌ 搶劫失敗，對方報警了！');
    }
}

