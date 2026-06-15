const fs = require('fs');
const path = require('path');

function checkUndefinedInService(serviceFile) {
    const filePath = path.join(__dirname, '../services', serviceFile);
    const code = fs.readFileSync(filePath, 'utf8');
    
    // We can just use a simple regex to find `functionName(` and see if it's defined
    const definedFuncs = [...code.matchAll(/function\s+([a-zA-Z0-9_]+)/g)].map(m => m[1]);
    const calledFuncs = [...code.matchAll(/([a-zA-Z0-9_]+)\s*\(/g)].map(m => m[1]);
    
    // builtins to ignore
    const ignore = new Set([
        'require', 'console', 'Math', 'Date', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
        'Promise', 'Array', 'String', 'Object', 'Number', 'Boolean', 'parseInt', 'parseFloat', 'isNaN',
        'db', 'lineUtils', 'flexUtils', 'memoryCache', 'getSpamResponse', 'isNaN', 'map', 'filter', 'reduce',
        'forEach', 'push', 'pop', 'shift', 'unshift', 'splice', 'slice', 'indexOf', 'includes', 'join',
        'split', 'toLowerCase', 'toUpperCase', 'trim', 'replace', 'match', 'exec', 'test', 'keys', 'values',
        'entries', 'from', 'isArray', 'hasOwnProperty', 'toString', 'toLocaleString', 'toFixed', 'floor',
        'ceil', 'round', 'max', 'min', 'random', 'now', 'collection', 'doc', 'get', 'set', 'update', 'delete',
        'runTransaction', 'where', 'orderBy', 'limit', 'catch', 'then', 'all', 'resolve', 'reject',
        'replyText', 'replyFlex', 'getGroupMemberName', 'createHeader', 'createBox', 'createText', 'createSeparator',
        'createButton', 'createBubble', 'get', 'set', 'del', 'push', 'unshift', 'length', 'log', 'error', 'warn'
    ]);
    
    const missing = new Set();
    for (const called of calledFuncs) {
        if (!definedFuncs.includes(called) && !ignore.has(called) && !called.includes('.')) {
            missing.add(called);
        }
    }
    
    console.log(`\n=== ${serviceFile} missing calls ===`);
    console.log(Array.from(missing).join(', '));
}

const services = fs.readdirSync(path.join(__dirname, '../services')).filter(f => f.endsWith('Service.js'));
services.forEach(checkUndefinedInService);
