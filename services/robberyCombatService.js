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

function calculateRobOutcome(robberStats, targetStats, targetCoins, crimeRecord, wantedLevel, isCouncilor, isSnitch = false, mafiaRank = null, targetMafiaRank = null) {
    let baseJailChance = 20; 
    let wantedPenalty = (wantedLevel * 100) * 0.4; 
    let crimePenalty = Math.min(30, crimeRecord * 1.5); 
    
    let jailChance = baseJailChance + wantedPenalty + crimePenalty;
    if (isSnitch) jailChance += 20; // 抓耙子額外增加 20% 坐牢機率
    let counterChance = 5; 
    
    let robRatioMin = 0.1; 
    let robRatioMax = 0.3; 
    
    let isCrit = (Math.random() * 100) < (robberStats.crit || 0);
    let isDodge = false;
    
    if (!isCrit) {
        if ((Math.random() * 100) < (targetStats.eva || 0)) {
            isDodge = true;
        }
    }
    
    // 黑道階級加成
    if (mafiaRank === 'boss') {
        isDodge = false; // 老大 100% 命中
        isCrit = true;   
    }

    let wantedLevelGain = 0.15;
    if (mafiaRank) {
        wantedLevelGain = 0.05; // 黑幫搶劫只增加 5% 通緝值
    }
    const newWantedLevel = Number((wantedLevel + wantedLevelGain).toFixed(2));

    const evaReduction = 1 - Math.min(0.5, (robberStats.eva || 0) / 100);
    counterChance = counterChance * evaReduction;
    
    // LUK 風險減免改為絕對值減免：每 1 點 LUK 減少 0.2% 坐牢率，減少 0.05% 反擊率
    const jailReduction = (robberStats.luk || 0) * 0.2;
    const counterReduction = (robberStats.luk || 0) * 0.05;
    
    counterChance = Math.max(1, counterChance - counterReduction);
    jailChance = Math.max(5, jailChance - jailReduction);
    
    const rand = Math.random() * 100;

    if (rand < counterChance) {
        return { outcome: 'counterAttack', newWantedLevel };
    } else if (rand < counterChance + jailChance) {
        const escapeChance = Math.min(40, (robberStats.luk || 0) * 0.5);
        if (Math.random() * 100 < escapeChance) {
            return { outcome: 'lukEscape', newWantedLevel };
        }

        if (isCouncilor && Math.random() < 0.3) {
            return { outcome: 'councilorEvade', newWantedLevel, compensation: 500000 };
        }

        const newCrimeRecord = crimeRecord + 1;
        const penaltyMins = 60 + (newCrimeRecord * 10);
        const jailedUntil = Date.now() + (penaltyMins * 60 * 1000); 
        return { outcome: 'jailed', newWantedLevel, newCrimeRecord, penaltyMins, jailedUntil, fineRatio: 0.1 };
    } else {
        if (isDodge) {
            return { outcome: 'dodged', newWantedLevel };
        }
        
        let baseRobRatioMax = robRatioMax;
        let baseRobRatioMin = robRatioMin;
        
        let effectiveAtk = Math.max(1, robberStats.atk || 1);
        const originalDef = Math.max(0, targetStats.def || 0);
        let effectiveDef = originalDef;
        
        // 移除 30% 硬上限，但上限不得超過 100%
        const pen = Math.max(0, robberStats.pen || 0);
        effectiveDef = effectiveDef * (1 - Math.min(100, pen) / 100);

        if (isCrit) {
            baseRobRatioMax = Math.min(1.0, baseRobRatioMax * 1.5);
            baseRobRatioMin = Math.min(1.0, baseRobRatioMin * 1.5);
            effectiveDef = effectiveDef * 0.5;
        }

        // 防禦樓地板：有效 DEF 最低保留原始防禦的 40%
        effectiveDef = Math.max(effectiveDef, originalDef * 0.4);

        let mitigation = effectiveAtk / (effectiveAtk + effectiveDef);
        if (mitigation < 0.01) mitigation = 0.01;

        let robRatio = Math.random() * (baseRobRatioMax - baseRobRatioMin) + baseRobRatioMin; 
        robRatio = robRatio * mitigation;
        
        if (mafiaRank === 'boss') {
            robRatio = baseRobRatioMax; // 老大一出手就是上限
            isDodge = false;
        } else if (mafiaRank === 'capo') {
            robRatio = Math.min(1.0, robRatio * 1.5); // 堂主 +50% 成功率/獲利
        } else if (mafiaRank === 'thug') {
            robRatio = Math.min(1.0, robRatio * 1.1); // 小弟 +10% 成功率/獲利
        }
        
        if (robRatio < 0.01) robRatio = 0.01; 
        if (robRatio > 1.0) robRatio = 1.0;   
        
        const atkDefDiff = (robberStats.atk || 0) - (targetStats.def || 0);
        
        let robAmount = Math.floor(targetCoins * robRatio);
        if (robAmount < 1) robAmount = 1;

        return { outcome: 'success', newWantedLevel, robAmount, robRatio, isCrit, atkDefDiff, pen };
    }
}

function buildRobResultBubble(result, robberStatsObj, targetStatsObj) {
    const eqColors = { weapon: '#E53935', gloves: '#FF9800', ring: '#9C27B0', shield: '#795548', wings: '#00BCD4' };

    const robWeapon = robberStatsObj.equipments.weapon ? `[+${robberStatsObj.equipments.weapon.level} ${robberStatsObj.equipments.weapon.name}]` : '拳頭';
    const robGloves = robberStatsObj.equipments.gloves ? `[+${robberStatsObj.equipments.gloves.level} ${robberStatsObj.equipments.gloves.name}]` : '肉身';
    const robRing = robberStatsObj.equipments.ring ? `[+${robberStatsObj.equipments.ring.level} ${robberStatsObj.equipments.ring.name}]` : '徒手';
    const targetShield = targetStatsObj.equipments.shield ? `[+${targetStatsObj.equipments.shield.level} ${targetStatsObj.equipments.shield.name}]` : '肉身';
    const targetWings = targetStatsObj.equipments.wings ? `[+${targetStatsObj.equipments.wings.level} ${targetStatsObj.equipments.wings.name}]` : '雙腳';

    const sp = (txt, color, weight = 'regular') => ({ type: 'span', text: txt, color, weight });
    const eqSp = (name, type) => sp(name, eqColors[type] || '#333333', 'bold');
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

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
            header: flexUtils.createHeader(`💨 殘影閃避 (EVA)`, '', '#FFFFFF', '#9E9E9E'),
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: `你氣勢洶洶地試圖搶劫 ${result.targetName}，但他...`, size: 'sm', color: '#666666', wrap: true }),
                flexUtils.createText({ contents: dodgeContents, size: 'sm', wrap: true, margin: 'sm' }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `你撲了個空，只留下一陣尷尬！`, size: 'xs', color: '#E91E63', margin: 'md', wrap: true })
            ], { paddingAll: 'xl', backgroundColor: '#FAFAFA' })
        });
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
        bubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader(`🚨 搶劫大失敗`, '', '#FFFFFF', '#B71C1C'),
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: `${result.fromName} 蒙上面罩，準備搶劫 ${result.targetName}！`, size: 'sm', color: '#666666', wrap: true }),
                flexUtils.createText({ text: pick(counterActs), size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'md', wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `你被殘忍地反殺了！身上的 ${result.lostCoins.toLocaleString()} 哭幣全部被搜括一空！💸`, size: 'md', weight: 'bold', color: '#B71C1C', margin: 'md', wrap: true })
            ], { paddingAll: 'xl', backgroundColor: '#FFEBEE' })
        });
    } else if (result.outcome === 'mafiaBossCounter') {
        const mafiaActs = [
            `對方只是冷冷地看了你一眼，身後的小弟們瞬間蜂擁而上，把你打到媽媽都認不出來！`,
            `你還沒拔出武器，就被暗巷裡冒出的十幾個黑衣人按在地上！老大在旁邊悠哉地點了根菸！`,
            `「知道我是誰嗎？」老大露出恐怖的微笑，一個眼神，手下們就把你拖進了暗巷！`,
            `對方打了一通電話：「有人來找麻煩。」不到三秒鐘，一輛黑色廂型車就把你塞了進去！`
        ];
        const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
        bubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader(`🕶️ 黑幫威壓`, '黑道老大專屬', '#FFFFFF', '#1A1A1A'),
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: `${result.fromName} 竟然敢搶劫【黑道老大】${result.targetName}！`, size: 'sm', color: '#666666', wrap: true }),
                flexUtils.createText({ text: pick(mafiaActs), size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'md', wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `你被老大的手下洗劫一空！損失 ${result.lostCoins.toLocaleString()} 哭幣！💸`, size: 'md', weight: 'bold', color: '#B71C1C', margin: 'md', wrap: true })
            ], { paddingAll: 'xl', backgroundColor: '#FAFAFA' })
        });
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
        bubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader(`🚓 遭到逮捕`, '', '#FFFFFF', '#1976D2'),
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: `${result.fromName} 準備搶劫 ${result.targetName}，${pick(jailActs)}`, size: 'sm', color: '#666666', wrap: true }),
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
            header: flexUtils.createHeader(`🍀 極限逃脫`, '', '#FFFFFF', '#f39c12'),
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: `警察本來已經包圍了 ${result.fromName}...`, size: 'sm', color: '#666666', wrap: true }),
                flexUtils.createText({ text: `但幸運女神的眷顧，${pick(escapeActs)}`, size: 'sm', weight: 'bold', color: '#f39c12', margin: 'md', wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `你驚險地躲過了牢獄之災，但必須先去避避風頭！`, size: 'xs', color: '#888888', margin: 'md', wrap: true })
            ], { paddingAll: 'xl', backgroundColor: '#FFF9C4' })
        });
    } else if (result.outcome === 'councilorEvade') {
        bubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader(`☎️ 關說特權`, '議員專屬', '#FFFFFF', '#673AB7'),
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: `警察本來已經把 ${result.fromName} 壓在地上...`, size: 'sm', color: '#666666', wrap: true }),
                flexUtils.createText({ text: `但你立刻打了通電話給警察局長：「我是市議員！你這個局長是不想幹了是不是？」`, size: 'sm', weight: 'bold', color: '#673AB7', margin: 'md', wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `局長嚇得連忙叫警察放人，並親自拿了 ${result.compensation.toLocaleString()} 哭幣作為精神賠償金！你大搖大擺地離開了現場！`, size: 'xs', color: '#333333', margin: 'md', wrap: true })
            ], { paddingAll: 'xl', backgroundColor: '#EDE7F6' })
        });
    } else if (result.outcome === 'umbrella') {
        bubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader(`🏛️ 司法保護傘`, '議員專屬', '#FFFFFF', '#673AB7'),
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: `警察本來已經把 ${result.fromName} 壓在地上準備移送法辦...`, size: 'sm', color: '#666666', wrap: true }),
                flexUtils.createText({ text: `但此時地檢署突然來電：「因缺乏關鍵證據，對議員不予起訴，立刻放人！」`, size: 'sm', weight: 'bold', color: '#673AB7', margin: 'md', wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `你拍了拍衣服上的灰塵，在警察無奈的目光下大搖大擺地離開了！\n(成功保住議員資格)`, size: 'xs', color: '#333333', margin: 'md', wrap: true })
            ], { paddingAll: 'xl', backgroundColor: '#EDE7F6' })
        });
    } else if (result.outcome === 'blackmail') {
        bubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader(`📸 抓到把柄`, '黑函勒索', '#FFFFFF', '#000000'),
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: `${result.fromName} 發現強攻不破保鑣防線，於是拿出了 ${result.targetName} 貪污收賄的照片！`, size: 'sm', color: '#666666', wrap: true }),
                flexUtils.createText({ text: `「議員大人，如果這些照片流給媒體...你的政治生涯就完了吧？」`, size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'md', wrap: true }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `議員臉色大變，乖乖交出了 ${result.robAmount.toLocaleString()} 哭幣的封口費！`, size: 'md', weight: 'bold', color: '#FF9800', margin: 'md', wrap: true }),
                flexUtils.createText({ text: `(勒索讓你增加了 15% 通緝值！)`, size: 'xxs', color: '#E91E63', margin: 'sm', wrap: true })
            ], { paddingAll: 'xl', backgroundColor: '#FAFAFA' })
        });
    } else {
        let comboTitle = '🦹‍♂️ 搶劫成功';
        let headerColor = '#4CAF50';
        const bodyContents = [];
        
        if (result.isVendetta) {
            bodyContents.push(flexUtils.createText({ text: `🩸 【血海深仇：極致復仇】`, size: 'md', weight: 'bold', color: '#D32F2F', wrap: true }));
            bodyContents.push(flexUtils.createText({ text: `${result.fromName} 眼中充滿血絲，動用了針對 ${result.targetName} 的【血海深仇】標記！\n\n「把屬於我的東西，連本帶利吐出來！」`, size: 'sm', color: '#666666', wrap: true, margin: 'md' }));
            bodyContents.push(flexUtils.createSeparator('md'));
            bodyContents.push(flexUtils.createText({ text: `無視 any 防禦與迴避，絕對命中！\n*(復仇標記已消耗)*`, size: 'xs', weight: 'bold', color: '#D32F2F', wrap: true, margin: 'sm' }));
            comboTitle = '🩸 復仇成功';
            headerColor = '#D32F2F';
        } else if (result.isCrit) {
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
        
        if (result.isBlackOnBlack) {
            bodyContents.push(flexUtils.createText({ text: `🩸 【黑吃黑】對方也是道上兄弟，被你搶走後額外損失了 ${(result.targetLoss - result.robAmount).toLocaleString()} 哭幣的保護費！`, size: 'sm', weight: 'bold', color: '#B71C1C', margin: 'sm', wrap: true }));
        }

        let wantedIncreaseText = result.newWantedLevel > (result.wantedLevel || 0) ? `(搶劫讓你增加了通緝值，請注意條子！)` : '';
        if (wantedIncreaseText) {
            bodyContents.push(flexUtils.createText({ text: wantedIncreaseText, size: 'xxs', color: '#E91E63', margin: 'sm', wrap: true }));
        }

        bubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader(comboTitle, '', '#FFFFFF', headerColor),
            body: flexUtils.createBox('vertical', bodyContents, { paddingAll: 'xl', backgroundColor: '#FAFAFA' })
        });
    }

    // 統一加上資產結算與冷卻時間提示
    if (bubble && bubble.body && bubble.body.contents) {
        const outcome = result.outcome;
        const hasBalanceChange = ['counterAttack', 'mafiaBossCounter', 'jailed', 'councilorEvade', 'success', 'blackmail'].includes(outcome);
        
        if (hasBalanceChange) {
            bubble.body.contents.push(flexUtils.createSeparator('md'));
            
            if (outcome === 'counterAttack' || outcome === 'mafiaBossCounter') {
                bubble.body.contents.push(
                    flexUtils.createText({ text: `💰 結算總資產：\n• 搶劫者 ${result.fromName}：0 哭幣\n• 防守者 ${result.targetName}：${result.newTargetBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#B71C1C', wrap: true, margin: 'sm' })
                );
            } else {
                let balanceCol = '#1A1A1A';
                if (outcome === 'jailed') balanceCol = '#D32F2F';
                else if (outcome === 'success' || outcome === 'blackmail') balanceCol = '#FF9800';
                else if (outcome === 'councilorEvade') balanceCol = '#673AB7';

                bubble.body.contents.push(
                    flexUtils.createText({ text: `💰 結算總資產：${result.newFromBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: balanceCol, margin: 'sm' })
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

async function executeRobTransaction(t, fromUserId, targetUserId, fromMemberName, targetMemberName, robberStatsObj, targetStatsObj) {
    const fromProfile = await getUserProfile(t, fromUserId, fromMemberName);
    const targetProfile = await getUserProfile(t, targetUserId, targetMemberName);



    const isCouncilor = fromProfile.data.councilorUntil && Date.now() < fromProfile.data.councilorUntil;

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
        const spam = getSpamResponse(fromProfile.data, 'rob_cd', `⏳ 【避風頭】\n你剛作案不久，外面風聲還很緊！請等待 ${remainMin} 分鐘後再行動。`);
        t.update(fromProfile.docRef, { spamTracker: spam.newTracker });
        return { success: false, reason: 'limit', message: spam.message, ignore: spam.ignore };
    }
    
    // 檢查是否為抓耙子
    const isSnitch = fromProfile.data.snitchUntil && Date.now() < fromProfile.data.snitchUntil;
    
    // 檢查血海深仇
    let outcomeData;
    const fromVendettas = fromProfile.data.vendettas || {};
    const hasVendetta = fromVendettas[targetUserId] && fromVendettas[targetUserId] > Date.now();

    if (hasVendetta) {
        delete fromVendettas[targetUserId];
        const robAmount = Math.floor(targetCoins * 0.5); // 絕對復仇，直接搶 50%
        
        outcomeData = {
            outcome: 'success',
            robAmount,
            newWantedLevel: wantedLevel + 0.15,
            atkDefDiff: 9999,
            pen: 100,
            isCrit: true,
            isVendetta: true
        };
        t.update(fromProfile.docRef, { vendettas: fromVendettas });
    } else {
        const isTargetCouncilor = targetProfile.data.councilorUntil && Date.now() < targetProfile.data.councilorUntil;
        if (isTargetCouncilor) {
            if (Math.random() < 0.7) {
                t.update(fromProfile.docRef, { lastRob: now.getTime() });
                return { success: false, reason: 'immune', message: `❌ 搶劫失敗！${displayTargetName} 目前是【市議員】，身邊隨時有特勤保鑣戒護，你連靠近的機會都沒有！` };
            } else {
                let hushMoneyRatio = Math.random() * (0.3 - 0.1) + 0.1; // 10% ~ 30% 封口費
                let hushMoney = Math.floor(targetCoins * hushMoneyRatio);
                if (hushMoney < 1) hushMoney = 1;
                
                outcomeData = {
                    outcome: 'blackmail',
                    robAmount: hushMoney,
                    newWantedLevel: Number((wantedLevel + 0.15).toFixed(2))
                };
            }
        } else {
            // 黑幫威壓：老大 80% 機率觸發反殺 (原為 40%)
            if (targetMafiaRank === 'boss' && Math.random() < 0.8) {
                let lostCoins = fromProfile.data.kuCoin || 0;
                outcomeData = {
                    outcome: 'mafiaBossCounter',
                    lostCoins,
                    newWantedLevel: Number((wantedLevel + 0.1).toFixed(2))
                };
            } else {
                outcomeData = calculateRobOutcome(robberStatsObj.final, targetStatsObj.final, targetCoins, crimeRecord, wantedLevel, isCouncilor, isSnitch, mafiaRank, targetMafiaRank);
            }
        }
    }

    // 更新 DB
    if (outcomeData.outcome === 'dodged' || outcomeData.outcome === 'lukEscape') {
        t.update(fromProfile.docRef, { 
            lastRob: now.getTime(),
            wantedLevel: outcomeData.newWantedLevel,
            displayName: fromMemberName || fromProfile.data.displayName || fromProfile.data.name
        });
    } else if (outcomeData.outcome === 'counterAttack') {
        let lostCoins = fromProfile.data.kuCoin || 0;
        outcomeData.lostCoins = lostCoins;
        if (lostCoins > 0) {
            t.update(fromProfile.docRef, { 
                kuCoin: 0,
                lastRob: now.getTime(),
                wantedLevel: outcomeData.newWantedLevel,
                displayName: fromMemberName || fromProfile.data.displayName || fromProfile.data.name
            });
            t.update(targetProfile.docRef, { 
                kuCoin: db.FieldValue.increment(lostCoins),
                displayName: displayTargetName
            });
        } else {
            t.update(fromProfile.docRef, { 
                lastRob: now.getTime(),
                wantedLevel: outcomeData.newWantedLevel,
                displayName: fromMemberName || fromProfile.data.displayName || fromProfile.data.name
            });
        }
    } else if (outcomeData.outcome === 'mafiaBossCounter') {
        let lostCoins = fromProfile.data.kuCoin || 0;
        outcomeData.lostCoins = lostCoins;
        if (lostCoins > 0) {
            t.update(fromProfile.docRef, { 
                kuCoin: 0,
                lastRob: now.getTime(),
                wantedLevel: outcomeData.newWantedLevel,
                displayName: fromMemberName || fromProfile.data.displayName || fromProfile.data.name
            });
            t.update(targetProfile.docRef, { 
                kuCoin: db.FieldValue.increment(lostCoins),
                displayName: displayTargetName
            });
        } else {
            t.update(fromProfile.docRef, { 
                lastRob: now.getTime(),
                wantedLevel: outcomeData.newWantedLevel,
                displayName: fromMemberName || fromProfile.data.displayName || fromProfile.data.name
            });
        }
    } else if (outcomeData.outcome === 'councilorEvade') {
        t.update(fromProfile.docRef, { 
            kuCoin: db.FieldValue.increment(outcomeData.compensation),
            lastRob: now.getTime(),
            wantedLevel: outcomeData.newWantedLevel,
            displayName: fromMemberName || fromProfile.data.displayName || fromProfile.data.name
        });
    } else if (outcomeData.outcome === 'jailed') {
        const isFromCouncilor = fromProfile.data.councilorUntil && Date.now() < fromProfile.data.councilorUntil;
        if (isFromCouncilor && Math.random() < 0.25) {
            outcomeData.outcome = 'umbrella';
            t.update(fromProfile.docRef, {
                lastRob: now.getTime(),
                wantedLevel: outcomeData.newWantedLevel,
                displayName: fromMemberName || fromProfile.data.displayName || fromProfile.data.name
            });
        } else {
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
                lastRob: now.getTime(),
                wantedLevel: outcomeData.newWantedLevel,
                displayName: fromMemberName || fromProfile.data.displayName || fromProfile.data.name
            };
            if (fineAmount > 0) {
                updates.kuCoin = db.FieldValue.increment(-fineAmount);
            }
            if (isFromCouncilor) {
                updates.councilorUntil = db.FieldValue.delete();
                outcomeData.lostCouncilor = true;
            }
            t.update(fromProfile.docRef, updates);
        }
    } else if (outcomeData.outcome === 'success' || outcomeData.outcome === 'blackmail') {
        let robAmount = outcomeData.robAmount;
        let targetLoss = robAmount;

        // 黑吃黑懲罰 (黑道搶黑道，被搶方損失額外加重 30%)
        if (outcomeData.outcome === 'success' && mafiaRank && targetMafiaRank) {
            targetLoss = Math.floor(robAmount * 1.3);
            outcomeData.isBlackOnBlack = true;
            outcomeData.targetLoss = targetLoss;
        }

        t.update(fromProfile.docRef, { 
            kuCoin: db.FieldValue.increment(robAmount),
            lastRob: now.getTime(),
            wantedLevel: outcomeData.newWantedLevel,
            displayName: fromMemberName || fromProfile.data.displayName || fromProfile.data.name
        });
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
    } else if (outcome === 'success' || outcome === 'blackmail') {
        newFromBalance = fromCoin + outcomeData.robAmount;
        newTargetBalance = targetCoin - (outcomeData.targetLoss !== undefined ? outcomeData.targetLoss : outcomeData.robAmount);
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
            return await executeRobTransaction(t, fromUserId, targetUserId, fromMemberName, targetMemberName, robberStatsObj, targetStatsObj);
        });

        if (!result.success) {
            if (result.ignore) return;
            if (result.message) await lineUtils.replyText(replyToken, result.message);
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
        await lineUtils.replyText(replyToken, '❌ 搶劫失敗，對方報警了！');
    }
}

module.exports = {
    calculateRobOutcome,
    buildRobResultBubble,
    executeRobTransaction,
    robCoin
};
