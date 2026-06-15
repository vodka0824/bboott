const lineUtils = require('../utils/line');

/**
 * 狂標 (Tag Blast)
 * @param {Object} context 路由上下文
 * @param {Array} match 正則匹配結果
 */
async function handleTagBlast(context, match) {
    const { messageObject, replyToken } = context;

    // 1. 檢查是否有提及對象 (Mentions)
    const mentions = messageObject.mention && messageObject.mention.mentionees;
    if (!mentions || mentions.length === 0) {
        await lineUtils.replyText(replyToken, '❌ 請標記(Tag)一位要狂標的對象！');
        return;
    }

    // 取第一個被標記的人 (為了避免濫用，一次只標一人)
    const target = mentions[0];
    const targetUserId = target.userId;

    // 2. 解析次數 (限制 1~5 次)
    let count = parseInt(match[1]);
    if (isNaN(count)) count = 5; // Default 5
    if (count > 5) count = 5;    // Max 5
    if (count < 1) count = 1;    // Min 1

    // 3. 建構訊息陣列
    // 為了觸發通知，每個訊息都需要包含真正的 Mention Object
    const messages = [];
    for (let i = 0; i < count; i++) {
        messages.push({
            type: 'text',
            text: '起來嗨！ @Target', // 顯示文字
            mention: {
                mentionees: [
                    {
                        index: 5,     // "起來嗨！ " length is 5
                        length: 7,    // "@Target" length is 7
                        userId: targetUserId
                    }
                ]
            }
        });
    }

    // 4. 發送 (使用 replyToLine 支援多則訊息)
    await lineUtils.replyToLine(replyToken, messages);
}

module.exports = {
    handleTagBlast
};

