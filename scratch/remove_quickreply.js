const fs = require('fs');

const files = [
    'handlers/jail.js',
    'handlers/mafia.js',
    'handlers/police.js',
    'services/bankingService.js',
    'services/jailBailService.js'
];

files.forEach(f => {
    if(!fs.existsSync(f)) return;
    let content = fs.readFileSync(f, 'utf8');
    
    // Pattern 1:
    content = content.replace(/const quickReply = \{[\s\S]*?\};\s*await lineUtils\.replyFlex\(replyToken,\s*([^,]+),\s*([^,]+),\s*\[\],\s*quickReply\);/g, "await lineUtils.replyFlex(replyToken, $1, $2);");
    
    // Pattern 2: (just in case)
    content = content.replace(/,\s*\[\],\s*quickReply\)/g, ")");
    
    // Pattern 3: Unused quickReply defs
    content = content.replace(/const quickReply = \{[\s\S]*?\};\s*(?=await lineUtils)/g, "");

    // Pattern 4: jailBailService.js
    content = content.replace(/,\s*quickReply:\s*\{[\s\S]*?\}\s*(?=\}\];\s*await lineUtils\.replyToLine)/g, "");

    // Pattern 5: replyText
    content = content.replace(/await lineUtils\.replyText\(([^,]+),\s*([^,]+),\s*quickReply\);/g, "await lineUtils.replyText($1, $2);");

    fs.writeFileSync(f, content, 'utf8');
    console.log(`Patched ${f}`);
});
