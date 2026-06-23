const fs = require('fs');

const files = [
    'routes/jailRoutes.js',
    'routes/policeRoutes.js',
    'routes/mafiaRoutes.js'
];

for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/\{ isGroupOnly: true, needAuth: true \}/g, "{ feature: 'economy', isGroupOnly: true, needAuth: true }");
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Updated ${file}`);
}
