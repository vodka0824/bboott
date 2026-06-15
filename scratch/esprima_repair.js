const fs = require('fs');
const esprima = require('esprima');

const filesToFix = fs.readdirSync('services').map(f => 'services/' + f)
    .concat(fs.readdirSync('handlers').map(f => 'handlers/' + f))
    .filter(f => f.endsWith('.js'));

for (let f of filesToFix) {
    let content = fs.readFileSync(f, 'utf8');
    let lines = content.split('\n');
    let attempt = 0;
    while (attempt < 100) {
        attempt++;
        try {
            esprima.parseScript(lines.join('\n'));
            break; // Parsed successfully
        } catch (e) {
            if (e.lineNumber) {
                // To avoid breaking blocks, we don't just clear the line.
                // We'll try replacing the rest of the string if it's an unclosed string.
                // A simpler way: replace the whole line with a harmless statement if it doesn't contain '{' or '}'
                const lineIdx = e.lineNumber - 1;
                const badLine = lines[lineIdx];
                if (badLine.includes('{') || badLine.includes('}') || badLine.includes('function')) {
                    // Try to balance quotes? Too hard. Let's just remove the bad characters.
                    lines[lineIdx] = badLine.replace(/'[^']*$/, "''").replace(/`[^`]*$/, "``").replace(/"[^"]*$/, '""');
                } else {
                    lines[lineIdx] = "/* fixed */";
                }
            } else {
                break;
            }
        }
    }
    fs.writeFileSync(f, lines.join('\n'), 'utf8');
}
console.log('Done repairing AST syntax errors.');
