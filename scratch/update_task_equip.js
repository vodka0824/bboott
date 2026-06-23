# Phase 1: 監獄系統重構追蹤清單

- `[x]` 刪除現存的舊死碼微服務
- `[x]` 重新自 `handlers/jail.js` 抽離邏輯並建立新微服務
- `[x]` 搬移並重新命名 `handlers/jail_redemption.js` 為 `services/jailRedemptionService.js`
- `[x]` 重寫 `handlers/jail.js` 為 Facade 模式
- `[x]` 測試並驗證 Facade 導出之 API 與原先完全一致
- `[x]` 重啟伺服器並進行手動/語法測試

# Phase 2: 警察系統重構追蹤清單

- `[x]` 備份 `handlers/police.js`
- `[x]` 刪除現存的舊死碼微服務
- `[x]` 重新自 `handlers/police.js` 抽離邏輯並建立新微服務
- `[x]` 重寫 `handlers/police.js` 為 Facade 模式
- `[x]` 測試並驗證 Facade 導出之 API 與原先完全一致

# Phase 3: 裝備與抽獎系統重構追蹤清單

- `[ ]` 備份 `handlers/equipment.js`
- `[ ]` 刪除現存的舊死碼微服務
  - `[ ]` `services/equipmentForgeService.js`
  - `[ ]` `services/equipmentInfoService.js`
  - `[ ]` `services/equipmentShopService.js`
- `[ ]` 重新自 `handlers/equipment.js` 抽離邏輯並建立新微服務
  - `[ ]` 抽離 `equipmentCoreService.js` 
  - `[ ]` 抽離 `equipmentShopService.js`
  - `[ ]` 抽離 `equipmentManageService.js`
  - `[ ]` 抽離 `equipmentEnchantService.js`
- `[ ]` 重寫 `handlers/equipment.js` 為 Facade 模式
- `[ ]` 測試並驗證 Facade 導出之 API 與原先完全一致
