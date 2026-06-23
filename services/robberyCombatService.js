const { db } = require('../utils/db');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const { ADMIN_USER_ID } = require('../config/constants');
const { getSpamResponse } = require('../utils/spamHandler');
const { getFinalPlayerStats } = require('../handlers/rpg');
const { getWantedList, getMafiaRank, applyWantedDecay, applyBossBetrayal, getBossBetrayalFlex, getMafiaBoss } = require('../handlers/profession');
const economyHandler = require('../handlers/economy');

const COLLECTION_NAME = 'economy_users';

const sp = (n) => parseInt(n || 0, 10);
const eqSp = (eq) => eq ? Object.values(eq).reduce((sum, item) => sum + (item?.sp || 0), 0) : 0;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const { validateRobTarget } = require('./robberyValidationService');

async function getUserProfile(t, userId, name = '未知用戶') {
    const docRef = db.collection(COLLECTION_NAME).doc(userId);
    const doc = await t.get(docRef);
    let data;
    if (!doc.exists) {
        data = {
            kuCoin: 0,
            crimeRecord: 0,
            wantedLevel: 0,
            name: name
        };
        t.set(docRef, data);
    } else {
        data = doc.data();
        if (name !== '未知用戶' && (!data.name || data.name === '未知用戶' || (data.name.startsWith('C') && data.name.length === 33))) {
            data.name = name;
            t.update(docRef, { name: name });
        }
    }
    return { docRef, data };
}

function calculateRobOutcome(robberStats, targetStats, targetCoins, crimeRecord, wantedLevel, isFromCouncilor, isTargetPolice, isTargetCouncilor, isSnitch = false, mafiaRank = null, targetMafiaRank = null, targetLevel = 1, isTargetMilitary = false, isTargetMonk = false, targetFollowers = 0) {
    if (isTargetMilitary) {
        return { outcome: 'military_block' };
    }

    let baseJailChance = 20; 
    let wantedPenalty = (wantedLevel * 100) * 0.4; 
    let crimePenalty = Math.min(20, crimeRecord * 1.0); // 減緩前科坐牢率
    
    let jailChance = baseJailChance + wantedPenalty + crimePenalty;
    if (isSnitch) jailChance += 20;
    
    // 硬上限：就算惡貫滿盈，坐牢率最高 60% (幸運減免前)
    if (jailChance > 60) jailChance = 60;
    
    let counterChance = 5; 
    if (isTargetPolice) counterChance += 20; // 警察防禦優勢
    if (targetMafiaRank === 'boss') counterChance = 50; // 老大被搶 50% 反擊
    else if (targetMafiaRank === 'capo') counterChance = 30; // 堂主 30%
    else if (targetMafiaRank === 'thug') counterChance = 15; // 小弟 15%
    
    let robRatioMin = 0.1; 
    let robRatioMax = 0.3; 
    
    if (isFromCouncilor) {
        // 議員親自下海：特權強徵
        robRatioMin = 0.3;
        robRatioMax = 0.5;
    }
    
    let isCrit = (Math.random() * 100) < (robberStats.crit || 0);
    let isDodge = false;
    
    if (!isCrit && targetMafiaRank !== 'boss') {
        if ((Math.random() * 100) < (targetStats.eva || 0)) {
            isDodge = true;
        }
    }
    
    // 老大對高迴避自帶 30% 額外命中，但不保證必中
    if (mafiaRank === 'boss' && isDodge) {
        if (Math.random() < 0.30) {
            isDodge = false;
        }
    }

    let wantedLevelGain = 0.05; 
    if (mafiaRank === 'capo') wantedLevelGain = 0.035; 
    else if (mafiaRank === 'boss') wantedLevelGain = 0.025; 
    
    if (isTargetPolice) wantedLevelGain *= 3; // 襲警成功通緝值 3 倍
    if (isTargetCouncilor) wantedLevelGain = 0.15; // 搶議員成功通緝值 15%
    if (isTargetMonk) wantedLevelGain = 0.15 + (Math.random() * 0.10); // 搶法師通緝值暴增 15~25%

    const newWantedLevel = Number((wantedLevel + wantedLevelGain).toFixed(2));

    const evaReduction = 1 - Math.min(0.5, (robberStats.eva || 0) / 100);
    counterChance = counterChance * evaReduction;
    
    const jailReduction = (robberStats.luk || 0) * 0.2;
    const counterReduction = (robberStats.luk || 0) * 0.05;
    
    counterChance = Math.max(1, counterChance - counterReduction);
    jailChance = Math.max(5, jailChance - jailReduction);
    
    // 黑幫規避逮捕加成 (警匪勾結)
    if (mafiaRank === 'boss') jailChance = Math.max(5, jailChance - 20);
    else if (mafiaRank === 'capo') jailChance = Math.max(5, jailChance - 10);
    else if (mafiaRank === 'thug') jailChance = Math.max(5, jailChance - 5);
    
    // 黑幫堂口火拼氣場加成
    let atkMultiplier = 1;
    let defMultiplier = 1;
    let targetDefMultiplier = 1;
    if (mafiaRank && targetMafiaRank) {
        // 假設從外部帶入 targetWantedLevel，這裡為了簡單，我們稍後在外面計算，此處先假設 robberStats 和 targetStats 已經處理好
    }

    const rand = Math.random() * 100;

    if (rand < counterChance) {
        if (targetMafiaRank === 'boss') {
            return { outcome: 'mafiaBossCounter', newWantedLevel };
        }
        return { outcome: 'counterAttack', newWantedLevel };
    } else if (rand < counterChance + jailChance) {
        // 議員專屬豁免檢定
        if (isFromCouncilor) {
            const randPrivilege = Math.random() * 100;
            if (randPrivilege < 30) {
                // 30% 關說特權：免坐牢並獲得國賠
                return { outcome: 'councilorEvade', newWantedLevel, compensation: Math.floor(targetCoins * 0.1) || 50000 };
            } else if (randPrivilege < 50) {
                // 20% 司法保護傘：直接無罪釋放
                return { outcome: 'umbrella', newWantedLevel };
            }
            // 剩下的 50% 才會真的入獄
        }

        // 議員搶劫失敗直接判定入獄，不允許逃脫 (除非觸發了上面的豁免)
        if (!isFromCouncilor) {
            const escapeChance = Math.min(40, (robberStats.luk || 0) * 0.5);
            if (Math.random() * 100 < escapeChance) {
                return { outcome: 'lukEscape', newWantedLevel };
            }
        }

        const newCrimeRecord = crimeRecord + 1;
        let penaltyMins = 60 + (newCrimeRecord * 10);
        
        if (isTargetPolice) penaltyMins *= 3; // 襲警失敗 3 倍刑期
        if (isFromCouncilor) penaltyMins *= 2; // 議員失敗 2 倍刑期
        
        const jailedUntil = Date.now() + (penaltyMins * 60 * 1000); 
        return { outcome: 'jailed', newWantedLevel, newCrimeRecord, penaltyMins, jailedUntil, fineRatio: 0.1 };
    } else {
        if (isDodge) {
            return { outcome: 'dodged', newWantedLevel };
        }
        
        // 法師專屬「佛光普照」閃避 (15%)
        if (isTargetMonk && Math.random() < 0.15) {
            return { outcome: 'monk_dodged', newWantedLevel };
        }
        
        // 議員保鑣檢定
        if (isTargetCouncilor) {
            const bodyguardDef = (targetLevel * 50) + 5000;
            const robberTotalAtk = (robberStats.atk || 1) * (1 + Math.max(0, robberStats.pen || 0) / 100);
            if (robberTotalAtk <= bodyguardDef) {
                if ((robberStats.luk || 0) > 50 && Math.random() < 0.25) {
                    return { outcome: 'blackmail', newWantedLevel, robRatio: Math.random() * 0.1 + 0.1 }; // 10~20%
                }
                const newCrimeRecord = crimeRecord + 1;
                const penaltyMins = (60 + (newCrimeRecord * 10)) * 2; // 2 倍刑期
                const jailedUntil = Date.now() + (penaltyMins * 60 * 1000); 
                return { outcome: 'bodyguard_arrest', newWantedLevel, newCrimeRecord, penaltyMins, jailedUntil, fineRatio: 0.1 };
            }
        }
        
        let baseRobRatioMax = robRatioMax;
        let baseRobRatioMin = robRatioMin;
        
        let effectiveAtk = Math.max(1, robberStats.atk || 1) * atkMultiplier;
        let originalDef = Math.max(0, targetStats.def || 0) * targetDefMultiplier;
        
        if (isTargetMonk) {
            originalDef += Math.floor(targetFollowers / 10);
        }
        let effectiveDef = originalDef;
        
        let pen = Math.max(0, robberStats.pen || 0);
        if (isFromCouncilor) pen = Math.max(pen, 50); // 議員特權無視 50% 防禦

        effectiveDef = effectiveDef * (1 - Math.min(100, pen) / 100);

        // 新版爆擊：無視 30% 防禦
        if (isCrit) {
            effectiveDef = effectiveDef * 0.7;
        }

        effectiveDef = Math.max(effectiveDef, originalDef * 0.4);

        if (isTargetMonk && effectiveAtk <= effectiveDef * 0.5) {
            return { outcome: 'karma_rebound', newWantedLevel };
        }

        // --- 新版攻防差值分檔制 ---
        let atkDefDiff = effectiveAtk - effectiveDef;
        baseRobRatioMin = 0.05;
        baseRobRatioMax = 0.15;

        if (atkDefDiff <= -500) {
            baseRobRatioMin = 0.0001;
            baseRobRatioMax = 0.01;
        } else if (atkDefDiff <= -100) {
            baseRobRatioMin = 0.01;
            baseRobRatioMax = 0.05;
        } else if (atkDefDiff <= 200) {
            baseRobRatioMin = 0.05;
            baseRobRatioMax = 0.15;
        } else if (atkDefDiff <= 800) {
            baseRobRatioMin = 0.15;
            baseRobRatioMax = 0.25;
        } else {
            baseRobRatioMin = 0.25;
            baseRobRatioMax = 0.40;
        }

        let robRatio = Math.random() * (baseRobRatioMax - baseRobRatioMin) + baseRobRatioMin; 
        
        // 新版爆擊：結算金額 1.5 倍
        if (isCrit) {
            robRatio = robRatio * 1.5;
        }

        if (mafiaRank === 'boss') {
            robRatio = robRatio * 1.5; 
        } else if (mafiaRank === 'capo') {
            robRatio = robRatio * 1.25; 
        } else if (mafiaRank === 'thug') {
            robRatio = robRatio * 1.1; 
        }
        
        if (isFromCouncilor) {
            robRatio = Math.max(robRatio, robRatioMin); // 保障議員特權
        }

        if (robRatio < 0.0001) robRatio = 0.0001; 
        if (robRatio > 1.0) robRatio = 1.0;   
        
        atkDefDiff = effectiveAtk - originalDef;
        
        let robAmount = Math.floor(targetCoins * robRatio);
        if (robAmount < 1) robAmount = 1;
        
        if (isTargetPolice) robAmount = Math.floor(robAmount * 1.5); // 警察贓物庫加成 1.5 倍

        return { outcome: 'success', newWantedLevel, robAmount, robRatio, isCrit, atkDefDiff, pen };
    }
}


function buildRobResultBubble(result, robberStatsObj, targetStatsObj) {
    const eqColors = { weapon: '#E53935', gloves: flexUtils.COLORS.SECONDARY, ring: '#9C27B0', shield: '#795548', wings: flexUtils.COLORS.PRIMARY };

    const robWeapon = robberStatsObj.equipments.weapon ? `[+${robberStatsObj.equipments.weapon.level} ${robberStatsObj.equipments.weapon.name}]` : '拳頭';
    const robGloves = robberStatsObj.equipments.gloves ? `[+${robberStatsObj.equipments.gloves.level} ${robberStatsObj.equipments.gloves.name}]` : '肉身';
    const robRing = robberStatsObj.equipments.ring ? `[+${robberStatsObj.equipments.ring.level} ${robberStatsObj.equipments.ring.name}]` : '徒手';
    const targetShield = targetStatsObj.equipments.shield ? `[+${targetStatsObj.equipments.shield.level} ${targetStatsObj.equipments.shield.name}]` : '肉身';
    const targetWings = targetStatsObj.equipments.wings ? `[+${targetStatsObj.equipments.wings.level} ${targetStatsObj.equipments.wings.name}]` : '雙腳';

    const sp = (txt, color, weight = 'regular') => ({ type: 'span', text: txt, color, weight });
    const eqSp = (name, type) => sp(name, eqColors[type] || '#333333', 'bold');
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

    const counterActs = [
        `對方早就識破了你的詭計，一記上鉤拳直接把你打飛到外太空！🥊`,
        `你剛拿出武器，對方已經用一套行雲流水的連續技把你按在地上摩擦！`,
        `對方冷笑一聲：「就這點本事也敢出來混？」然後用鈔能力召喚了一群保鑣把你圍毆了一頓！`,
        `你踩到香蕉皮滑倒，剛好撞到對方的拳頭上，瞬間失去意識！🍌`,
        `對方只是瞪了你一眼，你就嚇得雙腿發軟，自己把錢包掏出來賠罪了！`
    ];

    const mafiaActs = [
        `對方只是冷冷地看了你一眼，你周圍的空氣彷彿瞬間降到了冰點！🥶`,
        `你剛開口，老大的手下已經拿著 AK-47 抵住你的腦門了！`,
        `老大抽了一口雪茄：「年輕人，你知道死字怎麼寫嗎？」你當場嚇尿！`,
        `你甚至還沒看清楚老大的動作，自己就已經被倒吊在天花板上了！`,
        `對方打了個響指，你突然發現自己被十幾個西裝暴徒包圍了！`
    ];

    const jailActs = [
        `結果剛好撞見巡邏的警察，當場人贓俱獲！`,
        `沒想到對方是便衣刑警，你直接被反手壓制！`,
        `路過的熱心民眾見義勇為，一個過肩摔把你制伏並報警！`,
        `你太緊張不小心按到路邊的警報器，整條街響起警笛聲！`,
        `你在逃跑時不小心跑進了警察局，自投羅網！`
    ];

    let bubble;

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

        bubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader(`💨 殘影閃避 (EVA)`, '', flexUtils.COLORS.BG_MAIN, '#9E9E9E'),
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: `你氣勢洶洶地試圖搶劫 ${result.targetName}，但他...`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, wrap: true }),
                flexUtils.createText({ contents: dodgeContents, size: 'sm', wrap: true, margin: 'sm' }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `你撲了個空，只留下一陣尷尬！`, size: 'xs', color: '#E91E63', margin: 'md', wrap: true })
            ], { paddingAll: 'xl', backgroundColor: '#FAFAFA' })
        });
    } else if (result.outcome === 'monk_dodged') {
        bubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader(`✨ 佛光普照`, '法師專屬', flexUtils.COLORS.BG_MAIN, '#FFC107'),
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: `你試圖對 ${result.targetName} 發動攻擊，但對方雙手合十，低眉垂目...`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, wrap: true }),
                flexUtils.createText({ text: `「阿彌陀佛，苦海無邊，回頭是岸。」`, size: 'sm', weight: 'bold', color: '#FFC107', margin: 'md', wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `一股祥和的金光從法師身上散發出來，溫柔卻堅定地將你的攻擊化為無形！\n(法師觸發了 15% 的專屬閃避)`, size: 'xs', color: '#D32F2F', margin: 'md', wrap: true })
            ], { paddingAll: 'xl', backgroundColor: '#FFFDE7' })
        });
    } else if (result.outcome === 'karma_rebound') {
        bubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader(`💀 業力反噬`, '天譴降臨', flexUtils.COLORS.BG_MAIN, '#B71C1C'),
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: `${result.fromName} 的攻擊無法突破法師的【信仰護盾】！`, size: 'sm', weight: 'bold', color: '#D32F2F', wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `因對出家人動手，天理難容！你受到嚴重的業力反彈，心中充滿愧疚，被迫損失 ${result.penaltyAmount?.toLocaleString() || 0} 哭幣的財產！`, size: 'sm', color: '#333333', margin: 'md', wrap: true }),
            ], { paddingAll: 'xl', backgroundColor: '#FFEBEE' })
        });
    } else if (result.outcome === 'counterAttack') {
        const texts = [];
        texts.push(flexUtils.createText({ text: `${result.fromName} 搶劫不成，反而被 ${result.targetName} 狠狠修理了一頓！`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, wrap: true }));
        if (result.lostCoins > 0) {
            texts.push(flexUtils.createSeparator('md'));
            texts.push(flexUtils.createText({ text: `你被打得鼻青臉腫，從口袋裡掉出了 ${result.lostCoins.toLocaleString()} 哭幣，被對方撿走了！`, size: 'sm', color: '#D32F2F', margin: 'md', wrap: true }));
        }
        if (result.medicalDebt > 0) {
            texts.push(flexUtils.createText({ text: `🏥 【重傷負債】你身無分文付不出醫藥費，背上了 ${result.medicalDebt.toLocaleString()} 哭幣的醫療負債！
(系統將強制扣除你的未來收入直至還清，期間戰力減半且無法搶劫)`, size: 'sm', weight: 'bold', color: '#B71C1C', margin: 'md', wrap: true }));
        }
        if (result.brokenEquip) {
            texts.push(flexUtils.createText({ text: `💥 【裝備損壞】你在扭打中弄壞了裝備，${result.brokenEquip} 降級了！`, size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'sm', wrap: true }));
        }
        
        bubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader(`🚨 搶劫大失敗`, '', flexUtils.COLORS.BG_MAIN, '#B71C1C'),
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: `${result.fromName} 蒙上面罩，準備搶劫 ${result.targetName}！`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, wrap: true }),
                flexUtils.createText({ text: pick(counterActs), size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'md', wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `你被殘忍地反殺了！身上的 ${result.lostCoins.toLocaleString()} 哭幣全部被搜括一空！💸`, size: 'md', weight: 'bold', color: '#B71C1C', margin: 'md', wrap: true })
            ], { paddingAll: 'xl', backgroundColor: '#FFEBEE' })
        });
    } else if (result.outcome === 'mafiaBossCounter') {
        const texts = [];
        texts.push(flexUtils.createText({ text: `你惹到了黑道高層 ${result.targetName}，對方連武器都沒拿出來，光靠氣場就震碎了你的理智！`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, wrap: true }));
        if (result.lostCoins > 0) {
            texts.push(flexUtils.createSeparator('md'));
            texts.push(flexUtils.createText({ text: `你嚇得交出了 ${result.lostCoins.toLocaleString()} 哭幣當作保護費！`, size: 'sm', color: '#D32F2F', margin: 'md', wrap: true }));
        }
        if (result.medicalDebt > 0) {
            texts.push(flexUtils.createText({ text: `🏥 【重傷負債】你身無分文付不出醫藥費，背上了 ${result.medicalDebt.toLocaleString()} 哭幣的醫療負債！`, size: 'sm', weight: 'bold', color: '#B71C1C', margin: 'md', wrap: true }));
        }
        if (result.brokenEquip) {
            texts.push(flexUtils.createText({ text: `💥 【裝備損壞】你嚇得跌倒，${result.brokenEquip} 降級了！`, size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'sm', wrap: true }));
        }

        bubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader(`🕶️ 黑幫威壓`, '黑道老大專屬', flexUtils.COLORS.BG_MAIN, flexUtils.COLORS.BG_CARD),
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: `${result.fromName} 竟然敢搶劫【黑道老大】${result.targetName}！`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, wrap: true }),
                flexUtils.createText({ text: pick(mafiaActs), size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'md', wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `你被老大的手下洗劫一空！損失 ${result.lostCoins.toLocaleString()} 哭幣！💸`, size: 'md', weight: 'bold', color: '#B71C1C', margin: 'md', wrap: true })
            ], { paddingAll: 'xl', backgroundColor: '#FAFAFA' })
        });
    } else if (result.outcome === 'jailed' || result.outcome === 'bodyguard_arrest') {
        const texts = [];
        if (result.outcome === 'bodyguard_arrest') {
            texts.push(flexUtils.createText({ text: `你一靠近就被 ${result.targetName} 的特勤保鑣發現！`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, wrap: true }));
            texts.push(flexUtils.createText({ text: `「有刺客！保護議員！」`, size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'md', wrap: true }));
            texts.push(flexUtils.createText({ text: `你當場被保鑣壓制並移送法辦，罪名為危害國家安全！`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, margin: 'md', wrap: true }));
        } else {
            texts.push(flexUtils.createText({ text: `${result.fromName} 在作案過程中行蹤敗露，遭警方逮捕！`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, wrap: true }));
        }

        if (result.lostCoins > 0) {
            texts.push(flexUtils.createSeparator('md'));
            texts.push(flexUtils.createText({ text: `法院沒收了你的部分財產：\n-${result.lostCoins.toLocaleString()} 哭幣`, size: 'sm', color: '#D32F2F', margin: 'md', wrap: true }));
        }

        if (result.weaponConfiscated) {
            texts.push(flexUtils.createText({ text: `🚨 【襲警重罰】警方沒收了你身上的主武器！`, size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'sm', wrap: true }));
        }
        
        if (result.lostCouncilor) {
            texts.push(flexUtils.createText({ text: `🏛️ 【政治醜聞】你身為議員卻親自下海搶劫，當場遭議會革職，政治生涯徹底結束！`, size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'sm', wrap: true }));
        }

        texts.push(flexUtils.createSeparator('md'));
        texts.push(flexUtils.createText({ text: `👮 前科次數增加為：${result.newCrimeRecord} 次`, size: 'xs', color: flexUtils.COLORS.TEXT_MUTED, margin: 'md' }));
        texts.push(flexUtils.createText({ text: `⏳ 必須坐牢 ${result.penaltyMins} 分鐘`, size: 'md', weight: 'bold', color: '#B71C1C', margin: 'sm' }));

        bubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader(`🚓 遭到逮捕`, '', flexUtils.COLORS.BG_MAIN, '#1976D2'),
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: `${result.fromName} 準備搶劫 ${result.targetName}，${pick(jailActs)}`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, wrap: true }),
                flexUtils.createText({ text: `👮 警察：「把武器放下！雙手抱頭！你被捕了！」`, size: 'sm', weight: 'bold', color: '#1976D2', margin: 'md', wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `你被上銬關進了監獄，刑期 ${result.penaltyMins} 分鐘！\n(期間無法使用各種功能)`, size: 'xs', color: '#333333', margin: 'md', wrap: true }),
                flexUtils.createText({ text: `💸 法院裁定沒收 10% 財產作為罰金！(損失 ${result.lostCoins.toLocaleString()} 哭幣)`, size: 'xs', weight: 'bold', color: '#D32F2F', margin: 'md', wrap: true })
            ], { paddingAll: 'xl', backgroundColor: '#E3F2FD' })
        });
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
        bubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader(`🍀 極限逃脫`, '', flexUtils.COLORS.BG_MAIN, '#f39c12'),
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: `警察本來已經包圍了 ${result.fromName}...`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, wrap: true }),
                flexUtils.createText({ text: `但幸運女神的眷顧，${pick(escapeActs)}`, size: 'sm', weight: 'bold', color: '#f39c12', margin: 'md', wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `你驚險地躲過了牢獄之災，但必須先去避避風頭！`, size: 'xs', color: flexUtils.COLORS.TEXT_MUTED, margin: 'md', wrap: true })
            ], { paddingAll: 'xl', backgroundColor: '#FFF9C4' })
        });
    } else if (result.outcome === 'councilorEvade') {
        bubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader(`☎️ 關說特權`, '議員專屬', flexUtils.COLORS.BG_MAIN, '#673AB7'),
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: `警察本來已經把 ${result.fromName} 壓在地上...`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, wrap: true }),
                flexUtils.createText({ text: `但你立刻打了通電話給警察局長：「我是市議員！你這個局長是不想幹了是不是？」`, size: 'sm', weight: 'bold', color: '#673AB7', margin: 'md', wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `局長嚇得連忙叫警察放人，並親自拿了 ${result.compensation.toLocaleString()} 哭幣作為精神賠償金！你大搖大擺地離開了現場！`, size: 'xs', color: '#333333', margin: 'md', wrap: true })
            ], { paddingAll: 'xl', backgroundColor: '#EDE7F6' })
        });
    } else if (result.outcome === 'umbrella') {
        bubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader(`🏛️ 司法保護傘`, '議員專屬', flexUtils.COLORS.BG_MAIN, '#673AB7'),
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: `警察本來已經把 ${result.fromName} 壓在地上準備移送法辦...`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, wrap: true }),
                flexUtils.createText({ text: `但此時地檢署突然來電：「因缺乏關鍵證據，對議員不予起訴，立刻放人！」`, size: 'sm', weight: 'bold', color: '#673AB7', margin: 'md', wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `你拍了拍衣服上的灰塵，在警察無奈的目光下大搖大擺地離開了！\n(成功保住議員資格)`, size: 'xs', color: '#333333', margin: 'md', wrap: true })
            ], { paddingAll: 'xl', backgroundColor: '#EDE7F6' })
        });
    } else if (result.outcome === 'blackmail') {
        bubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader(`📸 抓到把柄`, '黑函勒索', flexUtils.COLORS.BG_MAIN, flexUtils.COLORS.BG_CARD),
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: `${result.fromName} 發現強攻不破保鑣防線，於是拿出了 ${result.targetName} 貪污收賄的照片！`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, wrap: true }),
                flexUtils.createText({ text: `「議員大人，如果這些照片流給媒體...你的政治生涯就完了吧？」`, size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'md', wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `議員臉色大變，乖乖交出了 ${result.robAmount.toLocaleString()} 哭幣的封口費！`, size: 'md', weight: 'bold', color: flexUtils.COLORS.SECONDARY, margin: 'md', wrap: true }),
                flexUtils.createText({ text: `🚨 勒索通緝：+15.0% (目前總通緝值：${((result.newWantedLevel || 0) * 100).toFixed(1)}%)`, size: 'xs', weight: 'bold', color: '#E91E63', margin: 'sm', wrap: true })
            ], { paddingAll: 'xl', backgroundColor: '#FAFAFA' })
        });
    } else {
        let comboTitle = '🦹‍♂️ 搶劫成功';
        let headerColor = '#4CAF50';
        const bodyContents = [];
        
        if (result.isVendetta) {
            bodyContents.push(flexUtils.createText({ text: `🩸 【血海深仇：極致復仇】`, size: 'md', weight: 'bold', color: '#D32F2F', wrap: true }));
            bodyContents.push(flexUtils.createText({ text: `${result.fromName} 眼中充滿血絲，動用了針對 ${result.targetName} 的【血海深仇】標記！\n\n「把屬於我的東西，連本帶利吐出來！」`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, wrap: true, margin: 'md' }));
            bodyContents.push(flexUtils.createSeparator('md'));
            bodyContents.push(flexUtils.createText({ text: `無視 any 防禦與迴避，絕對命中！\n*(復仇標記已消耗)*`, size: 'xs', weight: 'bold', color: '#D32F2F', wrap: true, margin: 'sm' }));
            comboTitle = '🩸 復仇成功';
            headerColor = '#D32F2F';
        } else if (result.isCrit) {
            const mkSp = (text, color, weight) => ({ type: 'span', text, color, weight });
            const mkEqSp = (eq, typeKey) => eq ? mkSp(`+${eq.level} ${eq.name}`, '#1976D2', 'bold') : mkSp(typeKey === 'weapon' ? '雙拳' : '空手', '#9E9E9E');
            
            let critContents = [];
            if (robberStatsObj.equipments.gloves) {
                const skillName = pick(['「星爆氣流斬」', '「天照」', '「認真拳」', '「超魔王烈風拳」', '「無量空處」', '「黑閃」', '「超電磁砲」', '「王之虛閃」']);
                critContents = [
                    mkSp(`你戴著 `), mkEqSp(robGloves, 'gloves'), mkSp(` 爆發出驚人的力量，配合 `), mkEqSp(robWeapon, 'weapon'), mkSp(` 施展了${skillName}！`)
                ];
            } else {
                const skillName = pick(['「燃燒小宇宙」', '「霸王色霸氣」', '「界王拳二十倍」', '「八門遁甲・第八死門」', '「自在極意功」', '「超級賽亞人模式」', '「須佐能乎」']);
                critContents = [ mkSp(`你使用了${skillName}，使出了全力一擊！`) ];
            }
            bodyContents.push(flexUtils.createText({ text: `💥 【致命爆擊 (CRT)】`, size: 'sm', weight: 'bold', color: '#E91E63', wrap: true }));
            bodyContents.push(flexUtils.createText({ contents: [...critContents, mkSp(`\n瞬間貫穿了 `, '#E91E63'), mkSp(result.targetName, '#E91E63', 'bold'), mkSp(` 的 30% 防禦，搶劫收益飆升 1.5 倍！`, '#E91E63')], size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, wrap: true, margin: 'sm' }));
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
            bodyContents.push(flexUtils.createText({ text: `${result.fromName} 拿著武器逼近 ${result.targetName}！\n${pick(threatLines)}`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, wrap: true }));
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
            bodyContents.push(flexUtils.createText({ contents: battleContents, size: 'xs', color: flexUtils.COLORS.TEXT_MUTED, wrap: true, margin: 'sm' }));
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
            ], size: 'xs', color: flexUtils.COLORS.TEXT_MUTED, margin: 'md', wrap: true }));
        }

        bodyContents.push(flexUtils.createSeparator('md'));
        bodyContents.push(flexUtils.createText({ text: `你成功掠奪了 ${result.robAmount.toLocaleString()} 哭幣！💰`, size: 'xl', weight: 'bold', color: flexUtils.COLORS.SECONDARY, margin: 'md', wrap: true }));
        
        if (result.launderingFee > 0) {
            bodyContents.push(flexUtils.createText({ text: `💼 【洗錢手續費】黑市抽成了 20% (${result.launderingFee.toLocaleString()} 哭幣)！\n👉 實際入帳：${result.actualGain.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#795548', margin: 'sm', wrap: true }));
        }
        
        if (result.isBlackOnBlack) {
            bodyContents.push(flexUtils.createText({ text: `🩸 【黑吃黑】對方也是道上兄弟，被你搶走後額外損失了 ${(result.targetLoss - result.robAmount).toLocaleString()} 哭幣的保護費！`, size: 'sm', weight: 'bold', color: '#B71C1C', margin: 'sm', wrap: true }));
        }

        let wantedIncreaseText = result.newWantedLevel > (result.wantedLevel || 0) 
            ? `🚨 搶劫通緝：+${((result.newWantedLevel - (result.wantedLevel || 0)) * 100).toFixed(1)}% (目前總通緝值：${(result.newWantedLevel * 100).toFixed(1)}%)` : '';
        if (wantedIncreaseText) {
            bodyContents.push(flexUtils.createText({ text: wantedIncreaseText, size: 'xs', weight: 'bold', color: '#E91E63', margin: 'sm', wrap: true }));
        }

        bubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader(comboTitle, '', flexUtils.COLORS.BG_MAIN, headerColor),
            body: flexUtils.createBox('vertical', bodyContents, { paddingAll: 'xl', backgroundColor: '#FAFAFA' })
        });
    }

    // 統一加上資產結算與冷卻時間提示
    if (bubble && bubble.body && bubble.body.contents) {
        const outcome = result.outcome;
        const hasBalanceChange = ['counterAttack', 'mafiaBossCounter', 'jailed', 'bodyguard_arrest', 'councilorEvade', 'success', 'blackmail', 'karma_rebound'].includes(outcome);
        
        if (hasBalanceChange || result.instantKarma) {
            bubble.body.contents.push(flexUtils.createSeparator('md'));
            
            if (outcome === 'counterAttack' || outcome === 'mafiaBossCounter') {
                bubble.body.contents.push(
                    flexUtils.createText({ text: `💰 結算總資產：\n• 搶劫者 ${result.fromName}：0 哭幣\n• 防守者 ${result.targetName}：${result.newTargetBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#B71C1C', wrap: true, margin: 'sm' })
                );
            } else {
                let balanceCol = flexUtils.COLORS.BG_CARD;
                if (outcome === 'jailed' || outcome === 'bodyguard_arrest') balanceCol = '#D32F2F';
                else if (outcome === 'success' || outcome === 'blackmail') balanceCol = flexUtils.COLORS.SECONDARY;
                else if (outcome === 'councilorEvade') balanceCol = '#673AB7';

                bubble.body.contents.push(
                    flexUtils.createText({ text: `💰 結算總資產：${result.newFromBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: balanceCol, margin: 'sm' })
                );
            }
        }

        if (result.instantKarma) {
            bubble.body.contents.push(flexUtils.createSeparator('md'));
            if (result.instantKarmaType === 'weapon_break') {
                bubble.body.contents.push(
                    flexUtils.createText({ text: `⚡ 【現世報：天打雷劈】\n一道落雷劈中你的武器，導致其當場碎裂降級！`, size: 'sm', weight: 'bold', color: '#E53935', margin: 'sm', wrap: true })
                );
            } else {
                bubble.body.contents.push(
                    flexUtils.createText({ text: `⚡ 【現世報：天打雷劈】\n一道落雷直接劈中你，你被強制送醫急救，產生了 ${result.medicalDebt?.toLocaleString() || 0} 哭幣的醫療負債！`, size: 'sm', weight: 'bold', color: '#E53935', margin: 'sm', wrap: true })
                );
            }
        }

        if (result.cooldownMs) {
            const cdTimeStr = new Date(Date.now() + result.cooldownMs).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
            const cdMinutes = Math.round(result.cooldownMs / 60000);
            bubble.body.contents.push(
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `⏳ 冷卻時間：${cdMinutes} 分鐘\n（可於 ${cdTimeStr} 後再次搶劫）`, size: 'xs', color: '#E91E63', margin: 'sm', wrap: true })
            );
        }
    }

    return bubble;
}

async function executeRobTransaction(t, fromUserId, targetUserId, fromMemberName, targetMemberName, robberStatsObj, targetStatsObj, isConfirmed) {
    const fromProfile = await getUserProfile(t, fromUserId, fromMemberName);
    const targetProfile = await getUserProfile(t, targetUserId, targetMemberName);

    const isCouncilor = fromProfile.data.councilorUntil && Date.now() < fromProfile.data.councilorUntil;
    const isTargetCouncilor = targetProfile.data.councilorUntil && Date.now() < targetProfile.data.councilorUntil;
    const isTargetPolice = targetProfile.data.isPolice;
    const isTargetMilitary = targetProfile.data.militaryUntil && Date.now() < targetProfile.data.militaryUntil;

    // 檢查醫療負債
    if (fromProfile.data.medicalDebt && fromProfile.data.medicalDebt > 0) {
        return { success: false, reason: 'debt', message: '❌ 你身上還有醫療負債未清，傷勢未癒，無法發動搶劫！' };
    }

    const isMilitary = fromProfile.data.militaryUntil && Date.now() < fromProfile.data.militaryUntil;
    if (isMilitary) {
        return { success: false, reason: 'military', message: '❌ 軍紀如鐵！身為現役軍人怎麼可以擅離職守去搶劫？\n請專心在營區服役！' };
    }

    if (fromProfile.data.profession === 'monk') {
        return { success: false, reason: 'monk', message: '❌ 出家人慈悲為懷，阿彌陀佛！\n你不能進行搶劫這種傷天害理的事！' };
    }

    if (isTargetMilitary) {
        return { success: false, reason: 'military', message: '🛡️ 警告：對方目前正在營區服役，軍事重地禁止靠近！' };
    }

    // 警察禁止搶劫
    if (fromProfile.data.isPolice) {
        return { success: false, reason: 'police', message: '❌ 你是【警察】，不能搶劫！\n想犯罪就先「辭職」吧！' };
    }

    let displayFromName = fromMemberName || fromProfile.data.displayName || fromProfile.data.name || '無名氏';
    if (isCouncilor) displayFromName = `【尊貴的市議員】${displayFromName}`;
    let displayTargetName = targetMemberName || targetProfile.data.displayName || targetProfile.data.name || '未知用戶';

    const now = new Date();
    const lastRob = fromProfile.data.lastRob || 0;
    const targetCoins = targetProfile.data.kuCoin || 0;
    if (targetCoins <= 0) {
        return { success: false, reason: 'poor', message: `😒 對方窮到連一塊錢都沒有，你搶個屁啊！` };
    }

    const crimeRecord = fromProfile.data.crimeRecord || 0;
    const wantedLevel = fromProfile.data.wantedLevel || 0;

    // 取得黑幫階級
    const topList = await getWantedList();
    const mafiaRank = await getMafiaRank(fromUserId, fromProfile.data, topList);
    const targetMafiaRank = await getMafiaRank(targetUserId, targetProfile.data, topList);

    if (!isConfirmed) {
        if (isTargetPolice) return { success: false, reason: 'warning_police', message: '🚨 警告：對方是現役警察！襲警失敗將面臨 3 倍刑期與武器沒收，但若成功可能摸走警局證物！', targetUserId, targetName: displayTargetName };
        if (isTargetCouncilor) return { success: false, reason: 'warning_councilor', message: '🏛️ 警告：對方是市議員！突破保鑣失敗將面臨國家重罰，但成功將獲得鉅額黑金！', targetUserId, targetName: displayTargetName };
        if (targetMafiaRank === 'boss' || targetMafiaRank === 'capo') return { success: false, reason: 'warning_mafia', message: '🕶️ 警告：對方是黑幫高層！惹毛他們可能會讓你背上鉅額醫療負債！', targetUserId, targetName: displayTargetName };
    }

    // 威壓護體 (免被市民搶劫)
    if (targetMafiaRank && targetProfile.data.wantedLevel >= 0.5) {
        if (!isCouncilor && !fromProfile.data.isPolice && !mafiaRank) {
            return { success: false, reason: 'scared', message: `❌ 搶劫失敗！對方惡名昭彰，你嚇得腿都軟了不敢下手！\n(黑社會通緝值 >= 50% 時免疫一般市民搶劫)` };
        }
    }

    // 黑幫冷卻減免
    let cooldownMs = 2 * 60 * 60 * 1000;
    if (mafiaRank === 'thug') cooldownMs *= 0.9;
    else if (mafiaRank === 'capo') cooldownMs *= 0.7;
    else if (mafiaRank === 'boss') cooldownMs *= 0.5;

    if (now.getTime() - lastRob < cooldownMs) {
        const remainMin = Math.ceil((cooldownMs - (now.getTime() - lastRob)) / 60000);
        if (isConfirmed) {
            // 玩家按下確認按鈕時，強制回傳冷卻訊息而非靜默
            return { success: false, reason: 'limit', message: `⏳ 【避風頭】\n你剛作案不久，外面風聲還很緊！請等待 ${remainMin} 分鐘後再行動。`, ignore: false };
        }
        const spam = getSpamResponse(fromProfile.data, 'rob_cd', `⏳ 【避風頭】\n你剛作案不久，外面風聲還很緊！請等待 ${remainMin} 分鐘後再行動。`);
        t.update(fromProfile.docRef, { spamTracker: spam.newTracker });
        return { success: false, reason: 'limit', message: spam.message, ignore: spam.ignore };
    }
    
    // 計算本次搶劫的通緝值增加量
    let wantedLevelGain = 0.05;
    if (mafiaRank === 'capo') wantedLevelGain = 0.035;
    else if (mafiaRank === 'boss') wantedLevelGain = 0.025;

    // 檢查是否為抓耙子
    const isSnitch = fromProfile.data.snitchUntil && Date.now() < fromProfile.data.snitchUntil;

    // 檢查血海深仇
    let outcomeData;
    const fromVendettas = fromProfile.data.vendettas || {};
    const hasVendetta = fromVendettas[targetUserId] && fromVendettas[targetUserId] > Date.now();

    const targetLevel = targetProfile.data.level || 1;
    const isTargetMonk = targetProfile.data.profession === 'monk';
    const targetFollowers = targetProfile.data.followers || 0;

    if (hasVendetta) {
        delete fromVendettas[targetUserId];
        const robAmount = Math.floor(targetCoins * 0.5); // 絕對復仇，直接搶 50%
        
        outcomeData = {
            outcome: 'success',
            robAmount,
            newWantedLevel: Number((wantedLevel + wantedLevelGain).toFixed(2)),
            atkDefDiff: 9999,
            pen: 100,
            isCrit: true,
            isVendetta: true
        };
        t.update(fromProfile.docRef, { vendettas: fromVendettas });
    } else {
        outcomeData = calculateRobOutcome(robberStatsObj.final, targetStatsObj.final, targetCoins, crimeRecord, wantedLevel, isCouncilor, isTargetPolice, isTargetCouncilor, isSnitch, mafiaRank, targetMafiaRank, targetLevel, isTargetMilitary, isTargetMonk, targetFollowers);
    }

    if (isTargetMonk && !outcomeData.isVendetta) {
        if (Math.random() < 0.30) {
            outcomeData.instantKarma = true;
            const weapon = fromProfile.data.equipments && fromProfile.data.equipments.weapon;
            if (weapon && weapon.level > 0 && Math.random() < 0.5) {
                outcomeData.instantKarmaType = 'weapon_break';
            } else {
                outcomeData.instantKarmaType = 'hospital';
                outcomeData.medicalDebt = Math.floor((fromProfile.data.kuCoin || 0) * 0.3);
            }
        }
    }

    // 統整要給 fromProfile 的 DB 更新
    const fromUpdates = {
        lastRob: now.getTime(),
        wantedLevel: outcomeData.newWantedLevel,
        displayName: fromMemberName || fromProfile.data.displayName || fromProfile.data.name
    };

    if (outcomeData.instantKarma) {
        if (outcomeData.instantKarmaType === 'weapon_break') {
            fromProfile.data.equipments.weapon.level -= 1;
            fromUpdates['equipments.weapon'] = fromProfile.data.equipments.weapon;
        } else if (outcomeData.instantKarmaType === 'hospital') {
            fromUpdates.medicalDebt = db.FieldValue.increment(outcomeData.medicalDebt);
            fromUpdates.kuCoin = db.FieldValue.increment(-outcomeData.medicalDebt);
        }
    }

    // 更新 DB
    if (outcomeData.outcome === 'dodged' || outcomeData.outcome === 'lukEscape' || outcomeData.outcome === 'monk_dodged') {
        t.update(fromProfile.docRef, fromUpdates);
    } else if (outcomeData.outcome === 'karma_rebound') {
        const penaltyAmount = Math.floor((fromProfile.data.kuCoin || 0) * 0.2);
        fromUpdates.kuCoin = db.FieldValue.increment(outcomeData.instantKarmaType === 'hospital' ? -(penaltyAmount + outcomeData.medicalDebt) : -penaltyAmount);
        t.update(fromProfile.docRef, fromUpdates);
        outcomeData.penaltyAmount = penaltyAmount;
    } else if (outcomeData.outcome === 'counterAttack' || outcomeData.outcome === 'mafiaBossCounter') {
        let currentCoins = fromProfile.data.kuCoin || 0;
        let requiredLoss = outcomeData.outcome === 'mafiaBossCounter' ? Math.floor(currentCoins * 0.5) : currentCoins; // 老大沒收50%或全損
        if (requiredLoss === 0) requiredLoss = 50000; // 0元搶劫基礎醫療費

        outcomeData.lostCoins = Math.min(requiredLoss, currentCoins);
        let newDebt = 0;
        let equipmentLost = false;

        if (currentCoins < requiredLoss) {
            newDebt = requiredLoss - currentCoins;
            outcomeData.medicalDebt = newDebt;
            
            // 噴裝機制
            if (Math.random() < 0.15 && fromProfile.data.equipments) {
                const eqKeys = Object.keys(fromProfile.data.equipments).filter(k => fromProfile.data.equipments[k] && fromProfile.data.equipments[k].level > 0);
                if (eqKeys.length > 0) {
                    const targetEq = eqKeys[Math.floor(Math.random() * eqKeys.length)];
                    fromProfile.data.equipments[targetEq].level -= 1;
                    equipmentLost = true;
                    outcomeData.brokenEquip = targetEq;
                }
            }
        }

        if (outcomeData.instantKarma && outcomeData.instantKarmaType === 'hospital') {
            newDebt += outcomeData.medicalDebt;
        }

        const updates = {
            kuCoin: 0,
            ...fromUpdates
        };
        if (newDebt > 0) updates.medicalDebt = (fromProfile.data.medicalDebt || 0) + newDebt;
        if (equipmentLost || (outcomeData.instantKarma && outcomeData.instantKarmaType === 'weapon_break')) updates.equipments = fromProfile.data.equipments;

        t.update(fromProfile.docRef, updates);
        
        if (outcomeData.lostCoins > 0) {
            t.update(targetProfile.docRef, { 
                kuCoin: db.FieldValue.increment(outcomeData.lostCoins),
                displayName: displayTargetName
            });
        }
    } else if (outcomeData.outcome === 'councilorEvade') {
        if (outcomeData.instantKarma && outcomeData.instantKarmaType === 'hospital') {
            fromUpdates.kuCoin = db.FieldValue.increment(outcomeData.compensation - outcomeData.medicalDebt);
        } else {
            fromUpdates.kuCoin = db.FieldValue.increment(outcomeData.compensation);
        }
        t.update(fromProfile.docRef, fromUpdates);
    } else if (outcomeData.outcome === 'jailed' || outcomeData.outcome === 'bodyguard_arrest') {
        const isFromCouncilor = fromProfile.data.councilorUntil && Date.now() < fromProfile.data.councilorUntil;
        
        let fineAmount = 0;
        if (outcomeData.fineRatio) {
            const currentCoins = fromProfile.data.kuCoin || 0;
            fineAmount = Math.floor(currentCoins * outcomeData.fineRatio);
            outcomeData.lostCoins = fineAmount;
        }

        const updates = {
            jailedUntil: outcomeData.jailedUntil,
            jailbreakCooldownUntil: db.FieldValue.delete(),
            crimeRecord: outcomeData.newCrimeRecord,
            ...fromUpdates
        };
        let totalDeduct = fineAmount;
        if (outcomeData.instantKarma && outcomeData.instantKarmaType === 'hospital') {
            totalDeduct += outcomeData.medicalDebt;
        }
        if (totalDeduct > 0) {
            updates.kuCoin = db.FieldValue.increment(-totalDeduct);
        }

        // 警察被動逮捕沒收裝備
        if (outcomeData.penaltyMins >= 180 && Math.random() < 0.3 && fromProfile.data.equipments && fromProfile.data.equipments.weapon) {
            updates['equipments.weapon'] = db.FieldValue.delete();
            outcomeData.weaponConfiscated = true;
        }

        if (isFromCouncilor) {
            // 醜聞爆發
            updates.councilorUntil = db.FieldValue.delete();
            const currentCoins = fromProfile.data.kuCoin || 0;
            const extraFine = Math.floor(currentCoins * 0.5);
            if (extraFine > 0) updates.kuCoin = db.FieldValue.increment(-(fineAmount + extraFine));
            outcomeData.lostCouncilor = true;
            outcomeData.lostCoins = (outcomeData.lostCoins || 0) + extraFine;
        }
        t.update(fromProfile.docRef, updates);

        if (outcomeData.outcome === 'bodyguard_arrest' && fineAmount > 0) {
            t.update(targetProfile.docRef, { kuCoin: db.FieldValue.increment(fineAmount) });
        }
    } else if (outcomeData.outcome === 'success' || outcomeData.outcome === 'blackmail') {
        let robAmount = outcomeData.robAmount;
        let targetLoss = robAmount;

        if (outcomeData.outcome === 'success' && mafiaRank && targetMafiaRank) {
            targetLoss = Math.floor(robAmount * 1.3);
            outcomeData.isBlackOnBlack = true;
            outcomeData.targetLoss = targetLoss;
        }

        let actualGain = robAmount;
        let launderingFee = 0;
        if (outcomeData.outcome === 'success') {
            launderingFee = Math.floor(robAmount * 0.2); 
            actualGain = robAmount - launderingFee;
            outcomeData.launderingFee = launderingFee;
            outcomeData.actualGain = actualGain;
        }

        if (outcomeData.instantKarma && outcomeData.instantKarmaType === 'hospital') {
            fromUpdates.kuCoin = db.FieldValue.increment(actualGain - outcomeData.medicalDebt);
        } else {
            fromUpdates.kuCoin = db.FieldValue.increment(actualGain);
        }
        t.update(fromProfile.docRef, fromUpdates);
        t.update(targetProfile.docRef, { 
            kuCoin: db.FieldValue.increment(-targetLoss),
            displayName: displayTargetName
        });
    }

    // 計算最新餘額
    const fromCoin = fromProfile.data.kuCoin || 0;
    const targetCoin = targetProfile.data.kuCoin || 0;
    let newFromBalance = fromCoin;
    let newTargetBalance = targetCoin;

    const outcome = outcomeData.outcome;
    if (outcome === 'counterAttack' || outcome === 'mafiaBossCounter') {
        newFromBalance = 0;
        newTargetBalance = targetCoin + (outcomeData.lostCoins || 0);
    } else if (outcome === 'councilorEvade') {
        newFromBalance = fromCoin + (outcomeData.compensation || 0);
    } else if (outcome === 'jailed') {
        newFromBalance = fromCoin - (outcomeData.lostCoins || 0);
    } else if (outcome === 'karma_rebound') {
        newFromBalance = fromCoin - (outcomeData.penaltyAmount || 0);
    } else if (outcome === 'success' || outcome === 'blackmail') {
        newFromBalance = fromCoin + (outcomeData.actualGain !== undefined ? outcomeData.actualGain : outcomeData.robAmount);
        newTargetBalance = targetCoin - (outcomeData.targetLoss !== undefined ? outcomeData.targetLoss : outcomeData.robAmount);
    }

    if (outcomeData.instantKarma && outcomeData.instantKarmaType === 'hospital') {
        newFromBalance -= outcomeData.medicalDebt;
    }

    return { 
        success: true, 
        ...outcomeData,
        wantedLevel,
        fromName: displayFromName,
        targetName: displayTargetName,
        isSnitch,
        cooldownMs,
        newFromBalance,
        newTargetBalance
    };
}

async function robCoin(replyToken, groupId, fromUserId, messageObject) {
    const isConfirmed = messageObject && messageObject.text && messageObject.text.includes('確認');
    const mentionObj = messageObject && messageObject.mention;
    if (!mentionObj || !mentionObj.mentionees || mentionObj.mentionees.length === 0) {
        await lineUtils.replyText(replyToken, '❌ 想搶誰？請 @標記 你要搶劫的對象！');
        return;
    }

    const targetUserId = mentionObj.mentionees[0].userId;

    if (!targetUserId) {
        await lineUtils.replyText(replyToken, '❌ 無法搶劫！(對方可能未加機器人好友，導致無法取得資料)');
        return;
    }

    if (!(await validateRobTarget(replyToken, fromUserId, targetUserId))) {
        return;
    }

    try {
        const fromMemberName = await lineUtils.getGroupMemberName(groupId, fromUserId);
        const targetMemberName = await lineUtils.getGroupMemberName(groupId, targetUserId);

        const robberStatsObj = await getFinalPlayerStats(fromUserId);
        const targetStatsObj = await getFinalPlayerStats(targetUserId);

        const result = await db.runTransaction(async (t) => {
            return await executeRobTransaction(t, fromUserId, targetUserId, fromMemberName, targetMemberName, robberStatsObj, targetStatsObj, isConfirmed);
        });

        if (!result.success) {
            if (result.ignore && !isConfirmed) return; // 防洗頻靜默：非確認模式才無視
            if (result.reason && result.reason.startsWith('warning_')) {
                const bubble = flexUtils.createBubble({
                    size: 'mega',
                    header: flexUtils.createHeader('🚨 高風險行動確認', '風險警告', '#C62828', '#FFEBEE'),
                    body: flexUtils.createBox('vertical', [
                        flexUtils.createText({ text: result.message, size: 'sm', weight: 'bold', color: '#C62828', wrap: true }),
                        flexUtils.createSeparator('md'),
                        flexUtils.createText({ text: '此為高風險行動，確定要繼續發動搶劫嗎？', size: 'sm', color: '#333333', margin: 'md', wrap: true })
                    ], { paddingAll: 'xl', backgroundColor: '#FAFAFA' }),
                    footer: flexUtils.createBox('vertical', [
                        flexUtils.createButton({
                            style: 'primary',
                            color: '#C62828',
                            action: {
                                type: 'postback',
                                label: '🚨 確認搶劫',
                                data: `action=confirmRob&targetId=${result.targetUserId}`
                            }
                        })
                    ])
                });
                await lineUtils.replyFlex(replyToken, '搶劫確認', bubble);
            } else if (result.message) {
                await lineUtils.replyText(replyToken, result.message);
            } else if (result.ignore && isConfirmed) {
                // 防洗頻 ignore 但玩家確實按了確認按鈕，給予友善提示
                await lineUtils.replyText(replyToken, '⏳ 搶劫失敗！你剛才太頻繁試圖搶劫，需要冷靜一下。請稍後再試。');
            }
            return;
        }

        // 產生並傳送回覆
        const titleMap = {
            dodged: '殘影閃避',
            counterAttack: '搶劫反殺',
            mafiaBossCounter: '🕶️ 黑幫威壓',
            jailed: '遭到逮捕',
            lukEscape: '極限逃脫',
            councilorEvade: '關說特權',
            umbrella: '司法保護傘',
            blackmail: '📸 抓到把柄',
            bodyguard_arrest: '💂 保鑣壓制',
            success: '🦹‍♂️ 搶劫成功'
        };

        const bubble = buildRobResultBubble(result, robberStatsObj, targetStatsObj);

        // 如果是抓耙子，在最下方插入警告訊息
        if (result.isSnitch) {
            bubble.body.contents.push(
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `🐍 【抓耙子效應】\n道上兄弟早就知道你是抓耙子，對你嚴加防範！你的坐牢率大增！`, size: 'xs', color: '#D32F2F', weight: 'bold', margin: 'md', wrap: true })
            );
        }

        await lineUtils.replyFlex(replyToken, titleMap[result.outcome], bubble);

        // 寫入分析 Log
        if (result.success && result.outcome) {
            db.collection('log_robberies').doc().set({
                robberId: fromUserId,
                targetId: targetUserId,
                groupId: groupId || 'direct',
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
        await lineUtils.replyText(replyToken, `❌ 搶劫系統發生異常，請聯絡管理員！\n(錯誤代碼: ${e.message})`);
    }
}

module.exports = {
    calculateRobOutcome,
    buildRobResultBubble,
    executeRobTransaction,
    robCoin
};
