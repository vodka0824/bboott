const flexUtils = require('../utils/flex');
/**
 * 黑貓物流查詢模組
 */
const axios = require('axios');
const lineUtils = require('../utils/line');

/**
 * 查詢黑貓物流狀態
 */
async function getTcatStatus(billId) {
    const url = 'https://www.t-cat.com.tw/inquire/TraceDetail.aspx?BillID=' + billId;

    try {
        const res = await axios.get(url, {
            headers: { "User-Agent": "Mozilla/5.0" },
            timeout: 10000
        });
        const html = res.data;

        const tableMatch = html.match(/<table[^>]*id="resultTable"[^>]*>([\s\S]*?)<\/table>/i);
        if (!tableMatch) return { error: `查無單號 ${billId}` };

        const trs = tableMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
        const rows = trs.slice(1).map(tr => {
            const tds = tr.match(/<td[^>]*>([\s\S]*?)<\/td>/gi).map(td =>
                td.replace(/<[^>]+>/g, '').trim()
            );
            return {
                time: tds.length === 4 ? tds[2] : tds[1],
                status: tds.length === 4 ? tds[1] : tds[0],
                location: tds.length === 4 ? tds[3] : tds[2]
            };
        });

        return { rows, url };
    } catch (e) {
        console.error('[TCAT] Query Error:', e.message);
        return { error: '物流查詢失敗' };
    }
}

/**
 * 建構黑貓查詢結果 Flex Message
 */
function buildTcatFlex(billId, rows, url) {
    const items = rows.map((r, i) => ({
        type: "box",
        layout: "vertical",
        margin: i === 0 ? "none" : "md",
        contents: [
            { type: "text", text: `📅 ${r.time}`, size: "sm", color: flexUtils.COLORS.TEXT_MUTED },
            { type: "text", text: `🚚 ${r.status}`, weight: "bold", color: r.status.includes('送達') ? "#22BB33" : "#333333" },
            { type: "text", text: `📍 ${r.location}`, size: "sm", color: "#555555" }
        ]
    }));

    return {
        type: "bubble",
        header: {
            type: "box",
            layout: "vertical",
            contents: [{ type: "text", text: `📦 單號: ${billId}`, weight: "bold", color: "#1DB446" }]
        },
        body: {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            contents: items.slice(0, 10)
        },
        footer: {
            type: "box",
            layout: "vertical",
            contents: [{
                type: "button",
                action: { type: "uri", label: "官網詳情", uri: url },
                style: "primary",
                color: "#1DB446"
            }]
        }
    };
}

/**
 * 處理黑貓查詢指令
 */
async function handleTcatQuery(replyToken, billId) {
    const result = await getTcatStatus(billId);

    if (result.error) {
        await lineUtils.replyText(replyToken, `❌ ${result.error}`);
        return;
    }

    const flex = buildTcatFlex(billId, result.rows, result.url);
    await lineUtils.replyFlex(replyToken, `黑貓查詢 ${billId}`, flex);
}

module.exports = {
    getTcatStatus,
    buildTcatFlex,
    handleTcatQuery
};
