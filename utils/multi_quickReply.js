/**
 * 多人賭桌專用的 Quick Reply 生成器
 */

function getQuickReply(table, gameType) {
    if (!table) return null;

    const items = [];

    if (gameType === '百家樂') {
        if (table.status === 'waiting') {
            items.push({ type: 'action', action: { type: 'message', label: '🟦 押閒 500萬', text: '押閒 5000000' } });
            items.push({ type: 'action', action: { type: 'message', label: '🟥 押莊 500萬', text: '押莊 5000000' } });
            items.push({ type: 'action', action: { type: 'message', label: '🟩 押和 500萬', text: '押和 5000000' } });
            items.push({ type: 'action', action: { type: 'message', label: '🔥 閒歐印', text: '押閒 歐印' } });
            items.push({ type: 'action', action: { type: 'message', label: '🔥 莊歐印', text: '押莊 歐印' } });
            items.push({ type: 'action', action: { type: 'message', label: '🃏 發牌', text: '發牌' } });
        }
    } else {
        // 21點, 炸金花, 牛牛, 射龍門, 十點半, 十八仔, 推筒子
        if (table.status === 'waiting') {
            items.push({ type: 'action', action: { type: 'message', label: '🔥 歐印', text: '歐印' } });
            items.push({ type: 'action', action: { type: 'message', label: '💰 押 100萬', text: '下注 1000000' } });
            items.push({ type: 'action', action: { type: 'message', label: '💰 押 1000萬', text: '下注 10000000' } });
            items.push({ type: 'action', action: { type: 'message', label: '💰 押 1億', text: '下注 100000000' } });
            items.push({ type: 'action', action: { type: 'message', label: '🃏 發牌', text: '發牌' } });
        } else if (table.status === 'playing') {
            if (gameType === '21點') {
                items.push({ type: 'action', action: { type: 'message', label: '👆 補牌', text: '+' } });
                items.push({ type: 'action', action: { type: 'message', label: '✋ 停牌', text: '-' } });
                items.push({ type: 'action', action: { type: 'message', label: '✌️ 雙倍下注', text: '雙倍下注' } });
                items.push({ type: 'action', action: { type: 'message', label: '🏳️ 投降', text: '投降' } });
            } else if (gameType === '十點半') {
                items.push({ type: 'action', action: { type: 'message', label: '👆 補牌', text: '+' } });
                items.push({ type: 'action', action: { type: 'message', label: '✋ 停牌', text: '-' } });
            } else if (gameType === '射龍門') {
                // 射龍門有撞柱、不撞柱的後續，但預設發送的可能不需要
            }
        }
    }

    if (items.length > 0) {
        return { items };
    }
    return null;
}

module.exports = {
    getQuickReply
};
