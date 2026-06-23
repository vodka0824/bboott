const fs = require('fs');
let content = fs.readFileSync('handlers/jail.js', 'utf8');

// Replace the cap in both handleJailbreak and confirmJailbreak
// We have two instances of:
// let newWantedLevel = currentWanted + wantedAdd;
// if (newWantedLevel > 1.0) newWantedLevel = 1.0;

content = content.replace(/let newWantedLevel = currentWanted \+ wantedAdd;\s*if\s*\(newWantedLevel > 1\.0\)\s*newWantedLevel = 1\.0;/g, 'let newWantedLevel = currentWanted + wantedAdd;');

// We also have this string in the warning message: 🚨 警告：你已成為全國頭號通緝犯 (通緝值 100.0%)
// We should make sure the string correctly shows the actual newWantedLevel * 100.
// But we already wrote it as: `🚨 警告：你已成為全國頭號通緝犯 (通緝值 ${wantedPercent}%)！警方將全面追緝！`
// So it will display whatever percentage it is, even if it's 300%.

fs.writeFileSync('handlers/jail.js', content, 'utf8');
console.log('Removed wanted level cap in handlers/jail.js');
