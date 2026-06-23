const flexUtils = require('../utils/flex');
/**
 * iTaigi 台語查詢模組
 */
const axios = require('axios');
const lineUtils = require('../utils/line');

// iTaigi API 端點 (使用 URL 編碼路徑)
const ITAIGI_API = 'https://itaigi.tw/%E5%B9%B3%E8%87%BA%E9%A0%85%E7%9B%AE%E5%88%97%E8%A1%A8/%E6%8F%A3%E5%88%97%E8%A1%A8';
const ITAIGI_AUDIO_API = 'https://hapsing.itaigi.tw/bangtsam';
// 自訂音檔播放器頁面 (GitHub Pages)
const AUDIO_PLAYER_URL = 'https://vodka0824.github.io/lineBot/taigi-player.html';

/**
 * 查詢台語發音
 */
async function searchTaigi(keyword) {
    try {
        // 使用完整編碼的 URL
        const url = `${ITAIGI_API}?%E9%97%9C%E9%8D%B5%E5%AD%97=${encodeURIComponent(keyword)}`;
        const res = await axios.get(url, { timeout: 10000 });

        const results = res.data?.列表 || [];
        if (results.length === 0) return null;

        // 解析結果
        const parsed = [];
        for (const item of results.slice(0, 5)) { // 最多取5筆
            const translations = item.新詞文本 || [];
            for (const trans of translations.slice(0, 3)) { // 每個詞最多3個翻譯
                if (trans.音標資料) {
                    parsed.push({
                        hanzi: trans.文本資料 || keyword,
                        romanization: trans.音標資料,
                        audioUrl: `${ITAIGI_AUDIO_API}?taibun=${encodeURIComponent(trans.音標資料)}`
                    });
                }
            }
        }

        // 去除重複結果 (依羅馬拼音去重)
        const unique = [...new Map(parsed.map(p => [p.romanization, p])).values()];

        return unique.length > 0 ? unique : null;
    } catch (error) {
        console.error('[iTaigi] API Error:', error.message);
        return null;
    }
}

/**
 * 建構台語查詢 Flex Message (Carousel 輪播格式)
 */
function buildTaigiFlex(keyword, results) {
    // 查無結果
    if (!results || results.length === 0) {
        return {
            type: "bubble",
            body: {
                type: "box",
                layout: "vertical",
                contents: [
                    { type: "text", text: "🗣️ iTaigi 台語辭典", weight: "bold", size: "lg", color: "#E65100" },
                    { type: "separator", margin: "md" },
                    { type: "text", text: `查無「${keyword}」的台語發音`, size: "sm", color: flexUtils.COLORS.TEXT_MUTED, margin: "md", wrap: true },
                    { type: "text", text: "請嘗試其他關鍵字", size: "xs", color: flexUtils.COLORS.TEXT_SUB, margin: "sm" }
                ],
                paddingAll: "15px"
            }
        };
    }

    // 建構多個 bubble (每個結果一張卡片)
    const bubbles = results.slice(0, 10).map((r, index) => ({
        type: "bubble",
        size: "kilo",
        header: {
            type: "box",
            layout: "vertical",
            contents: [
                { type: "text", text: `${keyword} 的台語唸法`, size: "sm", color: flexUtils.COLORS.TEXT_MAIN }
            ],
            backgroundColor: "#E65100",
            paddingAll: "12px"
        },
        body: {
            type: "box",
            layout: "vertical",
            contents: [
                { type: "text", text: "拼音", size: "xs", color: flexUtils.COLORS.TEXT_SUB },
                { type: "text", text: `${r.hanzi}(${r.romanization})`, size: "xl", weight: "bold", color: "#333333", margin: "sm", wrap: true }
            ],
            paddingAll: "15px",
            justifyContent: "center"
        },
        footer: {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            contents: [
                {
                    type: "button",
                    action: {
                        type: "uri",
                        label: "聽發音",
                        // 使用自訂音檔播放器頁面
                        uri: `${AUDIO_PLAYER_URL}?word=${encodeURIComponent(r.hanzi)}&rom=${encodeURIComponent(r.romanization)}`
                    },
                    style: "link",
                    color: "#E65100",
                    height: "sm"
                },
                {
                    type: "button",
                    action: {
                        type: "uri",
                        label: "分享這個唸法",
                        uri: `https://itaigi.tw/chhoe?q=${encodeURIComponent(keyword)}`
                    },
                    style: "link",
                    color: flexUtils.COLORS.TEXT_MUTED,
                    height: "sm"
                }
            ],
            paddingAll: "10px"
        }
    }));

    // 回傳 Carousel 格式
    return {
        type: "carousel",
        contents: bubbles
    };
}

/**
 * 處理台語查詢指令
 */
async function handleTaigi(replyToken, message) {
    // 解析關鍵字 (格式: 講台語 XXX)
    const keyword = message.replace(/^講台語\s*/, '').trim();

    if (!keyword) {
        await lineUtils.replyText(replyToken, '❌ 請輸入要查詢的詞彙\n\n範例：講台語 你好');
        return;
    }

    const results = await searchTaigi(keyword);

    if (!results || results.length === 0) {
        await lineUtils.replyText(replyToken, `❌ 查無「${keyword}」的台語發音\n\n請嘗試其他關鍵字`);
        return;
    }

    // 建構音檔訊息陣列 (LINE 最多允許 5 則訊息)
    const displayResults = results.slice(0, 4); // 最多 4 個 (1 Flex + 4 audio = 5)

    const audioMessages = displayResults.map(r => ({
        type: 'audio',
        originalContentUrl: `${ITAIGI_AUDIO_API}?taibun=${encodeURIComponent(r.romanization)}`,
        duration: 2000
    }));

    // 建構 Flex Message 說明
    const flexMessage = {
        type: 'flex',
        altText: `${keyword} 的台語發音`,
        contents: {
            type: 'bubble',
            size: 'kilo',
            header: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    { type: 'text', text: '🗣️ 愛呆丸講台語', weight: 'bold', size: 'md', color: flexUtils.COLORS.TEXT_MAIN }
                ],
                backgroundColor: '#E65100',
                paddingAll: '12px'
            },
            body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    { type: 'text', text: `查詢: ${keyword}`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED },
                    { type: 'separator', margin: 'md' },
                    ...displayResults.map((r, i) => ({
                        type: 'box',
                        layout: 'horizontal',
                        margin: 'md',
                        contents: [
                            { type: 'text', text: `${i + 1}.`, size: 'sm', color: '#E65100', flex: 1 },
                            { type: 'text', text: r.hanzi, size: 'sm', weight: 'bold', flex: 3 },
                            { type: 'text', text: r.romanization, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, flex: 4 }
                        ]
                    }))
                ],
                paddingAll: '12px'
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    { type: 'text', text: '⬇️ 以下為發音音檔', size: 'xs', color: flexUtils.COLORS.TEXT_SUB, align: 'center' }
                ],
                paddingAll: '8px'
            }
        }
    };

    // 發送: Flex 說明 + 多個音檔
    await lineUtils.replyToLine(replyToken, [flexMessage, ...audioMessages]);
}

module.exports = {
    searchTaigi,
    buildTaigiFlex,
    handleTaigi
};
