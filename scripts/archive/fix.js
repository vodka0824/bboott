const fs = require('fs');

function fixBlackjack() {
    let code = fs.readFileSync('handlers/blackjack.js', 'utf8');
    
    // Fix player blackjack
    code = code.replace(/const winAmount = Math\.floor\(betAmount \* 1\.5\);([\s\S]*?)await sendEndGameFlex\(replyToken, `🎉 黑傑克！您贏得了 \$\{winAmount\} 哭幣！`, betAmount, winAmount, playerHand, dealerHand, userName, true\);/g, 
        `let winAmount = Math.floor(betAmount * 1.5);
            let resultMsg = \`🎉 黑傑克！您贏得了 \${winAmount} 哭幣！\`;
            const taxResult = await atonementHandler.processDevilTax(winAmount, userId);
            if (taxResult.hasContract && taxResult.taxAmount > 0) {
                winAmount = taxResult.finalProfit;
                resultMsg += \`\\n😈 惡魔契約發動：強制徵收 90% 獲利 (-\${taxResult.taxAmount})\`;
            }
            await economyHandler.addCoinQuietly(groupId, userId, betAmount + winAmount);
            await sendEndGameFlex(replyToken, resultMsg, betAmount, winAmount, playerHand, dealerHand, userName, true);`
    );

    // Fix other wins
    code = code.replace(/const taxResult = await atonementHandler\.processDevilTax\(winAmount, userId\);([\s\S]*?)await economyHandler\.addCoinQuietly\(groupId, userId, betAmount \+ winAmount\);/g, 
        `const taxResult = await atonementHandler.processDevilTax(winAmount, userId);
        if (taxResult.hasContract && taxResult.taxAmount > 0) {
            winAmount = taxResult.finalProfit;
            resultText += \`\\n😈 惡魔契約發動：強制徵收 90% 獲利 (-\${taxResult.taxAmount})\`;
        }
        await economyHandler.addCoinQuietly(groupId, userId, betAmount + winAmount);`
    );

    fs.writeFileSync('handlers/blackjack.js', code);
}
fixBlackjack();
console.log('blackjack fixed');
