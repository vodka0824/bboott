// Overrides
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function() {
    const args = Array.prototype.slice.call(arguments);
    if (args[0] === '../utils/economy' || args[0] === './economy') {
        return {
            consumeCoin: async () => ({ success: true, newBalance: 1000 }),
            addCoinQuietly: async () => 1000,
            addWantedLevel: async () => 0.1,
            triggerPublicGamblingEvent: async () => null
        };
    }
    if (args[0] === '../utils/atonement' || args[0] === './atonement') {
        return {
            checkDevilContract: async () => false,
            processDevilTax: async () => ({ taxAmount: 0, finalProfit: 100, hasContract: false })
        };
    }
    if (args[0] === '../utils/line' || args[0] === './line') {
        return {
            replyText: async () => {},
            replyFlex: async () => {},
            replyToLine: async () => {},
            pushMessage: async () => {},
            addPendingMessage: () => {},
            getGroupMemberName: async (g, u) => "Player " + u
        };
    }
    if (args[0] === '../utils/flex' || args[0] === './flex') {
        return {
            createText: () => ({}),
            createSeparator: () => ({}),
            createBox: () => ({}),
            createBubble: () => ({}),
            createHeader: () => ({}),
            COLORS: { WIN: 'green' }
        };
    }
    if (args[0] === '../utils/db' || args[0] === './db') {
        return {
            db: {
                collection: () => ({
                    doc: () => ({
                        get: async () => ({ exists: true, data: () => ({ kuCoin: 10000 }) }),
                        set: async () => {}
                    })
                }),
                runTransaction: async (cb) => {
                    return await cb({
                        get: async () => ({ exists: true, data: () => ({ kuCoin: 10000 }) }),
                        update: () => {}
                    });
                },
                FieldValue: { increment: () => {} }
            }
        };
    }
    if (args[0] === '../config/constants') {
        return { CHANNEL_ACCESS_TOKEN: 'abc', ADMIN_USER_ID: 'admin' };
    }
    if (args[0] === '../utils/auth') {
        return { isSuperAdmin: () => false };
    }
    return originalRequire.apply(this, args);
};

const multiRedDogHandler = require('./handlers/multi_reddog');

async function runSimulation() {
    console.log("Starting simulation...");
    const groupId = 'group1';
    
    // 1. Open table
    await multiRedDogHandler.openTable('token', groupId, 'user1', '1000');
    console.log("Table opened");
    
    // 2. Join table
    await multiRedDogHandler.joinTable('token', groupId, 'user2');
    console.log("User 2 joined");
    
    // 3. Start table
    await multiRedDogHandler.startTable('token', groupId, 'user1');
    let table = multiRedDogHandler.getActiveTable(groupId);
    console.log(`Table started. Status: ${table.status}, Current player: ${table.players[table.currentPlayerIndex].userId}`);
    
    // Player 1 action
    let p1 = table.players[table.currentPlayerIndex].userId;
    console.log(`${p1} plays...`);
    let handled = await multiRedDogHandler.handlePlayerAction('token', groupId, p1, '射', '100');
    console.log(`Player 1 handled: ${handled}`);
    
    table = multiRedDogHandler.getActiveTable(groupId);
    if (table && table.status === 'playing') {
        if (table.currentPlayerIndex < table.players.length) {
            let p2 = table.players[table.currentPlayerIndex].userId;
            console.log(`${p2} plays...`);
            let handled2 = await multiRedDogHandler.handlePlayerAction('token', groupId, p2, '射', '100');
            console.log(`Player 2 handled: ${handled2}`);
        } else {
            console.log("Error: index out of bounds");
        }
    } else {
        console.log("Game ended early");
    }
    
    console.log("Simulation complete");
}

runSimulation().catch(console.error);
