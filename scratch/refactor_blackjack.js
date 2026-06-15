const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../handlers/multi_blackjack.js');
let code = fs.readFileSync(filePath, 'utf8');

// 1. Replace activeTables instantiation
code = code.replace(
    /const activeTables = new Map\(\);/,
    `const MultiGameEngine = require('../services/multiGameEngine');\nconst engine = new MultiGameEngine('blackjack', '21 點', 1);`
);

// 2. Replace activeTables methods
code = code.replace(/activeTables\.get\(/g, 'engine.getActiveTable(');
code = code.replace(/activeTables\.set\(/g, 'engine.activeTables.set(');
code = code.replace(/activeTables\.has\(/g, 'engine.activeTables.has(');
code = code.replace(/activeTables\.delete\(/g, 'engine.clearTable(');

// 3. Remove autoCloseTable and closeTable entirely, since engine provides them.
// Actually, `closeTable` is exported, so we should map it to engine.
// Let's replace the `closeTable` function with an engine wrapper or just rely on engine's closeTable.
// Wait, engine's closeTable requires `replyToken` and `context`. It matches!
// So we can just remove `closeTable` and `autoCloseTable` from `multi_blackjack.js`.

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

// 4. Refactor openTable to use engine.openTable
// We'll just remove openTable and rewrite it using engine.
code = removeFunction(code, 'openTable');

const newOpenTable = `
async function openTable(replyToken, context) {
    const table = await engine.openTable(replyToken, context, {
        dealerHand: [],
        dealerScore: 0,
        deck: createDeck()
    });
    
    if (table) {
        await sendTableFlex(replyToken, table, '【 21點牌局已建立 】\\n請大家下注後，莊家可點擊發牌開始！\\n(1分鐘未開始將自動取消)');
    }
}

async function closeTable(replyToken, context) {
    return engine.closeTable(replyToken, context);
}
`;

// Insert the new functions where openTable used to be, let's just put it before placeBet
code = code.replace(/async function placeBet/, newOpenTable + '\nasync function placeBet');

fs.writeFileSync(filePath, code);
console.log('Refactored multi_blackjack.js');
