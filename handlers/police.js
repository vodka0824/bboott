// ==========================================
// Police Handler Facade (警察系統門面)
// ==========================================
// 此檔案作為外部路由與內部微服務的橋樑。
// 原有的過多業務邏輯已拆分至 services/ 目錄下。
// 此架構確保了路由檔可以無縫升級，並且降低單一檔案的維護複雜度。
// ==========================================

const policeCareerService = require('../services/policeCareerService');
const policeActionService = require('../services/policeActionService');
const policeCorruptionService = require('../services/policeCorruptionService');

module.exports = {
    // 職涯管理
    handleJoinPolice: policeCareerService.handleJoinPolice,
    handleResignPolice: policeCareerService.handleResignPolice,
    
    // 警察行動
    handleArrest: policeActionService.handleArrest,
    handleQuickArrest: policeActionService.handleQuickArrest,
    handleIndict: policeActionService.handleIndict,
    handleFrisk: policeActionService.handleFrisk,
    handleRaid: policeActionService.handleRaid,
    
    // 貪腐行動
    handleCoverUp: policeCorruptionService.handleCoverUp,
    handleAssassinatePolice: policeCorruptionService.handleAssassinatePolice
};
