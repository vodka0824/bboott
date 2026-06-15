const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../handlers/multi_baccarat.js');
let code = fs.readFileSync(filePath, 'utf8');

// 1. Instantiation
code = code.replace(
    /const activeTables = new Map\(\);/,
    `const MultiGameEngine = require('../services/multiGameEngine');\nconst engine = new MultiGameEngine('baccarat', '百家樂', 1);`
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

// In baccarat, `closeTable` and `openTable` are the only things to replace. Wait, there's no `autoCloseTable` function, it's just `setTimeout` inside `openTable`.
code = removeFunction(code, 'openTable');
code = removeFunction(code, 'closeTable');

const newOpenTable = `
async function openTable(replyToken, ctx) {
    const { userId } = ctx;
    if (!authUtils.isSuperAdmin(userId)) {
        await lineUtils.replyText(replyToken, '【權限不足】百家樂為官方限定活動，須由系統管理員發起！');
        return;
    }

    const tableState = await engine.openTable(replyToken, ctx, {
        deck: createDeck(),
        playerHand: [],
        bankerHand: [],
        playerScore: 0,
        bankerScore: 0,
        resultType: null
    });
    
    if (tableState) {
        await sendTableFlex(replyToken, tableState, '【百家樂賭局已開啟】', []);
    }
}

async function closeTable(replyToken, ctx) {
    return engine.closeTable(replyToken, ctx);
}
`;

code = code.replace(/async function placeBet/, newOpenTable + '\nasync function placeBet');

fs.writeFileSync(filePath, code);
console.log('Refactored multi_baccarat.js');
