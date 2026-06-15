const { db, Firestore } = require('../utils/db');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const worldcupView = require('../views/worldcupView');
const { getTeamWithFlag, generateTicketId } = require('../utils/worldcupUtils');
const userState = require('../utils/userState');

const MATCHES_COL = 'worldcup_matches';
const BETS_COL = 'worldcup_bets';
const ECONOMY_COL = 'economy_users';

async function openManualMatch(replyToken, adminId, args) {
    if (args.length < 11) {
        return lineUtils.replyText(replyToken, "❌ 格式錯誤。\n範例：/手動開盤 wc01 阿根廷 法國 1.5 2.0 3.0 2.5 1.8 1.8 1.9 1.9 (可選: 分鐘數)");
    }

    const [matchId, homeTeam, awayTeam, homeStr, awayStr, drawStr, lineStr, overStr, underStr, oddStr, evenStr, lockMinsStr] = args;

    const odds = {
        home: parseFloat(homeStr),
        away: parseFloat(awayStr),
        draw: parseFloat(drawStr),
        ouPoint: parseFloat(lineStr),
        over: parseFloat(overStr),
        under: parseFloat(underStr),
        odd: parseFloat(oddStr),
        even: parseFloat(evenStr)
    };

    let lockMinutes = lockMinsStr ? parseInt(lockMinsStr, 10) : 120;
    if (isNaN(lockMinutes)) lockMinutes = 120;

    const lockAtDate = new Date(Date.now() + lockMinutes * 60000);

    const matchData = {
        matchId,
        homeTeam,
        awayTeam,
        odds,
        status: 'open',
        createdAt: Firestore.FieldValue.serverTimestamp(),
        lockAt: lockAtDate.getTime(),
        createdBy: adminId
    };

    await db.collection(MATCHES_COL).doc(matchId).set(matchData);
    const bubble = worldcupView.buildOpenMatchBubble(matchData, lockAtDate);
    await lineUtils.replyFlex(replyToken, "📢 新盤口開放", bubble);
}

async function setHandicapMatch(replyToken, adminId, args) {
    if (args.length < 4) {
        return lineUtils.replyText(replyToken, "❌ 格式錯誤。\n範例：/設定讓分 wc01 -1.5 1.8 1.9");
    }

    const [matchId, handicapStr, homeOddsStr, awayOddsStr] = args;
    const docRef = db.collection(MATCHES_COL).doc(matchId);
    const doc = await docRef.get();

    if (!doc.exists) {
        return lineUtils.replyText(replyToken, `❌ 找不到賽事 ID：${matchId}`);
    }

    const matchData = doc.data();
    matchData.odds.handicapPoint = parseFloat(handicapStr);
    matchData.odds.hcHome = parseFloat(homeOddsStr);
    matchData.odds.hcAway = parseFloat(awayOddsStr);

    await docRef.update({ odds: matchData.odds });
    const lockAtDate = new Date(matchData.lockAt);
    const bubble = worldcupView.buildOpenMatchBubble(matchData, lockAtDate);
    await lineUtils.replyFlex(replyToken, "📢 盤口更新", bubble);
}

async function setMatchLockTime(replyToken, adminId, args) {
    if (args.length < 2) return lineUtils.replyText(replyToken, "❌ 格式錯誤。\n範例：/設定鎖盤 wc01 60 (代表60分鐘後鎖定)");
    const matchId = args[0];
    const mins = parseInt(args[1], 10);
    const docRef = db.collection(MATCHES_COL).doc(matchId);
    const doc = await docRef.get();
    if (!doc.exists) return lineUtils.replyText(replyToken, `❌ 找不到賽事 ID：${matchId}`);
    
    const lockAt = Date.now() + mins * 60000;
    await docRef.update({ lockAt });
    await lineUtils.replyText(replyToken, `✅ 賽事 ${matchId} 鎖盤時間已延長 ${mins} 分鐘。`);
}

async function lockMatch(replyToken, adminId, args) {
    if (args.length < 1) return lineUtils.replyText(replyToken, "❌ 格式錯誤。\n範例：/鎖盤運彩 wc01");
    const matchId = args[0];
    const docRef = db.collection(MATCHES_COL).doc(matchId);
    await docRef.update({ status: 'locked' });
    await lineUtils.replyText(replyToken, `✅ 賽事 ${matchId} 已手動鎖定。`);
}

async function settleMatch(replyToken, adminId, args) {
    if (args.length < 3) return lineUtils.replyText(replyToken, "❌ 格式錯誤。\n範例：/結算運彩 wc01 2 1");
    const matchId = args[0];
    const homeScore = parseInt(args[1], 10);
    const awayScore = parseInt(args[2], 10);
    
    const docRef = db.collection(MATCHES_COL).doc(matchId);
    const doc = await docRef.get();
    if (!doc.exists) return lineUtils.replyText(replyToken, `❌ 找不到賽事 ID：${matchId}`);
    const matchData = doc.data();
    if (matchData.status === 'settled') return lineUtils.replyText(replyToken, `❌ 賽事已經結算過了！`);

    // Determine results
    const totalScore = homeScore + awayScore;
    const isOdd = totalScore % 2 !== 0;
    
    let mainResult = '';
    if (homeScore > awayScore) mainResult = 'home';
    else if (awayScore > homeScore) mainResult = 'away';
    else mainResult = 'draw';

    let ouResult = '';
    if (matchData.odds.ouPoint !== undefined) {
        if (totalScore > matchData.odds.ouPoint) ouResult = 'over';
        else if (totalScore < matchData.odds.ouPoint) ouResult = 'under';
    }

    let oeResult = isOdd ? 'odd' : 'even';

    let hcResult = '';
    let isHcPush = false;
    if (matchData.odds.handicapPoint !== undefined) {
        const adjustedHomeScore = homeScore + matchData.odds.handicapPoint;
        if (adjustedHomeScore > awayScore) hcResult = 'hcHome';
        else if (adjustedHomeScore < awayScore) hcResult = 'hcAway';
        else {
            isHcPush = true; // 走水
        }
    }

    // Update match
    await docRef.update({ 
        status: 'settled',
        settleParams: { homeScore, awayScore, mainResult, ouResult, oeResult, hcResult, isHcPush }
    });

    // Process bets
    const betsSnapshot = await db.collection(BETS_COL).where('matchId', '==', matchId).where('status', '==', 'pending').get();
    
    let totalWinAmount = 0;
    let winnerCount = 0;
    let pushCount = 0;
    let loseCount = 0;

    const batch = db.batch();
    const notifications = []; // array of { userId, text }

    for (const betDoc of betsSnapshot.docs) {
        const bet = betDoc.data();
        let isWin = false;
        let isPush = false;
        
        if (bet.pred === mainResult || bet.pred === ouResult || bet.pred === oeResult) {
            isWin = true;
        } else if (bet.pred === 'hcHome' || bet.pred === 'hcAway') {
            if (isHcPush) isPush = true;
            else if (bet.pred === hcResult) isWin = true;
        }

        if (isWin) {
            const winAmount = Math.floor(bet.amount * bet.lockedOdds);
            totalWinAmount += winAmount - bet.amount;
            winnerCount++;
            batch.update(betDoc.ref, { status: 'won', settleResult: 'win', potentialWin: winAmount });
            batch.update(db.collection(ECONOMY_COL).doc(bet.userId), {
                kuCoin: Firestore.FieldValue.increment(winAmount)
            });
            notifications.push({ userId: bet.userId, text: `🎉 您的運彩 [${matchData.homeTeam} VS ${matchData.awayTeam}] 押注【${bet.predLabel}】獲勝！贏得 ${winAmount} 哭幣！` });
        } else if (isPush) {
            pushCount++;
            batch.update(betDoc.ref, { status: 'push', settleResult: 'push', potentialWin: bet.amount });
            batch.update(db.collection(ECONOMY_COL).doc(bet.userId), {
                kuCoin: Firestore.FieldValue.increment(bet.amount)
            });
            notifications.push({ userId: bet.userId, text: `🛡️ 您的運彩 [${matchData.homeTeam} VS ${matchData.awayTeam}] 押注【${bet.predLabel}】因走水退還 ${bet.amount} 哭幣。` });
        } else {
            loseCount++;
            batch.update(betDoc.ref, { status: 'lost', settleResult: 'lose' });
            notifications.push({ userId: bet.userId, text: `😢 您的運彩 [${matchData.homeTeam} VS ${matchData.awayTeam}] 押注【${bet.predLabel}】未中獎。` });
        }
    }

    await batch.commit();

    // Send notifications in background
    for (const notif of notifications) {
        lineUtils.pushMessage(notif.userId, [{ type: 'text', text: notif.text }]).catch(() => {});
    }

    const stats = { winnerCount, pushCount, loseCount, totalWinAmount };
    const bubble = worldcupView.buildSettleReportBubble(matchId, homeScore, awayScore, stats, getTeamWithFlag);
    await lineUtils.replyFlex(replyToken, "🏆 賽事結算報告", bubble);
}

async function showMatches(replyToken, page = 1) {
    const limit = 5;
    const snapshot = await db.collection(MATCHES_COL).where('status', '==', 'open').get();
    const docs = snapshot.docs;

    if (docs.length === 0) {
        return lineUtils.replyText(replyToken, "ℹ️ 目前沒有開放下注的賽事！");
    }

    const now = Date.now();
    const activeMatches = docs.map(d => d.data()).filter(m => m.lockAt > now);

    if (activeMatches.length === 0) {
        return lineUtils.replyText(replyToken, "ℹ️ 所有賽事皆已鎖盤！");
    }

    const totalPages = Math.ceil(activeMatches.length / limit);
    const currentMatches = activeMatches.slice((page - 1) * limit, page * limit);

    const contents = currentMatches.map(m => worldcupView.buildShowMatchBubble(m, 0, 0)); // passing dummy counts for now
    
    if (page < totalPages) {
        contents.push(worldcupView.buildPaginationBubble(page + 1, totalPages, 'show_wc_page'));
    } else {
        contents.push(worldcupView.buildShowMatchesEndCard());
    }

    await lineUtils.replyFlex(replyToken, "🏆 運彩大廳", {
        type: 'carousel',
        contents: contents
    });
}

async function manageMatches(replyToken, adminId) {
    const snapshot = await db.collection(MATCHES_COL).where('status', 'in', ['open', 'locked']).get();
    if (snapshot.empty) return lineUtils.replyText(replyToken, "目前沒有進行中或已鎖盤的賽事。");

    const contents = snapshot.docs.map(d => worldcupView.buildManageMatchBubble(d.data(), 0, 0));
    await lineUtils.replyFlex(replyToken, "🛡️ 賽事管理", {
        type: 'carousel',
        contents: contents.slice(0, 12)
    });
}

async function handleBetPostback(replyToken, userId, dataObj) {
    const { matchId, pred } = dataObj;
    const docRef = db.collection(MATCHES_COL).doc(matchId);
    const doc = await docRef.get();

    if (!doc.exists) return lineUtils.replyText(replyToken, "❌ 賽事不存在。");
    const matchData = doc.data();

    if (matchData.status !== 'open' || Date.now() > matchData.lockAt) {
        return lineUtils.replyText(replyToken, "❌ 此賽事已鎖盤，停止下注。");
    }

    let lockedOdds = 0;
    let predLabel = '';
    const odds = matchData.odds;

    switch (pred) {
        case 'home': lockedOdds = odds.home; predLabel = '主勝'; break;
        case 'away': lockedOdds = odds.away; predLabel = '客勝'; break;
        case 'draw': lockedOdds = odds.draw; predLabel = '和局'; break;
        case 'over': lockedOdds = odds.over; predLabel = `大 (${odds.ouPoint})`; break;
        case 'under': lockedOdds = odds.under; predLabel = `小 (${odds.ouPoint})`; break;
        case 'odd': lockedOdds = odds.odd; predLabel = '單數'; break;
        case 'even': lockedOdds = odds.even; predLabel = '雙數'; break;
        case 'hcHome': lockedOdds = odds.hcHome; predLabel = `讓主 (${odds.handicapPoint > 0 ? '+' : ''}${odds.handicapPoint})`; break;
        case 'hcAway': lockedOdds = odds.hcAway; predLabel = `讓客 (${odds.handicapPoint > 0 ? '-' : '+'}${Math.abs(odds.handicapPoint)})`; break;
    }

    if (!lockedOdds) return lineUtils.replyText(replyToken, "❌ 賠率錯誤，無法下注。");

    const state = {
        action: 'waiting_wc_bet_amount',
        matchId,
        pred,
        predLabel,
        lockedOdds,
        homeTeam: matchData.homeTeam,
        awayTeam: matchData.awayTeam,
        ts: Date.now()
    };

    await userState.setUserState(userId, state);
    await lineUtils.replyText(replyToken, `⚽ 您準備下注 [${matchData.homeTeam} VS ${matchData.awayTeam}]\n👉 預測項目：【${predLabel}】(賠率 ${lockedOdds})\n\n請直接輸入欲下注的「哭幣金額」：`);
}

async function processBetAmount(replyToken, groupId, userId, amountStr, state) {
    const amount = parseInt(amountStr, 10);
    if (isNaN(amount) || amount <= 0) {
        return lineUtils.replyText(replyToken, "❌ 金額無效，請重新輸入。");
    }

    const userDoc = await db.collection(ECONOMY_COL).doc(userId).get();
    const balance = userDoc.exists ? (userDoc.data().kuCoin || 0) : 0;

    if (balance < amount) {
        await userState.clearUserState(userId);
        return lineUtils.replyText(replyToken, `❌ 您的哭幣餘額不足！(餘額: ${balance})`);
    }

    state.amount = amount;
    state.action = 'waiting_wc_bet_confirm';
    await userState.setUserState(userId, state);

    const ticketId = generateTicketId();
    state.ticketId = ticketId;

    const potentialWin = Math.floor(amount * state.lockedOdds);
    const bubble = worldcupView.buildBetSlipBubble(ticketId, state.homeTeam, state.awayTeam, state.predLabel, state.lockedOdds, amount, potentialWin, getTeamWithFlag);
    
    await lineUtils.replyFlex(replyToken, "🎟️ 確認下注", bubble);
}

async function processBetConfirm(replyToken, groupId, userId, confirmStr, state) {
    if (confirmStr !== 'yes') {
        await userState.clearUserState(userId);
        return lineUtils.replyText(replyToken, "❌ 已取消下注。");
    }

    const docRef = db.collection(MATCHES_COL).doc(state.matchId);
    const doc = await docRef.get();
    if (!doc.exists) {
        await userState.clearUserState(userId);
        return lineUtils.replyText(replyToken, "❌ 賽事已不存在。");
    }

    const matchData = doc.data();
    if (matchData.status !== 'open' || Date.now() > matchData.lockAt) {
        await userState.clearUserState(userId);
        return lineUtils.replyText(replyToken, "❌ 抱歉，此賽事已經鎖盤，無法接受新的下注。");
    }

    // 再次確認餘額並扣款
    try {
        await db.runTransaction(async (t) => {
            const userRef = db.collection(ECONOMY_COL).doc(userId);
            const userSnap = await t.get(userRef);
            const currentBal = userSnap.exists ? (userSnap.data().kuCoin || 0) : 0;

            if (currentBal < state.amount) {
                throw new Error("餘額不足");
            }

            t.update(userRef, { kuCoin: Firestore.FieldValue.increment(-state.amount) });

            const betRef = db.collection(BETS_COL).doc();
            t.set(betRef, {
                ticketId: state.ticketId || generateTicketId(),
                matchId: state.matchId,
                userId: userId,
                amount: state.amount,
                pred: state.pred,
                predLabel: state.predLabel,
                lockedOdds: state.lockedOdds,
                createdAt: Firestore.FieldValue.serverTimestamp(),
                status: 'pending' // pending, won, lost, push
            });
        });

        await userState.clearUserState(userId);
        await lineUtils.replyText(replyToken, `✅ 下注成功！\n賽事：${state.homeTeam} VS ${state.awayTeam}\n預測：${state.predLabel}\n投入：${state.amount} 哭幣\n\n祝您中獎！可輸入「我的運彩」查看注單。`);
    } catch (e) {
        await userState.clearUserState(userId);
        await lineUtils.replyText(replyToken, `❌ 下注失敗：${e.message}`);
    }
}

async function myBets(replyToken, userId, page = 1) {
    const limit = 5;
    const snapshot = await db.collection(BETS_COL)
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .get();

    if (snapshot.empty) {
        return lineUtils.replyText(replyToken, "ℹ️ 您目前沒有任何運彩紀錄。");
    }

    const totalPages = Math.ceil(snapshot.size / limit);
    const bets = snapshot.docs.map(d => d.data());
    const currentBets = bets.slice((page - 1) * limit, page * limit);

    // Group bets into a carousel
    // This isn't using buildMyBetsSummaryBubble yet, just individual bubbles
    const contents = currentBets.map(b => worldcupView.buildMyBetBubble(b, new Date(b.createdAt.toMillis()).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }), getTeamWithFlag, generateTicketId));
    
    if (page < totalPages) {
        contents.push(worldcupView.buildPaginationBubble(page + 1, totalPages, 'my_bets_page'));
    }

    await lineUtils.replyFlex(replyToken, "🎫 我的運彩", {
        type: 'carousel',
        contents: contents
    });
}

async function matchDetails(replyToken, userId, args) {
    // optional stub
}

async function handleAdminPostback(replyToken, userId, dataObj) {
    const { cmd, matchId } = dataObj;
    const docRef = db.collection(MATCHES_COL).doc(matchId);
    const doc = await docRef.get();

    if (!doc.exists) {
        return lineUtils.replyText(replyToken, `❌ 賽事 ${matchId} 不存在。`);
    }

    if (cmd === 'lock') {
        await docRef.update({ status: 'locked' });
        await lineUtils.replyText(replyToken, `✅ 賽事 ${matchId} 已手動鎖盤。`);
    } else if (cmd === 'unlock') {
        await docRef.update({ status: 'open' });
        await lineUtils.replyText(replyToken, `✅ 賽事 ${matchId} 已重新開放下注。`);
    } else if (cmd === 'delete') {
        // Refund all pending bets for this match
        const betsSnapshot = await db.collection(BETS_COL).where('matchId', '==', matchId).where('status', '==', 'pending').get();
        if (!betsSnapshot.empty) {
            const batch = db.batch();
            for (const betDoc of betsSnapshot.docs) {
                const bet = betDoc.data();
                batch.update(db.collection(ECONOMY_COL).doc(bet.userId), {
                    kuCoin: Firestore.FieldValue.increment(bet.amount)
                });
                batch.delete(betDoc.ref);
                // optionally notify user
                lineUtils.pushMessage(bet.userId, [{ type: 'text', text: `⚠️ 賽事 ${matchId} 已被管理員刪除，您下注的 ${bet.amount} 哭幣已退還。` }]).catch(() => {});
            }
            await batch.commit();
        }
        await docRef.delete();
        await lineUtils.replyText(replyToken, `🗑️ 賽事 ${matchId} 及相關未結算注單已全數刪除並退還本金。`);
    }
}

module.exports = {
    openManualMatch,
    setHandicapMatch,
    setMatchLockTime,
    lockMatch,
    settleMatch,
    showMatches,
    manageMatches,
    handleBetPostback,
    handleAdminPostback,
    processBetAmount,
    processBetConfirm,
    myBets,
    matchDetails
};
