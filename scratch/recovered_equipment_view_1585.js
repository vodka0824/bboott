                    break;
                }
                
                scrolls[scrollKey] -= 1;
                costCount++;
                enchantCount++;

                const baseRate = PROBABILITY[currentLvl] !== undefined ? PROBABILITY[currentLvl] : 0.05;
                const rate = baseRate >= 1.0 ? 1.0 : Math.min(0.99, baseRate * (1 + lukBonus));
                const isSuccess = Math.random() < rate;
                
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
                equipments, backupEqu
            }
            return;
        }

        const { logs, costCount, isBroken, currentLvl, newReqId, equip, failedEquip, scrollsLeft, newEnchantCount, slot, lukBonus } = result;
        
        // 若為單次強化，維持原本單純的 Bubble
        if (times === 1) {
            const bubble = buildSingleEnchantBubble(
                !isBroken, type, slot, equip, config, 
                isBroken ? currentLvl : currentLvl - 1, 
                isBroken ? 0 : currentLvl, 
                scrollsLeft, costCount, newEnchantCount, lukBonus, newReqId, userId
            );
            await lineUtils.replyFlex(replyToken, isBroken ? '強化失敗' : '強化成功', bubble);
            
            db.collection('log_enchants').doc().set({
                userId, groupId: groupId || 'direct', type, slot, equipName: equip.name, variant: equip.grade, oldLevel: initialLevel, newLevel: isBroken ? 0 : currentLvl, isSuccess: !isBroken, timestamp: new Date()
            }).catch(e => console.error(e));
            return;
        }
        
        // 若 > 5，產生戰報 Summary
        const headerColor = isBroken ? flexUtils.COLORS.DANGER : flexUtils.COLORS.SUCCESS;
        const headerTitle = isBroken ? '💥 連續強化失敗' : '✨ 連續強化成功';
        const headerSub = isBroken ? '裝備已損毀' : '裝備屬性提升';
        
        const bodyItems = [
            flexUtils.createText({ text: `消耗 ${costCount} 張 ${config.scrollName}`, size: 'xs', color: flexUtils.COLORS.GRAY }),
            flexUtils.createSeparator('sm'),