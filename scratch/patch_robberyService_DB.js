const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../services/robberyCombatService.js');
let content = fs.readFileSync(filePath, 'utf8');

// 找到 "更新 DB" 開始的地方
const startIdx = content.indexOf('// 更新 DB');
const endIdx = content.indexOf('// 計算最新餘額');

if (startIdx !== -1 && endIdx !== -1) {
    const dbUpdateLogic = `// 更新 DB
    if (outcomeData.outcome === 'dodged' || outcomeData.outcome === 'lukEscape') {
        t.update(fromProfile.docRef, { 
            lastRob: now.getTime(),
            wantedLevel: outcomeData.newWantedLevel,
            displayName: fromMemberName || fromProfile.data.displayName || fromProfile.data.name
        });
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

        const updates = {
            kuCoin: 0,
            lastRob: now.getTime(),
            wantedLevel: outcomeData.newWantedLevel,
            displayName: fromMemberName || fromProfile.data.displayName || fromProfile.data.name
        };
        if (newDebt > 0) updates.medicalDebt = (fromProfile.data.medicalDebt || 0) + newDebt;
        if (equipmentLost) updates.equipments = fromProfile.data.equipments;

        t.update(fromProfile.docRef, updates);
        
        if (outcomeData.lostCoins > 0) {
            t.update(targetProfile.docRef, { 
                kuCoin: db.FieldValue.increment(outcomeData.lostCoins),
                displayName: displayTargetName
            });
        }
    } else if (outcomeData.outcome === 'councilorEvade') {
        t.update(fromProfile.docRef, { 
            kuCoin: db.FieldValue.increment(outcomeData.compensation),
            lastRob: now.getTime(),
            wantedLevel: outcomeData.newWantedLevel,
            displayName: fromMemberName || fromProfile.data.displayName || fromProfile.data.name
        });
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
            lastRob: now.getTime(),
            wantedLevel: outcomeData.newWantedLevel,
            displayName: fromMemberName || fromProfile.data.displayName || fromProfile.data.name
        };
        if (fineAmount > 0) {
            updates.kuCoin = db.FieldValue.increment(-fineAmount);
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

        t.update(fromProfile.docRef, { 
            kuCoin: db.FieldValue.increment(actualGain),
            lastRob: now.getTime(),
            wantedLevel: outcomeData.newWantedLevel,
            displayName: fromMemberName || fromProfile.data.displayName || fromProfile.data.name
        });
        t.update(targetProfile.docRef, { 
            kuCoin: db.FieldValue.increment(-targetLoss),
            displayName: displayTargetName
        });
    }

    `;

    content = content.substring(0, startIdx) + dbUpdateLogic + content.substring(endIdx);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('DB Update Logic Patched.');
} else {
    console.log('Could not find injection points.');
}
