/**
 * 待辦事項模組 (Kanban Style Optimization)
 */
const { db, Firestore } = require('../utils/firestore');
const flexUtils = require('../utils/flex');
const lineUtils = require('../utils/line');
const memoryCache = require('../utils/memoryCache');

// Status Constants
const STATUS = {
    PENDING: 'pending',   // 待處理
    PROGRESS: 'progress', // 進行中
    READY: 'ready',       // 待取件
    DONE: 'done'          // 已結案 (Archived)
};

// Priority Constants
const PRIORITY_ORDER = { high: 1, medium: 2, low: 3 };
const PRIORITY_EMOJI = { high: '🔴', medium: '🟡', low: '🟢' };

// Category Constants
const CATEGORY_INFO = {
    new: { label: '新機', icon: '🆕', color: '#1E90FF' },
    repair: { label: '維修', icon: '🔧', color: '#FF8C00' },
    other: { label: '其他', icon: '📋', color: '#808080' }
};

// Helper: Get Icon for Category
function getCatInfo(cat) {
    return CATEGORY_INFO[cat] || CATEGORY_INFO.other;
}

// Helper: Normalize Item (Migration)
function normalizeItem(item) {
    if (!item.status) {
        // Migration logic for old items
        item.status = item.done ? STATUS.DONE : STATUS.PENDING;
    }
    return item;
}

// 新增待辦事項
async function addTodo(groupId, text, userId, priority = 'low', category = 'other') {
    const todoRef = db.collection('todos').doc(groupId);
    const doc = await todoRef.get();

    const newItem = {
        text: text,
        priority: priority,
        priorityOrder: PRIORITY_ORDER[priority] || 3,
        category: category,
        status: STATUS.PENDING, // Default status
        subStatus: '',          // e.g., '燒機中', '待料'
        createdAt: Date.now(),
        createdBy: userId,
        updatedAt: Date.now()
    };

    if (doc.exists) {
        await todoRef.update({
            items: Firestore.FieldValue.arrayUnion(newItem)
        });
    } else {
        await todoRef.set({
            items: [newItem]
        });
    }

    // Update Cache
    const cacheKey = `todo_list_${groupId}`;
    const cached = memoryCache.get(cacheKey);
    if (cached) {
        cached.unshift(newItem);
        memoryCache.set(cacheKey, cached, 1800);
    } else {
        memoryCache.delete(cacheKey);
    }

    const cat = getCatInfo(category);
    return { ...newItem, emoji: PRIORITY_EMOJI[priority], catIcon: cat.icon, catLabel: cat.label };
}

// 取得待辦事項列表
async function getTodoList(groupId) {
    const cacheKey = `todo_list_${groupId}`;
    const cached = memoryCache.get(cacheKey);
    if (cached) return cached.map(normalizeItem);

    const doc = await db.collection('todos').doc(groupId).get();
    let items = doc.exists ? (doc.data().items || []) : [];

    // Normalize
    items = items.map(normalizeItem);

    // Cache
    memoryCache.set(cacheKey, items, 1800);
    return items;
}

// 更新狀態 (Transactional)
async function updateTodoStatus(groupId, itemId, newStatus, subStatus = null) {
    const todoRef = db.collection('todos').doc(groupId);
    try {
        return await db.runTransaction(async (t) => {
            const doc = await t.get(todoRef);
            if (!doc.exists) return { success: false, message: '沒有待辦事項' };

            const items = doc.data().items || [];
            const targetIndex = items.findIndex(item => String(item.createdAt) === String(itemId));

            if (targetIndex === -1) return { success: false, message: '找不到該項目' };

            // Update
            if (newStatus) items[targetIndex].status = newStatus;
            if (subStatus !== null) items[targetIndex].subStatus = subStatus;
            items[targetIndex].updatedAt = Date.now();

            // If done, set completedAt
            if (newStatus === STATUS.DONE) {
                items[targetIndex].completedAt = Date.now();
                // Remove from active list to simulate archiving
                const removed = items.splice(targetIndex, 1)[0];
                t.update(todoRef, { items: items });
                memoryCache.delete(`todo_list_${groupId}`);
                return { success: true, text: removed.text, status: STATUS.DONE };
            }

            t.update(todoRef, { items: items });
            memoryCache.delete(`todo_list_${groupId}`);

            return {
                success: true,
                text: items[targetIndex].text,
                status: items[targetIndex].status,
                category: items[targetIndex].category
            };
        });
    } catch (e) {
        console.error('[Todo] Update Status Error:', e);
        return { success: false, message: '更新失敗' };
    }
}

// 刪除項目
async function deleteTodo(groupId, itemId) {
    return await updateTodoStatus(groupId, itemId, STATUS.DONE); // Reuse logic
}

// 更新優先級 / 分類
async function updateMeta(groupId, itemId, { priority, category }) {
    const todoRef = db.collection('todos').doc(groupId);
    try {
        return await db.runTransaction(async (t) => {
            const doc = await t.get(todoRef);
            if (!doc.exists) return { success: false, message: '無資料' };

            const items = doc.data().items || [];
            const targetIndex = items.findIndex(item => String(item.createdAt) === String(itemId));
            if (targetIndex === -1) return { success: false, message: '找不到' };

            if (priority) {
                items[targetIndex].priority = priority;
                items[targetIndex].priorityOrder = PRIORITY_ORDER[priority] || 3;
            }
            if (category) {
                items[targetIndex].category = category;
            }

            t.update(todoRef, { items: items });
            memoryCache.delete(`todo_list_${groupId}`);
            return { success: true, item: items[targetIndex] };
        });
    } catch (e) {
        console.error('[Todo] Update Meta Error:', e);
        return { success: false, message: '更新失敗' };
    }
}

// --- FLEX UI BUILDER ---

function createItemRow(groupId, item, currentPhase) {
    const { COLORS } = flexUtils;

    // Status Logic
    const isPriorityHigh = item.priority === 'high';

    // Category Badge
    const catKey = item.category || 'other';
    const catInfo = getCatInfo(catKey);

    const catBadge = flexUtils.createBox('vertical', [
        flexUtils.createText({
            text: catInfo.label,
            size: 'xxs',
            color: '#FFFFFF',
            align: 'center',
            weight: 'bold'
        })
    ], {
        backgroundColor: catInfo.color,
        cornerRadius: 'sm',
        paddingAll: '2px', // Use pixel for strict structure
        width: '36px',
        flex: 0,
        justifyContent: 'center',
        alignItems: 'center'
    });

    // Main Text
    const mainText = flexUtils.createText({
        text: item.text,
        size: 'sm',
        color: COLORS.DARK_GRAY,
        wrap: true,
        weight: isPriorityHigh ? 'bold' : 'regular',
        flex: 1
    });

    // Status Metadata Row
    const pColor = item.priority === 'high' ? COLORS.DANGER : (item.priority === 'medium' ? COLORS.WARNING : COLORS.SUCCESS);

    const metaParts = [
        catBadge,
        flexUtils.createText({ text: '●', color: pColor, size: 'xs', gravity: 'center', flex: 0 })
    ];

    if (item.subStatus && currentPhase === STATUS.PROGRESS) {
        metaParts.push(flexUtils.createText({
            text: `[${item.subStatus}]`,
            color: COLORS.PRIMARY,
            size: 'xs',
            gravity: 'center',
            weight: 'bold',
            flex: 0
        }));
    }

    metaParts.push(flexUtils.createText({
        text: new Date(item.createdAt).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }),
        color: '#AAAAAA',
        size: 'xs',
        gravity: 'center',
        flex: 0
    }));

    const metaRow = flexUtils.createBox('horizontal', metaParts, {
        spacing: 'sm',
        alignItems: 'center'
    });

    // Action Button Logic
    let btnLabel = '動作';
    let btnData = '';
    let btnColor = COLORS.PRIMARY;

    if (currentPhase === STATUS.PENDING) {
        btnLabel = '開始';
        btnData = `action=set_status&s=${STATUS.PROGRESS}&gid=${groupId}&id=${item.createdAt}`;
    } else if (currentPhase === STATUS.PROGRESS) {
        btnLabel = '完工';
        btnData = `action=set_status&s=${STATUS.READY}&gid=${groupId}&id=${item.createdAt}`;
        btnColor = COLORS.WARNING;
    } else if (currentPhase === STATUS.READY) {
        btnLabel = '已取';
        btnData = `action=set_status&s=${STATUS.DONE}&gid=${groupId}&id=${item.createdAt}`;
        btnColor = COLORS.SUCCESS;
    }

    const actionBtn = flexUtils.createButton({
        action: {
            type: 'postback',
            label: btnLabel,
            data: btnData
        },
        style: 'primary',
        color: btnColor,
        height: 'sm',
        flex: 0
    });

    // Left side container (Meta + Text)
    const infoBox = flexUtils.createBox('vertical', [
        metaRow,
        mainText
    ], {
        spacing: 'xs',
        flex: 1
    });

    // Entire Row
    return flexUtils.createBox('horizontal', [
        infoBox,
        actionBtn
    ], {
        paddingAll: '8px',
        spacing: 'md',
        alignItems: 'center',
        // Make the info box clickable for details
        action: {
            type: 'postback',
            label: '詳細',
            data: `action=show_detail&gid=${groupId}&id=${item.createdAt}`
        }
    });
}

function buildTodoFlex(groupId, todos) {
    const { COLORS } = flexUtils;

    // 1. Group by Status
    const groups = {
        [STATUS.PENDING]: [],
        [STATUS.PROGRESS]: [],
        [STATUS.READY]: []
    };

    todos.forEach(t => {
        const s = t.status || STATUS.PENDING;
        if (groups[s]) groups[s].push(t);
    });

    // Sort: High Priority first
    const sorter = (a, b) => (a.priorityOrder - b.priorityOrder) || (a.createdAt - b.createdAt);

    groups[STATUS.PENDING].sort(sorter);
    groups[STATUS.PROGRESS].sort(sorter);
    groups[STATUS.READY].sort(sorter);

    const bubbles = [];

    // Helper to create bubble
    const createStatusBubble = (headerText, headerSub, color, items, status) => {
        const rows = items.slice(0, 10).map(item => createItemRow(groupId, item, status));

        if (items.length === 0) {
            rows.push(flexUtils.createBox('vertical', [
                flexUtils.createText({ text: '目前無事項', align: 'center', color: COLORS.GRAY })
            ], { paddingAll: '20px' }));
        } else if (items.length > 10) {
            rows.push(flexUtils.createText({ text: `...還有 ${items.length - 10} 項`, align: 'center', color: COLORS.GRAY, size: 'xs' }));
        }

        // Add separators
        const bodyContents = [];
        rows.forEach((r, i) => {
            bodyContents.push(r);
            if (i < rows.length - 1) bodyContents.push(flexUtils.createSeparator());
        });

        return flexUtils.createBubble({
            header: flexUtils.createHeader(headerText, headerSub, color),
            body: flexUtils.createBox('vertical', bodyContents, { paddingAll: '0px' })
        });
    };

    // --- Bubble 1: Pending ---
    bubbles.push(createStatusBubble('🔴 待處理', `(${groups[STATUS.PENDING].length})`, COLORS.DANGER, groups[STATUS.PENDING], STATUS.PENDING));

    // --- Bubble 2: In Progress ---
    bubbles.push(createStatusBubble('🟡 進行中', `(${groups[STATUS.PROGRESS].length})`, COLORS.WARNING, groups[STATUS.PROGRESS], STATUS.PROGRESS));

    // --- Bubble 3: Ready ---
    bubbles.push(createStatusBubble('🟢 待取件', `(${groups[STATUS.READY].length})`, COLORS.SUCCESS, groups[STATUS.READY], STATUS.READY));

    return flexUtils.createCarousel(bubbles);
}


// --- POSTBACK HANDLER ---

async function handleTodoPostback(ctx, data) {
    const params = new URLSearchParams(data);
    const action = params.get('action');
    const groupId = params.get('gid') || params.get('groupId');
    const id = params.get('id');

    if (!groupId || !id) return;

    if (action === 'set_status') {
        const newStatus = params.get('s');
        const res = await updateTodoStatus(groupId, id, newStatus);

        if (res.success) {
            const list = await getTodoList(groupId);
            const flex = buildTodoFlex(groupId, list);
            const flexMsg = flexUtils.createFlexMessage('待辦看板更新', flex);

            // Notify if Ready/Done
            if (newStatus === STATUS.READY) {
                await lineUtils.replyToLine(ctx.replyToken, [
                    { type: 'text', text: `🎉 [${res.category === 'new' ? '新機' : '維修'}] ${res.text} 已完工！` },
                    flexMsg
                ]);
            } else if (newStatus === STATUS.DONE) {
                await lineUtils.replyToLine(ctx.replyToken, [
                    { type: 'text', text: `✅ [${res.category === 'new' ? '新機' : '維修'}] ${res.text} 已結案` },
                    flexMsg
                ]);
            } else {
                await lineUtils.replyToLine(ctx.replyToken, [flexMsg]);
            }
        } else {
            await lineUtils.replyText(ctx.replyToken, `❌ ${res.message}`);
        }
    }
    else if (action === 'show_detail') {
        const quickReply = {
            items: [
                {
                    type: 'action',
                    action: { type: 'postback', label: '🔥 設為急件', data: `action=update_meta&gid=${groupId}&id=${id}&p=high`, displayText: '更新為：急件' }
                },
                {
                    type: 'action',
                    action: { type: 'postback', label: '🟢 設為普通', data: `action=update_meta&gid=${groupId}&id=${id}&p=low`, displayText: '更新為：普通' }
                },
                {
                    type: 'action',
                    action: { type: 'postback', label: '🗑️ 刪除案件', data: `action=set_status&s=${STATUS.DONE}&gid=${groupId}&id=${id}`, displayText: '刪除此案件' }
                }
            ]
        };
        await lineUtils.replyToLine(ctx.replyToken, [{
            type: 'text',
            text: '⚙️ 請選擇操作：',
            quickReply
        }]);
    }
    else if (action === 'update_meta') {
        const p = params.get('p');
        const res = await updateMeta(groupId, id, { priority: p });
        if (res.success) {
            const list = await getTodoList(groupId);
            const flex = buildTodoFlex(groupId, list);
            const flexMsg = flexUtils.createFlexMessage('待辦看板更新', flex);
            await lineUtils.replyToLine(ctx.replyToken, [flexMsg]);
        } else {
            await lineUtils.replyText(ctx.replyToken, `❌ ${res.message}`);
        }
    }
    // Legacy support
    else if (action === 'complete_todo' || action === 'delete_todo') {
        const res = await updateTodoStatus(groupId, id, STATUS.DONE);
        if (res.success) {
            const list = await getTodoList(groupId);
            const flex = buildTodoFlex(groupId, list);
            const flexMsg = flexUtils.createFlexMessage('待辦看板更新', flex);
            await lineUtils.replyToLine(ctx.replyToken, [flexMsg]);
        }
    }
}

// --- COMMAND HANDLER ---

async function handleTodoCommand(replyToken, groupId, userId, text) {
    const targetId = groupId || userId;

    try {
        const msg = text.trim();

        // 1. Dashboard
        if (msg === '待辦' || msg === '待辦事項') {
            const list = await getTodoList(targetId);
            const flex = buildTodoFlex(targetId, list);
            const flexMsg = flexUtils.createFlexMessage('待辦看板', flex);
            await lineUtils.replyToLine(replyToken, [flexMsg]);
            return;
        }

        // 2. Add New
        if (msg.startsWith('待辦 ')) {
            let content = msg.replace(/^待辦\s+/, '').trim();
            let priority = 'low';
            let category = 'other';

            // Simple parser
            if (content.match(/(!|\[)?(高|急|high|🔴)(!|\])?/i)) priority = 'high';
            if (content.match(/(新機|新組|組裝|new|🆕)/i)) category = 'new';
            if (content.match(/(維修|檢測|重灌|repair|fix|🔧)/i)) category = 'repair';

            // Cleanup keywords from content is complex, let's just keep the full text for now or simple replace
            // A bit too complex to implement perfect regex cleaner in one go without potential data loss, 
            // so we trust the user input mostly.

            if (content) {
                const newItem = await addTodo(targetId, content, userId, priority, category);
                const list = await getTodoList(targetId);
                const flex = buildTodoFlex(targetId, list);
                const flexMsg = flexUtils.createFlexMessage('待辦看板更新', flex);

                await lineUtils.replyToLine(replyToken, [
                    { type: 'text', text: `✅ 已新增: ${newItem.text}` },
                    flexMsg
                ]);
            }
            return;
        }

    } catch (error) {
        console.error('[Todo] Error:', error);
        await lineUtils.replyText(replyToken, '❌ 系統發生錯誤');
    }
}

module.exports = {
    addTodo,
    getTodoList,
    updateTodoStatus,
    handleTodoCommand,
    handleTodoPostback
};
