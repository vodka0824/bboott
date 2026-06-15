const { db } = require('../utils/db');
const economyHandler = require('./economy');
const { getSpamResponse } = require('../utils/spamHandler');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');

const COLLECTION_NAME = 'economy_users';

// 檢查玩家是否有惡魔契約，並回傳相關資訊
async function checkDevilContract(userId) {
    try {
        const docRef = db.collection(COLLECTION_NAME).doc(userId);
        const doc = await docRef.get();
        if (!doc.exists) return false;
        
        const data = doc.data();
        if (data.devilContractUntil && Date.now() < data.devilContractUntil) {
            return true;
        }
        return false;
    } catch (e) {
        console.error('[Atonement] Error checking devil contract:', e);
        return false;
    }
}

// 處理惡魔抽稅邏輯，回傳 { taxAmount, finalProfit }
async function processDevilTax(netProfit, userId) {
    if (netProfit <= 0) return { taxAmount: 0, finalProfit: netProfit };
    
    const hasContract = await checkDevilContract(userId);
    if (!hasContract) return { taxAmount: 0, finalProfit: netProfit };

    const taxAmount = Math.floor(netProfit * 0.9); // 抽 90%
    const finalProfit = netProfit - taxAmount;
    
    return { taxAmount, finalProfit, hasContract: true };
}

// 神明懺悔
async function handleConfession(replyToken, context) {
    const { userId } = context;

    try {
        const docRef = db.collection(COLLECTION_NAME).doc(userId);
        const doc = await docRef.get();
        
        if (!doc.exists) {
            await lineUtils.replyText(replyToken, '❌ 找不到您的帳戶資料。');
            return;
        }

        const data = doc.data();
        const kuCoin = data.kuCoin || 0;

        if (kuCoin >= 0) {
            await lineUtils.replyText(replyToken, '👼 神明說：「孩子，你既無負債，何來懺悔？」');
            return;
        }

        // 檢查冷卻時間
        if (data.confessionCooldownUntil && Date.now() < data.confessionCooldownUntil) {
            const remainingMins = Math.ceil((data.confessionCooldownUntil - Date.now()) / 60000);
            const spam = getSpamResponse(data, 'confess', `⏳ 神明正在休息，請於 ${remainingMins} 分鐘後再來懺悔。`);
            await docRef.update({ spamTracker: spam.newTracker });
            if (spam.ignore) return;
            await lineUtils.replyText(replyToken, spam.message);
            return;
        }

        // 取得幸運加成
        const rpgHandler = require('./rpg');
        const userStats = await rpgHandler.getFinalPlayerStats(userId);
        const luk = userStats.final.luk || 0;
        const lukBonus = luk * 0.1; // 每 10 點幸運增加 1% 奇蹟機率，並減少 1% 神罰機率

        const rand = Math.random() * 100 - lukBonus;
        let resultMsg = '';
        let cooldownMins = 0;
        let updateData = {};

        if (rand < 5) {
            // 5% 神明展現奇蹟：清空負債
            const debt = Math.abs(kuCoin);
            updateData.kuCoin = 0;
            // 歸零不需要冷卻，所以不設定 confessionCooldownUntil
            resultMsg = `👼 【神蹟降臨】\n神明感受到了您深切的懺悔，決定赦免您的罪孽。\n\n您的負債（${debt.toLocaleString()}）已全數一筆勾銷！願您從此重新做人。`;
        } else if (rand < 20) {
            // 15% 神明沒有回應 (15分冷卻)
            cooldownMins = 15;
            resultMsg = `😐 神明似乎沒有聽見您的懺悔，什麼事都沒發生。`;
        } else if (rand < 45) {
            // 25% 神明沒有回應 (30分冷卻)
            cooldownMins = 30;
            resultMsg = `😐 神殿內一片死寂，神明沒有回應。`;
        } else if (rand < 95) {
            // 50% 神明沒有回應 (1小時冷卻)
            cooldownMins = 60;
            resultMsg = `😐 您的聲音無法傳達到天聽，請沉澱心靈後再來。`;
        } else {
            // 5% 神明震怒：負債 1.5 倍 (1小時冷卻)
            const newDebt = Math.floor(kuCoin * 1.5);
            const penalty = Math.abs(newDebt - kuCoin);
            updateData.kuCoin = newDebt;
            cooldownMins = 60;
            resultMsg = `⚡ 【神罰降臨】\n神明看穿了您的虛偽，認為您並非真心懺悔！\n\n神明降下神罰，您的負債增加了 ${penalty.toLocaleString()}！\n目前餘額：${newDebt.toLocaleString()}`;
        }

        if (cooldownMins > 0) {
            updateData.confessionCooldownUntil = Date.now() + cooldownMins * 60 * 1000;
        } else {
            // 如果觸發奇蹟，清除冷卻時間
            updateData.confessionCooldownUntil = db.FieldValue.delete();
        }

        await docRef.update(updateData);
        await lineUtils.replyText(replyToken, resultMsg);

    } catch (e) {
        console.error('[Atonement] Confession Error:', e);
        await lineUtils.replyText(replyToken, '❌ 懺悔過程發生錯誤，請稍後再試。');
    }
}

// 出賣靈魂
async function handleSellSoul(replyToken, context) {
    const { userId } = context;

    try {
        const docRef = db.collection(COLLECTION_NAME).doc(userId);
        const doc = await docRef.get();
        
        if (!doc.exists) {
            await lineUtils.replyText(replyToken, '❌ 找不到您的帳戶資料。');
            return;
        }

        const data = doc.data();
        const kuCoin = data.kuCoin || 0;

        if (kuCoin >= 0) {
            await lineUtils.replyText(replyToken, '😈 惡魔：「你這不缺錢的傢伙，靈魂對我沒有價值，滾吧！」');
            return;
        }

        const debt = Math.abs(kuCoin);
        const contractDurationDays = 3;
        const contractUntil = Date.now() + contractDurationDays * 24 * 60 * 60 * 1000;

        await docRef.update({
            kuCoin: 0,
            devilContractUntil: contractUntil
        });

        const msg = `📜 【惡魔契約已簽訂】\n\n惡魔笑著收下了您的靈魂，並為您清償了 ${debt.toLocaleString()} 的債務。\n\n⚠️ 作為代價，未來 ${contractDurationDays} 天內您將受到「惡魔契約」的詛咒：\n1. 所有賭博遊戲獲利將被強制徵收 90%。\n2. 剝奪您在多人賭局中擔任莊家的權力。`;
        
        await lineUtils.replyText(replyToken, msg);

    } catch (e) {
        console.error('[Atonement] Sell Soul Error:', e);
        await lineUtils.replyText(replyToken, '❌ 簽署契約失敗，也許是天意吧。');
    }
}

// 贖罪系統說明
async function handleAtonementInfo(replyToken) {
    const msg = `📖 【贖罪系統說明】

這是一個專為「負債玩家」設計的特殊地下系統。只要您的餘額小於 0，即可在「私訊」中使用以下指令尋求翻身機會：

🙏 指令：向神明懺悔 或 贖罪
(高風險拼人品，受 RPG 幸運加成)
• 5% 機率：神蹟降臨，負債無條件歸零！
• 15% 機率：沒有回應 (15分鐘冷卻)
• 25% 機率：沒有回應 (30分鐘冷卻)
• 50% 機率：沒有回應 (1小時冷卻)
• 5% 機率：神明震怒，降下神罰，負債直接乘以 1.5 倍！(1小時冷卻)
*(💡 提示：你的幸運(LUK)屬性越高，觸發神蹟的機率越高，遭受神罰的機率越低！每 10 點幸運增減 1% 機率。)*

😈 指令：出賣靈魂
(必定成功，但代價沉重)
• 效果：立即將負債清零！
• 代價：獲得長達 3 天的「惡魔契約」詛咒。
  1. 期間內參與任何單人/多人賭博，若贏錢將被強制沒收 90% 的淨利給惡魔。
  2. 期間內絕對禁止在多人賭局中擔任莊家。

請謹慎選擇您的贖罪之路！`;
    await lineUtils.replyText(replyToken, msg);
}

module.exports = {
    handleConfession,
    handleSellSoul,
    handleAtonementInfo,
    checkDevilContract,
    processDevilTax
};
