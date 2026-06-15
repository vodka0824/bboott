const fs = require('fs');

function injectMulti(file) {
    let code = fs.readFileSync(file, 'utf8');

    // Inject atonement check in openTable
    if (!code.includes("require('./atonement')")) {
        code = code.replace(
            /async function openTable\(replyToken, (context|groupId, userId, amountStr)\) \{/,
            `$&
    const atonementHandler = require('./atonement');
    const { userId: uidForCheck } = arguments.length === 2 ? arguments[1] : { userId: arguments[2] };
    if (await atonementHandler.checkDevilContract(uidForCheck)) {
        const lineUtils = require('../utils/line');
        await lineUtils.replyText(replyToken, '❌ 惡魔契約期間，您無法擔任莊家！');
        return;
    }`
        );
    }

    // Inject player tax in finishGameAndSettle for blackjack and niuniu
    if (file.includes('blackjack') || file.includes('niuniu')) {
        code = code.replace(
            /dealerNetProfit \-= playerNet;\s*if \(playerPayout > 0\) \{/g,
            `dealerNetProfit -= playerNet;
        
        if (playerNet > 0) {
            const atonementHandler = require('./atonement');
            const taxResult = await atonementHandler.processDevilTax(playerNet, uid);
            if (taxResult.hasContract && taxResult.taxAmount > 0) {
                playerNet = taxResult.finalProfit;
                playerPayout -= taxResult.taxAmount;
                p.resultStr += \` (抽水 -\${taxResult.taxAmount})\`;
            }
        }

        if (playerPayout > 0) {`
        );
    }

    // For reddog, the player tax is during handlePlayerAction
    if (file.includes('reddog')) {
        code = code.replace(
            /await economyHandler\.addCoinQuietly\(groupId, userId, betAmount \+ winAmount\);/g,
            `const atonementHandler = require('./atonement');
            const taxResult = await atonementHandler.processDevilTax(winAmount, userId);
            if (taxResult.hasContract && taxResult.taxAmount > 0) {
                winAmount = taxResult.finalProfit;
                resultMsg += \`\\n😈 惡魔契約發動：強制徵收 90% 獲利 (-\${taxResult.taxAmount})\`;
            }
            await economyHandler.addCoinQuietly(groupId, userId, betAmount + winAmount);`
        );
    }

    fs.writeFileSync(file, code);
    console.log(file + ' updated.');
}

injectMulti('handlers/multi_blackjack.js');
injectMulti('handlers/multi_niuniu.js');
injectMulti('handlers/multi_reddog.js');
