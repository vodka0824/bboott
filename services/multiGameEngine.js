const { db } = require('../utils/db');
const tableManager = require('../handlers/multi_tableManager');
const atonementHandler = require('../handlers/atonement');
const economyHandler = require('../handlers/economy');
const { getGroupMemberName, replyText, addPendingMessage } = require('../utils/line');

class MultiGameEngine {
    constructor(gameType, gameName, autoCloseMinutes = 1) {
        this.gameType = gameType; // e.g. 'blackjack'
        this.gameName = gameName; // e.g. '21 嚙?
        this.autoCloseMinutes = autoCloseMinutes;
        this.activeTables = new Map(); // groupId -> table data
    }

    getActiveTable(groupId) {
        return this.activeTables.get(groupId);
    }

    async openTable(replyToken, context, initialTableData) {
        const { groupId, userId } = context;
        if (!groupId) {
await replyText(replyToken, '?航炊');
            return null;
        }

        if (await atonementHandler.checkDevilContract(userId)) {
await replyText(replyToken, '?航炊');
            return null;
        }

        if (tableManager.hasActiveTable(groupId)) {
await replyText(replyToken, '?航炊');
            return null;
        }

        if (this.activeTables.has(groupId)) {
await replyText(replyToken, '?航炊');
            return null;
        }

        this.activeTables.set(groupId, 'pending');

        const userDoc = await db.collection('economy_users').doc(userId).get();
        const balance = userDoc.exists ? (userDoc.data().kuCoin || 0) : 0;

        if (balance < 0) {
            this.activeTables.delete(groupId);
await replyText(replyToken, '?航炊');
            return null;
        }

        tableManager.lockTable(groupId, this.gameName);

        const userName = await getGroupMemberName(groupId, userId);
        const newWanted = await economyHandler.addWantedLevel(userId);
        
        const participantWantedLevels = new Map();
        participantWantedLevels.set(userId, { 
            wanted: newWanted, 
            isCouncilor: userDoc.exists && userDoc.data().councilorUntil > Date.now(),
            isMafia: userDoc.exists && userDoc.data().isMafia
        });

        const table = {
            groupId,
            dealerId: userId,
            dealerName: userName,
            status: 'waiting', // waiting, playing, closed
            players: new Map(), 
            participantWantedLevels,
/* fixed */
            timeout: setTimeout(() => this.autoCloseTable(groupId), this.autoCloseMinutes * 60 * 1000)
        };

        this.activeTables.set(groupId, table);
        return table;
    }

    async autoCloseTable(groupId) {
        const table = this.activeTables.get(groupId);
        if (!table || table === 'pending') return;

        if (table.status !== 'waiting') return; // Only auto-close if not started

        this.clearTable(groupId);
        console.log(`[MultiGameEngine - ${this.gameType}] Table in ${groupId} timed out.`);

        const refundedPlayers = [];
        const refundPromises = [];
        for (const [uid, p] of table.players.entries()) {
            refundPromises.push(economyHandler.addCoinFast(uid, p.bet));
            refundedPlayers.push({ name: p.name, bet: p.bet });
        }
        await Promise.all(refundPromises);

        let msg = `⚠️ 賭局自動解散\n${table.dealerName} 所開設的 ${this.gameName} 已超過 ${this.autoCloseMinutes} 分鐘無人參與，已自動關閉。`;
        
        if (refundedPlayers.length > 0) {
            msg += `\n\n已退款給以下玩家：`;
            for (const p of refundedPlayers) {
                msg += `\n- ${p.name}: ${p.bet.toLocaleString()} 庫幣`;
            }
        } else {
            msg += `\n(無玩家下注)`;
        }

        addPendingMessage(groupId, [{ type: 'text', text: msg }]);
    }

    async closeTable(replyToken, context) {
        const { groupId, userId } = context;
        const table = this.activeTables.get(groupId);

        if (!table || table === 'pending') {
await replyText(replyToken, '?航炊');
            return false;
        }

        if (table.dealerId !== userId) {
await replyText(replyToken, '?航炊');
            return false;
        }

        if (table.status !== 'waiting') {
await replyText(replyToken, '?航炊');
            return false;
        }

        this.clearTable(groupId);

        const refundPromises = [];
        for (const [uid, p] of table.players.entries()) {
            refundPromises.push(economyHandler.addCoinFast(uid, p.bet));
        }
        await Promise.all(refundPromises);

await replyText(replyToken, '?航炊');
        return true;
    }

    clearTable(groupId) {
        const table = this.activeTables.get(groupId);
        if (table && table.timeout) {
            clearTimeout(table.timeout);
        }
        this.activeTables.delete(groupId);
        tableManager.unlockTable(groupId);
    }
}

module.exports = MultiGameEngine;
