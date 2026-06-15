const fs = require('fs');
const path = require('path');

const src = fs.readFileSync('handlers/economy.js', 'utf8');

const sharedHeader = src.substring(0, src.indexOf('// 1. 查詢餘額'));

function extractFunction(name) {
    const fnStartRegex = new RegExp('(async function |function )' + name + '\\s*\\(');
    const match = src.match(fnStartRegex);
    if (!match) {
        console.warn('Function not found:', name);
        return '';
    }
    const startIndex = match.index;
    
    // Find the end by counting braces
    let openBraces = 0;
    let started = false;
    let endIndex = startIndex;
    for (let i = startIndex; i < src.length; i++) {
        if (src[i] === '{') {
            openBraces++;
            started = true;
        } else if (src[i] === '}') {
            openBraces--;
        }
        
        if (started && openBraces === 0) {
            endIndex = i + 1;
            break;
        }
    }
    return src.substring(startIndex, endIndex) + '\n\n';
}

const bankingFns = ['checkBalance', 'transferCoin', 'adminManageCoin', 'consumeCoin', 'addCoinQuietly', 'addCoinFast', 'queryPlayerProfile'];
const welfareFns = ['dailyCheckIn', 'begCoin', 'claimEmergencyAid'];
const crimeFns = ['addWantedLevel', 'queryWantedLevel', 'showWantedLeaderboard', 'showCombinedWantedAndJailRank', 'showCriminalList', 'handleRigBidding', 'handleEmbezzle'];
const leaderboardFns = ['showLeaderboard', 'createEmptyLeaderboardBubble'];
const eventFns = ['triggerPublicGamblingEvent', 'handleHarvestLeeks', 'checkCooldowns', 'handleDonationPrompt', 'handleDonationConfirm'];

function buildService(name, fnList) {
    let content = sharedHeader;
    let exportsList = [];
    for (const fn of fnList) {
        content += extractFunction(fn);
        if (fn !== 'createEmptyLeaderboardBubble') exportsList.push(fn);
    }
    
    if(name === 'bankingService') {
        content += "const { robCoin } = require('../handlers/robberyHandler');\n";
    }
    if(name === 'crimeService') {
        content += "const { robCoin } = require('../handlers/robberyHandler');\nexportsList.push('robCoin');\n";
    }
    
    if(name === 'leaderboardService') {
        content += "const { formatCoins, cleanName, getProfessionName, getProfessionSuffix } = require('../utils/formatUtils');\n";
    }
    
    if(name === 'crimeService') {
        // Special logic since we pushed robCoin to exportsList
    }

    let exportsStr = 'module.exports = {\n  ' + exportsList.join(',\n  ');
    if (name === 'crimeService') exportsStr += ',\n  robCoin';
    exportsStr += '\n};\n';

    content += exportsStr;
    
    if (!fs.existsSync('services')) fs.mkdirSync('services');
    fs.writeFileSync(path.join('services', name + '.js'), content);
    console.log('Created:', name);
}

buildService('bankingService', bankingFns);
buildService('welfareService', welfareFns);
buildService('crimeService', crimeFns);
buildService('leaderboardService', leaderboardFns);
buildService('economyEventService', eventFns);

console.log('Services generated successfully.');
