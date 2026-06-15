/**
 * 遊戲功能模組
 */
const { replyText } = require('../utils/line');

const economyHandler = require('./economy');

// === 剪刀石頭布 ===
async function handleRPS(replyToken, userChoice, groupId, userId) {
    const cost = 10;
    const consumeResult = await economyHandler.consumeCoin(groupId, userId, cost);
    if (!consumeResult.success) {
        await replyText(replyToken, `❌ 餘額不足！猜拳需要 ${cost} 哭幣。`);
        return;
    }

    const choices = ['剪刀', '石頭', '布'];
    const emojis = { '剪刀': '✌️', '石頭': '✊', '布': '🖐️' };
    const botChoice = choices[Math.floor(Math.random() * 3)];

    let result;
    if (userChoice === botChoice) {
        result = '🤝 平手！ (退回 10 哭幣)';
        await economyHandler.addCoinQuietly(groupId, userId, cost);
    } else if (
        (userChoice === '剪刀' && botChoice === '布') ||
        (userChoice === '石頭' && botChoice === '剪刀') ||
        (userChoice === '布' && botChoice === '石頭')
    ) {
        result = '🎉 你贏了！ (贏得 20 哭幣)';
        await economyHandler.addCoinQuietly(groupId, userId, cost * 2);
    } else {
        result = `😢 你輸了！ (損失 ${cost} 哭幣)`;
    }

    const msg = `${emojis[userChoice]} vs ${emojis[botChoice]}\n你：${userChoice}\n我：${botChoice}\n\n${result}`;
    await replyText(replyToken, msg);
}

module.exports = {
    handleRPS
};
