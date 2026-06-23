const fs = require('fs');
const path = require('path');

const extractQuickReplies = (dir) => {
    let results = {};
    if (!fs.existsSync(dir)) return results;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
    for (const file of files) {
        const content = fs.readFileSync(path.join(dir, file), 'utf8');
        const regex = /quickReply\s*[:=]\s*\{[\s\S]*?\}/g;
        let matches = content.match(regex);
        if (matches) {
            results[file] = [];
            matches.forEach(m => {
                let labels = [];
                let labelRegex = /label:\s*['"]([^'"]+)['"]/g;
                let labelMatch;
                while ((labelMatch = labelRegex.exec(m)) !== null) {
                    labels.push(labelMatch[1]);
                }
                if (labels.length > 0) {
                    results[file].push(labels.join(', '));
                }
            });
        }
        if (content.includes('getQuickReply') || content.includes('getBetQuickReply')) {
            if (!results[file]) results[file] = [];
            results[file].push('[由 utils 動態產生]');
        }
    }
    return results;
};

const hResults = extractQuickReplies('handlers');
const sResults = extractQuickReplies('services');

console.log('Handlers:');
for (const [f, labels] of Object.entries(hResults)) {
    if (labels.length > 0) {
        console.log(`- ${f}:\n  ${[...new Set(labels)].map(l => '  > ' + l).join('\n')}`);
    }
}
console.log('\nServices:');
for (const [f, labels] of Object.entries(sResults)) {
    if (labels.length > 0) {
        console.log(`- ${f}:\n  ${[...new Set(labels)].map(l => '  > ' + l).join('\n')}`);
    }
}
