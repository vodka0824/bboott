const { db } = require('../utils/db');
const lineUtils = require('../utils/line');
const flexUtils = require('../utils/flex');

// --- 職業切換 ---
async function joinTsmc(replyToken, groupId, userId) {
    const memberName = await lineUtils.getGroupMemberName(groupId, userId);
    
    await db.runTransaction(async (t) => {
        const docRef = db.collection('economy_users').doc(userId);
        const doc = await t.get(docRef);
        if (!doc.exists) throw new Error('NOT_FOUND');
        const data = doc.data();

        // 檢查是否已有其他職業
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
        else if (e.message === 'HAS_PROFESSION') await lineUtils.replyText(replyToken, '❌ 系統嚴格禁止雙職業！你想當輪班星人，必須先辭去現在的職業（如：還俗、退伍、斷指等）。');
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
            tsmcCooldowns: db.FieldValue.delete()
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
        // 買錯乖乖
        await db.collection('economy_users').doc(userId).update({
            tsmcKpi: db.FieldValue.increment(-30),
            'tsmcCooldowns.kuaiKuai': Date.now()
        });
        const msg = `😱 【嚴重失誤】\n${memberName} 因為太累眼花，不小心把【黃色五香乖乖】放上機台！\n機台當場大當機，副總氣炸，你的績效被扣除 30 點！`;
        await lineUtils.replyText(replyToken, msg);
    } else {
        // 成功
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
    
    // 增加疲勞值，並判斷是否爆肝送醫
    const currentFatigue = data.tsmcFatigue || 0;
    const addedFatigue = Math.floor(Math.random() * 10) + 10; // +10~20
    const newFatigue = currentFatigue + addedFatigue;
    
    // 爆肝機率公式 (疲勞值 > 50 開始有機會，疲勞值越高機率越大)
    let collapseChance = 0;
    if (newFatigue > 100) collapseChance = 0.5;
    else if (newFatigue > 80) collapseChance = 0.3;
    else if (newFatigue > 50) collapseChance = 0.1;

    if (Math.random() < collapseChance) {
        // 爆肝送醫！
        const currentMoney = data.kuCoin || 0;
        const medicalBill = Math.floor(currentMoney * 0.5);
        
        await db.collection('economy_users').doc(userId).update({
            kuCoin: db.FieldValue.increment(-medicalBill),
            tsmcFatigue: 0, // 送醫後疲勞清空
            jailedUntil: Date.now() + 6 * 60 * 60 * 1000, // 躺醫院 6 小時 (套用坐牢機制)
            jailReason: '爆肝送醫急救',
            tsmcOvertimeBuff: false,
            'tsmcCooldowns.overtime': Date.now()
        });
        
        const msg = `🚑 【爆肝送醫】\n${memberName} 灌完拿鐵後突然眼前一黑，倒在產線旁！\n\n經緊急送醫搶救，被強制留院觀察 6 小時（期間無法行動）。\n並且支付了高達 ${medicalBill.toLocaleString()} 哭幣的龐大醫療費（總資產 50%）！\n\n(疲勞值已歸零)`;
        await lineUtils.replyText(replyToken, msg);
    } else {
        // 成功加班
        await db.collection('economy_users').doc(userId).update({
            tsmcFatigue: newFatigue,
            tsmcOvertimeBuff: true, // 標記下一次維修績效x3
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
    
    // 檢查是否處於「漏維修」狀態 (需有一個標記)
    if (!data.tsmcMissedRepair) {
        await lineUtils.replyText(replyToken, '❌ 甩鍋失敗：你目前沒有「漏維修」的懲罰紀錄可以甩鍋！只有在 Down 機被扣績效後才能找替死鬼。');
        return;
    }

    const targetName = await lineUtils.getGroupMemberName(groupId, targetId);
    
    // 執行甩鍋
    await db.runTransaction(async (t) => {
        const targetRef = db.collection('economy_users').doc(targetId);
        const targetDoc = await t.get(targetRef);
        const targetData = targetDoc.exists ? targetDoc.data() : {};
        
        // 扣除目標 100 萬罰款
        t.update(targetRef, {
            kuCoin: db.FieldValue.increment(-1000000)
        }, { merge: true });
        
        // 自己恢復 20 點績效，並解除 tsmcMissedRepair 標記
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

module.exports = {
    joinTsmc,
    leaveTsmc,
    placeKuaiKuai,
    overtime,
    scapegoat
};
