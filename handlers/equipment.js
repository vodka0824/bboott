// ==========================================
// Equipment Handler Facade (裝備系統門面)
// ==========================================
// 此檔案作為外部路由與內部微服務的橋樑。
// 原有的過多業務邏輯已拆分至 services/ 目錄下。
// 此架構確保了路由檔可以無縫升級，並且降低單一檔案的維護複雜度。
// ==========================================

const equipmentCoreService = require('../services/equipmentCoreService');
const equipmentShopService = require('../services/equipmentShopService');
const equipmentManageService = require('../services/equipmentManageService');
const equipmentEnchantService = require('../services/equipmentEnchantService');

module.exports = {
    EQUIP_TYPES: equipmentCoreService.EQUIP_TYPES,
    getEquipmentData: equipmentCoreService.getEquipmentData,
    getFinalEquipStat: equipmentCoreService.getFinalEquipStat,
    
    showEquipmentShop: equipmentShopService.showEquipmentShop,
    buyEquipment: equipmentShopService.buyEquipment,
    buyScrolls: equipmentShopService.buyScrolls,
    buyEquipmentPostback: equipmentShopService.buyEquipmentPostback,
    buyScrollsPostback: equipmentShopService.buyScrollsPostback,
    
    showMyEquipments: equipmentManageService.showMyEquipments,
    swapEquipmentPostback: equipmentManageService.swapEquipmentPostback,
    
    enchantEquipment: equipmentEnchantService.enchantEquipment,
    enchantEquipmentPostback: equipmentEnchantService.enchantEquipmentPostback,
    buyAndSafeEnchantPostback: equipmentEnchantService.buyAndSafeEnchantPostback
};
