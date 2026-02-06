
const flexUtils = require('../utils/flex');

// Mock Constants
const PRIORITY_EMOJI = { high: '🔴', medium: '🟡', low: '🟢' };
const CATEGORY_INFO = {
    new: { label: '新機', icon: '🆕', color: '#1E90FF' },
    repair: { label: '維修', icon: '🔧', color: '#FF8C00' },
    other: { label: '其他', icon: '📋', color: '#808080' }
};

function getCatInfo(cat) {
    return CATEGORY_INFO[cat] || CATEGORY_INFO.other;
}

// Replicating the function from handlers/todo.js
function buildTaskCreationFlex(groupId, item) {
    const { COLORS } = flexUtils;
    // Mock item properties if missing
    if (!item.priority) item.priority = 'low';

    const isPriorityHigh = item.priority === 'high';
    const catInfo = getCatInfo(item.category || 'other');

    // Header: Item Text
    const header = flexUtils.createBox('vertical', [
        flexUtils.createText({ text: '✅ 已新增待辦事項', weight: 'bold', color: COLORS.SUCCESS, size: 'sm' }),
        flexUtils.createText({ text: item.text, weight: 'bold', size: 'xl', wrap: true, margin: 'md' })
    ]);

    // Current State
    const stateRow = flexUtils.createBox('horizontal', [
        flexUtils.createText({ text: `${catInfo.icon} ${catInfo.label}`, size: 'sm', color: '#666666', flex: 0 }),
        flexUtils.createText({ text: ` | `, size: 'sm', color: '#DDDDDD', flex: 0 }),
        flexUtils.createText({ text: `${PRIORITY_EMOJI[item.priority] || '🟢'} ${item.priority === 'high' ? '急件' : (item.priority === 'medium' ? '普通' : '一般')}`, size: 'sm', color: '#666666', flex: 0 })
    ], { spacing: 'sm', margin: 'md', alignItems: 'center' });

    // Buttons: Category
    const catButtons = Object.entries(CATEGORY_INFO).map(([key, info]) => {
        const isSelected = item.category === key;
        return flexUtils.createButton({
            action: {
                type: 'postback',
                label: info.label,
                data: `action=update_meta&gid=${groupId}&id=${item.createdAt}&c=${key}&mode=creation`
            },
            style: isSelected ? 'primary' : 'secondary',
            color: isSelected ? info.color : '#AAAAAA',
            height: 'sm'
        });
    });

    // Buttons: Priority
    const priButtons = [
        { key: 'high', label: '急件', color: COLORS.DANGER },
        { key: 'medium', label: '普通', color: COLORS.WARNING },
        { key: 'low', label: '一般', color: COLORS.SUCCESS }
    ].map(p => {
        const isSelected = item.priority === p.key;
        return flexUtils.createButton({
            action: {
                type: 'postback',
                label: p.label,
                data: `action=update_meta&gid=${groupId}&id=${item.createdAt}&p=${p.key}&mode=creation`
            },
            style: isSelected ? 'primary' : 'secondary',
            color: isSelected ? p.color : '#AAAAAA',
            height: 'sm'
        });
    });

    // View Board Button (Exit Creation Mode)
    const viewBoardBtn = flexUtils.createButton({
        action: {
            type: 'postback',
            label: '查看完整看板',
            data: `action=view_board&gid=${groupId}`
        },
        style: 'link',
        height: 'sm'
    });

    return flexUtils.createBubble({
        body: flexUtils.createBox('vertical', [
            header,
            stateRow,
            flexUtils.createSeparator('md'),
            flexUtils.createText({ text: '設定相關分類：', size: 'xs', color: '#AAAAAA', margin: 'md' }),
            flexUtils.createBox('horizontal', catButtons, { spacing: 'sm', margin: 'sm' }),
            flexUtils.createText({ text: '設定重要性：', size: 'xs', color: '#AAAAAA', margin: 'md' }),
            flexUtils.createBox('horizontal', priButtons, { spacing: 'sm', margin: 'sm' }),
            flexUtils.createSeparator('xl'),
            viewBoardBtn
        ])
    });
}

// Test Execution
const mockItem = {
    text: '測試案件',
    priority: 'low',
    category: 'other',
    createdAt: 1234567890
};

try {
    const json = buildTaskCreationFlex('group1', mockItem);
    const fs = require('fs');
    fs.writeFileSync('tests/creation_card_output.json', JSON.stringify(json, null, 2), 'utf8');
    console.log("JSON written to tests/creation_card_output.json");
} catch (e) {
    console.error(e);
}
