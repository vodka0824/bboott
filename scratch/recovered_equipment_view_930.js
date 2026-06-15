            t.set(docRef, { scrolls }, { merge: true });

            return { success: true };
        });

        if (!result.success) {
            if (result.reason === 'insufficient') {
                await lineUtils.replyText(replyToken, `❌ 購買失敗：您的餘額不足 ${price} 哭幣！`);
            }
            return;
        }

        const displayTypeMap = { 'weapon': '武卷', 'armor': '防卷', 'accessory': '飾品卷' };
        const displayScrollName = displayTypeMap[scrollKey];

        const header = flexUtils.createHeader('🛒 卷軸購買成功', '補給完成', '#9C27B0');
        const body = flexUtils.createBox('vertical', [
            flexUtils.createText({ text: `花費 ${price} 哭幣購買了：`, size: 'sm', color: '#555555' }),
            flexUtils.createText({ text: `${amount} 張 ${displayScrollName}`, size: 'lg', weight: 'bold', color: '#1976D2', margin: 'sm' }),
            flexUtils.createSeparator('md'),
            flexUtils.createText({ text: `目前剩餘卷軸：`, size: 'sm', weight: 'bold', margin: 'md' }),
            flexUtils.createText({ text: `📜 武卷: ${scrolls.weapon} | 📜 防卷: ${scrolls.armor} | 📜 飾品卷: ${scrolls.accessory}`, size: 'xs', margin: 'sm' })
        ], { paddingAll: 'xl' });
        
        const footer = flexUtils.createBox('horizontal', [
            flexUtils.createButton({ action: { type: 'message', label: '🛡️ 去強化', text
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
                equipments, backupEquips, scrolls, enchantCount,
                lastEnchantReqId: reqId, enchantLastTimestamp: now, enchantBurstCount: newBurstCount, enchantCooldownUntil: newCooldownUntil
            }, { merge: true });

            return { success: true, logs, costCount, isBroken, finalSuccess, 
                currentLvl, newReqId, equip, failedEquip: isBroken ? { name: equip.name, grade: equip.grade } : null, scrollsLeft: scrolls[scrollKey], newEnchantCount: enchantCount, slot, lukBonus };
        });

        if (!result.success) {