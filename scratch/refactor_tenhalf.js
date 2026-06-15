const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../handlers/multi_tenhalf.js');
let code = fs.readFileSync(filePath, 'utf8');

// 1. Replace activeTables instantiation
code = code.replace(
    /const activeTables = new Map\(\);/,
    `const MultiGameEngine = require('../services/multiGameEngine');\nconst engine = new MultiGameEngine('tenhalf', '十點半', 1);`
);

// 2. Replace activeTables methods
code = code.replace(/activeTables\.get\(/g, 'engine.getActiveTable(');
code = code.replace(/activeTables\.set\(/g, 'engine.activeTables.set(');
code = code.replace(/activeTables\.has\(/g, 'engine.activeTables.has(');
code = code.replace(/activeTables\.delete\(/g, 'engine.clearTable(');

function removeFunction(sourceCode, functionName) {
    const regex = new RegExp(`^(?:async\\s+)?function\\s+${functionName}\\s*\\([\\s\\S]*?\\)\\s*\\{`, 'm');
    const match = regex.exec(sourceCode);
    if (!match) return sourceCode;
    let startIndex = match.index;
    let braceCount = 0;
    let endIndex = startIndex;
    let foundFirstBrace = false;
    for (let i = startIndex; i < sourceCode.length; i++) {
        if (sourceCode[i] === '{') {
            braceCount++;
            foundFirstBrace = true;
        } else if (sourceCode[i] === '}') {
            braceCount--;
        }
        if (foundFirstBrace && braceCount === 0) {
            endIndex = i + 1;
            break;
        }
    }
    return sourceCode.substring(0, startIndex) + sourceCode.substring(endIndex);
}

code = removeFunction(code, 'autoCloseTable');
code = removeFunction(code, 'closeTable');
code = removeFunction(code, 'openTable');

const newOpenTable = `
async function openTable(replyToken, context) {
    const table = await engine.openTable(replyToken, context, {
        dealerHand: [],
        dealerScore: 0,
        deck: createDeck()
    });
    
    if (table) {
        await sendTableFlex(replyToken, table, '【 十點半牌局已建立 】\\n請大家下注後，莊家可點擊發牌開始！\\n(1分鐘未開始將自動取消)');
    }
}

async function closeTable(replyToken, context) {
    return engine.closeTable(replyToken, context);
}
`;

code = code.replace(/async function placeBet/, newOpenTable + '\nasync function placeBet');

fs.writeFileSync(filePath, code);
console.log('Refactored multi_tenhalf.js');
