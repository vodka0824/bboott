const { db, Firestore } = require('../utils/db');
const authUtils = require('../utils/auth');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const { COLORS } = flexUtils;

// === Cache Layer ===
const KEYWORD_CACHE = new Map();
const CACHE_TTL = 60 * 1000;

async function getCachedKeywords(groupId) {
    const now = Date.now();
    const cached = KEYWORD_CACHE.get(groupId);

    if (cached && (now - cached.timestamp < CACHE_TTL)) {
        return cached.keywords;
    }

    try {
        const snapshot = await db.collection('auctions')
            .where('groupId', '==', groupId)
            .where('active', '==', true)
            .get();

        const keywords = new Set();
        snapshot.forEach(doc => keywords.add(doc.data().keyword));

        KEYWORD_CACHE.set(groupId, { keywords, timestamp: now });
        return keywords;
    } catch (e) {
        console.error('[Auction] Cache Fetch Error:', e);
        return new Set();
    }
}

function invalidateCache(groupId) {
    KEYWORD_CACHE.delete(groupId);
}

// 1. 開始競標
async function startAuction(replyToken, groupId, userId, item, basePriceStr, durationStr, keyword) {
    if (!authUtils.isSuperAdmin(userId)) {
        await lineUtils.replyText(replyToken, '❌ 只有超級管理員可以使用發起競標功能');
        return;
    }

    const duration = parseInt(durationStr);
    const price = parseInt(basePriceStr);

    if (isNaN(duration) || duration <= 0) {
        await lineUtils.replyText(replyToken, '⚠️ 競標時間必須是正整數（分鐘）');
        return;
    }
    if (isNaN(price) || price < 0) {
        await lineUtils.replyText(replyToken, '⚠️ 起標價必須是正整數或 0');
        return;
    }

    try {
        const snapshot = await db.collection('auctions')
            .where('groupId', '==', groupId)
            .where('keyword', '==', keyword)
            .where('active', '==', true)
            .get();

        if (!snapshot.empty) {
            await lineUtils.replyText(replyToken, `⚠️ 目前已經有相同關鍵字「${keyword}」的競標正在進行中`);
            return;
        }

        const now = Date.now();
        const endTime = now + duration * 60 * 1000;

        await db.collection('auctions').doc().set({
            groupId,
            item,
            basePrice: price,
            duration,
            endTime,
            keyword,
            active: true,
            createdAt: now,
            createdBy: userId,
            highestBid: price,
            highestBidder: null,
            bids: []
        });

        invalidateCache(groupId);

        const bubble = flexUtils.createBubble({
            size: 'kilo',
            header: flexUtils.createHeader('⚖️ 頂級拍賣會開始', '', '#1A1A1A', '#D4AF37'),
            body: flexUtils.createBox('vertical', [
                flexUtils.createText({ text: `${item}`, size: 'xxl', weight: 'bold', color: '#1A1A1A', wrap: true, align: 'center' }),
                flexUtils.createSeparator('lg'),
                flexUtils.createBox('vertical', [
                    flexUtils.createBox('horizontal', [
                        flexUtils.createText({ text: '💰 起標價', size: 'sm', color: '#333333', weight: 'bold', flex: 0 }),
                        flexUtils.createText({ text: `${price.toLocaleString()}`, size: 'md', color: '#8B6508', weight: 'bold', flex: 1, align: 'end' })
                    ]),
                    flexUtils.createBox('horizontal', [
                        flexUtils.createText({ text: '⏱️ 限時', size: 'sm', color: '#333333', weight: 'bold', flex: 0 }),
                        flexUtils.createText({ text: `${duration} 分鐘`, size: 'sm', color: '#1A1A1A', weight: 'bold', flex: 1, align: 'end' })
                    ], { margin: 'sm' })
                ], { margin: 'md', backgroundColor: '#F5F5F5', paddingAll: '15px', cornerRadius: '10px' }),
                flexUtils.createSeparator('lg'),
                flexUtils.createText({ text: `請輸入「${keyword} [金額]」來出價！`, size: 'sm', weight: 'bold', color: '#1A1A1A', align: 'center', margin: 'md', wrap: true })
            ], { paddingAll: '15px' }),
            footer: flexUtils.createBox('vertical', [
                flexUtils.createButton({
                    action: { type: 'message', label: `快速加碼 ($10)`, text: `${keyword} +10` },
                    style: 'primary',
                    color: '#1A1A1A'
                })
            ])
        });

        await lineUtils.replyFlex(replyToken, `🔨 競標開始：${item}`, bubble);
    } catch (e) {
        console.error('[Auction] Start Error:', e);
        await lineUtils.replyText(replyToken, '❌ 發起競標失敗，請重試');
    }
}

// 2. 檢查關鍵字
async function checkAuctionKeyword(groupId, text) {
    if (!text || typeof text !== 'string') return false;
    
    const args = text.trim().split(/\s+/);
    if (args.length < 2) return false;
    
    const possibleKeyword = args[0];
    const keywords = await getCachedKeywords(groupId);
    return keywords.has(possibleKeyword);
}

// 3. 出價
async function placeBid(groupId, userId, text) {
    const args = text.trim().split(/\s+/);
    if (args.length < 2) return null;

    const keyword = args[0];
    const bidAmountStr = args[1];
    
    let parsedAmount;
    let isRelative = false;

    if (bidAmountStr.startsWith('+')) {
        isRelative = true;
        parsedAmount = parseInt(bidAmountStr.substring(1));
    } else {
        parsedAmount = parseInt(bidAmountStr);
    }

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return { success: false, message: '⚠️ 出價金額必須是整數' };
    }

    const snapshot = await db.collection('auctions')
        .where('groupId', '==', groupId)
        .where('keyword', '==', keyword)
        .where('active', '==', true)
        .limit(1)
        .get();

    if (snapshot.empty) {
        return null;
    }

    const doc = snapshot.docs[0];
    const docRef = doc.ref;

    const bidderName = await lineUtils.getGroupMemberName(groupId, userId) || '未知買家';

    try {
        return await db.runTransaction(async (t) => {
            const freshDoc = await t.get(docRef);
            if (!freshDoc.exists || !freshDoc.data().active) {
                return { success: false, message: '❌ 該競標活動已結束' };
            }

            const data = freshDoc.data();

            if (Date.now() > data.endTime) {
                return { success: false, message: '⏰ 競標時間已到，等待管理員結標中' };
            }

            let finalBidAmount = parsedAmount;
            if (isRelative) {
                finalBidAmount = data.highestBid + parsedAmount;
            }

            if (finalBidAmount <= data.highestBid) {
                if (finalBidAmount === data.highestBid) {
                    return { success: false, message: `⚠️ 出價失敗：目前最高價已經是 $，請出更高的價格！` };
                }
                return { success: false, message: `⚠️ 出價失敗：金額必須大於目前最高價 ${data.highestBid.toLocaleString()}` };
            }

            const now = Date.now();
            const bidData = { userId, amount: finalBidAmount, timestamp: now };

            t.update(docRef, {
                highestBid: finalBidAmount,
                highestBidder: userId,
                bids: Firestore.FieldValue.arrayUnion(bidData)
            });

            const remainingMs = data.endTime - now;
            let statusText = '';
            let statusColor = '#333333';
            if (remainingMs <= 0) {
                statusText = '已結束結算中';
                statusColor = '#D32F2F';
            } else if (remainingMs <= 60000) {
                statusText = `⏳ 剩餘約 ${Math.ceil(remainingMs / 1000)} 秒`;
                statusColor = '#D32F2F';
            } else {
                statusText = `⏳ 剩餘約 ${Math.ceil(remainingMs / 60000)} 分鐘`;
                statusColor = '#4CAF50';
            }

            const bubble = flexUtils.createBubble({
                size: 'kilo',
                header: flexUtils.createHeader('✅ 出價成功', '', '#4CAF50', '#FFFFFF'),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `${data.item}`, size: 'xl', weight: 'bold', color: '#1A1A1A', wrap: true, align: 'center' }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createBox('vertical', [
                        flexUtils.createBox('horizontal', [
                            flexUtils.createText({ text: '🔥 最新出價', size: 'sm', color: '#333333', weight: 'bold', flex: 0 }),
                            flexUtils.createText({ text: `${finalBidAmount.toLocaleString()}`, size: 'sm', color: '#D32F2F', weight: 'bold', flex: 1, align: 'end' })
                        ], { margin: 'sm' }),
                        flexUtils.createBox('horizontal', [
                            flexUtils.createText({ text: '🙋‍♂️ 最高買家', size: 'sm', color: '#333333', weight: 'bold', flex: 0 }),
                            flexUtils.createText({ text: bidderName, size: 'xs', color: '#1A1A1A', weight: 'bold', flex: 1, align: 'end', wrap: true })
                        ], { margin: 'sm' }),
                        flexUtils.createBox('horizontal', [
                            flexUtils.createText({ text: '狀態', size: 'sm', color: '#333333', weight: 'bold', flex: 0 }),
                            flexUtils.createText({ text: statusText, size: 'xs', color: statusColor, weight: 'bold', flex: 1, align: 'end' })
                        ], { margin: 'sm' })
                    ], { margin: 'md', backgroundColor: '#F5F5F5', paddingAll: '15px', cornerRadius: '10px' })
                ], { paddingAll: '15px' }),
                footer: flexUtils.createBox('vertical', [
                    flexUtils.createButton({
                        action: { type: 'message', label: `快速加碼 ($10)`, text: `${data.keyword} +10` },
                        style: 'primary', color: '#1E90FF', margin: 'sm'
                    }),
                    flexUtils.createButton({
                        action: { type: 'message', label: `快速加碼 ($50)`, text: `${data.keyword} +50` },
                        style: 'secondary', margin: 'sm'
                    })
                ], { spacing: 'sm' })
            });

            return {
                success: true,
                message: `✅ 出價成功！\n目前最高價更新為：${finalBidAmount.toLocaleString()}`,
                bubble
            };
        });
    } catch (e) {
        console.error('[Auction] Bid Error:', e);
        return { success: false, message: '❌ 出價系統發生錯誤，請重試' };
    }
}
// 3.5 顯式出價
async function placeBidExplicit(replyToken, groupId, userId, bidAmountStr) {
    try {
        const snapshot = await db.collection('auctions')
            .where('groupId', '==', groupId)
            .where('active', '==', true)
            .get();

        if (snapshot.empty) {
            await lineUtils.replyText(replyToken, '❌ 目前沒有進行中的拍賣');
            return;
        }

        if (snapshot.size > 1) {
            await lineUtils.replyText(replyToken, '⚠️ 目前有多個拍賣進行中，請直接使用關鍵字出價（例如：蘋果 100）');
            return;
        }

        const keyword = snapshot.docs[0].data().keyword;
        const result = await placeBid(groupId, userId, `${keyword} ${bidAmountStr}`);
        
        if (result) {
            if (result.success && result.bubble) {
                await lineUtils.replyFlex(replyToken, result.message, result.bubble);
            } else if (result.message) {
                await lineUtils.replyText(replyToken, result.message);
            }
        }
    } catch (e) {
        console.error('[Auction] placeBidExplicit Error:', e);
        await lineUtils.replyText(replyToken, '❌ 出價系統錯誤，請重試');
    }
}


// 4. 手動結標
async function endAuction(replyToken, groupId, userId, itemName) {
    if (!authUtils.isSuperAdmin(userId)) {
        await lineUtils.replyText(replyToken, '❌ 只有超級管理員可以手動結標');
        return;
    }

    let snapshot;
    if (itemName) {
        snapshot = await db.collection('auctions')
            .where('groupId', '==', groupId)
            .where('item', '==', itemName)
            .where('active', '==', true)
            .limit(1)
            .get();
    } else {
        snapshot = await db.collection('auctions')
            .where('groupId', '==', groupId)
            .where('active', '==', true)
            .get();
    }

    if (snapshot.empty) {
        if (itemName) {
            await lineUtils.replyText(replyToken, `❌ 找不到與「${itemName}」相關的進行中競標活動`);
        } else {
            await lineUtils.replyText(replyToken, '❌ 目前沒有進行中的拍賣');
        }
        return;
    }
    
    if (!itemName && snapshot.size > 1) {
        await lineUtils.replyText(replyToken, '⚠️ 目前有多個拍賣進行中，請明確指定要結束的物品名稱（結束拍賣 物品名稱）');
        return;
    }

    const doc = snapshot.docs[0];
    const docRef = doc.ref;

    try {
        const messages = await db.runTransaction(async (t) => {
            const freshDoc = await t.get(docRef);
            if (!freshDoc.exists || !freshDoc.data().active) {
                return [{ type: 'text', text: '❌ 該競標活動已經結標' }];
            }

            const data = freshDoc.data();
            t.update(docRef, { active: false });

            if (!data.highestBidder) {
                return [{ type: 'text', text: `「${data.item}」流標了 🍂\n因為沒有任何人出價！` }];
            }

            const winnerName = await lineUtils.getGroupMemberName(groupId, data.highestBidder) || '某位買家';

            const substitution = {
                "winner": {
                    type: "mention",
                    mentionee: { type: "user", userId: data.highestBidder }
                }
            };

            const bubble = flexUtils.createBubble({
                size: 'kilo',
                header: flexUtils.createHeader('🎉 拍賣結標', '', '#1A1A1A', '#D4AF37'),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `${data.item}`, size: 'xl', weight: 'bold', color: '#1A1A1A', wrap: true, align: 'center' }),
                    flexUtils.createSeparator('lg'),
                    flexUtils.createText({ text: '⭐ 最終結標價 ⭐', size: 'sm', color: '#333333', weight: 'bold', align: 'center', margin: 'md' }),
                    flexUtils.createText({ text: `${data.highestBid.toLocaleString()}`, size: 'xxl', weight: 'bold', color: '#8B6508', align: 'center', margin: 'sm' }),
                    flexUtils.createSeparator('lg'),
                    flexUtils.createText({ text: '👑 得標者', size: 'sm', color: '#333333', weight: 'bold', align: 'center', margin: 'md' }),
                    flexUtils.createText({ text: `${winnerName}`, size: 'lg', weight: 'bold', color: '#1A1A1A', align: 'center', margin: 'sm' })
                ], { paddingAll: '15px' })
            });

            return [
                { type: 'flex', altText: `🎉 結標！恭喜得標「${data.item}」`, contents: bubble },
                {
                    type: 'textV2',
                    text: `恭喜 {winner} 成功標下！`,
                    substitution: substitution
                }
            ];
        });

        invalidateCache(groupId);
        await lineUtils.replyToLine(replyToken, messages);

    } catch (e) {
        console.error('[Auction] End Error:', e);
        await lineUtils.replyText(replyToken, '結標失敗，系統發生錯誤');
    }
}

// 5. 查詢競標狀態
async function checkAuctionStatus(replyToken, groupId) {
    try {
        const snapshot = await db.collection('auctions')
            .where('groupId', '==', groupId)
            .where('active', '==', true)
            .get();

        if (snapshot.empty) {
            await lineUtils.replyText(replyToken, '目前群組內沒有正在進行的拍賣。');
            return;
        }

        const now = Date.now();
        const auctions = snapshot.docs.map(doc => doc.data());
        
        // Build flex message carousel
        const contents = [];
        for (const data of auctions) {
            let statusText = '';
            let statusColor = '#333333';
            if (now > data.endTime) {
                statusText = '⏳ 等待結標中';
                statusColor = '#FF5722';
            } else {
                const remainingMinutes = Math.ceil((data.endTime - now) / 60000);
                statusText = `⏳ 剩餘約 ${remainingMinutes} 分鐘`;
                statusColor = '#4CAF50';
            }
            
            let bidderName = '無人出價';
            if (data.highestBidder) {
                bidderName = await lineUtils.getGroupMemberName(groupId, data.highestBidder) || '未知買家';
            }

            contents.push(flexUtils.createBubble({
                size: 'kilo',
                header: flexUtils.createHeader('⚖️ 拍賣狀態', '', '#1A1A1A', '#D4AF37'),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `${data.item}`, size: 'xl', weight: 'bold', color: '#1A1A1A', wrap: true, align: 'center' }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createBox('vertical', [
                        flexUtils.createBox('horizontal', [
                            flexUtils.createText({ text: '🔑 關鍵字', size: 'sm', color: '#333333', weight: 'bold', flex: 0 }),
                            flexUtils.createText({ text: data.keyword, size: 'sm', color: '#8B6508', weight: 'bold', flex: 1, align: 'end' })
                        ]),
                        flexUtils.createBox('horizontal', [
                            flexUtils.createText({ text: '🔥 最高出價', size: 'sm', color: '#333333', weight: 'bold', flex: 0 }),
                            flexUtils.createText({ text: `${data.highestBid.toLocaleString()}`, size: 'sm', color: '#D32F2F', weight: 'bold', flex: 1, align: 'end' })
                        ], { margin: 'sm' }),
                        flexUtils.createBox('horizontal', [
                            flexUtils.createText({ text: '🙋‍♂️ 最高買家', size: 'sm', color: '#333333', weight: 'bold', flex: 0 }),
                            flexUtils.createText({ text: bidderName, size: 'xs', color: '#1A1A1A', weight: 'bold', flex: 1, align: 'end', wrap: true })
                        ], { margin: 'sm' }),
                        flexUtils.createBox('horizontal', [
                            flexUtils.createText({ text: '狀態', size: 'sm', color: '#333333', weight: 'bold', flex: 0 }),
                            flexUtils.createText({ text: statusText, size: 'xs', color: statusColor, weight: 'bold', flex: 1, align: 'end' })
                        ], { margin: 'sm' })
                    ], { margin: 'md', backgroundColor: '#F5F5F5', paddingAll: '15px', cornerRadius: '10px' })
                ], { paddingAll: '15px' }),
                footer: flexUtils.createBox('vertical', [
                    flexUtils.createButton({
                        action: { type: 'message', label: `快速加碼 ($10)`, text: `${data.keyword} +10` },
                        style: 'primary', color: '#1E90FF', margin: 'sm'
                    }),
                    flexUtils.createButton({
                        action: { type: 'message', label: `自訂出價`, text: `${data.keyword} ` },
                        style: 'secondary', margin: 'sm'
                    })
                ], { spacing: 'sm', paddingAll: 'md' })
            }));
        }

        const carousel = flexUtils.createCarousel(contents);
        await lineUtils.replyFlex(replyToken, '📋 目前拍賣狀態', carousel);
    } catch (e) {
        console.error('[Auction] Status Query Error:', e);
        await lineUtils.replyText(replyToken, '❌ 查詢拍賣狀態發生錯誤');
    }
}

module.exports = {
    startAuction,
    checkAuctionKeyword,
    placeBid,
    placeBidExplicit,
    endAuction,
    checkAuctionStatus
};
