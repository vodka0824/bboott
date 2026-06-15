# LINE Bot 系統架構與開發規範 (Architecture & Guidelines)

本文件定義了本專案的核心模組化架構。未來所有參與開發的工程師（或 AI 助手）在新增系統、指令或模組時，**必須**遵循本文件的設計模式，以維持程式碼的高內聚性、低耦合性與可擴充性。

---

## 1. 架構總覽 (Architecture Overview)

系統採用類似 Web API 的 **Pipeline (管線) 架構** 搭配 **MVC / 服務層 (Service Layer)** 的概念：
1. **入口 (index.js)**: 接收 Webhook，進行基本的全域中介軟體 (Middlewares) 攔截。
2. **路由 (utils/router.js)**: 負責字串匹配與參數解析，支援針對單一指令掛載專屬的中介軟體。
3. **門面與處理器 (handlers/)**: 負責統整各個微服務的 API，並處理 LINE Flex Message 等視覺化邏輯。
4. **業務服務層 (services/)**: 將龐大的業務邏輯依據「領域驅動」拆分為多個具有單一職責的模組。
5. **底層工具 (utils/)**: 共用的快取、資料庫連線與格式化工具。

---

## 2. 目錄結構規範

```text
lineBot/
├── index.js                # 系統唯一入口，註冊全域 Middlewares 與 Webhook 監聽
├── middlewares/            # 中介軟體層：負責攔截、驗證與過濾
│   ├── global.js           # 全域過濾器 (防連點、洗頻、發言紀錄、給予經驗值)
│   └── routeChecks.js      # 路由過濾器 (權限檢查、賭場開關、監獄禁玩)
├── utils/                  # 共用工具層
│   ├── router.js           # 核心路由器
│   ├── cache.js            # 統一快取介面 (LRU Memory + Redis Adapter)
│   ├── db.js               # 資料庫橋接層 (Firestore 模擬器與原生 MongoDB)
│   └── ...                 
├── handlers/               # 請求處理層 / Facade 門面
│   ├── economy.js          # (Facade) 將 services/ 下的經濟模組統一匯出
│   ├── multi_*.js          # 多人遊戲 (德州撲克、21點等) 的生命週期與邏輯
│   └── ...                 
└── services/               # 領域業務層 (細分後的獨立服務)
    ├── bankingService.js   # 銀行與轉帳
    ├── crimeService.js     # 犯罪、通緝與黑吃黑
    ├── leaderboardService.js
    └── ...
```

---

## 3. 開發規範與標準流程

### 📌 規則一：新增指令必須透過 `router.js`
不要在 `index.js` 寫任何的 `if-else` 字串判斷。所有新指令都必須寫入路由表。
如果你的指令需要「管理員權限」或「只能在群組使用」，請利用 `options` 配置，路由器會自動將其交給 `middlewares/routeChecks.js` 處理。

**正確的註冊方式：**
```javascript
// 在 router 註冊的地方
router.register(/^(我的新功能)$/, async (context, match) => {
    const newService = require('../handlers/newFeature');
    return await newService.execute(context);
}, {
    isGroupOnly: true,    // 僅限群組
    needAdmin: false,     // 是否需超級管理員
    feature: 'casino',    // 綁定特定功能開關 (可被群組管理員禁用)
    middlewares: [customMW] // 針對該指令的自訂過濾器
});
```

### 📌 規則二：業務邏輯過度肥大時，必須切分 `services/` (門面模式)
當一個 `handler` 檔案超過 500 行，或包含多個不同領域的職責時，**嚴禁**繼續往該檔案塞程式碼。
- 請在 `services/` 目錄下建立獨立的服務模組（例如 `welfareService.js`）。
- 原本的 `handler` 檔案轉作 **Facade (門面)**，僅負責 `require` 這些服務並 `module.exports` 統一拋出。這樣能確保外部呼叫完全向下相容。

### 📌 規則三：狀態與快取必須使用 `utils/cache.js`
不要在全域宣告 `new Map()` 或 `let myCache = {}` 來儲存需要長期跨次請求的資料（除了有 `setInterval` 遊戲循環的多人遊戲外）。
- 請一律引入 `const cache = require('../utils/cache');`
- 盡量使用非同步的 `await cache.getAsync(key)` 與 `await cache.setAsync(key, value, ttl)`。
- 這能確保未來系統切換到 Redis 時，所有的快取都能變成跨進程的分散式快取。

### 📌 規則四：多人遊戲模組化規範 (MultiGameEngine)
為解決多人連線遊戲 (如 `multi_blackjack.js`, `multi_reddog.js`) 高度重複的發起、計時、結算退款邏輯，所有新的多人連線遊戲都 **必須** 繼承或使用 `services/multiGameEngine.js` 的核心服務。
- **統一狀態管理**: 使用 `MultiGameEngine.openTable(replyToken, context, data)` 來負責開局驗證 (餘額、鎖定狀態、通緝犯檢查)。
- **自動關閉與退款**: 引擎會統一處理 `timeout` 以及在閒置時自動退還玩家下注 (`autoCloseTable`)。
- **個別遊戲職責**: 遊戲的 `handler` (如 `multi_blackjack.js`) 僅需負責「遊戲規則邏輯 (hit/stand)」、「勝利結算 (finishGameAndSettle)」以及客製化的 UI 渲染。

---

## 4. 微服務重構現況與規範 (Phase 4 ~ Phase 8)

自 Phase 4 起，我們已將所有肥大的 God Objects 成功重構為 Facade 代理，所有底層邏輯均已分離至 `services/`，請所有開發者務必遵循現有的微服務架構，**嚴禁將新的邏輯直接寫入 `handlers/` 之中**。

### 已完成微服務化的核心系統清單：
1. **經濟與轉帳系統** (`economy.js` -> `bankingService`, `welfareService`, `crimeService`, `economyEventService`)
2. **監獄系統** (`jail.js` -> `jailLifeService`, `jailBailService`, `jailbreakService`, `jailInfoService`)
3. **裝備與鍛造系統** (`equipment.js` -> `equipmentShopService`, `equipmentForgeService`, `equipmentInfoService`)
4. **治安與警察系統** (`police.js` -> `policeCareerService`, `policeActionService`, `policeCorruptionService`)
5. **搶劫與戰鬥系統** (`robberyHandler.js` -> `robberyValidationService`, `robberyCombatService`)
6. **RPG 系統** (`rpg.js` -> `rpgCoreService`, `rpgCombatStatService`, `rpgProfileFlexService`, `rpgLeaderboardService`)
7. **多人連線遊戲** (`multi_*.js`)：全數 8 款遊戲 (包含 21點、百家樂、推筒子等) 皆已接入 `services/multiGameEngine.js`，達成生命週期、超時退款與狀態的統一接管。

### 🚨 開發新功能之防呆原則
- **UI 與資料庫分離**：Flex Message 的生成應獨立於資料庫讀寫之外 (例如參考 `rpgProfileFlexService.js`)。
- **箭頭函式陷阱**：微服務若有內部依賴的 Helper (如機率骰子 `pick()`)，應盡量寫在 Service 內部或提取至 `utils/`，避免因外部引用導致 `ReferenceError`。
- **避免循環依賴 (Circular Dependency)**：不同系統間若需調用資料，**絕對禁止 `handlers/A.js` 與 `handlers/B.js` 互相 require**。應統一由 `services/A_Service.js` 引用 `services/B_Service.js`。

### 效能優化建議：使用原生 MongoDB 聚合查詢
如果遇到跨系統的複雜排行榜 (如結合 `economy_users` 與 `rpg_stats`)，請停止使用 `db.collection('x').get()` 載入全部資料。
**正確示範 (Native MongoDB 寫法)：**
```javascript
const { getDb } = require('../utils/db');
const db = await getDb();
const docs = await db.collection('economy_users')
    .find({ isMafia: true })
    .sort({ crimeRecord: -1, wantedLevel: -1 })
    .limit(1)
    .toArray();
```

---

## 4. Middleware (中介軟體) 的運作機制
Pipeline 架構的執行順序如下：
1. Webhook 進來後，經過 `global.js` 的 `checkRateLimitMW`, `checkSpamMW` 等。
   - 若 Middleware 回傳 `true`，代表「已攔截」，將中斷後續執行。
   - 若回傳 `false`，代表「放行」，繼續進入下一個 Pipeline。
2. 進入 `router.js`，匹配到指令後，檢查 `options`。
3. 根據 `options` 決定要執行 `routeChecks.js` 的哪些規則（例如 `checkCasinoMW` 確保沒有警察在賭博）。
4. 最終執行對應的 Handler。

未來若要新增全域過濾器（例如：封鎖某個國家的 IP 等），只需在 `middlewares/global.js` 實作函式，並放入 `index.js` 的 Pipeline 陣列即可。
