const { db } = require('../utils/db');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');

const ALARM_DURATION_MS = 10 * 60 * 1000; // 10 minutes

const REPAIR_CODES = [
    '重啟EAP系統', '更換Pump閥門', 'Reset Alarm 502', 
    '清理Chamber', '校正Robot手臂', '更換O-ring',
    '重灌機台軟體', '排除Wafer卡盤', '更換Filter'
];

async function handleTsmcMessageEvent(context) {
    const { groupId, userId, message, replyToken, isGroup } = context;
    console.log(`[TSMC DEBUG] handleTsmcMessageEvent called for group: ${groupId}, msg: ${message}`);
    if (!isGroup) return false;

    let consumedToken = false;
    try {
        const alarmRef = db.collection('tsmc_alarms').doc(groupId);
        
        await db.runTransaction(async (t) => {
            const alarmDoc = await t.get(alarmRef);
            
            if (alarmDoc.exists) {
                const alarm = alarmDoc.data();
                const now = Date.now();
                
                // 檢查是否已過期
                if (now > alarm.createdAt + ALARM_DURATION_MS) {
                    // 執行結算
                    await processAlarmSettlement(t, groupId, alarm, replyToken, context);
                    t.delete(alarmRef);
                    consumedToken = true;
                    return;
                }
                
                // 尚未過期，檢查是否為修復指令
                const cleanMsg = message.trim();
                if (cleanMsg === alarm.code) {
                    // 檢查此人是否為輪班星人
                    const userRef = db.collection('economy_users').doc(userId);
                    const userDoc = await t.get(userRef);
                    if (userDoc.exists && userDoc.data().profession === 'tsmc') {
                        // 記錄修復
                        if (!alarm.repairedBy) alarm.repairedBy = {};
                        if (!alarm.repairedBy[userId]) {
                            const memberName = await lineUtils.getGroupMemberName(groupId, userId);
                            alarm.repairedBy[userId] = {
                                time: now - alarm.createdAt,
                                name: memberName || userDoc.data().displayName || userDoc.data().name || '未知工程師'
                            };
                            t.update(alarmRef, { repairedBy: alarm.repairedBy });
                            
                            // 立即回覆讓使用者知道已經登記成功
                            const repairTimeStr = ((now - alarm.createdAt) / 1000).toFixed(1) + ' 秒';
                            
                            const bubble = flexUtils.createBubble({
                                size: 'mega',
                                header: flexUtils.createHeader('✅ 維修登記成功', 'TSMC LOG', '#009688', '#E0F2F1'),
                                body: flexUtils.createBox('vertical', [
                                    flexUtils.createText({ text: `辛苦了，輪班星人 ${alarm.repairedBy[userId].name}！`, size: 'sm', weight: 'bold', color: flexUtils.COLORS.TEXT_MAIN, wrap: true }),
                                    flexUtils.createSeparator('md'),
                                    flexUtils.createBox('horizontal', [
                                        flexUtils.createText({ text: '搶修時間', size: 'xs', color: flexUtils.COLORS.TEXT_SUB, flex: 1 }),
                                        flexUtils.createText({ text: repairTimeStr, size: 'sm', weight: 'bold', color: flexUtils.COLORS.PRIMARY, align: 'end', flex: 2 })
                                    ], { margin: 'md' }),
                                    flexUtils.createText({ text: '你的搶修紀錄已登錄，請等待本次警報解除（10分鐘內結算）。', size: 'xs', color: flexUtils.COLORS.TEXT_MUTED, wrap: true, margin: 'md' })
                                ], { paddingAll: 'xl', backgroundColor: flexUtils.COLORS.BG_CARD })
                            });
                            
                            await lineUtils.replyFlex(replyToken, '維修登記成功', bubble);
                            consumedToken = true;
                        } else {
                            // 已經登記過
                            await lineUtils.replyText(replyToken, `⚠️ 你已經搶修過這次警報了，請等待結算！`);
                            consumedToken = true;
                        }
                    } else {
                        // 非輪班星人嘗試維修
                        await lineUtils.replyText(replyToken, `⚠️ 你不是輪班星人，請勿觸碰機台！`);
                        consumedToken = true;
                    }
                } else if (REPAIR_CODES.includes(cleanMsg)) {
                    // 錯誤代碼，修復失敗
                    await lineUtils.replyText(replyToken, `❌ 錯誤的維修代碼！正確代碼為：${alarm.code}\n你的無能導致機台狀況惡化！`);
                    consumedToken = true;
                }
            } else {
                // 沒有警報，機率觸發
                const userRef = db.collection('economy_users').doc(userId);
                const userDoc = await t.get(userRef);
                const data = userDoc.exists ? userDoc.data() : {};
                
                let triggerChance = 0.10; 
                if (data.profession === 'tsmc') {
                    triggerChance = 0.03;
                }
                
                console.log(`[TSMC DEBUG] triggerChance: ${triggerChance}`);
                if (Math.random() < triggerChance) {
                    console.log(`[TSMC DEBUG] Alarm triggered! Checking tsmc users...`);
                    // 觸發警報
                    const tsmcUsersSnapshot = await db.collection('economy_users')
                        .where('profession', '==', 'tsmc')
                        .get();
                        
                    console.log(`[TSMC DEBUG] Found TSMC users: ${!tsmcUsersSnapshot.empty}`);
                    if (!tsmcUsersSnapshot.empty) {
                        const code = REPAIR_CODES[Math.floor(Math.random() * REPAIR_CODES.length)];
                        t.set(alarmRef, {
                            status: 'active',
                            createdAt: Date.now(),
                            code: code,
                            repairedBy: {}
                        });
                        
                        const bubble = flexUtils.createBubble({
                            size: 'mega',
                            header: flexUtils.createHeader('⚠️ 設備異常警報', 'TSMC ALARM', '#D32F2F', '#FFEBEE'),
                            body: flexUtils.createBox('vertical', [
                                flexUtils.createText({ text: '機台發出刺耳的逼逼聲！產線即將停擺！', size: 'sm', weight: 'bold', color: '#D32F2F', wrap: true }),
                                flexUtils.createSeparator('md'),
                                flexUtils.createText({ text: '🧑‍💻 請所有輪班星人立刻輸入以下指令搶修：', size: 'xs', color: '#333333', margin: 'md', wrap: true }),
                                flexUtils.createText({ text: code, size: 'xl', weight: 'bold', color: '#1976D2', margin: 'sm', align: 'center' }),
                                flexUtils.createSeparator('md'),
                                flexUtils.createText({ text: '⏳ 限時 10 分鐘，逾時將造成 Down 機懲處！', size: 'xs', color: '#757575', margin: 'md', wrap: true })
                            ], { paddingAll: 'xl', backgroundColor: '#FAFAFA' })
                        });
                        await lineUtils.replyFlex(replyToken, `⚠️ 【設備異常警報】請輸入：${code}`, bubble);
                        consumedToken = true;
                    }
                }
            }
        });
        return consumedToken;
    } catch (e) {
        console.error('[TSMC] handleTsmcMessageEvent error:', e);
        return false;
    }
}

async function processAlarmSettlement(t, groupId, alarm, replyToken, context) {
    const now = Date.now();
    
    // 取得所有台積電員工
    const tsmcUsersSnapshot = await t.get(db.collection('economy_users').where('profession', '==', 'tsmc'));
    if (tsmcUsersSnapshot.empty) return;
    
    let successList = [];
    let failList = [];
    
    for (const doc of tsmcUsersSnapshot.docs) {
        const userId = doc.id;
        const data = doc.data();
        const userRef = doc.ref;
        
        // 檢查乖乖護體
        const hasKuaiKuai = data.tsmcKuaiKuaiUntil && now < data.tsmcKuaiKuaiUntil;
        
        let repairRecord = alarm.repairedBy ? alarm.repairedBy[userId] : null;
        let isSuccess = false;
        let kpiChange = 0;
        let timeLabel = '';
        let timeTakenMs = 0;
        
        if (hasKuaiKuai && !repairRecord) {
            repairRecord = { time: 10000, name: data.displayName || data.name || '未知工程師' }; // 乖乖自動判定10秒
        }
        
        if (repairRecord) {
            isSuccess = true;
            timeTakenMs = repairRecord.time;
            
            if (timeTakenMs <= 30000) { // 30秒
                kpiChange = 50;
                timeLabel = '秒解神救援';
            } else if (timeTakenMs <= 60000) { // 1分
                kpiChange = 20;
                timeLabel = '迅速處理';
            } else if (timeTakenMs <= 300000) { // 5分
                kpiChange = 5;
                timeLabel = '標準作業';
            } else { // 10分內
                kpiChange = -10;
                timeLabel = '慢半拍';
            }
            
            // 檢查加班 Buff (參與維修就觸發)
            if (data.tsmcOvertimeBuff) {
                kpiChange *= 3;
                timeLabel += ' (加班x3)';
                t.update(userRef, { tsmcOvertimeBuff: false });
            }
            
            t.update(userRef, { 
                tsmcKpi: db.FieldValue.increment(kpiChange),
                tsmcMissedRepair: false
            });
            
            successList.push({
                name: repairRecord.name,
                time: (timeTakenMs / 1000).toFixed(1) + 's',
                label: timeLabel,
                kpi: kpiChange
            });
        } else {
            // 漏維修
            kpiChange = -30;
            timeLabel = 'Down機';
            
            // 加班 Buff 漏修則失效
            const updates = {
                tsmcKpi: db.FieldValue.increment(kpiChange),
                tsmcMissedRepair: true
            };
            if (data.tsmcOvertimeBuff) {
                updates.tsmcOvertimeBuff = false;
                timeLabel += ' (加班失效)';
            }
            t.update(userRef, updates);
            
            failList.push({
                name: data.displayName || data.name || '未知工程師',
                kpi: kpiChange,
                label: timeLabel
            });
        }
    }
    
    // 組合 Flex Message
    const bodyContents = [];
    bodyContents.push(flexUtils.createText({ text: '📊 機台維修結算報告', size: 'lg', weight: 'bold', color: '#1A237E', align: 'center' }));
    bodyContents.push(flexUtils.createSeparator('md'));
    
    bodyContents.push(flexUtils.createText({ text: '✅ 成功維修人員', size: 'sm', weight: 'bold', color: '#2E7D32', margin: 'md' }));
    if (successList.length > 0) {
        successList.forEach(item => {
            const kpiColor = item.kpi >= 0 ? '#4CAF50' : '#E53935';
            const kpiSign = item.kpi >= 0 ? '+' : '';
            bodyContents.push(
                flexUtils.createBox('horizontal', [
                    flexUtils.createText({ text: `${item.name}`, size: 'xs', color: '#333333', flex: 3 }),
                    flexUtils.createText({ text: `${item.time}`, size: 'xs', color: '#757575', flex: 2 }),
                    flexUtils.createText({ text: `KPI ${kpiSign}${item.kpi}`, size: 'xs', weight: 'bold', color: kpiColor, flex: 2 }),
                    flexUtils.createText({ text: `${item.label}`, size: 'xxs', color: '#9E9E9E', flex: 3, align: 'end' })
                ], { margin: 'sm' })
            );
        });
    } else {
        bodyContents.push(flexUtils.createText({ text: '無人參與維修...', size: 'xs', color: '#9E9E9E', margin: 'sm' }));
    }
    
    bodyContents.push(flexUtils.createSeparator('md'));
    bodyContents.push(flexUtils.createText({ text: '❌ 漏維修人員 (Down機)', size: 'sm', weight: 'bold', color: '#C62828', margin: 'md' }));
    if (failList.length > 0) {
        failList.forEach(item => {
            bodyContents.push(
                flexUtils.createBox('horizontal', [
                    flexUtils.createText({ text: `${item.name}`, size: 'xs', color: '#333333', flex: 4 }),
                    flexUtils.createText({ text: `KPI ${item.kpi}`, size: 'xs', weight: 'bold', color: '#E53935', flex: 3 }),
                    flexUtils.createText({ text: `${item.label}`, size: 'xxs', color: '#9E9E9E', flex: 3, align: 'end' })
                ], { margin: 'sm' })
            );
        });
    } else {
        bodyContents.push(flexUtils.createText({ text: '全員皆已維修完畢！', size: 'xs', color: '#9E9E9E', margin: 'sm' }));
    }
    
    const bubble = flexUtils.createBubble({
        size: 'mega',
        body: flexUtils.createBox('vertical', bodyContents, { paddingAll: 'xl', backgroundColor: '#F5F5F5' })
    });
    
    // 使用 replyToken 發送 (避免推播限制)
    await lineUtils.replyFlex(replyToken, '機台維修結算報告', bubble);
}

// --- 職業切換 ---
async function joinTsmc(replyToken, groupId, userId) {
    const memberName = await lineUtils.getGroupMemberName(groupId, userId);
    
    await db.runTransaction(async (t) => {
        const docRef = db.collection('economy_users').doc(userId);
        const doc = await t.get(docRef);
        if (!doc.exists) throw new Error('NOT_FOUND');
        const data = doc.data();

        if (data.profession === 'monk') throw new Error('HAS_PROFESSION');
        if (data.isPolice) throw new Error('HAS_PROFESSION');
        if (data.isMafia) throw new Error('HAS_PROFESSION');
        if (data.councilorUntil && Date.now() < data.councilorUntil) throw new Error('HAS_PROFESSION');
        if (data.militaryUntil) throw new Error('HAS_PROFESSION');
        if (data.profession === 'tsmc') throw new Error('ALREADY_TSMC');

        t.update(docRef, {
            profession: 'tsmc',
            tsmcKpi: 0,
            tsmcFatigue: 0
        });
    }).then(async () => {
        const msg = `🧑‍💻 【入職成功】\n恭喜 ${memberName} 簽下賣身契，正式成為護國神山「台積電輪班星人」！\n\n⚠️ 警告：\n1. 你已失去出入賭場的權利（被鎖在無塵室）。\n2. 請隨時注意群組內的機台異常警報。\n3. 黑眼圈是你的榮耀，爆肝是你的宿命。`;
        await lineUtils.replyText(replyToken, msg);
    }).catch(async (e) => {
        if (e.message === 'NOT_FOUND') await lineUtils.replyText(replyToken, '❌ 查無資料，請先簽到。');
        else if (e.message === 'HAS_PROFESSION') await lineUtils.replyText(replyToken, '❌ 系統嚴格禁止雙職業！你想當輪班星人，必須先辭去現在的職業。');
        else if (e.message === 'ALREADY_TSMC') await lineUtils.replyText(replyToken, '❌ 你已經在無塵室裡面了，還要簽幾張賣身契？');
        else {
            console.error('[TSMC] joinTsmc Error:', e);
            await lineUtils.replyText(replyToken, '❌ 入職失敗，發生未知錯誤。');
        }
    });
}

async function leaveTsmc(replyToken, groupId, userId) {
    const memberName = await lineUtils.getGroupMemberName(groupId, userId);
    
    await db.runTransaction(async (t) => {
        const docRef = db.collection('economy_users').doc(userId);
        const doc = await t.get(docRef);
        if (!doc.exists) throw new Error('NOT_FOUND');
        const data = doc.data();

        if (data.profession !== 'tsmc') throw new Error('NOT_TSMC');

        t.update(docRef, {
            profession: db.FieldValue.delete(),
            tsmcKpi: 0,
            tsmcFatigue: 0,
            tsmcCooldowns: db.FieldValue.delete(),
            tsmcOvertimeBuff: db.FieldValue.delete(),
            tsmcKuaiKuaiUntil: db.FieldValue.delete(),
            tsmcMissedRepair: db.FieldValue.delete()
        });
    }).then(async () => {
        const msg = `👋 【離職成功】\n${memberName} 決定重獲自由，離開了護國神山！\n\n⚠️ 注意：你過去賣肝累積的績效 (KPI) 已全數歸零，淨身出戶！`;
        await lineUtils.replyText(replyToken, msg);
    }).catch(async (e) => {
        if (e.message === 'NOT_FOUND') await lineUtils.replyText(replyToken, '❌ 查無資料，請先簽到。');
        else if (e.message === 'NOT_TSMC') await lineUtils.replyText(replyToken, '❌ 你又不是輪班星人，提什麼離職？');
        else {
            console.error('[TSMC] leaveTsmc Error:', e);
            await lineUtils.replyText(replyToken, '❌ 離職失敗。');
        }
    });
}

// 檢查冷卻
async function checkCooldown(userId, skillKey, durationMs) {
    const doc = await db.collection('economy_users').doc(userId).get();
    if (!doc.exists) return { allowed: false, msg: '查無資料' };
    const data = doc.data();
    if (data.profession !== 'tsmc') return { allowed: false, msg: '你不是輪班星人！' };

    const cooldowns = data.tsmcCooldowns || {};
    const lastTime = cooldowns[skillKey] || 0;
    const now = Date.now();

    if (now - lastTime < durationMs) {
        const remainMs = durationMs - (now - lastTime);
        const hours = Math.floor(remainMs / 3600000);
        const mins = Math.floor((remainMs % 3600000) / 60000);
        const secs = Math.floor((remainMs % 60000) / 1000);
        return { allowed: false, msg: `⏳ 技能冷卻中，還需等待 ${hours}小時 ${mins}分 ${secs}秒` };
    }

    return { allowed: true, data };
}

// 更新冷卻
async function updateCooldown(userId, skillKey) {
    const key = `tsmcCooldowns.${skillKey}`;
    await db.collection('economy_users').doc(userId).update({
        [key]: Date.now()
    });
}

// --- 技能 ---
async function placeKuaiKuai(replyToken, groupId, userId) {
    const cdCheck = await checkCooldown(userId, 'kuaiKuai', 2 * 60 * 60 * 1000); // 2 hours
    if (!cdCheck.allowed) {
        await lineUtils.replyText(replyToken, cdCheck.msg);
        return;
    }

    const { data } = cdCheck;
    const memberName = await lineUtils.getGroupMemberName(groupId, userId);

    const isFail = Math.random() < 0.05;

    if (isFail) {
        await db.collection('economy_users').doc(userId).update({
            tsmcKpi: db.FieldValue.increment(-30),
            'tsmcCooldowns.kuaiKuai': Date.now()
        });
        const msg = `😱 【嚴重失誤】\n${memberName} 因為太累眼花，不小心把【黃色五香乖乖】放上機台！\n機台當場大當機，副總氣炸，你的績效被扣除 30 點！`;
        await lineUtils.replyText(replyToken, msg);
    } else {
        await db.collection('economy_users').doc(userId).update({
            tsmcKuaiKuaiUntil: Date.now() + 30 * 60 * 1000, // 30 minutes
            'tsmcCooldowns.kuaiKuai': Date.now()
        });
        const msg = `🟢 【綠色護體】\n${memberName} 成功在機台上放了一包【綠色乖乖】！\n在接下來的 30 分鐘內，若發生機台警報，系統將自動幫你秒解修復！`;
        await lineUtils.replyText(replyToken, msg);
    }
}

async function overtime(replyToken, groupId, userId) {
    const cdCheck = await checkCooldown(userId, 'overtime', 30 * 60 * 1000); // 30 minutes
    if (!cdCheck.allowed) {
        await lineUtils.replyText(replyToken, cdCheck.msg);
        return;
    }

    const { data } = cdCheck;
    const memberName = await lineUtils.getGroupMemberName(groupId, userId);
    
    const currentFatigue = data.tsmcFatigue || 0;
    const addedFatigue = Math.floor(Math.random() * 10) + 10;
    const newFatigue = currentFatigue + addedFatigue;
    
    let collapseChance = 0;
    if (newFatigue > 100) collapseChance = 0.5;
    else if (newFatigue > 80) collapseChance = 0.3;
    else if (newFatigue > 50) collapseChance = 0.1;

    if (Math.random() < collapseChance) {
        const currentMoney = data.kuCoin || 0;
        const medicalBill = Math.floor(currentMoney * 0.5);
        
        await db.collection('economy_users').doc(userId).update({
            kuCoin: db.FieldValue.increment(-medicalBill),
            tsmcFatigue: 0,
            jailedUntil: Date.now() + 6 * 60 * 60 * 1000,
            jailReason: '爆肝送醫急救',
            tsmcOvertimeBuff: false,
            'tsmcCooldowns.overtime': Date.now()
        });
        
        const msg = `🚑 【爆肝送醫】\n${memberName} 灌完拿鐵後突然眼前一黑，倒在產線旁！\n\n經緊急送醫搶救，被強制留院觀察 6 小時（期間無法行動）。\n並且支付了高達 ${medicalBill.toLocaleString()} 哭幣的龐大醫療費（總資產 50%）！\n\n(疲勞值已歸零)`;
        await lineUtils.replyText(replyToken, msg);
    } else {
        await db.collection('economy_users').doc(userId).update({
            tsmcFatigue: newFatigue,
            tsmcOvertimeBuff: true,
            'tsmcCooldowns.overtime': Date.now()
        });
        
        const msg = `☕ 【灌拿鐵加班】\n${memberName} 灌下了一大杯冰拿鐵，雙眼佈滿血絲準備再戰！\n\n✨ 【效應】：下一次機台警報若你成功修復，績效將獲得 3 倍加成！（若漏維修則失效）\n\n🩸 當前疲勞值升至：${newFatigue} (注意！疲勞過高可能隨時爆肝送醫！)`;
        await lineUtils.replyText(replyToken, msg);
    }
}

async function scapegoat(replyToken, groupId, userId, targetId) {
    if (userId === targetId) {
        await lineUtils.replyText(replyToken, '❌ 你不能甩鍋給自己！');
        return;
    }

    const cdCheck = await checkCooldown(userId, 'scapegoat', 24 * 60 * 60 * 1000); // 24 hours
    if (!cdCheck.allowed) {
        await lineUtils.replyText(replyToken, cdCheck.msg);
        return;
    }

    const { data } = cdCheck;
    const memberName = await lineUtils.getGroupMemberName(groupId, userId);
    
    if (!data.tsmcMissedRepair) {
        await lineUtils.replyText(replyToken, '❌ 甩鍋失敗：你目前沒有「漏維修」的懲罰紀錄可以甩鍋！只有在 Down 機被扣績效後才能找替死鬼。');
        return;
    }

    const targetName = await lineUtils.getGroupMemberName(groupId, targetId);
    
    await db.runTransaction(async (t) => {
        const targetRef = db.collection('economy_users').doc(targetId);
        const targetDoc = await t.get(targetRef);
        
        t.update(targetRef, {
            kuCoin: db.FieldValue.increment(-1000000)
        }, { merge: true });
        
        const selfRef = db.collection('economy_users').doc(userId);
        t.update(selfRef, {
            tsmcKpi: db.FieldValue.increment(20),
            tsmcMissedRepair: false,
            'tsmcCooldowns.scapegoat': Date.now()
        });
    });

    const msg = `💩 【甩鍋成功】\n${memberName} 將剛剛機台 Down 機的責任，全部推給了無辜的設備商 ${targetName}！\n\n${targetName} 莫名其妙被扣款了 1,000,000 哭幣！\n而 ${memberName} 成功掩蓋了疏失，討回了 20 點績效！`;
    await lineUtils.replyText(replyToken, msg);
}

// 用於管理員測試的強制觸發警報
async function triggerAlarmTest(replyToken, groupId) {
    const code = REPAIR_CODES[Math.floor(Math.random() * REPAIR_CODES.length)];
    const alarmRef = db.collection('tsmc_alarms').doc(groupId);
    await alarmRef.set({
        createdAt: Date.now(),
        code: code,
        repairedBy: {}
    });
    
    const bubble = flexUtils.createBubble({
        size: 'mega',
        header: flexUtils.createHeader('⚠️ 手動測試警報', 'TSMC TEST', '#E65100', '#FFF3E0'),
        body: flexUtils.createBox('vertical', [
            flexUtils.createText({ text: '機台發出刺耳的逼逼聲！產線即將停擺！', size: 'sm', weight: 'bold', color: '#D32F2F', wrap: true }),
            flexUtils.createSeparator('md'),
            flexUtils.createText({ text: '🧑‍💻 請所有輪班星人立刻輸入以下指令搶修：', size: 'xs', color: '#333333', margin: 'md', wrap: true }),
            flexUtils.createText({ text: code, size: 'xl', weight: 'bold', color: '#1976D2', margin: 'sm', align: 'center' }),
            flexUtils.createSeparator('md'),
            flexUtils.createText({ text: '⏳ 限時 10 分鐘，逾時將造成 Down 機懲處！', size: 'xs', color: '#757575', margin: 'md', wrap: true }),
            flexUtils.createText({ text: '(測試提示：大約 10 分鐘後有人講話就會觸發結算報告)', size: 'xxs', color: '#9E9E9E', margin: 'sm', wrap: true })
        ], { paddingAll: 'xl', backgroundColor: '#FAFAFA' })
    });
    
    await lineUtils.replyFlex(replyToken, `⚠️ 【手動測試警報】請輸入：${code}`, bubble);
}

module.exports = {
    handleTsmcMessageEvent,
    joinTsmc,
    leaveTsmc,
    placeKuaiKuai,
    overtime,
    scapegoat,
    triggerAlarmTest
};
