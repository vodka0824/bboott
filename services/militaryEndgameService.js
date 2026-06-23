const { db } = require('../utils/db');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');

const COLLECTION_NAME = 'economy_users';

/**
 * 發動戰爭 (四星上將專屬)
 */
async function handleDeclareWar(replyToken, context) {
    const { userId, groupId } = context;

    try {
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);
        
        const result = await db.runTransaction(async (t) => {
            const docRef = db.collection(COLLECTION_NAME).doc(userId);
            const doc = await t.get(docRef);
            if (!doc.exists) return { success: false, message: '找不到玩家資料。' };
            const data = doc.data();

            if (!data.militaryUntil || Date.now() >= data.militaryUntil) {
                return { success: false, message: '你目前不在營區內，無法指揮軍隊！' };
            }

            const currentCount = data.militaryEnlistCount || 0;
            const rankIndex = currentCount - 1;

            if (rankIndex !== 18) { // 四星上將的 index = 18 (二兵是0)
                if (rankIndex < 18) {
                    return { success: false, message: '你還不是四星上將，沒有權力發動戰爭！' };
                } else {
                    return { success: false, message: '你已經是五星上將了，不需要再發動戰爭！' };
                }
            }

            // 檢查冷卻時間 (24小時)
            const cdMs = 24 * 60 * 60 * 1000;
            if (data.declareWarCooldownUntil && Date.now() < data.declareWarCooldownUntil) {
                const remainMs = data.declareWarCooldownUntil - Date.now();
                const remainHrs = Math.floor(remainMs / 3600000);
                const remainMins = Math.ceil((remainMs % 3600000) / 60000);
                return { success: false, message: `軍隊還在整補中，請等待 ${remainHrs} 小時 ${remainMins} 分鐘後再發動戰爭！` };
            }

            // 發動戰爭機率： 20% 大獲全勝 (升五星), 50% 戰局僵持 (留任), 30% 慘烈戰敗 (降三星)
            const rand = Math.random() * 100;
            let outcome = '';
            let newEnlistCount = currentCount;
            let outcomeText = '';
            let color = '';

            if (rand < 20) {
                outcome = 'win';
                newEnlistCount = currentCount + 1; // 升級五星 (index 19)
                outcomeText = '大獲全勝，晉升五星上將！';
                color = flexUtils.COLORS.SUCCESS;
            } else if (rand < 70) {
                outcome = 'draw';
                outcomeText = '戰局僵持，維持四星上將！';
                color = flexUtils.COLORS.WARNING;
            } else {
                outcome = 'lose';
                newEnlistCount = currentCount - 1; // 降級三星 (index 17)
                outcomeText = '慘烈戰敗，降級三星上將！';
                color = flexUtils.COLORS.DANGER;
            }

            t.update(docRef, {
                militaryEnlistCount: newEnlistCount,
                declareWarCooldownUntil: Date.now() + cdMs
            });

            return {
                success: true,
                outcome,
                outcomeText,
                color,
                name: memberName || data.displayName || data.name
            };
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        // 發送結果 Flex
        let titleColor = '';
        let headerText = '';
        let descText = '';

        if (result.outcome === 'win') {
            titleColor = flexUtils.COLORS.SUCCESS;
            headerText = '🌟 大獲全勝';
            descText = '你帶領軍隊橫掃敵國，立下赫赫戰功！\n國家授予你至高無上的榮耀：【五星上將】！';
        } else if (result.outcome === 'draw') {
            titleColor = flexUtils.COLORS.WARNING;
            headerText = '🛡️ 戰局僵持';
            descText = '雙方軍隊在邊境陷入泥沼，最終簽署停火協議。\n你保住了軍階，但仍需等待時機再戰。';
        } else {
            titleColor = flexUtils.COLORS.DANGER;
            headerText = '💀 慘烈戰敗';
            descText = '戰略錯誤導致我軍死傷慘重，你被送上軍事法庭！\n國防部剝奪了你的權力，降級為【三星上將】！';
        }

        const bodyContents = [
            flexUtils.createText({ text: descText, size: 'sm', color: flexUtils.COLORS.TEXT_MAIN, wrap: true, margin: 'md' }),
            flexUtils.createSeparator('md'),
            flexUtils.createText({ text: `⏳ 戰爭冷卻：24 小時`, size: 'xs', color: flexUtils.COLORS.TEXT_MUTED, margin: 'md' })
        ];

        const flexBubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader(headerText, `【發動戰爭】${result.name}`, flexUtils.COLORS.BG_CARD, titleColor),
            body: flexUtils.createBox('vertical', bodyContents, { backgroundColor: flexUtils.COLORS.BG_CARD, paddingAll: 'xl' })
        });

        await lineUtils.replyFlex(replyToken, '發動戰爭結果', flexBubble);

    } catch (e) {
        console.error('[Military] handleDeclareWar Error:', e);
        await lineUtils.replyText(replyToken, '❌ 發動戰爭發生錯誤。');
    }
}

/**
 * 研發軍火 (五星上將專屬)
 */
async function handleArmsDealer(replyToken, context, weaponType) {
    const { userId, groupId } = context;

    const WEAPON_CONFIG = {
        '零件': { cost: 50000000, cooldownHrs: 3, winRate: 45, loseRate: 45, critLoseRate: 10, winReward: 150000000, jailHrs: 3, title: '🔩 軍火零件' },
        '輕兵器': { cost: 100000000, cooldownHrs: 6, winRate: 40, loseRate: 50, critLoseRate: 10, winReward: 350000000, jailHrs: 6, crime: 1, title: '🔫 輕兵器' },
        '輕武器': { cost: 100000000, cooldownHrs: 6, winRate: 40, loseRate: 50, critLoseRate: 10, winReward: 350000000, jailHrs: 6, crime: 1, title: '🔫 輕兵器' },
        '重武器': { cost: 300000000, cooldownHrs: 12, winRate: 25, loseRate: 60, critLoseRate: 15, winReward: 1500000000, jailHrs: 12, crime: 3, title: '💣 重型武器' },
        '特殊武器': { cost: 1000000000, cooldownHrs: 24, winRate: 10, loseRate: 70, critLoseRate: 20, winReward: 8000000000, jailHrs: 24, demote: true, title: '🚀 大規模殺傷武器' }
    };

    const config = WEAPON_CONFIG[weaponType];
    if (!config) {
        await lineUtils.replyText(replyToken, '❌ 未知的軍火類型！只能選擇：零件、輕武器、重武器、特殊武器。');
        return;
    }

    try {
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);
        
        const result = await db.runTransaction(async (t) => {
            const docRef = db.collection(COLLECTION_NAME).doc(userId);
            const doc = await t.get(docRef);
            if (!doc.exists) return { success: false, message: '找不到玩家資料。' };
            const data = doc.data();

            if (!data.militaryUntil || Date.now() >= data.militaryUntil) {
                return { success: false, message: '你目前不在營區內，無法動用國防資源！' };
            }

            const currentCount = data.militaryEnlistCount || 0;
            const rankIndex = currentCount - 1;

            if (rankIndex !== 19) { // 五星上將的 index = 19
                return { success: false, message: '你必須是五星上將才能進行地下軍火交易！' };
            }

            const cdMs = config.cooldownHrs * 60 * 60 * 1000;
            if (data.armsDealerCooldownUntil && Date.now() < data.armsDealerCooldownUntil) {
                const remainMs = data.armsDealerCooldownUntil - Date.now();
                const remainHrs = Math.floor(remainMs / 3600000);
                const remainMins = Math.ceil((remainMs % 3600000) / 60000);
                return { success: false, message: `工廠產能不足，請等待 ${remainHrs} 小時 ${remainMins} 分鐘後再研發！` };
            }

            if ((data.kuCoin || 0) < config.cost) {
                return { success: false, message: `你的資金不足！研發 ${config.title} 需要 ${config.cost.toLocaleString()} 哭幣。` };
            }

            const rand = Math.random() * 100;
            let outcome = '';
            let newKuCoin = data.kuCoin - config.cost;
            let updates = {
                armsDealerCooldownUntil: Date.now() + cdMs,
                kuCoin: newKuCoin
            };

            if (rand < config.winRate) {
                outcome = 'win';
                updates.kuCoin += config.winReward;
            } else if (rand < config.winRate + config.loseRate) {
                outcome = 'lose';
                // Just lose the cost
            } else {
                outcome = 'crit_lose';
                updates.jailedUntil = Date.now() + (config.jailHrs * 60 * 60 * 1000);
                updates.wantedLevel = 0; // Arrested
                
                if (config.crime) {
                    updates.crimeRecord = db.FieldValue.increment(config.crime);
                }
                if (config.demote) {
                    // Demote to 4-star (index 18)
                    updates.militaryEnlistCount = 19; // EnlistCount is rankIndex + 1, so 18 + 1 = 19
                }
            }

            t.update(docRef, updates);

            return {
                success: true,
                outcome,
                newBalance: updates.kuCoin || newKuCoin,
                name: memberName || data.displayName || data.name
            };
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        // 結算畫面
        let titleColor = '';
        let headerText = '';
        let descText = '';

        if (result.outcome === 'win') {
            titleColor = flexUtils.COLORS.SUCCESS;
            headerText = '🤑 研發成功大賣';
            descText = `你成功將【${config.title}】走私到黑市，大撈了一筆！\n\n💰 獲得收益：${config.winReward.toLocaleString()} 哭幣\n(淨賺 ${(config.winReward - config.cost).toLocaleString()} 哭幣)`;
        } else if (result.outcome === 'lose') {
            titleColor = flexUtils.COLORS.WARNING;
            headerText = '🔥 研發失敗';
            descText = `你的工廠發生意外，或是貨物遭到黑吃黑截胡。\n\n💸 損失成本：${config.cost.toLocaleString()} 哭幣`;
        } else {
            titleColor = flexUtils.COLORS.DANGER;
            headerText = '🚨 東窗事發';
            let extraP = '';
            if (config.crime) extraP += `\n🚨 增加 ${config.crime} 次前科`;
            if (config.demote) extraP += `\n📉 強制降級為【四星上將】`;
            descText = `你的非法勾當被憲兵與國際刑警聯合查獲！資金全數充公！\n\n🚔 直接入獄：${config.jailHrs} 小時${extraP}`;
        }

        const bodyContents = [
            flexUtils.createText({ text: descText, size: 'sm', color: flexUtils.COLORS.TEXT_MAIN, wrap: true, margin: 'md' }),
            flexUtils.createSeparator('md'),
            flexUtils.createText({ text: `🏦 結算總資產：${result.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#4CAF50', margin: 'md' }),
            flexUtils.createText({ text: `⏳ 工廠冷卻：${config.cooldownHrs} 小時`, size: 'xs', color: flexUtils.COLORS.TEXT_MUTED, margin: 'sm' })
        ];

        const flexBubble = flexUtils.createBubble({
            size: 'mega',
            header: flexUtils.createHeader(headerText, `【研發軍火】${result.name}`, flexUtils.COLORS.BG_CARD, titleColor),
            body: flexUtils.createBox('vertical', bodyContents, { backgroundColor: flexUtils.COLORS.BG_CARD, paddingAll: 'xl' })
        });

        await lineUtils.replyFlex(replyToken, '研發軍火結算', flexBubble);

    } catch (e) {
        console.error('[Military] handleArmsDealer Error:', e);
        await lineUtils.replyText(replyToken, '❌ 研發軍火發生錯誤。');
    }
}

async function handleArmsDealerMenu(replyToken, context) {
    const { userId } = context;

    try {
        const docRef = db.collection(COLLECTION_NAME).doc(userId);
        const doc = await docRef.get();
        if (!doc.exists) {
            await lineUtils.replyText(replyToken, '❌ 找不到玩家資料。');
            return;
        }
        const data = doc.data();

        if (!data.militaryUntil || Date.now() >= data.militaryUntil) {
            await lineUtils.replyText(replyToken, '❌ 你目前不在營區內，無法動用國防資源！');
            return;
        }

        const currentCount = data.militaryEnlistCount || 0;
        const rankIndex = currentCount - 1;

        if (rankIndex !== 19) {
            await lineUtils.replyText(replyToken, '❌ 你必須是五星上將才能進行地下軍火交易！');
            return;
        }

        const WEAPON_CONFIG = [
            { cmd: '零件', cost: 50000000, title: '🔩 軍火零件', desc: '成功率高，適合平穩賺取外快。' },
            { cmd: '輕兵器', cost: 100000000, title: '🔫 輕兵器', desc: '軍火大宗，利潤與風險並存。' },
            { cmd: '重武器', cost: 300000000, title: '💣 重型武器', desc: '高風險走私，失敗將面臨嚴重刑期。' },
            { cmd: '特殊武器', cost: 1000000000, title: '🚀 大規模殺傷武器', desc: '極高機率失敗入獄並遭到降級，但一旦成功將富可敵國！' }
        ];

        let cdStatus = '🟢 產線閒置中';
        let isCd = false;
        if (data.armsDealerCooldownUntil && Date.now() < data.armsDealerCooldownUntil) {
            const remainMs = data.armsDealerCooldownUntil - Date.now();
            const remainHrs = Math.floor(remainMs / 3600000);
            const remainMins = Math.ceil((remainMs % 3600000) / 60000);
            cdStatus = `🔴 生產中 (剩餘 ${remainHrs}h${remainMins}m)`;
            isCd = true;
        }

        const memberName = data.name || data.displayName || '上將';

        const infoBubble = flexUtils.createBubble({
            size: 'micro',
            header: flexUtils.createHeader('⭐⭐⭐⭐⭐', '五星上將總部', flexUtils.COLORS.BG_CARD, '#FFD700'),
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: `👤 ${memberName}`, size: 'sm', color: flexUtils.COLORS.TEXT_MAIN, weight: 'bold' }),
                flexUtils.createText({ text: `💰 軍資: ${(data.kuCoin || 0).toLocaleString()}`, size: 'xs', color: '#4CAF50', weight: 'bold', margin: 'sm' }),
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: '🏭 工廠狀態:', size: 'xs', color: flexUtils.COLORS.TEXT_SUB, margin: 'md' }),
                flexUtils.createText({ text: cdStatus, size: 'xs', color: isCd ? flexUtils.COLORS.DANGER : flexUtils.COLORS.SUCCESS, weight: 'bold', margin: 'sm' })
            ], { backgroundColor: flexUtils.COLORS.BG_CARD, paddingAll: 'md' })
        });

        const bubbles = WEAPON_CONFIG.map(w => {
            return flexUtils.createBubble({
                size: 'micro',
                header: flexUtils.createHeader(w.title, `研發成本: ${(w.cost/10000).toLocaleString()}萬`, flexUtils.COLORS.BG_CARD, flexUtils.COLORS.WARNING),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: w.desc, size: 'xs', color: flexUtils.COLORS.TEXT_MUTED, wrap: true, margin: 'sm' }),
                    flexUtils.createSeparator('md'),
                    {
                        type: 'button',
                        style: 'primary',
                        color: flexUtils.COLORS.DANGER,
                        margin: 'md',
                        action: { 
                            type: 'postback', 
                            label: `研發 ${w.cmd}`, 
                            data: `action=jailAction&targetId=${userId}&cmd=研發軍火 ${w.cmd}` 
                        }
                    }
                ], { backgroundColor: flexUtils.COLORS.BG_CARD, paddingAll: 'md' })
            });
        });

        bubbles.unshift(infoBubble);

        const flex = flexUtils.createFlexMessage('研發軍火選單', flexUtils.createCarousel(bubbles));
        await lineUtils.replyToLine(replyToken, [flex]);

    } catch (e) {
        console.error('[Military] handleArmsDealerMenu Error:', e);
        await lineUtils.replyText(replyToken, '❌ 產生軍火選單發生錯誤。');
    }
}

module.exports = {
    handleDeclareWar,
    handleArmsDealer,
    handleArmsDealerMenu
};
