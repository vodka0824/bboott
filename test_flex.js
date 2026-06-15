const flexUtils = require('./utils/flex');

const createLeaderboardRow = (rankStr, rankColor, displayName, professionName, subText, subTextColor, valStr, labelStr, valColor) => {
    let badgeBg = '#333333';
    let badgeText = '#CCCCCC';
    if (professionName.includes('議員')) { badgeBg = '#4A148C'; badgeText = '#E1BEE7'; }
    else if (professionName.includes('警察')) { badgeBg = '#0D47A1'; badgeText = '#BBDEFB'; }
    else if (professionName.includes('黑')) { badgeBg = '#212121'; badgeText = '#F5F5F5'; }
    else if (professionName.includes('軍')) { badgeBg = '#1B5E20'; badgeText = '#C8E6C9'; }

    return {
        type: 'box',
        layout: 'horizontal',
        alignItems: 'center',
        margin: 'md',
        contents: [
            { type: 'text', text: rankStr, size: 'md', weight: 'bold', color: rankColor, flex: 2, align: 'center' },
            {
                type: 'box', layout: 'vertical', flex: 6,
                contents: [
                    { type: 'text', text: displayName, size: 'sm', weight: 'bold', color: '#FFFFFF', wrap: true },
                    {
                        type: 'box', layout: 'horizontal', alignItems: 'center', margin: 'sm', spacing: 'sm',
                        contents: [
                            {
                                type: 'box', layout: 'vertical', backgroundColor: badgeBg, cornerRadius: 'md', paddingStart: '8px', paddingEnd: '8px', paddingTop: '2px', paddingBottom: '2px',
                                contents: [{ type: 'text', text: professionName, size: 'xxs', color: badgeText, weight: 'bold' }]
                            },
                            { type: 'text', text: subText, size: 'xxs', color: subTextColor, weight: 'bold' }
                        ]
                    }
                ]
            },
            {
                type: 'box', layout: 'vertical', flex: 4, alignItems: 'flex-end',
                contents: [
                    { type: 'text', text: valStr, size: 'sm', weight: 'bold', color: valColor },
                    { type: 'text', text: labelStr, size: 'xxs', color: '#777777', margin: 'xs' }
                ]
            }
        ]
    };
};

const contents = [];
contents.push(createLeaderboardRow('🥇', '#FFD700', 'Test User', '一般市民', '「稱號」', '#B39DDB', '10萬', '總資產', '#FFCA28'));
contents.push(flexUtils.createSeparator('md', '#333333'));

const bubble = {
    type: 'bubble', size: 'mega',
    header: {
        type: 'box', layout: 'vertical', paddingAll: '20px',
        background: { type: 'linearGradient', angle: '135deg', startColor: '#1A1100', endColor: '#4A3500' },
        contents: [
            { type: 'text', text: '🏆 財富排行榜', weight: 'bold', size: 'xl', color: '#FFD700', align: 'center' },
            { type: 'text', text: 'WEALTH RANK • TOP 10', size: 'xs', color: '#FFC107', align: 'center', margin: 'xs', weight: 'bold' }
        ]
    },
    body: { type: 'box', layout: 'vertical', contents: contents, paddingAll: 'lg', backgroundColor: '#121212' }
};

const flexMsg = { type: 'flex', altText: '🏆 財富排行榜', contents: bubble };

console.log(JSON.stringify(flexMsg, null, 2));
