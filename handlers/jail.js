const jailInfoService = require('../services/jailInfoService');
const jailBailService = require('../services/jailBailService');
const jailbreakService = require('../services/jailbreakService');
const jailLifeService = require('../services/jailLifeService');
const jailRedemptionService = require('../services/jailRedemptionService');
const militaryEndgameService = require('../services/militaryEndgameService');

module.exports = {
    // Jail Info
    getCriminalTitle: jailInfoService.getCriminalTitle,
    checkJailStatus: jailInfoService.checkJailStatus,
    handleJailList: jailInfoService.handleJailList,
    handleJailRank: jailInfoService.handleJailRank,

    // Jail Bail
    handleBail: jailBailService.handleBail,
    confirmBail: jailBailService.confirmBail,
    handleBailOther: jailBailService.handleBailOther,
    confirmBailOther: jailBailService.confirmBailOther,
    handleBribePrompt: jailBailService.handleBribePrompt,
    handleBribe: jailBailService.handleBribe,
    confirmBribe: jailBailService.confirmBribe,

    // Jail Break
    handleJailbreak: jailbreakService.handleJailbreak,
    confirmJailbreak: jailbreakService.confirmJailbreak,
    handleRiot: jailbreakService.handleRiot,
    handlePressure: jailbreakService.handlePressure,

    // Jail Life
    handleDropSoap: jailLifeService.handleDropSoap,
    handleLabor: jailLifeService.handleLabor,
    handleBlowWarden: jailLifeService.handleBlowWarden,
    handleVisit: jailLifeService.handleVisit,

    // Redemption
    handleSutra: jailRedemptionService.handleSutra,
    handlePsychiatric: jailRedemptionService.handlePsychiatric,
    handleElection: jailRedemptionService.handleElection,
    handleScapegoat: jailRedemptionService.handleScapegoat,
    handleDonation: jailRedemptionService.handleDonation,
    handleLiveStream: jailRedemptionService.handleLiveStream,
    handleSnitch: jailRedemptionService.handleSnitch,
    handleEnlist: jailRedemptionService.handleEnlist,
    handleDischarge: jailRedemptionService.handleDischarge,
    handleHungerStrike: jailRedemptionService.handleHungerStrike,
    handleDragDown: jailRedemptionService.handleDragDown,
    handleMilitaryGame: jailRedemptionService.handleMilitaryGame,
    handleBatchMilitaryGames: jailRedemptionService.handleBatchMilitaryGames,
    handlePension: jailRedemptionService.handlePension,
    handleMedicalDischarge: jailRedemptionService.handleMedicalDischarge,
    handleDeclareWar: militaryEndgameService.handleDeclareWar,
    handleArmsDealer: militaryEndgameService.handleArmsDealer,
    handleArmsDealerMenu: militaryEndgameService.handleArmsDealerMenu
};
