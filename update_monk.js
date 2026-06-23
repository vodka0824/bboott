const fs = require('fs');

const path = './handlers/monk.js';
let content = fs.readFileSync(path, 'utf8');

// Replace fortuneTelling
content = content.replace(
    /async function fortuneTelling\([\s\S]*?\}\n\n\/\/ 2. 誦經/m,
    `async function fortuneTelling(replyToken, groupId, userId) {
    const cdCheck = await checkCooldown(userId, 'fortune', 15 * 60 * 1000);
    if (!cdCheck.allowed) return lineUtils.replyText(replyToken, cdCheck.msg);

    const roll = Math.random();
    
    if (roll < 0.40) {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '街邊算命', '😱 你恐嚇大老闆印堂發黑必有血光之災，成功騙到鉅額改運費！', 5000000, 0, 3, 'fortune');
    } else if (roll < 0.80) {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '街邊算命', '🗣️ 你隨便講了幾句星座運勢幹話，收到紅包。', 1000000, 0, 1, 'fortune');
    } else {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '街邊算命', '📉 你報給大媽的六合彩明牌全摃龜，大媽們要求退費！', -1000000, 0, 0, 'fortune');
    }
}

// 2. 誦經`
);

// Replace chanting
content = content.replace(
    /async function chanting\([\s\S]*?\}\n\n\/\/ 3. 放生/m,
    `async function chanting(replyToken, groupId, userId) {
    const cdCheck = await checkCooldown(userId, 'chanting', 30 * 60 * 1000);
    if (!cdCheck.allowed) return lineUtils.replyText(replyToken, cdCheck.msg);

    const roll = Math.random();
    
    if (roll < 0.30) {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '代客誦經', '😭 你去首富喪禮念經念得痛哭流涕，超逼真演技讓家屬感動大賞！', 8000000, 2, 1, 'chanting');
    } else if (roll < 0.70) {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '代客誦經', '🎤 念到一半發現跑錯靈堂，隨便混過去領走車馬費。', 3000000, 1, 2, 'chanting');
    } else if (roll < 0.90) {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '代客誦經', '😴 木魚敲到睡著狂打呼。通告費被沒收還被丟雞蛋！', -1000000, 0, 5, 'chanting');
    } else {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '代客誦經', '👻 去凶宅做法事結果被鬼壓床，跑去收驚花費鉅資。但你被嚇到屁滾尿流，業障竟然神奇地大減！', -3000000, 0, -5, 'chanting');
    }
}

// 3. 放生`
);

// Replace releaseAnimal
content = content.replace(
    /async function releaseAnimal\([\s\S]*?\}\n\n\/\/ 4. 化緣/m,
    `async function releaseAnimal(replyToken, groupId, userId) {
    const cdCheck = await checkCooldown(userId, 'release', 2 * 60 * 60 * 1000);
    if (!cdCheck.allowed) return lineUtils.replyText(replyToken, cdCheck.msg);

    if ((cdCheck.data.kuCoin || 0) < 1000000) {
        return lineUtils.replyText(replyToken, '❌ 放生需要購買動物，你的存款連 100 萬都不到！');
    }

    // 固定花費 100 萬
    let cost = -1000000;
    const roll = Math.random();
    
    if (roll < 0.50) {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '放生', '🐟 買了市場的小魚去放生，路過的善心人士深受感動捐款支持！', cost + 3000000, 5, 2, 'release');
    } else if (roll < 0.80) {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '放生', '💧 買了幾大卡車的礦泉水倒進水溝放生！智商堪憂，但信徒覺得你很有大愛並熱烈捐款！', cost + 10000000, 10, 5, 'release');
    } else {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '放生', '🐍 買毒蛇放生反被咬，緊急送醫花費大筆醫藥費！', cost - 5000000, 0, 5, 'release');
    }
}

// 4. 化緣`
);

// Replace begging
content = content.replace(
    /async function begging\([\s\S]*?\}\n\n\/\/ 5. 弘法/m,
    `async function begging(replyToken, groupId, userId) {
    const cdCheck = await checkCooldown(userId, 'begging', 6 * 60 * 60 * 1000);
    if (!cdCheck.allowed) return lineUtils.replyText(replyToken, cdCheck.msg);

    const roll = Math.random();
    
    if (roll < 0.30) {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '化緣', '🍀 成功洗腦路過的貴婦，推銷出高價開光佛珠！', 20000000, 2, 5, 'begging');
    } else if (roll < 0.80) {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '化緣', '😐 在路邊罰站一天，化到幾個便當跟一些香油錢。', 5000000, 0, -2, 'begging'); // 降業障
    } else {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '化緣', '💀 遇到+9陣頭被嗆「看三小」並扁了一頓，損失醫藥費。', -3000000, 0, 0, 'begging');
    }
}

// 5. 弘法`
);

// Replace preach
content = content.replace(
    /async function preach\([\s\S]*?\}\n\n\/\/ 6. 辦法會/m,
    `async function preach(replyToken, groupId, userId) {
    const cdCheck = await checkCooldown(userId, 'preach', 4 * 60 * 60 * 1000);
    if (!cdCheck.allowed) return lineUtils.replyText(replyToken, cdCheck.msg);

    if ((cdCheck.data.kuCoin || 0) < 10000000) {
        return lineUtils.replyText(replyToken, '❌ 電視台時段費需要 1000 萬，你錢不夠！');
    }

    let cost = -10000000;
    const roll = Math.random();
    
    if (roll < 0.30) {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '電視弘法', '🔥 弘法神曲爆紅！信徒激動落淚大喊「感恩師父！讚嘆師父！」', cost + 30000000, 20, 15, 'preach');
    } else if (roll < 0.80) {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '電視弘法', '👴 只有早起的阿公阿嬤在看，勉強吸收了幾個信徒並收到一點捐款。', cost + 15000000, 5, 5, 'preach');
    } else {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '電視弘法', '🤬 講道時不小心爆粗口被直播出去！遭 NCC 重罰！', cost - 20000000, -5, 0, 'preach');
    }
}

// 6. 辦法會`
);

// Replace ceremony
content = content.replace(
    /async function ceremony\([\s\S]*?\}\n\n\/\/ 7. 賣塔位/m,
    `async function ceremony(replyToken, groupId, userId) {
    const cdCheck = await checkCooldown(userId, 'ceremony', 12 * 60 * 60 * 1000);
    if (!cdCheck.allowed) return lineUtils.replyText(replyToken, cdCheck.msg);

    if ((cdCheck.data.followers || 0) < 10) {
        return lineUtils.replyText(replyToken, '❌ 辦法會需要至少 10 名信徒，不然沒人參加！');
    }

    const roll = Math.random();
    
    if (roll < 0.30) {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '祈福法會', '🎉 請了辣妹鋼管陣頭來大雄寶殿跳舞還願，氣氛嗨翻天，吸金無數！', 80000000, 15, 15, 'ceremony');
    } else if (roll < 0.70) {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '祈福法會', '🎐 正常舉辦念經消災法會，信眾熱烈捐獻。', 30000000, 5, 5, 'ceremony');
    } else if (roll < 0.90) {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '祈福法會', '🚨 法會被檢舉噪音污染，遭環保局開單開罰！', -10000000, 0, 0, 'ceremony');
    } else {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '祈福法會', '🔪 被地方黑道堂口強收保護費，法會被迫取消！', -30000000, -10, 0, 'ceremony');
    }
}

// 7. 賣塔位`
);

// Replace sellNiche
content = content.replace(
    /async function sellNiche\([\s\S]*?\}\n\n\/\/ 8. 雙修/m,
    `async function sellNiche(replyToken, groupId, userId, targetId) {
    const cdCheck = await checkCooldown(userId, 'sellNiche', 18 * 60 * 60 * 1000);
    if (!cdCheck.allowed) return lineUtils.replyText(replyToken, cdCheck.msg);

    if ((cdCheck.data.followers || 0) < 10) {
        return lineUtils.replyText(replyToken, '❌ 階級不足，需至少 10 名信徒。');
    }

    const targetDoc = await db.collection('economy_users').doc(targetId).get();
    if (!targetDoc.exists || (targetDoc.data().kuCoin || 0) < 50000000) {
        return lineUtils.replyText(replyToken, '❌ 對方太窮了（餘額低於 5000 萬），推銷靈骨塔對他沒用。');
    }

    const targetCoin = targetDoc.data().kuCoin;
    const roll = Math.random();
    const targetName = await lineUtils.getGroupMemberName(groupId, targetId) || '信徒';
    
    if (roll < 0.60) {
        const stealAmount = Math.floor(targetCoin * 0.12);
        const economyHandler = require('./economy'); // Require economyHandler inside if needed
        await economyHandler.addCoinQuietly(groupId, targetId, -stealAmount);
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '推銷塔位', \`😇 成功用「祖先業障重」恐嚇 \${targetName}，強迫推銷極樂海景塔位，奪走對方 12% 總財產！\`, stealAmount, 5, 10, 'sellNiche');
    } else if (roll < 0.85) {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '推銷塔位', \`🤡 想騙 \${targetName}，結果對方剛好也是詐騙集團！你反被騙走活動資金！\`, -10000000, 0, 5, 'sellNiche');
    } else {
        await db.collection('economy_users').doc(userId).set({
            jailUntil: Date.now() + 4 * 60 * 60 * 1000,
            jailReason: '靈骨塔詐騙'
        }, { merge: true });
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '推銷塔位', \`🚔 對 \${targetName} 推銷靈骨塔被認定為惡性詐騙！警察當場逮人，直接無條件入獄 4 小時！\`, -20000000, 0, 15, 'sellNiche');
    }
}

// 8. 雙修`
);

// Replace dualCultivation
content = content.replace(
    /async function dualCultivation\([\s\S]*?\}\n\n\/\/ 9. 蓋廟/m,
    `async function dualCultivation(replyToken, groupId, userId, targetId) {
    const cdCheck = await checkCooldown(userId, 'dualCultivation', 24 * 60 * 60 * 1000);
    if (!cdCheck.allowed) return lineUtils.replyText(replyToken, cdCheck.msg);

    if ((cdCheck.data.followers || 0) < 50) {
        return lineUtils.replyText(replyToken, '❌ 階級不足，雙修需要至少 50 名信徒（斂財住持）。');
    }

    const targetDoc = await db.collection('economy_users').doc(targetId).get();
    if (!targetDoc.exists || (targetDoc.data().kuCoin || 0) < 100000000) {
        return lineUtils.replyText(replyToken, '❌ 對方身家不到 1 億，不配與你雙修！');
    }

    const targetCoin = targetDoc.data().kuCoin;
    const roll = Math.random();
    const targetName = await lineUtils.getGroupMemberName(groupId, targetId) || '信眾';
    
    if (roll < 0.50) {
        const stealAmount = Math.floor(targetCoin * 0.20);
        const economyHandler = require('./economy'); // Require economyHandler inside if needed
        await economyHandler.addCoinQuietly(groupId, targetId, -stealAmount);
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '歡喜雙修', \`💖 \${targetName} 被無上佛法徹底洗腦，與你靈肉合一！你順利轉移了對方 20% 總資產！\`, stealAmount, 10, 30, 'dualCultivation');
    } else if (roll < 0.80) {
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '歡喜雙修', \`🤬 \${targetName} 覺得你是死變態並報警！你緊急賠償和解金平息風波！\`, -30000000, 0, 10, 'dualCultivation');
    } else {
        await db.collection('economy_users').doc(userId).set({
            jailUntil: Date.now() + 8 * 60 * 60 * 1000,
            jailReason: '宗教性侵騙財'
        }, { merge: true });
        await processSkillResult(replyToken, groupId, userId, cdCheck.data, '歡喜雙修', \`📸 與 \${targetName} 開房間被壹週刊偷拍爆料！身敗名裂被勒索封口費，信徒大幅流失，並遭檢調收押入獄 8 小時！\`, -50000000, -20, 40, 'dualCultivation');
    }
}

// 9. 蓋廟`
);

// Replace buildTemple 2000000 with 1000000
content = content.replace(/const costPerKarma = 2000000;/g, 'const costPerKarma = 1000000;');
content = content.replace(/200萬/g, '100萬');
content = content.replace(/2000萬/g, '1000萬');
content = content.replace(/2,000,000/g, '1,000,000');
content = content.replace(/2000000 哭幣/g, '1000000 哭幣');

fs.writeFileSync(path, content, 'utf8');

console.log('Update monk skills complete.');
