const fs = require('fs');
let content = fs.readFileSync('scratch/split_police.js', 'utf8');

// Replace the line
content = content.replace(
  "writeService('policeCorruptionService.js', ['handleCoverUp']);",
  "writeService('policeCorruptionService.js', ['handleCoverUp'], \"const { checkInternalAffairs } = require('./policeActionService');\\n\");"
);

fs.writeFileSync('scratch/split_police.js', content, 'utf8');
