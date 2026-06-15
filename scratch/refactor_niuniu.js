const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../handlers/multi_niuniu.js');
let code = fs.readFileSync(filePath, 'utf8');

// 1. Instantiation
code = code.replace(
    /const activeTables = new Map\(\);/,
    `const MultiGameEngine = require('../services/multiGameEngine');\nconst engine = new MultiGameEngine('niuniu', '牛牛', 1);`
);

// 2. Replacements
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

code = removeFunction(code, 'openTable');
code = removeFunction(code, 'closeTable');
code = removeFunction(code, 'autoCloseTable');

const newOpenTable = `
async function openTable(replyToken, context) {
    const tableState = await engine.openTable(replyToken, context, {
        deck: createDeck(),
        dealerHand: [],
        dealerResult: null
    });
    
    if (tableState) {
        await sendTableFlex(replyToken, tableState, '【 牛牛牌局已建立 】\\n請大家下注後，莊家可點擊發牌開始！\\n(1分鐘未開始將自動取消)');
    }
}

async function closeTable(replyToken, context) {
    return engine.closeTable(replyToken, context);
}
`;

code = code.replace(/async function placeBet/, newOpenTable + '\nasync function placeBet');

fs.writeFileSync(filePath, code);
console.log('Refactored multi_niuniu.js');
