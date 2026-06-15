
            // 開始連衝邏輯
            let currentLvl = initialLevel;
            let logs = [];
            let costCount = 0;
            let isBroken = false;
            let finalSuccess = false;
            
            let maxExec = Math.min(times, 10);

            for (let i = 0; i < maxExec; i++) {
                if (currentLvl >= 15) break; // 滿級中斷
                if (!cheat && (scrolls[scrollKey] || 0) <= 0) {
                    logs.push(`⚠️ 卷軸不足，已自動停止強化。`);
                    break;
                }
                
                scrolls[scrollKey] -= 1;
                costCount++;
                enchantCount++;

                const baseRate = PROBABILITY[currentLvl] !== undefined ? PROBABILITY[currentLvl] : 0.05;
                const rate = baseRate >= 1.0 ? 1.0 : Math.min(0.99, baseRate * (1 + lukBonus));
                const isSuccess = cheat ? true : Math.random() < rate;
                
                if (isSuccess) {
                    const nextLvl = currentLvl + 1;
                    logs.push(`+${currentLvl} ➔ +${nextLvl} (✨成功)`);
                    currentLvl = nextLvl;
                    equip.level = currentLvl;
                    finalSuccess = true;
                } else {
                    logs.push(`+${currentLvl} ➔ 💥爆裂消失`);
                    isBroken = true;
                    const failedGrade = equip.grade;
                    if (slot === 'main') equipments[type] = null;
                    else backupEquips[type] = null;
                    // 為了下面 buildSingleEnchantBubble 能抓到原本資訊
                    equip = { name: equip.name, grade: failedGrade };
                    break; // 爆裝立刻停止
                }
            }
            
            // 寫入 DB
            const newReqId = generateReqId();
            t.set(docRef, { 
                equipments, backupEquips, scrolls, enchantCount,
                lastEnchantReqId: reqId, enchantLastTimestamp: now, enchantBurstCount: newBurstCount, enchantCooldownUntil: newCooldownUntil
            }, { merge: true });
