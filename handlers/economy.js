const economyEventService = require('../services/economyEventService');
const bankingService = require('../services/bankingService');
const welfareService = require('../services/welfareService');
const crimeService = require('../services/crimeService');
const robberyCombatService = require('../services/robberyCombatService');
const economyLeaderboardService = require('../services/economyLeaderboardService');

// MOCKING_MESSAGES 位於一般的排行榜服務中
const { MOCKING_MESSAGES } = require('../services/leaderboardService');

const COIN_NAME = '哭幣';

module.exports = {
    // === 來自 economyEventService.js ===
    handleDonationPrompt: economyEventService.handleDonationPrompt,
    handleDonationConfirm: economyEventService.handleDonationConfirm,
    triggerPublicGamblingEvent: economyEventService.triggerPublicGamblingEvent,
    handleHarvestLeeks: economyEventService.handleHarvestLeeks,
    checkCooldowns: economyEventService.checkCooldowns,

    // === 來自 bankingService.js ===
    checkBalance: bankingService.checkBalance,
    transferCoin: bankingService.transferCoin,
    adminManageCoin: bankingService.adminManageCoin,
    consumeCoin: bankingService.consumeCoin,
    addCoinQuietly: bankingService.addCoinQuietly,
    addCoinFast: bankingService.addCoinFast,
    queryPlayerProfile: bankingService.queryPlayerProfile,
    payMedicalDebt: bankingService.payMedicalDebt,

    // === 來自 welfareService.js ===
    dailyCheckIn: welfareService.dailyCheckIn,
    begCoin: welfareService.begCoin,
    claimEmergencyAid: welfareService.claimEmergencyAid,

    // === 來自 crimeService.js ===
    addWantedLevel: crimeService.addWantedLevel,
    queryWantedLevel: crimeService.queryWantedLevel,
    showWantedLeaderboard: crimeService.showWantedLeaderboard,
    showCombinedWantedAndJailRank: crimeService.showCombinedWantedAndJailRank,
    showCriminalList: crimeService.showCriminalList,
    handleRigBidding: crimeService.handleRigBidding,
    handleEmbezzle: crimeService.handleEmbezzle,

    // === 來自 robberyCombatService.js ===
    // robCoin 在 robberyCombatService 中被實作
    robCoin: robberyCombatService.robCoin,

    // === 來自 economyLeaderboardService.js ===
    showAllLeaderboards: economyLeaderboardService.showAllLeaderboards,

    // === 常數與靜態資料 ===
    COIN_NAME,
    MOCKING_MESSAGES
};
