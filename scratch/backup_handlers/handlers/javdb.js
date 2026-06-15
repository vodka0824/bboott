/**
 * JavDB Handler - 番號查詢封面
 * 
 * ⚠️ 警告: 此功能涉及成人內容，僅供測試
 * 
 * 整合到 LINE Bot:
 * 指令: 查封面 SSIS-001
 * 
 * 刪除方式:
 * 1. 刪除此檔案 (handlers/javdb.js)
 * 2. 從 routes.js 移除相關路由
 * 3. 刪除 tests/javdb/ 資料夾
 */

const { searchByCode } = require('../tests/javdb/javdb-api');
const lineUtils = require('../utils/line');

/**
 * 處理 JavDB 查詢請求
 * @param {string} replyToken - LINE reply token
 * @param {string} code - 番號
 */
async function handleJavdbQuery(replyToken, code) {
    try {
        console.log(`[JavDB] 查詢番號: ${code}`);

        // 查詢番號
        const result = await searchByCode(code);

        if (result.success) {
            // 成功：回傳封面圖片與詳細資訊
            const {
                code: resultCode,
                title,
                coverUrl,
                date,
                duration,
                director,
                studio,
                series,
                rating,
                actors
            } = result.data;

            // 建立資訊欄位陣列
            const infoFields = [];

            // 添加各項資訊（只顯示有值的欄位）
            if (date) {
                infoFields.push({
                    type: 'box',
                    layout: 'baseline',
                    spacing: 'sm',
                    contents: [
                        {
                            type: 'text',
                            text: '日期',
                            color: '#AAAAAA',
                            size: 'xs',
                            flex: 2
                        },
                        {
                            type: 'text',
                            text: date,
                            wrap: true,
                            color: '#666666',
                            size: 'xs',
                            flex: 5
                        }
                    ]
                });
            }

            if (duration) {
                infoFields.push({
                    type: 'box',
                    layout: 'baseline',
                    spacing: 'sm',
                    contents: [
                        {
                            type: 'text',
                            text: '時長',
                            color: '#AAAAAA',
                            size: 'xs',
                            flex: 2
                        },
                        {
                            type: 'text',
                            text: duration,
                            wrap: true,
                            color: '#666666',
                            size: 'xs',
                            flex: 5
                        }
                    ]
                });
            }

            if (director) {
                infoFields.push({
                    type: 'box',
                    layout: 'baseline',
                    spacing: 'sm',
                    contents: [
                        {
                            type: 'text',
                            text: '導演',
                            color: '#AAAAAA',
                            size: 'xs',
                            flex: 2
                        },
                        {
                            type: 'text',
                            text: director,
                            wrap: true,
                            color: '#666666',
                            size: 'xs',
                            flex: 5
                        }
                    ]
                });
            }

            if (studio) {
                infoFields.push({
                    type: 'box',
                    layout: 'baseline',
                    spacing: 'sm',
                    contents: [
                        {
                            type: 'text',
                            text: '片商',
                            color: '#AAAAAA',
                            size: 'xs',
                            flex: 2
                        },
                        {
                            type: 'text',
                            text: studio,
                            wrap: true,
                            color: '#666666',
                            size: 'xs',
                            flex: 5
                        }
                    ]
                });
            }

            if (series) {
                infoFields.push({
                    type: 'box',
                    layout: 'baseline',
                    spacing: 'sm',
                    contents: [
                        {
                            type: 'text',
                            text: '系列',
                            color: '#AAAAAA',
                            size: 'xs',
                            flex: 2
                        },
                        {
                            type: 'text',
                            text: series,
                            wrap: true,
                            color: '#666666',
                            size: 'xs',
                            flex: 5
                        }
                    ]
                });
            }

            if (rating) {
                infoFields.push({
                    type: 'box',
                    layout: 'baseline',
                    spacing: 'sm',
                    contents: [
                        {
                            type: 'text',
                            text: '評分',
                            color: '#AAAAAA',
                            size: 'xs',
                            flex: 2
                        },
                        {
                            type: 'text',
                            text: rating,
                            wrap: true,
                            color: '#FF6B6B',
                            size: 'xs',
                            flex: 5,
                            weight: 'bold'
                        }
                    ]
                });
            }

            if (actors && actors.length > 0) {
                infoFields.push({
                    type: 'box',
                    layout: 'baseline',
                    spacing: 'sm',
                    contents: [
                        {
                            type: 'text',
                            text: '演員',
                            color: '#AAAAAA',
                            size: 'xs',
                            flex: 2
                        },
                        {
                            type: 'text',
                            text: actors.join(', '),
                            wrap: true,
                            color: '#666666',
                            size: 'xs',
                            flex: 5
                        }
                    ]
                });
            }

            // 使用優化的 Flex Message 呈現結果
            const flexMessage = {
                type: 'bubble',
                size: 'mega',
                hero: {
                    type: 'image',
                    url: coverUrl,
                    size: 'full',
                    aspectRatio: '1.91:1', // 最接近實際比例 (800:432 = 1.85:1)
                    aspectMode: 'cover' // 填滿整個容器，無左右留白
                },
                body: {
                    type: 'box',
                    layout: 'vertical',
                    spacing: 'none', // 移除間距
                    paddingAll: '12px', // 減少內距
                    contents: [
                        {
                            type: 'text',
                            text: resultCode,
                            weight: 'bold',
                            size: 'lg', // 從 xl 改為 lg
                            color: '#FF6B6B',
                            wrap: true
                        },
                        {
                            type: 'text',
                            text: title || '無標題資訊',
                            wrap: true,
                            color: '#666666',
                            size: 'xs', // 減小字體
                            margin: 'sm' // 減少上邊距
                        },
                        {
                            type: 'separator',
                            margin: 'md' // 減少分隔線邊距
                        },
                        {
                            type: 'box',
                            layout: 'vertical',
                            margin: 'md', // 減少上邊距
                            spacing: 'xs', // 緊湊間距
                            contents: infoFields.length > 0 ? infoFields : [
                                {
                                    type: 'text',
                                    text: '暫無詳細資訊',
                                    color: '#AAAAAA',
                                    size: 'xs'
                                }
                            ]
                        }
                    ]
                }
            };

            await lineUtils.replyFlex(replyToken, `${code} 詳細資訊`, flexMessage);
            console.log(`[JavDB] 成功回傳: ${code}`);

        } else {
            // 失敗：回傳錯誤訊息
            await lineUtils.replyText(replyToken, `❌ ${result.error}`);
            console.log(`[JavDB] 查詢失敗: ${result.error}`);
        }

    } catch (error) {
        console.error('[JavDB] 錯誤:', error);
        await lineUtils.replyText(replyToken, '❌ 查詢失敗，請稍後再試');
    }
}

module.exports = {
    handleJavdbQuery
};
