const fs = require('fs');
const path = require('path');

const filesToRefactor = [
    'multi_blackjack.js',
    'multi_niuniu.js',
    'multi_shibala.js',
    'multi_tenhalf.js',
    'multi_tuitongzi.js'
];

const targetPattern = /try \{\s*const dealerDoc = await db\.collection\('economy_users'\)\.doc\(dealerId\)\.get\(\);\s*table\.dealerFinalBalance = dealerDoc\.exists \? \(dealerDoc\.data\(\)\.kuCoin \|\| 0\) : 0;\s*for \(const \[uid, p\] of table\.players\.entries\(\)\) \{\s*const pDoc = await db\.collection\('economy_users'\)\.doc\(uid\)\.get\(\);\s*p\.finalBalance = pDoc\.exists \? \(pDoc\.data\(\)\.kuCoin \|\| 0\) : 0;\s*\}\s*\} catch\(e\) \{\}/g;

const replacementStr = `try {
        const allUids = [dealerId, ...Array.from(table.players.keys())];
        const docs = await Promise.all(allUids.map(uid => db.collection('economy_users').doc(uid).get()));
        table.dealerFinalBalance = docs[0].exists ? (docs[0].data().kuCoin || 0) : 0;
        let i = 1;
        for (const [uid, p] of table.players.entries()) {
            p.finalBalance = docs[i].exists ? (docs[i].data().kuCoin || 0) : 0;
            i++;
        }
    } catch(e) {
        console.error("Error fetching final balances", e);
    }`;

filesToRefactor.forEach(file => {
    const filePath = path.join(__dirname, '../handlers', file);
    if (!fs.existsSync(filePath)) return;
    
    let content = fs.readFileSync(filePath, 'utf8');
    if (targetPattern.test(content)) {
        content = content.replace(targetPattern, replacementStr);
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Refactored Promise.all in ${file}`);
    } else {
        console.log(`Pattern not found in ${file} or already refactored.`);
    }
});
