            }
            
            const now = Date.now();
            enchantCooldownUntil = enchantCooldownUntil || 0;
            enchantLastTimestamp = enchantLastTimestamp || 0;
            enchantBurstCount = enchantBurstCount || 0;

            if (enchantCooldownUntil > now) {
                const leftSec = Math.ceil((enchantCooldownUntil - now) / 1000);
                return { success: false, reason: 'cooldown', leftSec };
            }

            let newBurstCount = enchantBurstCount;
            let newCooldownUntil = 0;
            if (now - enchantLastTimestamp < 2000) {
                newBurstCount += 1;
            } else {
                newBurstCount = 1;
            }

            if (newBurstCount > 5) {
                newCooldownUntil = now + 10000;
                newBurstCount = 0;
                t.set(docRef, { enchantLastTimestamp: now, enchantBurstCount: newBurstCount, enchantCooldownUntil: newCooldownUntil }, { merge: true });
                return { success: false, reason: 'burst_cooldown' };
            }

            const currentLvl = equip.level;
            if (currentLvl >= 15) {
                return { success: false, reason: 'max_level', equipName: equip.name };
            }
            
            const scrollKey = config.scrollKey;
            if ((scrolls[scrollKey] || 0) <= 0) {
                return { success: false, reason: 'no_scroll', scrollName: config.scrollName };
            }
            
            // 扣除 1 張卷軸
            scrolls[scrollKey] -= 1;
            
            // 增加衝裝次數 (僅供統計)
            const newEnchantCount = enchantCount + 1;

            // 計算強化機率
            const baseRate = PROBABILITY[currentLvl] !== undefined ? PROBABILITY[currentLvl] : 0.05;
            const rate = baseRate >= 1.0 ? 1.0 : Math.min(0.99, baseRate * (1 + lukBonus));
            const isSuccess = Math.random() < rate;
            
            let failedEquip = null;
            let nextLvl = currentLvl;

            if (isSuccess) {
                nextLvl = currentLvl + 1;
                equip.level = nextLvl;
            } else {
                // 爆裝消失
                failedEquip = { name: equip.name, grade: equip.grade };
                if (slot === 'main') equipments[type] = null;
                else backupEquips[type] = null;
            }
