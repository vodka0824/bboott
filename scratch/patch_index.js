const fs = require('fs');

let content = fs.readFileSync('index.js', 'utf8');

// 1. Update registerRoutes import
content = content.replace("const registerRoutes = require('./handlers/routes');", "const registerRoutes = require('./routes');");

// 2. Add missing handler imports if they don't exist
const newImports = `
const economyHandler = require('./handlers/economy');
const rpgHandler = require('./handlers/rpg');
const jailHandler = require('./handlers/jail');
const equipmentHandler = require('./handlers/equipment');
const policeHandler = require('./handlers/police');
const robberyHandler = require('./handlers/robberyHandler');
const mafiaHandler = require('./handlers/mafia');
const worldcupHandler = require('./handlers/worldcup');
const atonementHandler = require('./handlers/atonement');
const auctionHandler = require('./handlers/auction');
const horoscopeHandler = require('./handlers/horoscope');
`;

if (!content.includes("require('./handlers/economy')")) {
    content = content.replace("const enchantHandler = require('./handlers/enchant'); // 天堂衝裝遊戲", "const enchantHandler = require('./handlers/enchant'); // 天堂衝裝遊戲" + newImports);
}

// 3. Update the registerRoutes call to pass all these handlers
const newRegisterBlock = `
// === 路由註冊 ===
registerRoutes(router, {
  financeHandler,
  currencyHandler,
  systemHandler,
  weatherHandler,
  todoHandler,
  restaurantHandler,
  lotteryHandler,
  taigiHandler,
  leaderboardHandler,
  driveHandler,
  crawlerHandler,
  aiHandler,
  gameHandler,
  lineUtils,
  settingsHandler,
  funHandler,
  tcatHandler,
  welcomeHandler,
  slotHandler,
  javdbHandler,
  enchantHandler,
  economyHandler,
  rpgHandler,
  jailHandler,
  equipmentHandler,
  policeHandler,
  robberyHandler,
  mafiaHandler,
  worldcupHandler,
  atonementHandler,
  auctionHandler,
  horoscopeHandler
});
`;

content = content.replace(/\/\/ === 路由註冊 ===[\s\S]*?\}\);/m, newRegisterBlock.trim());

fs.writeFileSync('index.js', content, 'utf8');
console.log('index.js successfully updated.');
