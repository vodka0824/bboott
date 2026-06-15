const { db } = require('../utils/db');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');
const memoryCache = require('../utils/memoryCache');
const { getSpamResponse } = require('../utils/spamHandler');
const COLLECTION_NAME = 'economy_users';

async function handleDropSoap(replyToken, context) {
    const { userId, groupId } = context;

    try {
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);
        
        const result = await db.runTransaction(async (t) => {
            const docRef = db.collection(COLLECTION_NAME).doc(userId);
            const doc = await t.get(docRef);
            
            if (!doc.exists) return { success: false, message: '找不到資料。' };
            
            const data = doc.data();
            if (!data.jailedUntil || Date.now() >= data.jailedUntil) {
                const spam = getSpamResponse(data, 'not_jailed', '你又沒坐牢，去哪裡撿肥皂？');
                t.update(docRef, { spamTracker: spam.newTracker });
                return { success: false, message: spam.message, ignore: spam.ignore };
            }

            // CD 10 分鐘
            if (data.soapCooldownUntil && Date.now() < data.soapCooldownUntil) {
                const remaining = Math.ceil((data.soapCooldownUntil - Date.now()) / 60000);
                const spam = getSpamResponse(data, 'soap_cd', `你的腰還在痛，請休息 ${remaining} 分鐘後再嘗試撿肥皂。`);
                t.update(docRef, { spamTracker: spam.newTracker });
                return { success: false, message: spam.message, ignore: spam.ignore };
            }

            const rand = Math.random() * 100;
            const cooldownTime = Date.now() + 10 * 60 * 1000;
            
            if (rand < 50) {
                // 50% 拿到 10k ~ 50k，減少 10 ~ 30 分鐘刑期
                const reward = Math.floor(Math.random() * 40001) + 10000;
                const reduceMins = Math.floor(Math.random() * 21) + 10;
                const reduceMs = reduceMins * 60 * 1000;
                
                let newJailedUntil = (data.jailedUntil || Date.now()) - reduceMs;
                if (newJailedUntil < Date.now()) newJailedUntil = Date.now(); // 直接釋放
                
                t.update(docRef, {
                    kuCoin: db.FieldValue.increment(reward),
                    jailedUntil: newJailedUntil,
                    soapCooldownUntil: cooldownTime
                });
                return { success: true, isGood: true, reward, reduceMins, isFree: newJailedUntil <= Date.now(), name: memberName || data.displayName || data.name || '未知', finalJailedUntil: newJailedUntil, newBalance: (data.kuCoin || 0) + reward };
            } else {
                // 50% 刑期增加 10 ~ 30 分鐘
                const addMins = Math.floor(Math.random() * 21) + 10;
                const addMs = addMins * 60 * 1000;
                const newJailedUntil = (data.jailedUntil || Date.now()) + addMs;
                
                t.update(docRef, {
                    jailedUntil: newJailedUntil,
                    soapCooldownUntil: cooldownTime
                });
                return { success: true, isGood: false, addMins, name: memberName || data.displayName || data.name || '未知', finalJailedUntil: newJailedUntil };
            }
        });

        if (!result.success) {
            if (result.ignore) return;
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        let bubble;
        const now = Date.now();
        const cdText = `⏳ 冷卻時間：10 分鐘\n（可於 ${new Date(Date.now() + 10 * 60 * 1000).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })} 後再次撿肥皂）`;
        
        if (result.isGood) {
            const remainingMins = Math.ceil((result.finalJailedUntil - now) / 60000);
            const bodyContents = [
                flexUtils.createText({ text: `${result.name} 在浴室撿肥皂時，意外發現了前人藏在磁磚縫裡的逃生道具！`, size: 'sm', color: '#666666', wrap: true }),
                flexUtils.createText({ text: `💰 發現暗盤：+${result.reward.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#2E7D32', margin: 'md' }),
                flexUtils.createText({ text: `⏱️ 刑期減免：-${result.reduceMins} 分鐘`, size: 'sm', weight: 'bold', color: '#2E7D32', margin: 'sm' }),
                flexUtils.createText({ text: `💰 結算總資產：${result.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#1A1A1A', margin: 'sm' }),
                flexUtils.createSeparator('md')
            ];

            if (result.isFree) {
                bodyContents.push(flexUtils.createText({ text: `🎉 由於刑期歸零，${result.name} 順利刑滿釋放出獄！`, size: 'md', weight: 'bold', color: '#2E7D32', margin: 'md', wrap: true }));
            } else {
                bodyContents.push(flexUtils.createText({ text: `⏱️ 目前剩餘刑期：${remainingMins} 分鐘。`, size: 'sm', color: '#333333', margin: 'md', wrap: true }));
            }
            bodyContents.push(flexUtils.createText({ text: cdText, size: 'xs', color: '#2E7D32', margin: 'md', wrap: true }));

            bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('🧼 意外暗盤', '好運降臨', '#2E7D32', '#E8F5E9'),
                body: flexUtils.createBox('vertical', bodyContents, { paddingAll: 'xl', backgroundColor: '#FFFFFF' })
            });
        } else {
            const remainingMins = Math.ceil((result.finalJailedUntil - now) / 60000);
            bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('🧼💥 肥皂滑落', '手滑慘劇', '#C62828', '#FFEBEE'),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `啊...手滑了！肥皂掉在地上！\n當 ${result.name} 彎腰去撿時，後方的獄霸露出了神祕的微笑...`, size: 'sm', color: '#666666', wrap: true }),
                    flexUtils.createText({ text: `(一陣慘叫聲傳來...)`, size: 'sm', weight: 'bold', color: '#C62828', margin: 'md', align: 'center' }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: `🚨 身心受創被送往醫務室，加刑 ${result.addMins} 分鐘！`, size: 'sm', weight: 'bold', color: '#C62828', margin: 'md', wrap: true }),
                    flexUtils.createText({ text: `⏱️ 目前剩餘刑期：${remainingMins} 分鐘。`, size: 'sm', color: '#333333', margin: 'sm', wrap: true }),
                    flexUtils.createText({ text: cdText, size: 'xs', color: '#C62828', margin: 'md', wrap: true })
                ], { paddingAll: 'xl', backgroundColor: '#FFFFFF' })
            });
        }
        await lineUtils.replyFlex(replyToken, '撿肥皂結果', bubble);

    } catch (e) {
        console.error('[Jail] handleDropSoap Error:', e);
        await lineUtils.replyText(replyToken, '❌ 撿肥皂失敗。');
    }
}

async function handleLabor(replyToken, context) {
    const { userId, groupId } = context;

    try {
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);
        const { getFinalPlayerStats } = require('./rpg');
        const stats = await getFinalPlayerStats(userId);
        const atk = stats.final.atk || 0;
        const luk = stats.final.luk || 0;

        const result = await db.runTransaction(async (t) => {
            const docRef = db.collection(COLLECTION_NAME).doc(userId);
            const doc = await t.get(docRef);
            if (!doc.exists) return { success: false, message: '找不到資料。' };
            const data = doc.data();
            
            if (!data.jailedUntil || Date.now() >= data.jailedUntil) {
                const spam = getSpamResponse(data, 'not_jailed', '你又沒坐牢，來勞動什麼？想進來嗎？');
                t.update(docRef, { spamTracker: spam.newTracker });
                return { success: false, message: spam.message, ignore: spam.ignore };
            }

            // CD 5 分鐘
            if (data.laborCooldownUntil && Date.now() < data.laborCooldownUntil) {
                const remaining = Math.ceil((data.laborCooldownUntil - Date.now()) / 60000);
                const spam = getSpamResponse(data, 'labor_cd', `你才剛刷完馬桶，休息 ${remaining} 分鐘後再來！`);
                
                let extraUpdates = { spamTracker: spam.newTracker };
                if (spam.triggerPenalty) {
                    extraUpdates.jailedUntil = Math.max(Date.now(), data.jailedUntil + 2 * 60 * 1000);
                    extraUpdates.laborCooldownUntil = data.laborCooldownUntil + 2 * 60 * 1000;
                }
                t.update(docRef, extraUpdates);
                return { success: false, message: spam.message, ignore: spam.ignore };
            }

            const rand = Math.random() * 100;
            const cooldownTime = Date.now() + 5 * 60 * 1000;
            
            // 降低勞動收益: 基礎 5~10 分鐘，外加 10% 攻擊力加成
            const reduceMins = Math.floor(Math.random() * 6) + 5 + Math.floor(atk * 0.1);
            const newJailedUntil = Math.max(Date.now(), data.jailedUntil - (reduceMins * 60 * 1000));
            
            let eventMsg = '';
            let isFree = false;
            let finalJailedUntil = newJailedUntil;
            let extraCoin = 0;

            if (rand < 10) {
                // 10% 洗破內褲，加刑 20 分
                finalJailedUntil = Math.max(Date.now(), data.jailedUntil + (20 * 60 * 1000));
                eventMsg = '你不小心把典獄長的內褲洗破了，刑期增加 20 分鐘！';
            } else if (rand < 25) {
                // 15% 找到錢
                extraCoin = Math.floor(Math.random() * 4000) + 1000;
                eventMsg = `你在洗衣房的囚服裡摸到前人藏的 ${extraCoin.toLocaleString()} 哭幣！(已悄悄存入帳戶)`;
            } else {
                eventMsg = `你乖乖地刷了 10 個馬桶，表現良好。`;
            }

            if (finalJailedUntil <= Date.now()) {
                isFree = true;
                t.update(docRef, { jailedUntil: db.FieldValue.delete(), kuCoin: db.FieldValue.increment(extraCoin) });
            } else {
                t.update(docRef, { 
                    jailedUntil: finalJailedUntil,
                    laborCooldownUntil: cooldownTime,
                    kuCoin: db.FieldValue.increment(extraCoin)
                });
            }

            return { success: true, isFree, eventMsg, reduceMins, finalJailedUntil, name: memberName || data.name, extraCoin, newBalance: (data.kuCoin || 0) + extraCoin };
        });

        if (!result.success) {
            if (result.ignore) return;
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        let bubble;
        const now = Date.now();
        const cdText = `⏳ 冷卻時間：5 分鐘\n（可於 ${new Date(Date.now() + 5 * 60 * 1000).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })} 後再次勞動）`;

        if (result.isFree) {
            const bodyContents = [
                flexUtils.createText({ text: `${result.name} 努力進行勞動改造！`, size: 'sm', color: '#666666', wrap: true }),
                flexUtils.createText({ text: `📝 ${result.eventMsg}`, size: 'sm', weight: 'bold', color: '#333333', margin: 'md', wrap: true })
            ];
            if (result.extraCoin > 0) {
                bodyContents.push(flexUtils.createText({ text: `💰 結算總資產：${result.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#1A1A1A', margin: 'sm' }));
            }
            bodyContents.push(
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `🎉 由於刑期已滿，典獄長批准你出獄啦！重獲自由！`, size: 'md', weight: 'bold', color: '#2E7D32', margin: 'md', wrap: true }),
                flexUtils.createText({ text: cdText, size: 'xs', color: '#2E7D32', margin: 'md', wrap: true })
            );

            bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('⛏️ 勞動改造', '刑滿釋放', '#E65100', '#FFF3E0'),
                body: flexUtils.createBox('vertical', bodyContents, { paddingAll: 'xl', backgroundColor: '#FFFFFF' })
            });
        } else {
            const remainingMins = Math.ceil((result.finalJailedUntil - now) / 60000);
            const isBadEvent = result.eventMsg.includes('內褲洗破');
            const headerTitle = isBadEvent ? '🚨 勞動失誤' : '⛏️ 勞動改造';
            const headerSubtitle = isBadEvent ? '意外加刑' : '減刑成功';
            const headerBg = isBadEvent ? '#FFEBEE' : '#FFF3E0';
            const headerTextCol = isBadEvent ? '#C62828' : '#E65100';

            const bodyContents = [
                flexUtils.createText({ text: `${result.name} 努力進行勞動改造，獲得減刑 ${result.reduceMins} 分鐘！`, size: 'sm', color: '#666666', wrap: true }),
                flexUtils.createText({ text: `📝 隨機事件：${result.eventMsg}`, size: 'sm', weight: 'bold', color: isBadEvent ? '#C62828' : '#333333', margin: 'md', wrap: true })
            ];
            if (result.extraCoin > 0) {
                bodyContents.push(flexUtils.createText({ text: `💰 結算總資產：${result.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#1A1A1A', margin: 'sm' }));
            }
            bodyContents.push(
                flexUtils.createSeparator('md'),
                flexUtils.createText({ text: `⏱️ 目前剩餘刑期：${remainingMins} 分鐘。`, size: 'sm', color: '#333333', margin: 'md', wrap: true }),
                flexUtils.createText({ text: cdText, size: 'xs', color: isBadEvent ? '#C62828' : '#E65100', margin: 'md', wrap: true })
            );

            bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader(headerTitle, headerSubtitle, headerTextCol, headerBg),
                body: flexUtils.createBox('vertical', bodyContents, { paddingAll: 'xl', backgroundColor: '#FFFFFF' })
            });
        }
        await lineUtils.replyFlex(replyToken, '勞動改造結果', bubble);

    } catch (e) {
        console.error('[Jail] handleLabor Error:', e);
        await lineUtils.replyText(replyToken, '❌ 勞動失敗。');
    }
}

async function handleBlowWarden(replyToken, context) {
    const { userId, groupId } = context;

    try {
        const memberName = await lineUtils.getGroupMemberName(groupId, userId);
        const result = await db.runTransaction(async (t) => {
            const docRef = db.collection('economy_users').doc(userId);
            const doc = await t.get(docRef);
            if (!doc.exists) return { success: false, message: '找不到資料。' };
            const data = doc.data();
            
            if (!data.jailedUntil || Date.now() >= data.jailedUntil) {
                return { success: false, message: '你又沒坐牢，跑來吹什麼喇叭？' };
            }

            if (data.blowCooldownUntil && Date.now() < data.blowCooldownUntil) {
                const remaining = Math.ceil((data.blowCooldownUntil - Date.now()) / 60000);
                return { success: false, message: `典獄長現在進入聖人模式，請休息 ${remaining} 分鐘後再來！` };
            }

            const rand = Math.random() * 100;
            const cooldownTime = Date.now() + 30 * 60 * 1000;
            
            let isFree = false;
            let finalJailedUntil = data.jailedUntil;
            let eventMsg = '';
            let isBad = false;

            if (rand < 10) {
                // 10% 典獄長覺得不舒服，加刑 30 分鐘
                finalJailedUntil = Math.max(Date.now(), data.jailedUntil) + (30 * 60 * 1000);
                eventMsg = '你牙齒撞到典獄長，他不舒服一怒之下給你加刑 30 分鐘！';
                isBad = true;
            } else if (rand < 50) {
                // 40% 白嫖
                eventMsg = '你賣力服務了半天，典獄長爽完提上褲子就不認人了，刑期一點也沒少！(被白嫖)';
                isBad = true;
            } else {
                // 50% 扣除一半剩餘刑期
                const remainingMins = Math.ceil((data.jailedUntil - Date.now()) / 60000);
                const deductMins = Math.floor(remainingMins / 2);
                finalJailedUntil = data.jailedUntil - (deductMins * 60 * 1000);
                eventMsg = `典獄長龍心大悅！直接幫你減去了一半的剩餘刑期 (${deductMins} 分鐘)！`;
                if (finalJailedUntil <= Date.now()) isFree = true;
            }

            if (isFree) {
                t.update(docRef, { jailedUntil: db.FieldValue.delete(), blowCooldownUntil: cooldownTime });
            } else {
                t.update(docRef, { jailedUntil: finalJailedUntil, blowCooldownUntil: cooldownTime });
            }

            return { success: true, isFree, eventMsg, isBad, name: memberName || data.name, finalJailedUntil };
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        if (result.isFree) {
            await lineUtils.replyText(replyToken, `👄 【特殊服務】\n${result.name} 敲開了典獄長的辦公室...\n${result.eventMsg}\n\n🎉 由於刑期已滿，典獄長批准你出獄啦！`);
        } else {
            const remainingMins = Math.ceil((result.finalJailedUntil - Date.now()) / 60000);
            const icon = result.isBad ? '😭' : '👄';
            await lineUtils.replyText(replyToken, `${icon} 【特殊服務】\n${result.name} 敲開了典獄長的辦公室...\n${result.eventMsg}\n\n目前剩餘刑期：${remainingMins} 分鐘。 (冷卻30分)`);
        }

    } catch (e) {
        console.error('[Jail] handleBlowWarden Error:', e);
    }
}

async function handleVisit(replyToken, context, messageObject) {
    const { userId: fromUserId, groupId } = context;
    const mentionObj = messageObject && messageObject.mention;
    
    if (!mentionObj || !mentionObj.mentionees || mentionObj.mentionees.length === 0) {
        await lineUtils.replyText(replyToken, '❌ 請問你要探誰的監？請 @標記 探監對象！(費用: 50,000 哭幣)');
        return;
    }

    const targetUserId = mentionObj.mentionees[0].userId;

    if (fromUserId === targetUserId) {
        await lineUtils.replyText(replyToken, '❌ 你要探監你自己？有病嗎？');
        return;
    }

    const visitCost = 50000;

    try {
        const fromMemberName = await lineUtils.getGroupMemberName(groupId, fromUserId);
        const targetMemberName = await lineUtils.getGroupMemberName(groupId, targetUserId);

        const result = await db.runTransaction(async (t) => {
            const fromDocRef = db.collection(COLLECTION_NAME).doc(fromUserId);
            const targetDocRef = db.collection(COLLECTION_NAME).doc(targetUserId);
            
            const fromDoc = await t.get(fromDocRef);
            const targetDoc = await t.get(targetDocRef);
            
            if (!fromDoc.exists || !targetDoc.exists) {
                return { success: false, message: '找不到玩家資料。' };
            }

            const fromData = fromDoc.data();
            const targetData = targetDoc.data();

            if (!targetData.jailedUntil || Date.now() >= targetData.jailedUntil) {
                return { success: false, message: '對方目前沒有在坐牢，你探個屁監？' };
            }

            const fromCoin = fromData.kuCoin || 0;
            if (fromCoin < visitCost) {
                return { success: false, message: `打通獄警探監需要 ${visitCost.toLocaleString()} 哭幣，你只有 ${fromCoin.toLocaleString()} 哭幣。` };
            }

            const rand = Math.random() * 100;
            
            if (rand < 20) {
                // 20% 被抓包
                const jailedUntil = Date.now() + (30 * 60 * 1000);
                t.update(fromDocRef, {
                    kuCoin: db.FieldValue.increment(-visitCost),
                    jailedUntil,
                    jailbreakCooldownUntil: db.FieldValue.delete()
                });
                return { success: true, caught: true, name: fromMemberName || fromData.name, targetName: targetMemberName || targetData.name, newBalance: fromCoin - visitCost };
            } else {
                // 80% 成功送達違禁品
                t.update(fromDocRef, { kuCoin: db.FieldValue.increment(-visitCost) });
                t.update(targetDocRef, { hasShiv: true });
                return { success: true, caught: false, name: fromMemberName || fromData.name, targetName: targetMemberName || targetData.name, newBalance: fromCoin - visitCost };
            }
        });

        if (!result.success) {
            await lineUtils.replyText(replyToken, `❌ ${result.message}`);
            return;
        }

        let bubble;
        if (result.caught) {
            bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('🚨 探監失敗', '夾帶違禁品被捕', '#C62828', '#FFEBEE'),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `${result.name} 帶了一碗「藏有銼刀的豬腳麵線」去探監 ${result.targetName}...`, size: 'sm', color: '#666666', wrap: true }),
                    flexUtils.createText({ text: `結果在金屬探測門逼逼大作！👮 獄警：「當我瞎了嗎？抓起來！」`, size: 'sm', weight: 'bold', color: '#C62828', margin: 'md', wrap: true }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: `💸 沒收打點費：${visitCost.toLocaleString()} 哭幣`, size: 'xs', color: '#888888', margin: 'md' }),
                    flexUtils.createText({ text: `💰 結算總資產：${result.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#1A1A1A', margin: 'sm' }),
                    flexUtils.createText({ text: `🔒 懲罰：${result.name} 被收押入獄 30 分鐘！(買一送一)`, size: 'sm', weight: 'bold', color: '#C62828', margin: 'sm', wrap: true })
                ], { paddingAll: 'xl', backgroundColor: '#FFFFFF' })
            });
        } else {
            bubble = flexUtils.createBubble({
                size: 'mega',
                header: flexUtils.createHeader('🍱 探監成功', '義氣相挺', '#006064', '#E0F7FA'),
                body: flexUtils.createBox('vertical', [
                    flexUtils.createText({ text: `${result.name} 成功用 ${visitCost.toLocaleString()} 哭幣打通獄警，前去探望了 ${result.targetName}！`, size: 'sm', color: '#666666', wrap: true }),
                    flexUtils.createText({ text: `「兄弟，麵線趁熱吃，底下有好康的...」`, size: 'sm', weight: 'bold', color: '#006064', margin: 'md', wrap: true }),
                    flexUtils.createText({ text: `💰 結算總資產：${result.newBalance.toLocaleString()} 哭幣`, size: 'sm', weight: 'bold', color: '#1A1A1A', margin: 'sm' }),
                    flexUtils.createSeparator('md'),
                    flexUtils.createText({ text: `🔑 ${result.targetName} 獲得了逃生工具【銼刀】！\n下一次使用「越獄」指令時必定成功！`, size: 'sm', weight: 'bold', color: '#2E7D32', margin: 'md', wrap: true })
                ], { paddingAll: 'xl', backgroundColor: '#FFFFFF' })
            });
        }
        await lineUtils.replyFlex(replyToken, '探監結果', bubble);

    } catch (e) {
        console.error('[Jail] handleVisit Error:', e);
        await lineUtils.replyText(replyToken, '❌ 探監失敗。');
    }
}

module.exports = {
    handleDropSoap,
    handleLabor,
    handleBlowWarden,
    handleVisit
};
