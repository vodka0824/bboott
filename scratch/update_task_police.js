const fs = require('fs');
let taskContent = fs.readFileSync('C:/Users/USER/.gemini/antigravity-ide/brain/8bc0b2ea-dcd6-4ca6-bf85-e492eb494299/task.md', 'utf8');

const phase2Tasks = [
    '',
    '# Phase 2: 警察系統重構追蹤清單',
    '',
    '- `[ ]` 備份 `handlers/police.js`',
    '- `[ ]` 刪除現存的舊死碼微服務',
    '  - `[ ]` `services/policeActionService.js`',
    '  - `[ ]` `services/policeCareerService.js`',
    '  - `[ ]` `services/policeCorruptionService.js`',
    '- `[ ]` 重新自 `handlers/police.js` 抽離邏輯並建立新微服務',
    '  - `[ ]` 抽離 `policeCareerService.js` (handleJoinPolice, handleResignPolice)',
    '  - `[ ]` 抽離 `policeActionService.js` (handleArrest, handleQuickArrest, handleIndict, handleFrisk, handleRaid)',
    '  - `[ ]` 抽離 `policeCorruptionService.js` (handleCoverUp)',
    '- `[ ]` 重寫 `handlers/police.js` 為 Facade 模式',
    '- `[ ]` 測試並驗證 Facade 導出之 API 與原先完全一致'
].join('\n');

taskContent += '\n' + phase2Tasks;
fs.writeFileSync('C:/Users/USER/.gemini/antigravity-ide/brain/8bc0b2ea-dcd6-4ca6-bf85-e492eb494299/task.md', taskContent, 'utf8');
console.log('Task list updated for Phase 2');
