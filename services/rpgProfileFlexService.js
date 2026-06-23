const { db } = require('../utils/db');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');

const DEFAULT_STATS = { level: 1, exp: 0, hp: 100, attack: 10, defense: 5 };

const { getOrInitPlayerStats, getPlayerTitle } = require('./rpgCoreService');
const { getFinalPlayerStats } = require('./rpgCombatStatService');

async function handleMyStats(context) {
    const { replyToken, groupId, userId } = context;

    // 取得玩家名稱與頭像
    let profile = { displayName: '未知玩家', pictureUrl: null };
    try {
        if (groupId) {
            profile = await lineUtils.getGroupMemberProfile(groupId, userId);
        } else {
            profile = await lineUtils.getProfile(userId);
        }
    } catch (e) {
        console.error('[RPG] Failed to fetch profile:', e.message);
    }

    const stats = await getFinalPlayerStats(userId);
    const { title, color } = getPlayerTitle(stats.level);

    // 取得真實職業身分
    const ecoDoc = await db.collection('economy_users').doc(userId).get();
    const ecoData = ecoDoc.exists ? ecoDoc.data() : {};
    const now = Date.now();
    
    const isJailed = !!(ecoData.jailedUntil && ecoData.jailedUntil > now);
    const isCouncilor = !!(ecoData.councilorUntil && ecoData.councilorUntil > now);
    const isPolice = !!(ecoData.isPolice === true);
    const isMilitary = !!(ecoData.militaryUntil && ecoData.militaryUntil > now);
    const isMafia = !!(ecoData.isMafia === true);

    let identityStr = '平民';
    if (isJailed) {
        identityStr = '⛓️ 監獄服刑中';
    } else if (isMilitary) {
        identityStr = '🪖 志願役軍人';
    } else if (isCouncilor) {
        identityStr = '👑 榮譽市議員';
    } else if (isPolice) {
        identityStr = '👮 執法警察';
    } else if (isMafia) {
        const profession = require('../handlers/profession');
        const mafiaRankId = await profession.getMafiaRank(userId, ecoData);
        if (mafiaRankId === 'boss') identityStr = '👑 黑道老大';
        else if (mafiaRankId === 'capo') identityStr = '🚬 黑幫堂主';
        else if (mafiaRankId === 'enforcer') identityStr = '🔪 黑道打手';
        else identityStr = '🚏 泊車小弟';
    }

    let finalTitle = title;
    if (title.includes(' ‧ ')) {
        const parts = title.split(' ‧ ');
        finalTitle = `${identityStr} ‧ ${parts[1]}`;
    } else {
        finalTitle = `${identityStr} ‧ ${title}`;
    }

    // 計算經驗值進度 (本級所需 ~ 下級所需)
    const currentLvlExp = 10 * Math.pow(stats.level, 2);
    const nextLvlExp = 10 * Math.pow(stats.level + 1, 2);
    const expNeeded = nextLvlExp - currentLvlExp;
    const expEarned = stats.chatExp - currentLvlExp;
    const progress = Math.min(100, Math.max(0, (expEarned / expNeeded) * 100));

    // 黑幫與犯罪資料
    const wantedLevel = ecoData.wantedLevel || 0;
    const crimeRecord = ecoData.crimeRecord || 0;
    const mafiaScore = Math.floor((wantedLevel * 100) + (crimeRecord * 5));

    // 建立屬性面板 Flex Message
    const flex = {
        type: 'bubble',
        size: 'mega',
        header: flexUtils.createHeader('📜 個人狀態面板', '', flexUtils.COLORS.PRIMARY),
        body: flexUtils.createBox('vertical', [
            // 頭像與名稱區塊
            flexUtils.createBox('horizontal', [
                profile.pictureUrl ? {
                    type: 'image',
                    url: profile.pictureUrl,
                    size: 'sm',
                    aspectRatio: '1:1',
                    aspectMode: 'cover',
                    flex: 1
                } : flexUtils.createText({ text: '👤', size: 'xl', flex: 1, align: 'center', gravity: 'center' }),
                flexUtils.createBox('vertical', [
                    // 名稱
                    flexUtils.createText({ text: profile.displayName, weight: 'bold', size: 'md', color: flexUtils.COLORS.TEXT_MAIN }),
                    // 稱號
                    flexUtils.createText({ text: finalTitle, size: 'xxs', color: color, weight: 'bold', margin: 'xs', wrap: true }),
                    // 戰鬥力（移至名稱下方）
                    flexUtils.createText({ text: `戰鬥力: ${stats.final.combatPower.toLocaleString()} ⚡`, size: 'sm', weight: 'bold', color: flexUtils.COLORS.SECONDARY, margin: 'xs' }),
                    // 等級 + EXP 同一行
                    flexUtils.createBox('horizontal', [
                        flexUtils.createText({ text: `Lv.${stats.level}`, size: 'xs', color: flexUtils.COLORS.TEXT_SUB, weight: 'bold', flex: 0 }),
                        flexUtils.createText({ text: `EXP: ${stats.chatExp} / ${nextLvlExp}`, size: 'xxs', color: flexUtils.COLORS.TEXT_MUTED, align: 'end', flex: 1 })
                    ], { margin: 'xs', alignItems: 'center' }),
                    // 等級進度條
                    flexUtils.createBox('vertical', [
                        flexUtils.createBox('vertical', [], { width: `${progress}%`, backgroundColor: color, height: '4px' })
                    ], { height: '4px', cornerRadius: '2px', backgroundColor: '#e3e4e6', margin: 'xs' })
                ], { flex: 3, margin: 'md', justifyContent: 'center' })
            ], { alignItems: 'center', margin: 'md' }),
            
            { type: 'separator', margin: 'lg' },
            
            // 屬性數值區塊（三排顯示）
            flexUtils.createBox('vertical', [
                // 第一排：攻擊 / 防禦 / 迴避
                flexUtils.createBox('horizontal', [
                    flexUtils.createBox('vertical', [
                        flexUtils.createText({ text: '⚔️ 攻擊', size: 'sm', color: '#c0392b', weight: 'bold' }),
                        flexUtils.createText({ text: `${stats.final.atk}`, size: 'md', color: '#333333', weight: 'bold', margin: 'xs' }),
                        flexUtils.createText({ text: `(+${stats.additions.atk}${stats.isCouncilor ? ' 戰神' : ''})`, size: 'xxs', color: flexUtils.COLORS.TEXT_MUTED })
                    ], { flex: 1, alignItems: 'center' }),
                    flexUtils.createBox('vertical', [
                        flexUtils.createText({ text: '🛡️ 防禦', size: 'sm', color: '#2980b9', weight: 'bold' }),
                        flexUtils.createText({ text: `${stats.final.def}`, size: 'md', color: '#333333', weight: 'bold', margin: 'xs' }),
                        flexUtils.createText({ text: `(+${stats.additions.def})`, size: 'xxs', color: flexUtils.COLORS.TEXT_MUTED })
                    ], { flex: 1, alignItems: 'center' }),
                    flexUtils.createBox('vertical', [
                        flexUtils.createText({ text: '🧭 迴避', size: 'sm', color: '#27ae60', weight: 'bold' }),
                        flexUtils.createText({ text: `${stats.final.eva}%`, size: 'md', color: '#333333', weight: 'bold', margin: 'xs' }),
                        flexUtils.createText({ text: `(+${stats.additions.eva}%)`, size: 'xxs', color: flexUtils.COLORS.TEXT_MUTED })
                    ], { flex: 1, alignItems: 'center' })
                ], { margin: 'md', justifyContent: 'space-between' }),
                // 第二排：爆擊 / 幸運 / 穿透
                flexUtils.createBox('horizontal', [
                    flexUtils.createBox('vertical', [
                        flexUtils.createText({ text: '💥 爆擊', size: 'sm', color: '#8e44ad', weight: 'bold' }),
                        flexUtils.createText({ text: `${stats.final.crit}%`, size: 'md', color: '#333333', weight: 'bold', margin: 'xs' }),
                        flexUtils.createText({ text: `(+${stats.additions.crit}%)`, size: 'xxs', color: flexUtils.COLORS.TEXT_MUTED })
                    ], { flex: 1, alignItems: 'center' }),
                    flexUtils.createBox('vertical', [
                        flexUtils.createText({ text: '🍀 幸運', size: 'sm', color: '#f39c12', weight: 'bold' }),
                        flexUtils.createText({ text: `${stats.final.luk}%`, size: 'md', color: '#333333', weight: 'bold', margin: 'xs' }),
                        flexUtils.createText({ text: `(+${stats.additions.luk}%)`, size: 'xxs', color: flexUtils.COLORS.TEXT_MUTED })
                    ], { flex: 1, alignItems: 'center' }),
                    flexUtils.createBox('vertical', [
                        flexUtils.createText({ text: '💍 穿透', size: 'sm', color: flexUtils.COLORS.ACCENT, weight: 'bold' }),
                        flexUtils.createText({ text: `${stats.final.pen}%`, size: 'md', color: flexUtils.COLORS.TEXT_MAIN, weight: 'bold', margin: 'xs' }),
                        flexUtils.createText({ text: `(+${stats.additions.pen}%)`, size: 'xxs', color: flexUtils.COLORS.TEXT_SUB })
                    ], { flex: 1, alignItems: 'center' })
                ], { margin: 'xl', justifyContent: 'space-between' })
            ], { margin: 'lg', backgroundColor: flexUtils.COLORS.BG_CARD, paddingAll: '10px', cornerRadius: '8px' }),
            
            { type: 'separator', margin: 'lg' },

            // 🚨 犯罪與黑幫資料區塊
            flexUtils.createBox('vertical', [
                flexUtils.createText({ text: '🚨 犯罪與黑幫狀態', size: 'xs', color: flexUtils.COLORS.TEXT_SUB, weight: 'bold', margin: 'sm' }),
                flexUtils.createBox('horizontal', [
                    flexUtils.createText({ 
                        text: `👮 前科: ${crimeRecord} 次`, 
                        size: 'xs', 
                        color: crimeRecord > 0 ? '#C62828' : flexUtils.COLORS.TEXT_MUTED, 
                        flex: 1 
                    }),
                    flexUtils.createText({ 
                        text: `🚨 通緝值: ${Math.floor(wantedLevel * 100)}%`, 
                        size: 'xs', 
                        color: wantedLevel > 0 ? '#D84315' : flexUtils.COLORS.TEXT_MUTED, 
                        flex: 1 
                    }),
                    flexUtils.createText({ 
                        text: `🕶️ 黑幫聲望: ${mafiaScore}`, 
                        size: 'xs', 
                        color: isMafia ? '#4A148C' : flexUtils.COLORS.TEXT_MUTED, 
                        flex: 1 
                    })
                ], { margin: 'md' })
            ], { margin: 'lg', backgroundColor: '#FFF3E0', paddingAll: '10px', cornerRadius: '8px', borderWidth: '1px', borderColor: '#FFB74D' }),
            
            { type: 'separator', margin: 'lg' },

            // 已穿戴裝備區塊
            flexUtils.createBox('vertical', [
                flexUtils.createText({ text: '🛡️ 已穿戴裝備', size: 'xs', color: flexUtils.COLORS.TEXT_SUB, weight: 'bold', margin: 'sm' }),
                flexUtils.createBox('horizontal', [
                    flexUtils.createText({ 
                        text: `⚔️ 武器: ${stats.equipments.weapon ? `+${stats.equipments.weapon.level} ${stats.equipments.weapon.name}` : '無'}`, 
                        size: 'xs', 
                        color: stats.equipments.weapon ? flexUtils.COLORS.TEXT_MAIN : flexUtils.COLORS.TEXT_MUTED, 
                        flex: 1 
                    }),
                    flexUtils.createText({ 
                        text: `🛡️ 盾牌: ${stats.equipments.shield ? `+${stats.equipments.shield.level} ${stats.equipments.shield.name}` : '無'}`, 
                        size: 'xs', 
                        color: stats.equipments.shield ? flexUtils.COLORS.TEXT_MAIN : flexUtils.COLORS.TEXT_MUTED, 
                        flex: 1 
                    })
                ], { margin: 'md' }),
                flexUtils.createBox('horizontal', [
                    flexUtils.createText({ 
                        text: `🧭 翅膀: ${stats.equipments.wings ? `+${stats.equipments.wings.level} ${stats.equipments.wings.name}` : '無'}`, 
                        size: 'xs', 
                        color: stats.equipments.wings ? '#333333' : flexUtils.COLORS.TEXT_SUB, 
                        flex: 1 
                    }),
                    flexUtils.createText({ 
                        text: `💥 手套: ${stats.equipments.gloves ? `+${stats.equipments.gloves.level} ${stats.equipments.gloves.name}` : '無'}`, 
                        size: 'xs', 
                        color: stats.equipments.gloves ? '#333333' : flexUtils.COLORS.TEXT_SUB, 
                        flex: 1 
                    })
                ], { margin: 'md' }),
                flexUtils.createBox('horizontal', [
                    flexUtils.createText({ 
                        text: `🍀 項鍊: ${stats.equipments.necklace ? `+${stats.equipments.necklace.level} ${stats.equipments.necklace.name}` : '無'}`, 
                        size: 'xs', 
                        color: stats.equipments.necklace ? '#333333' : flexUtils.COLORS.TEXT_SUB, 
                        flex: 1 
                    }),
                    flexUtils.createText({ 
                        text: `💍 戒指: ${stats.equipments.ring ? `+${stats.equipments.ring.level} ${stats.equipments.ring.name}` : '無'}`, 
                        size: 'xs', 
                        color: stats.equipments.ring ? '#333333' : flexUtils.COLORS.TEXT_SUB, 
                        flex: 1 
                    })
                ], { margin: 'md' })
            ], { margin: 'lg', backgroundColor: '#fdfefe', paddingAll: '10px', cornerRadius: '8px', borderWidth: '1px', borderColor: '#e3e4e6' }),
            

        ], { paddingAll: '15px', backgroundColor: flexUtils.COLORS.BG_MAIN })
    };

    const quickReply = {
        items: [
            { type: 'action', action: { type: 'message', label: '🛡️ 打開裝備', text: '裝備' } },
            { type: 'action', action: { type: 'message', label: '💰 查看錢包', text: '我的錢包' } }
        ]
    };

    await lineUtils.replyFlex(replyToken, '個人狀態面板', flex, [], quickReply);
}

module.exports = {
    handleMyStats
};
