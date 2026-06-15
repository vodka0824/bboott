const fs = require('fs');

let c = fs.readFileSync('routes/casinoRoutes.js', 'utf8');

// The messed up patterns:
// (\d+|[0-9０-９,kKwW萬]+\|歐印|all\s*in)
// ([0-9０-９,kKwW萬]+\|歐印|all\s*in)

// Replace them with the correct one: ([0-9０-９,kKwW萬]+|歐印|all\s*in)
c = c.replace(/\(\\d\+\|\[0\-9０\-９,kKwW萬\]\+\\\|歐印\|all\\s\*in\)/g, '([0-9０-９,kKwW萬]+|歐印|all\\s*in)');
c = c.replace(/\(\[0\-9０\-９,kKwW萬\]\+\\\|歐印\|all\\s\*in\)/g, '([0-9０-９,kKwW萬]+|歐印|all\\s*in)');

fs.writeFileSync('routes/casinoRoutes.js', c);
console.log('Fixed');
