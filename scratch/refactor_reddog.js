const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../handlers/multi_reddog.js');
let code = fs.readFileSync(filePath, 'utf8');

// 1. Instantiation
code = code.replace(
    /const tableManager = require\('\.\/multi_tableManager'\);\nconst activeTables = \{\n    _map: new Map\(\),\n    has: function\(groupId\) \{ [\s\S]*?\n    \},\n    get: function\(groupId\) \{ return this\._map\.get\(groupId\); \},\n    set: function\(groupId, val\) \{ [\s\S]*?\n    \},\n    delete: function\(groupId\) \{ [\s\S]*?\n    \}\n\};/,
    `const MultiGameEngine = require('../services/multiGameEngine');\nconst engine = new MultiGameEngine('reddog', '紅狗', 1);\n\nconst tableManager = require('../handlers/multi_tableManager');\n\nconst activeTables = {\n    has: (groupId) => engine.activeTables.has(groupId),\n    get: (groupId) => engine.getActiveTable(groupId),\n    set: (groupId, val) => {\n        tableManager.registerTable(groupId, 'reddog');\n        engine.activeTables.set(groupId, val);\n    },\n    delete: (groupId) => engine.clearTable(groupId)\n};`
);

fs.writeFileSync(filePath, code);
console.log('Refactored multi_reddog.js partially to use MultiGameEngine state.');
