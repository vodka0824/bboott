const fs = require('fs');
const path = require('path');

const handlersDir = path.join(__dirname, '..', 'handlers');
const files = fs.readdirSync(handlersDir).filter(f => f.startsWith('multi_') && f.endsWith('.js') && f !== 'multi_tableManager.js');

const replacement = `const tableManager = require('./multi_tableManager');
const activeTables = {
    _map: new Map(),
    has: function(groupId) { 
        if (this._map.has(groupId)) return true;
        return tableManager.hasActiveTable(groupId);
    },
    get: function(groupId) { return this._map.get(groupId); },
    set: function(groupId, val) { 
        tableManager.lockTable(groupId, '多人遊戲');
        return this._map.set(groupId, val); 
    },
    delete: function(groupId) { 
        tableManager.unlockTable(groupId);
        return this._map.delete(groupId); 
    }
};`;

files.forEach(file => {
    const filePath = path.join(handlersDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Check if already patched
    if (content.includes("require('./multi_tableManager')")) {
        console.log(`Skipping ${file}, already patched.`);
        return;
    }
    
    content = content.replace(/const activeTables = new Map\(\);/, replacement);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Patched ${file}`);
});
