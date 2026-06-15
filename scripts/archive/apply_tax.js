const fs = require('fs');
const files = [
  'handlers/blackjack.js',
  'handlers/slot.js',
  'handlers/baccarat.js',
  'handlers/horse_racing.js',
  'handlers/vip_wheel.js',
  'handlers/dice.js'
];

for (const file of files) {
  let code = fs.readFileSync(file, 'utf8');
  
  if (!code.includes("require('./atonement')")) {
      code = code.replace(/const flexUtils = require\('\.\.\/utils\/flex'\);/, "const flexUtils = require('../utils/flex');\nconst atonementHandler = require('./atonement');");
  }

  code = code.replace(
      /await economyHandler\.addCoinQuietly\(groupId, userId, betAmount \+ winAmount\);/g,
      `const taxResult = await atonementHandler.processDevilTax(winAmount, userId);
      if (taxResult.hasContract && taxResult.taxAmount > 0) {
          winAmount = taxResult.finalProfit;
          if (typeof resultText !== 'undefined') resultText += "\\n😈 惡魔契約發動：強制徵收 90% 獲利 (-" + taxResult.taxAmount + ")";
          else if (typeof msg !== 'undefined') msg += "\\n😈 惡魔契約發動：強制徵收 90% 獲利 (-" + taxResult.taxAmount + ")";
      }
      await economyHandler.addCoinQuietly(groupId, userId, betAmount + winAmount);`
  );

  fs.writeFileSync(file, code);
  console.log(file + ' updated.');
}
