function calculateRobOutcome(robberStats, targetStats, targetCoins, crimeRecord, wantedLevel, isFromCouncilor, isTargetPolice, isTargetCouncilor, isSnitch = false, mafiaRank = null, targetMafiaRank = null, targetLevel = 1, isTargetMilitary = false) {
    if (isTargetMilitary) {
        return { outcome: 'military_block' };
    }

    let baseJailChance = 20; 
    let wantedPenalty = (wantedLevel * 100) * 0.4; 
    let crimePenalty = Math.min(30, crimeRecord * 1.5); 
    
    let jailChance = baseJailChance + wantedPenalty + crimePenalty;
    if (isSnitch) jailChance += 20;
    
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
    
    if (mafiaRank === 'boss') {
        isDodge = false;
        isCrit = true;   
    }

    let wantedLevelGain = 0.05; 
    if (mafiaRank === 'capo') wantedLevelGain = 0.035; 
    else if (mafiaRank === 'boss') wantedLevelGain = 0.025; 
    
    if (isTargetPolice) wantedLevelGain *= 3; // 襲警成功通緝值 3 倍
    if (isTargetCouncilor) wantedLevelGain = 0.15; // 搶議員成功通緝值 15%

    const newWantedLevel = Number((wantedLevel + wantedLevelGain).toFixed(2));

    const evaReduction = 1 - Math.min(0.5, (robberStats.eva || 0) / 100);
    counterChance = counterChance * evaReduction;
    
    const jailReduction = (robberStats.luk || 0) * 0.2;
    const counterReduction = (robberStats.luk || 0) * 0.05;
    
    counterChance = Math.max(1, counterChance - counterReduction);
    jailChance = Math.max(5, jailChance - jailReduction);
    
    // 黑幫堂口火拼氣場加成
    let atkMultiplier = 1;
    let defMultiplier = 1;
    let targetDefMultiplier = 1;
    if (mafiaRank && targetMafiaRank) {
        // 假設從外部帶入 targetWantedLevel，這裡為了簡單，我們稍後在外面計算，此處先假設 robberStats 和 targetStats 已經處理好
    }

    const rand = Math.random() * 100;

    if (rand < counterChance) {
        return { outcome: 'counterAttack', newWantedLevel };
    } else if (rand < counterChance + jailChance) {
        // 議員搶劫失敗直接判定入獄，不允許逃脫
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
        const originalDef = Math.max(0, targetStats.def || 0) * targetDefMultiplier;
        let effectiveDef = originalDef;
        
        let pen = Math.max(0, robberStats.pen || 0);
        if (isFromCouncilor) pen = Math.max(pen, 50); // 議員特權無視 50% 防禦

        effectiveDef = effectiveDef * (1 - Math.min(100, pen) / 100);

        if (isCrit) {
            baseRobRatioMax = Math.min(1.0, baseRobRatioMax * 1.5);
            baseRobRatioMin = Math.min(1.0, baseRobRatioMin * 1.5);
            effectiveDef = effectiveDef * 0.5;
        }

        effectiveDef = Math.max(effectiveDef, originalDef * 0.4);

        let mitigation = effectiveAtk / (effectiveAtk + effectiveDef);
        if (mitigation < 0.01) mitigation = 0.01;

        let robRatio = Math.random() * (baseRobRatioMax - baseRobRatioMin) + baseRobRatioMin; 
        robRatio = robRatio * mitigation;
        
        if (mafiaRank === 'boss') {
            robRatio = baseRobRatioMax; 
        } else if (mafiaRank === 'capo') {
            robRatio = Math.min(1.0, robRatio * 1.5); 
        } else if (mafiaRank === 'thug') {
            robRatio = Math.min(1.0, robRatio * 1.1); 
        }
        
        if (robRatio < 0.01) robRatio = 0.01; 
        if (robRatio > 1.0) robRatio = 1.0;   
        
        const atkDefDiff = effectiveAtk - originalDef;
        
        let robAmount = Math.floor(targetCoins * robRatio);
        if (robAmount < 1) robAmount = 1;
        
        if (isTargetPolice) robAmount = Math.floor(robAmount * 1.5); // 警察贓物庫加成 1.5 倍

        return { outcome: 'success', newWantedLevel, robAmount, robRatio, isCrit, atkDefDiff, pen };
    }
}
