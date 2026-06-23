const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const atonementHandler = require('./atonement');
const economyHandler = require('./economy');

const HORSES = [
    { id: 1, icon: '🐎', name: '小紅馬', multiplier: 2, weight: 470, aliases: ['1', '🐎', '小紅馬'] },
    { id: 2, icon: '🦄', name: '獨角星', multiplier: 3, weight: 310, aliases: ['2', '🦄', '獨角星', '獨角獸'] },
    { id: 3, icon: '🦖', name: '霸王龍', multiplier: 5, weight: 180, aliases: ['3', '🦖', '霸王龍', '暴龍'] },
    { id: 4, icon: '🐢', name: '忍者龜', multiplier: 20, weight: 40, aliases: ['4', '🐢', '忍者龜', '烏龜'] }
];

async function showRaceTrack(replyToken) {
    try {
        const contents = [
            flexUtils.createText({ text: '🏁 皇家賽馬場 🏁', size: 'xl', weight: 'bold', color: flexUtils.COLORS.PRIMARY, align: 'center', margin: 'md' }),
            flexUtils.createSeparator('md'),
            flexUtils.createText({ text: '點擊下方按鈕或輸入「賽馬 [號碼] [金額]」下注', size: 'xs', color: flexUtils.COLORS.TEXT_SUB, align: 'center', margin: 'md' }),
            flexUtils.createSeparator('md')
        ];

        HORSES.forEach(horse => {
            // Horizontal box for each horse
            contents.push(flexUtils.createBox('horizontal', [
                flexUtils.createText({ text: `${horse.id}. ${horse.icon} ${horse.name}`, size: 'md', weight: 'bold', color: flexUtils.COLORS.TEXT_MAIN, flex: 2, align: 'start' }),
                flexUtils.createText({ text: `賠率: ${horse.multiplier}x`, size: 'sm', weight: 'bold', color: flexUtils.COLORS.SECONDARY, flex: 1, align: 'end' })
            ], { margin: 'md', alignItems: 'center' }));
            
            // Buttons for quick betting
            contents.push(flexUtils.createBox('horizontal', [
                flexUtils.createButton({ label: '押 1,000', style: 'secondary', action: { type: 'message', label: '押 1000', text: `賽馬 ${horse.id} 1000` }, margin: 'sm' }),
                flexUtils.createButton({ label: '押 10,000', style: 'primary', color: '#D32F2F', action: { type: 'message', label: '押 10000', text: `賽馬 ${horse.id} 10000` }, margin: 'sm' })
            ], { margin: 'md' }));
            contents.push(flexUtils.createSeparator('md'));
        });

        const bubble = flexUtils.createBubble({
            size: 'mega',
            body: flexUtils.createBox('vertical', contents, { backgroundColor: flexUtils.COLORS.BG_CARD, paddingAll: 'xl' })
        });

        await lineUtils.replyFlex(replyToken, '皇家賽馬場', bubble);
    } catch (e) {
        console.error('[HorseRacing] showRaceTrack error:', e);
        await lineUtils.replyText(replyToken, '❌ 無法載入賽馬場。');
    }
}

async function betHorse(replyToken, groupId, userId, betTarget, amountStr) {
    try {
        const betAmount = parseInt(amountStr, 10);
        if (isNaN(betAmount) || betAmount <= 0) {
            await lineUtils.replyText(replyToken, '❌ 賽馬下注金額無效（請輸入大於 0 的正整數金額，例如：賽馬 1 1000000 或 賽馬 小紅馬 500000）。');
            return;
        }

        // Find the selected horse
        const selectedHorse = HORSES.find(h => h.aliases.includes(betTarget.toString()));
        if (!selectedHorse) {
            await lineUtils.replyText(replyToken, '❌ 找不到您押注的馬匹。有效選擇包含：\n1. 小紅馬 (1)\n2. 獨角星 (2)\n3. 霸王龍 (3)\n4. 忍者龜 (4)\n指令範例：賽馬 3 10000');
            return;
        }

        // Deduct money
        const consumeResult = await economyHandler.consumeCoin(groupId, userId, betAmount, true);
        if (!consumeResult.success) {
            await lineUtils.replyText(replyToken, `❌ 下注失敗：${consumeResult.message}`);
            return;
        }

        const userName = consumeResult.name || '賭客';

        // Roll the winner
        const roll = Math.floor(Math.random() * 1000);
        let cumulative = 0;
        let winningHorse = HORSES[0];
        
        for (const horse of HORSES) {
            cumulative += horse.weight;
            if (roll < cumulative) {
                winningHorse = horse;
                break;
            }
        }

        const isWin = (winningHorse.id === selectedHorse.id);
        let winAmount = 0;
        let finalBalance = consumeResult.newBalance || 0;

        let taxMsg = "";
        if (isWin) {
            const netProfit = betAmount * (selectedHorse.multiplier - 1);
            let finalWinAmount = netProfit;
            
            const taxResult = await atonementHandler.processDevilTax(netProfit, userId);
            if (taxResult.hasContract && taxResult.taxAmount > 0) {
                finalWinAmount = taxResult.finalProfit;
                taxMsg = `\n😈 惡魔契約發動：強制徵收 90% 獲利 (-${taxResult.taxAmount.toLocaleString()})`;
            }
            
            winAmount = betAmount + finalWinAmount;
            finalBalance = await economyHandler.addCoinQuietly(groupId, userId, winAmount);
        }

        // Generate race result visualization
        // Randomize the order of losers
        let losers = HORSES.filter(h => h.id !== winningHorse.id);
        losers.sort(() => Math.random() - 0.5);
        
        const finalOrder = [winningHorse, ...losers];

        const resultColor = isWin ? '#4CAF50' : '#D32F2F';
        const resultTitle = isWin ? `🎉 贏了！${taxMsg}` : '💸 輸了！';

        const contents = [
            flexUtils.createText({ text: '🏁 比賽結果 🏁', size: 'xl', weight: 'bold', color: flexUtils.COLORS.PRIMARY, align: 'center', margin: 'md' }),
            flexUtils.createText({ text: `冠軍：${winningHorse.icon} ${winningHorse.name}`, size: 'xxl', weight: 'bold', color: flexUtils.COLORS.TEXT_MAIN, align: 'center', margin: 'md' }),
            flexUtils.createSeparator('md')
        ];

        finalOrder.forEach((horse, index) => {
            const rank = index === 0 ? '👑 1st' : `    ${index + 1}th`;
            contents.push(flexUtils.createText({ text: `${rank}  ${horse.icon} ${horse.name}`, size: 'md', color: index === 0 ? flexUtils.COLORS.PRIMARY : flexUtils.COLORS.TEXT_SUB, margin: 'sm' }));
        });

        contents.push(
            flexUtils.createSeparator('md'),
            flexUtils.createText({ text: resultTitle, size: 'xl', weight: 'bold', color: resultColor, align: 'center', margin: 'md' })
        );

        if (isWin) {
            contents.push(flexUtils.createText({ text: `獲得: ${winAmount.toLocaleString()} 哭幣`, size: 'md', weight: 'bold', color: flexUtils.COLORS.PRIMARY, align: 'center', margin: 'sm' }));
        }

        contents.push(flexUtils.createText({ text: `目前餘額: ${finalBalance.toLocaleString()}`, size: 'xs', color: flexUtils.COLORS.TEXT_MUTED, align: 'center', margin: 'md' }));

        const bubble = flexUtils.createBubble({
            size: 'mega',
            body: flexUtils.createBox('vertical', contents, { backgroundColor: flexUtils.COLORS.BG_CARD, paddingAll: 'xl' })
        });

        await lineUtils.replyFlex(replyToken, `賽馬結果: ${winningHorse.name} 獲勝`, bubble);

    } catch (e) {
        console.error('[HorseRacing] betHorse error:', e);
        await lineUtils.replyText(replyToken, '❌ 賽馬場發生暴亂，比賽取消。');
    }
}

module.exports = { showRaceTrack, betHorse };
