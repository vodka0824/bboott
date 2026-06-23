const flexUtils = require('../utils/flex');
const { getTeamWithFlag } = require('../utils/worldcupUtils');

/**
 * 建立開盤成功公告
 */
function buildOpenMatchBubble(matchData, lockAtDate) {
    const { matchId, homeTeam, awayTeam, odds } = matchData;
    const hasExtraMarkets = odds.over !== undefined;

    const bubble = {
        type: 'bubble',
        size: 'mega',
        header: {
            type: 'box', layout: 'vertical', paddingAll: '20px',
            background: {
                type: 'linearGradient', angle: '90deg', startColor: '#D32F2F', endColor: '#1976D2'
            },
            contents: [
                { type: 'text', text: '📢 新盤口開放', weight: 'bold', size: 'lg', color: '#FFFFFF', align: 'center' }
            ]
        },
        body: {
            type: 'box', layout: 'vertical', paddingAll: 'xl', backgroundColor: '#FAFAFA',
            contents: [
                { type: 'text', text: `ID: ${matchId}`, size: 'xs', color: '#9E9E9E', align: 'center', margin: 'md' },
                {
                    type: 'box', layout: 'horizontal', margin: 'lg', alignItems: 'center', contents: [
                        { type: 'text', text: getTeamWithFlag(homeTeam), weight: 'bold', size: 'lg', color: '#111111', align: 'center', wrap: true, flex: 4 },
                        { type: 'text', text: 'VS', weight: 'bold', size: 'sm', color: '#BDBDBD', align: 'center', flex: 1 },
                        { type: 'text', text: getTeamWithFlag(awayTeam), weight: 'bold', size: 'lg', color: '#111111', align: 'center', wrap: true, flex: 4 }
                    ]
                },
                flexUtils.createSeparator('lg', '#E0E0E0'),
                {
                    type: 'box', layout: 'horizontal', margin: 'lg', contents: [
                        { type: 'text', text: '主勝', size: 'sm', color: '#757575', align: 'center' },
                        { type: 'text', text: '和局', size: 'sm', color: '#757575', align: 'center' },
                        { type: 'text', text: '客勝', size: 'sm', color: '#757575', align: 'center' }
                    ]
                },
                {
                    type: 'box', layout: 'horizontal', margin: 'sm', contents: [
                        { type: 'text', text: String(odds.home), size: 'md', weight: 'bold', color: '#E65100', align: 'center' },
                        { type: 'text', text: String(odds.draw), size: 'md', weight: 'bold', color: '#E65100', align: 'center' },
                        { type: 'text', text: String(odds.away), size: 'md', weight: 'bold', color: '#E65100', align: 'center' }
                    ]
                }
            ]
        }
    };

    if (hasExtraMarkets) {
        bubble.body.contents.push(
            flexUtils.createSeparator('md', '#E0E0E0'),
            {
                type: 'box', layout: 'horizontal', margin: 'md', contents: [
                    { type: 'text', text: `大 (${odds.ouPoint})`, size: 'sm', color: '#757575', align: 'center' },
                    { type: 'text', text: '小', size: 'sm', color: '#757575', align: 'center' },
                    { type: 'text', text: '單數', size: 'sm', color: '#757575', align: 'center' },
                    { type: 'text', text: '雙數', size: 'sm', color: '#757575', align: 'center' }
                ]
            },
            {
                type: 'box', layout: 'horizontal', margin: 'sm', contents: [
                    { type: 'text', text: String(odds.over), size: 'md', weight: 'bold', color: '#E65100', align: 'center' },
                    { type: 'text', text: String(odds.under), size: 'md', weight: 'bold', color: '#E65100', align: 'center' },
                    { type: 'text', text: String(odds.odd), size: 'md', weight: 'bold', color: '#E65100', align: 'center' },
                    { type: 'text', text: String(odds.even), size: 'md', weight: 'bold', color: '#E65100', align: 'center' }
                ]
            }
        );
    }

    if (odds.handicapPoint !== undefined) {
        bubble.body.contents.push(
            flexUtils.createSeparator('md', '#E0E0E0'),
            {
                type: 'box', layout: 'horizontal', margin: 'md', contents: [
                    { type: 'text', text: `讓主 (${odds.handicapPoint > 0 ? '+' : ''}${odds.handicapPoint})`, size: 'sm', color: '#757575', align: 'center' },
                    { type: 'text', text: `讓客 (${odds.handicapPoint > 0 ? '-' : '+'}${Math.abs(odds.handicapPoint)})`, size: 'sm', color: '#757575', align: 'center' }
                ]
            },
            {
                type: 'box', layout: 'horizontal', margin: 'sm', contents: [
                    { type: 'text', text: String(odds.hcHome), size: 'md', weight: 'bold', color: '#D32F2F', align: 'center' },
                    { type: 'text', text: String(odds.hcAway), size: 'md', weight: 'bold', color: '#D32F2F', align: 'center' }
                ]
            }
        );
    }

    if (lockAtDate) {
        const timeStr = lockAtDate.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
        bubble.body.contents.push(
            flexUtils.createSeparator('md', '#E0E0E0'),
            {
                type: 'box', layout: 'horizontal', margin: 'md', justifyContent: 'center', contents: [
                    { type: 'text', text: `🕒 預計於 ${timeStr} 自動鎖盤`, size: 'xs', color: '#D32F2F', weight: 'bold' }
                ]
            }
        );
    }

    return bubble;
}

function buildManageMatchBubble(matchData, betCount, totalPool) {
    const { matchId, homeTeam, awayTeam, status, lockAt } = matchData;
    const isOpen = status === 'open';

    const bubble = {
        type: 'bubble',
        size: 'kilo',
        header: {
            type: 'box', layout: 'vertical', paddingAll: '15px',
            backgroundColor: isOpen ? '#4CAF50' : '#FF9800',
            contents: [
                { type: 'text', text: isOpen ? '🟢 開放押注中' : '🔒 已鎖盤', weight: 'bold', size: 'sm', color: '#FFFFFF' }
            ]
        },
        body: {
            type: 'box', layout: 'vertical', paddingAll: 'lg', backgroundColor: '#FAFAFA',
            contents: [
                { type: 'text', text: `ID: ${matchId}`, size: 'xs', color: '#9E9E9E', margin: 'md' },
                { type: 'text', text: `${getTeamWithFlag(homeTeam)} vs ${getTeamWithFlag(awayTeam)}`, weight: 'bold', size: 'lg', color: '#111111', wrap: true, margin: 'lg' },
                flexUtils.createSeparator('md', '#EEEEEE'),
                {
                    type: 'box', layout: 'horizontal', margin: 'md', contents: [
                        { type: 'text', text: '主客和賠率', size: 'xs', color: '#757575' },
                        { type: 'text', text: `主 ${matchData.odds.home} / 和 ${matchData.odds.draw} / 客 ${matchData.odds.away}`, size: 'xs', weight: 'bold', align: 'end' }
                    ]
                },
                {
                    type: 'box', layout: 'horizontal', margin: 'md', contents: [
                        { type: 'text', text: '累積注單', size: 'xs', color: '#757575' },
                        { type: 'text', text: `${betCount} 筆`, size: 'sm', weight: 'bold', align: 'end' }
                    ]
                },
                {
                    type: 'box', layout: 'horizontal', margin: 'sm', contents: [
                        { type: 'text', text: '總彩池', size: 'xs', color: '#757575' },
                        { type: 'text', text: `${totalPool.toLocaleString()}`, size: 'sm', weight: 'bold', align: 'end', color: '#FF9800' }
                    ]
                }
            ]
        },
        footer: {
            type: 'box', layout: 'vertical', spacing: 'sm',
            contents: []
        }
    };

    if (isOpen) {
        if (lockAt) {
            const timeStr = new Date(lockAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
            bubble.body.contents.push(
                {
                    type: 'box', layout: 'horizontal', margin: 'sm', contents: [
                        { type: 'text', text: '自動鎖盤', size: 'xs', color: '#757575' },
                        { type: 'text', text: timeStr, size: 'sm', weight: 'bold', align: 'end', color: '#D32F2F' }
                    ]
                }
            );
        } else {
            bubble.body.contents.push(
                {
                    type: 'box', layout: 'horizontal', margin: 'sm', contents: [
                        { type: 'text', text: '自動鎖盤', size: 'xs', color: '#757575' },
                        { type: 'text', text: '未設定', size: 'sm', weight: 'bold', align: 'end', color: '#9E9E9E' }
                    ]
                }
            );
        }
    }

    if (isOpen) {
        bubble.footer.contents.push({
            type: 'button', style: 'primary', color: '#F44336', height: 'sm', margin: 'sm',
            action: { type: 'postback', label: '🛑 手動鎖定', data: `action=admin_wc_action&cmd=lock&matchId=${matchId}` }
        });
        bubble.footer.contents.push({
            type: 'button', style: 'secondary', color: '#EEEEEE', height: 'sm', margin: 'sm',
            action: { type: 'uri', label: '⚙️ 設定讓分盤', uri: encodeURI(`line://msg/text/?/設定讓分 ${matchId} `) }
        });
        bubble.footer.contents.push({
            type: 'button', style: 'secondary', color: '#EEEEEE', height: 'sm', margin: 'sm',
            action: { type: 'uri', label: '⏳ 設定自動鎖盤', uri: encodeURI(`line://msg/text/?/設定鎖盤 ${matchId} `) }
        });
    } else {
        bubble.footer.contents.push({
            type: 'button', style: 'secondary', color: '#EEEEEE', height: 'sm', margin: 'sm',
            action: { type: 'postback', label: '🔓 重新開放', data: `action=admin_wc_action&cmd=unlock&matchId=${matchId}` }
        });
    }

    bubble.footer.contents.push({
        type: 'button', style: 'secondary', color: '#FFCDD2', height: 'sm', margin: 'sm',
        action: { type: 'postback', label: '🗑️ 刪除賽事(退款)', data: `action=admin_wc_action&cmd=confirm_delete&matchId=${matchId}` }
    });

    bubble.footer.contents.push({
        type: 'button', style: 'primary', color: '#1976D2', height: 'sm', margin: 'sm',
        action: { type: 'message', label: '📊 查看下注詳情', text: `/運彩詳情 ${matchId}` }
    });

    bubble.footer.contents.push({
        type: 'button', style: 'primary', color: '#673AB7', height: 'sm', margin: 'sm',
        action: { type: 'uri', label: '🏆 結算賽事 (點擊輸入比分)', uri: encodeURI(`line://msg/text/?/結算運彩 ${matchId} `) }
    });

    return bubble;
}

function buildShowMatchBubble(matchData, betCount, totalPool = 0, userBetAmount = 0) {
    const { matchId, homeTeam, awayTeam, odds, lockAt } = matchData;
    const homeFlag = getTeamWithFlag(homeTeam);
    const awayFlag = getTeamWithFlag(awayTeam);

    const bubble = {
        type: 'bubble',
        size: 'mega',
        header: {
            type: 'box', layout: 'vertical', paddingAll: '15px',
            background: {
                type: 'linearGradient',
                angle: '135deg',
                startColor: '#1B5E20',
                endColor: '#4CAF50'
            },
            contents: [
                {
                    type: 'box', layout: 'horizontal', justifyContent: 'space-between', alignItems: 'center', contents: [
                        {
                            type: 'box', layout: 'vertical', contents: [
                                { type: 'text', text: '🏆 綜合運彩賽事', weight: 'bold', size: 'sm', color: '#FFFFFF' },
                                { type: 'text', text: `ID: ${matchId}`, size: 'xxs', color: '#FFFFFFCC', margin: 'xs' }
                            ]
                        },
                        {
                            type: 'box', layout: 'vertical', backgroundColor: '#E53935', cornerRadius: '4px', paddingStart: '8px', paddingEnd: '8px', paddingTop: '2px', paddingBottom: '2px', contents: [
                                { type: 'text', text: '🔥 熱烈押注中', color: '#FFFFFF', size: 'xxs', weight: 'bold' }
                            ]
                        }
                    ]
                }
            ]
        },
        body: {
            type: 'box', layout: 'vertical', paddingAll: 'xl', backgroundColor: '#FFFFFF',
            contents: [
                {
                    type: 'box', layout: 'horizontal', alignItems: 'center', contents: [
                        { type: 'text', text: `(主) ${homeFlag}`, weight: 'bold', size: 'md', color: '#111111', align: 'center', wrap: true, flex: 4 },
                        { type: 'text', text: 'VS', size: 'xs', weight: 'bold', color: '#BDBDBD', align: 'center', flex: 1, margin: 'sm' },
                        { type: 'text', text: `(客) ${awayFlag}`, weight: 'bold', size: 'md', color: '#111111', align: 'center', wrap: true, flex: 4 }
                    ]
                },
                {
                    type: 'box', layout: 'horizontal', margin: 'xl', alignItems: 'center', contents: [
                        {
                            type: 'box', layout: 'vertical', alignItems: 'center', flex: 1, contents: [
                                { type: 'text', text: '主勝', size: 'xxs', color: '#9E9E9E', margin: 'xs' },
                                { type: 'text', text: `${odds.home}`, size: 'lg', weight: 'bold', color: odds.home > 3 ? '#D32F2F' : '#388E3C' }
                            ]
                        },
                        {
                            type: 'box', layout: 'vertical', alignItems: 'center', flex: 1, contents: [
                                { type: 'text', text: '和局', size: 'xxs', color: '#9E9E9E', margin: 'xs' },
                                { type: 'text', text: `${odds.draw}`, size: 'md', weight: 'bold', color: '#F57C00' }
                            ]
                        },
                        {
                            type: 'box', layout: 'vertical', alignItems: 'center', flex: 1, contents: [
                                { type: 'text', text: '客勝', size: 'xxs', color: '#9E9E9E', margin: 'xs' },
                                { type: 'text', text: `${odds.away}`, size: 'lg', weight: 'bold', color: odds.away > 3 ? '#D32F2F' : '#388E3C' }
                            ]
                        }
                    ]
                }
            ]
        },
        footer: {
            type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: 'md',
            contents: [
                {
                    type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
                        {
                            type: 'button', style: 'primary', color: '#E53935', height: 'sm', flex: 1,
                            action: { type: 'postback', label: `🎯 主勝`, data: `action=bet_wc&matchId=${matchId}&pred=home` }
                        },
                        {
                            type: 'button', style: 'primary', color: '#43A047', height: 'sm', flex: 1,
                            action: { type: 'postback', label: `🤝 和局`, data: `action=bet_wc&matchId=${matchId}&pred=draw` }
                        },
                        {
                            type: 'button', style: 'primary', color: '#1E88E5', height: 'sm', flex: 1,
                            action: { type: 'postback', label: `🎯 客勝`, data: `action=bet_wc&matchId=${matchId}&pred=away` }
                        }
                    ]
                }
            ]
        }
    };

    if (odds.over !== undefined) {
        bubble.body.contents.push(
            {
                type: 'box', layout: 'horizontal', margin: 'lg', alignItems: 'center', contents: [
                    {
                        type: 'box', layout: 'vertical', alignItems: 'center', flex: 1, contents: [
                            { type: 'text', text: `大 (${odds.ouPoint})`, size: 'xxs', color: '#9E9E9E', margin: 'xs' },
                            { type: 'text', text: `${odds.over}`, size: 'md', weight: 'bold', color: '#E65100' }
                        ]
                    },
                    {
                        type: 'box', layout: 'vertical', alignItems: 'center', flex: 1, contents: [
                            { type: 'text', text: '小', size: 'xxs', color: '#9E9E9E', margin: 'xs' },
                            { type: 'text', text: `${odds.under}`, size: 'md', weight: 'bold', color: '#E65100' }
                        ]
                    },
                    {
                        type: 'box', layout: 'vertical', alignItems: 'center', flex: 1, contents: [
                            { type: 'text', text: '單數', size: 'xxs', color: '#9E9E9E', margin: 'xs' },
                            { type: 'text', text: `${odds.odd}`, size: 'md', weight: 'bold', color: '#0288D1' }
                        ]
                    },
                    {
                        type: 'box', layout: 'vertical', alignItems: 'center', flex: 1, contents: [
                            { type: 'text', text: '雙數', size: 'xxs', color: '#9E9E9E', margin: 'xs' },
                            { type: 'text', text: `${odds.even}`, size: 'md', weight: 'bold', color: '#0288D1' }
                        ]
                    }
                ]
            },
            flexUtils.createSeparator('lg', '#EEEEEE')
        );

        bubble.footer.contents.push(
            {
                type: 'box', layout: 'horizontal', spacing: 'sm', margin: 'sm', contents: [
                    {
                        type: 'button', style: 'primary', color: '#F4511E', height: 'sm', flex: 1,
                        action: { type: 'postback', label: `📈 大`, data: `action=bet_wc&matchId=${matchId}&pred=over` }
                    },
                    {
                        type: 'button', style: 'primary', color: '#00ACC1', height: 'sm', flex: 1,
                        action: { type: 'postback', label: `📉 小`, data: `action=bet_wc&matchId=${matchId}&pred=under` }
                    }
                ]
            },
            {
                type: 'box', layout: 'horizontal', spacing: 'sm', margin: 'sm', contents: [
                    {
                        type: 'button', style: 'primary', color: '#8E24AA', height: 'sm', flex: 1,
                        action: { type: 'postback', label: `🔢 單`, data: `action=bet_wc&matchId=${matchId}&pred=odd` }
                    },
                    {
                        type: 'button', style: 'primary', color: '#3949AB', height: 'sm', flex: 1,
                        action: { type: 'postback', label: `🔠 雙`, data: `action=bet_wc&matchId=${matchId}&pred=even` }
                    }
                ]
            }
        );
    }

    if (odds.handicapPoint !== undefined) {
        const hcHomeText = `主 ${odds.handicapPoint > 0 ? '+' : ''}${odds.handicapPoint}`;
        const hcAwayText = `客 ${odds.handicapPoint > 0 ? '-' : '+'}${Math.abs(odds.handicapPoint)}`;

        bubble.body.contents.push(
            flexUtils.createSeparator('lg', '#EEEEEE'),
            {
                type: 'box', layout: 'horizontal', margin: 'lg', alignItems: 'center', contents: [
                    {
                        type: 'box', layout: 'vertical', alignItems: 'center', flex: 1, contents: [
                            { type: 'text', text: hcHomeText, size: 'xxs', color: '#9E9E9E', margin: 'xs' },
                            { type: 'text', text: `${odds.hcHome}`, size: 'md', weight: 'bold', color: '#D32F2F' }
                        ]
                    },
                    { type: 'text', text: '讓分盤', size: 'xs', weight: 'bold', color: '#BDBDBD', align: 'center', flex: 1 },
                    {
                        type: 'box', layout: 'vertical', alignItems: 'center', flex: 1, contents: [
                            { type: 'text', text: hcAwayText, size: 'xxs', color: '#9E9E9E', margin: 'xs' },
                            { type: 'text', text: `${odds.hcAway}`, size: 'md', weight: 'bold', color: '#D32F2F' }
                        ]
                    }
                ]
            }
        );

        bubble.footer.contents.push(
            {
                type: 'box', layout: 'horizontal', spacing: 'sm', margin: 'sm', contents: [
                    {
                        type: 'button', style: 'primary', color: '#D81B60', height: 'sm', flex: 1,
                        action: { type: 'postback', label: `⚔️ 讓主`, data: `action=bet_wc&matchId=${matchId}&pred=hcHome` }
                    },
                    {
                        type: 'button', style: 'primary', color: '#039BE5', height: 'sm', flex: 1,
                        action: { type: 'postback', label: `🛡️ 讓客`, data: `action=bet_wc&matchId=${matchId}&pred=hcAway` }
                    }
                ]
            }
        );
    }

    const statusBox1 = {
        type: 'box', layout: 'horizontal', margin: 'md', justifyContent: 'center', contents: [
            { type: 'text', text: `📊 ${betCount} 人投注 | 💰 彩池 ${totalPool.toLocaleString()}`, size: 'xs', color: '#757575', align: 'center', weight: 'bold' }
        ]
    };

    const extraInfos = [];
    if (userBetAmount > 0) {
        extraInfos.push(`👤 已下注: ${userBetAmount.toLocaleString()}`);
    }

    if (lockAt) {
        const timeStr = new Date(lockAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
        const timeDiffMs = lockAt - Date.now();
        const isUrgent = timeDiffMs > 0 && timeDiffMs < 60 * 60 * 1000; // 小於 1 小時
        extraInfos.push(isUrgent ? `⏳ ${timeStr} 即將截止!` : `🕒 ${timeStr} 鎖盤`);
    }

    bubble.body.contents.push(statusBox1);

    if (extraInfos.length > 0) {
        bubble.body.contents.push({
            type: 'box', layout: 'horizontal', margin: 'sm', justifyContent: 'center', contents: [
                { type: 'text', text: extraInfos.join('  |  '), size: 'xs', color: '#1976D2', align: 'center', weight: 'bold' }
            ]
        });
    }

    return bubble;
}

function buildShowMatchesEndCard() {
    return {
        type: 'bubble', size: 'mega',
        body: {
            type: 'box', layout: 'vertical', alignItems: 'center', justifyContent: 'center', paddingAll: 'xl', backgroundColor: '#111111',
            contents: [
                { type: 'text', text: '🎫', size: '4xl', margin: 'md' },
                { type: 'text', text: '查看所有注單與戰績', weight: 'bold', size: 'md', color: '#FFD700', margin: 'lg' }
            ]
        },
        footer: {
            type: 'box', layout: 'vertical', paddingAll: 'md',
            contents: [
                { type: 'button', style: 'primary', color: '#FFB300', action: { type: 'message', label: '我的運彩', text: '我的運彩' } }
            ]
        }
    };
}

function buildMyBetBubble(bet, dateStr, getTeamWithFlag, generateTicketId) {
    let statusBg = '#FFF9C4'; // pending yellow
    let statusText = '🟡 等待開獎 PENDING';
    let payoutColor = '#757575';
    let payoutText = `潛在獲利: ${Math.floor(bet.amount * bet.lockedOdds).toLocaleString()}`;
    
    if (bet.status === 'won') {
        statusBg = '#C8E6C9'; // green
        statusText = '🟢 恭喜中獎 WON';
        payoutColor = '#2E7D32';
        const wonAmt = Math.floor(bet.amount * bet.lockedOdds);
        payoutText = `贏得: +${wonAmt.toLocaleString()}`;
    } else if (bet.status === 'lost') {
        statusBg = '#F5F5F5'; // grey
        statusText = '🔴 殘念 LOST';
        payoutColor = '#D32F2F';
        payoutText = `損失: -${bet.amount.toLocaleString()}`;
    } else if (bet.status === 'refund') {
        statusBg = '#E0E0E0'; // dark grey
        statusText = '⚪ 走水退款 REFUND';
        payoutColor = '#757575';
        payoutText = `退回本金: ${bet.amount.toLocaleString()}`;
    }

    const hasScore = bet.homeScore !== undefined && bet.awayScore !== undefined;
    const finalScoreText = hasScore ? `${bet.homeScore} : ${bet.awayScore}` : 'v';
    const finalScoreColor = hasScore ? '#D32F2F' : '#BDBDBD';
    const finalScoreWeight = hasScore ? 'bold' : 'regular';
    const finalScoreSize = hasScore ? 'sm' : 'xs';

    return {
        type: 'bubble', size: 'kilo',
        body: {
            type: 'box', layout: 'vertical', paddingAll: '0px',
            contents: [
                {
                    type: 'box', layout: 'vertical', paddingAll: '15px', backgroundColor: statusBg,
                    contents: [
                        { type: 'text', text: statusText, weight: 'bold', size: 'sm', align: 'center', color: '#111111' }
                    ]
                },
                {
                    type: 'box', layout: 'vertical', paddingAll: 'lg', backgroundColor: '#FFFFFF',
                    contents: [
                        { type: 'text', text: bet.ticketId || generateTicketId(), size: 'xxs', color: '#BDBDBD', align: 'end' },
                        { type: 'text', text: dateStr, size: 'xxs', color: '#9E9E9E', align: 'end' },
                        {
                            type: 'box', layout: 'horizontal', margin: 'md', alignItems: 'center', contents: [
                                { type: 'text', text: `(主) ${getTeamWithFlag(bet.homeTeam)}`, weight: 'bold', size: 'sm', align: 'center', wrap: true, flex: 4 },
                                { type: 'text', text: finalScoreText, size: finalScoreSize, color: finalScoreColor, weight: finalScoreWeight, align: 'center', flex: 2 },
                                { type: 'text', text: `(客) ${getTeamWithFlag(bet.awayTeam)}`, weight: 'bold', size: 'sm', align: 'center', wrap: true, flex: 4 }
                            ]
                        },
                        { type: 'separator', margin: 'md', color: '#E0E0E0' },
                        {
                            type: 'box', layout: 'horizontal', margin: 'md', contents: [
                                { type: 'text', text: '預測', size: 'xs', color: '#757575', flex: 2 },
                                { type: 'text', text: `${bet.predLabel} @ ${bet.lockedOdds}`, size: 'sm', weight: 'bold', align: 'end', wrap: true, flex: 5 }
                            ]
                        },
                        {
                            type: 'box', layout: 'horizontal', margin: 'xs', contents: [
                                { type: 'text', text: '押注', size: 'xs', color: '#757575', flex: 2 },
                                { type: 'text', text: `${bet.amount.toLocaleString()}`, size: 'sm', weight: 'bold', align: 'end', wrap: true, flex: 5 }
                            ]
                        },
                        {
                            type: 'box', layout: 'horizontal', margin: 'xs', contents: [
                                { type: 'text', text: '結算', size: 'xs', color: '#757575', flex: 2 },
                                { type: 'text', text: payoutText, size: 'sm', weight: 'bold', color: payoutColor, align: 'end', wrap: true, flex: 5 }
                            ]
                        }
                    ]
                }
            ]
        }
    };
}

function buildBetSlipBubble(ticketId, homeTeam, awayTeam, predLabel, lockedOdds, amount, potentialWin, getTeamWithFlag) {
    return {
        type: 'bubble', size: 'mega',
        body: {
            type: 'box', layout: 'vertical', paddingAll: '0px',
            contents: [
                {
                    type: 'box', layout: 'vertical', paddingAll: 'xl', backgroundColor: '#2E7D32',
                    contents: [
                        { type: 'text', text: '✅ 押注成功 BET CONFIRMED', color: '#FFFFFF', weight: 'bold', size: 'sm', align: 'center' }
                    ]
                },
                {
                    type: 'box', layout: 'vertical', paddingAll: 'xl', backgroundColor: '#FAFAFA',
                    contents: [
                        {
                            type: 'box', layout: 'horizontal', margin: 'md', contents: [
                                { type: 'text', text: 'TICKET', size: 'xs', color: '#9E9E9E', flex: 2 },
                                { type: 'text', text: ticketId, size: 'xs', weight: 'bold', color: '#111111', flex: 5, align: 'end' }
                            ]
                        },
                        flexUtils.createSeparator('md', '#EEEEEE'),
                        {
                            type: 'box', layout: 'horizontal', margin: 'md', contents: [
                                { type: 'text', text: '對戰', size: 'sm', color: '#757575', flex: 2 },
                                { type: 'text', text: `${getTeamWithFlag(homeTeam)} vs ${getTeamWithFlag(awayTeam)}`, size: 'sm', weight: 'bold', color: '#111111', flex: 5, align: 'end', wrap: true }
                            ]
                        },
                        {
                            type: 'box', layout: 'horizontal', margin: 'md', contents: [
                                { type: 'text', text: '預測', size: 'sm', color: '#757575', flex: 2 },
                                { type: 'text', text: predLabel, size: 'sm', weight: 'bold', color: '#1565C0', flex: 5, align: 'end' }
                            ]
                        },
                        {
                            type: 'box', layout: 'horizontal', margin: 'md', contents: [
                                { type: 'text', text: '鎖定賠率', size: 'sm', color: '#757575', flex: 2 },
                                { type: 'text', text: `${lockedOdds}`, size: 'sm', weight: 'bold', color: '#111111', flex: 5, align: 'end' }
                            ]
                        },
                        { type: 'separator', margin: 'lg', color: '#BDBDBD' },
                        {
                            type: 'box', layout: 'horizontal', margin: 'lg', contents: [
                                { type: 'text', text: '押注金額', size: 'sm', color: '#757575', flex: 2 },
                                { type: 'text', text: amount.toLocaleString(), size: 'lg', weight: 'bold', color: '#E65100', flex: 5, align: 'end' }
                            ]
                        },
                        {
                            type: 'box', layout: 'horizontal', margin: 'xs', contents: [
                                { type: 'text', text: '過關可贏', size: 'xs', color: '#757575', flex: 2 },
                                { type: 'text', text: potentialWin.toLocaleString(), size: 'sm', weight: 'bold', color: '#4CAF50', flex: 5, align: 'end' }
                            ]
                        }
                    ]
                }
            ]
        }
    };
}

function buildMyBetsSummaryBubble(totalBetAmount, totalWonAmount) {
    return {
        type: 'bubble', size: 'kilo',
        body: {
            type: 'box', layout: 'vertical', paddingAll: 'xl', backgroundColor: '#111111', justifyContent: 'center',
            contents: [
                { type: 'text', text: '📊', size: '3xl', margin: 'md', align: 'center' },
                { type: 'text', text: '近期戰績總覽', weight: 'bold', size: 'lg', color: '#FFD700', margin: 'md', align: 'center' },
                flexUtils.createSeparator('md', '#333333'),
                {
                    type: 'box', layout: 'horizontal', margin: 'lg', contents: [
                        { type: 'text', text: '總押注', size: 'sm', color: '#9E9E9E' },
                        { type: 'text', text: totalBetAmount.toLocaleString(), size: 'sm', weight: 'bold', color: '#FFFFFF', align: 'end' }
                    ]
                },
                {
                    type: 'box', layout: 'horizontal', margin: 'md', contents: [
                        { type: 'text', text: '總淨利', size: 'sm', color: '#9E9E9E' },
                        { type: 'text', text: (totalWonAmount > 0 ? '+' : '') + totalWonAmount.toLocaleString(), size: 'md', weight: 'bold', color: totalWonAmount >= 0 ? '#4CAF50' : '#F44336', align: 'end' }
                    ]
                }
            ]
        }
    };
}

function buildPaginationBubble(page, totalPages, actionType) {
    const contents = [];
    
    if (page > 1) {
        contents.push({
            type: 'button', style: 'secondary', color: '#EEEEEE', height: 'sm', flex: 1, margin: 'sm',
            action: { type: 'postback', label: '⬅️ 上一頁', data: `action=${actionType}&page=${page - 1}` }
        });
    }
    
    if (page < totalPages) {
        contents.push({
            type: 'button', style: 'primary', color: '#1976D2', height: 'sm', flex: 1, margin: 'sm',
            action: { type: 'postback', label: '下一頁 ➡️', data: `action=${actionType}&page=${page + 1}` }
        });
    }

    if (contents.length === 0) {
        contents.push({ type: 'text', text: '已到盡頭', align: 'center', color: '#BDBDBD', size: 'sm' });
    }

    return {
        type: 'bubble', size: 'kilo',
        body: {
            type: 'box', layout: 'vertical', paddingAll: 'xl', backgroundColor: '#FAFAFA', justifyContent: 'center', alignItems: 'center',
            contents: [
                { type: 'text', text: `📄`, size: '3xl', margin: 'md' },
                { type: 'text', text: `第 ${page} / ${totalPages} 頁`, weight: 'bold', size: 'md', color: '#757575', margin: 'md' }
            ]
        },
        footer: {
            type: 'box', layout: 'horizontal', paddingAll: 'md',
            contents: contents
        }
    };
}

function buildLeaderboardBubble(leaders) {
    const contents = [
        {
            type: 'box', layout: 'vertical', paddingAll: 'xl', backgroundColor: '#111111', alignItems: 'center',
            contents: [
                { type: 'text', text: '🏆', size: '4xl', margin: 'md' },
                { type: 'text', text: '運彩賭神排行榜', weight: 'bold', size: 'xl', color: '#FFD700', margin: 'md' },
                { type: 'text', text: 'TOP 10 獲利王', size: 'xs', color: '#BDBDBD' }
            ]
        }
    ];

    const listContents = [];
    leaders.forEach((leader, index) => {
        const rank = index + 1;
        let rankStr = `${rank}.`;
        let rankColor = '#757575'; // default
        if (rank === 1) { rankStr = '🥇'; rankColor = '#FFD700'; }
        else if (rank === 2) { rankStr = '🥈'; rankColor = '#E0E0E0'; }
        else if (rank === 3) { rankStr = '🥉'; rankColor = '#FFB300'; }

        const profitColor = leader.netProfit >= 0 ? '#4CAF50' : '#F44336';
        const profitPrefix = leader.netProfit > 0 ? '+' : '';
        const totalGames = leader.winCount + leader.loseCount;
        const winRate = totalGames > 0 ? ((leader.winCount / totalGames) * 100).toFixed(1) : '0.0';

        listContents.push(
            {
                type: 'box', layout: 'horizontal', margin: 'lg', alignItems: 'center',
                contents: [
                    { type: 'text', text: rankStr, size: 'md', weight: 'bold', color: rankColor, flex: 1, align: 'center' },
                    {
                        type: 'box', layout: 'vertical', flex: 4, contents: [
                            { type: 'text', text: leader.displayName, size: 'sm', weight: 'bold', color: '#111111', wrap: true },
                            { type: 'text', text: `勝率 ${winRate}% (${leader.winCount}勝${leader.loseCount}敗)`, size: 'xxs', color: '#9E9E9E' }
                        ]
                    },
                    {
                        type: 'box', layout: 'vertical', flex: 3, alignItems: 'flex-end', contents: [
                            { type: 'text', text: '總淨利', size: 'xxs', color: '#9E9E9E' },
                            { type: 'text', text: `${profitPrefix}${leader.netProfit.toLocaleString()}`, size: 'sm', weight: 'bold', color: profitColor }
                        ]
                    }
                ]
            },
            flexUtils.createSeparator('md', '#EEEEEE')
        );
    });

    if (listContents.length > 0) {
        listContents.pop(); // remove last separator
    } else {
        listContents.push({
            type: 'text', text: '目前沒有任何資料', align: 'center', color: '#BDBDBD', margin: 'xl'
        });
    }

    contents.push({
        type: 'box', layout: 'vertical', paddingAll: 'lg', backgroundColor: '#FFFFFF',
        contents: listContents
    });

    return {
        type: 'bubble', size: 'mega',
        body: { type: 'box', layout: 'vertical', paddingAll: '0px', contents }
    };
}

function buildSettleReportBubble(matchId, homeScore, awayScore, stats, getTeamWithFlag) {
    const { totalWinners, totalLosers, totalPayout, totalBetAmount, houseProfit, topWinners, biggestLoser, mostPopularOption, res1X2, resOU, resOE, resHC, matchData } = stats;

    const homeFlag = getTeamWithFlag(matchData.homeTeam);
    const awayFlag = getTeamWithFlag(matchData.awayTeam);
    const isHouseWin = houseProfit >= 0;

    let resultStr = `獨贏：${res1X2 === 'home' ? '主勝' : res1X2 === 'away' ? '客勝' : '和局'}`;
    if (resHC) {
        resultStr += ` / 讓分：${resHC === 'hcHome' ? '主勝' : resHC === 'hcAway' ? '客勝' : '平手(走水)'}`;
    }
    if (resOU) {
        resultStr += ` / 大小：${resOU === 'over' ? '大' : '小'}`;
        resultStr += ` / 單雙：${resOE === 'odd' ? '單' : '雙'}`;
    }

    const bubble = {
        type: 'bubble', size: 'mega',
        header: {
            type: 'box', layout: 'vertical', paddingAll: 'xl', backgroundColor: '#111111', alignItems: 'center',
            contents: [
                { type: 'text', text: '🏆', size: '4xl', margin: 'md' },
                { type: 'text', text: '賽事結算戰報', weight: 'bold', size: 'xl', color: '#FFD700', margin: 'md' },
                { type: 'text', text: `ID: ${matchId}`, size: 'xxs', color: '#BDBDBD' }
            ]
        },
        body: {
            type: 'box', layout: 'vertical', paddingAll: 'lg', backgroundColor: '#FAFAFA',
            contents: [
                {
                    type: 'box', layout: 'horizontal', alignItems: 'center', justifyContent: 'center', margin: 'lg',
                    contents: [
                        { type: 'text', text: `(主) ${homeFlag}`, weight: 'bold', size: 'md', color: '#111111', align: 'center', wrap: true, flex: 3 },
                        { type: 'text', text: `${homeScore} : ${awayScore}`, size: 'xl', weight: 'bold', color: '#D32F2F', align: 'center', flex: 2 },
                        { type: 'text', text: `(客) ${awayFlag}`, weight: 'bold', size: 'md', color: '#111111', align: 'center', wrap: true, flex: 3 }
                    ]
                },
                { type: 'text', text: resultStr, size: 'sm', weight: 'bold', color: '#1565C0', align: 'center', margin: 'md' },
                flexUtils.createSeparator('lg', '#EEEEEE'),
                {
                    type: 'box', layout: 'horizontal', margin: 'lg', contents: [
                        { type: 'text', text: '總押注額', size: 'sm', color: '#757575', flex: 1 },
                        { type: 'text', text: `${totalBetAmount.toLocaleString()}`, size: 'sm', weight: 'bold', color: '#111111', align: 'end' }
                    ]
                },
                {
                    type: 'box', layout: 'horizontal', margin: 'sm', contents: [
                        { type: 'text', text: '總派彩額', size: 'sm', color: '#757575', flex: 1 },
                        { type: 'text', text: `${totalPayout.toLocaleString()}`, size: 'sm', weight: 'bold', color: '#111111', align: 'end' }
                    ]
                },
                {
                    type: 'box', layout: 'horizontal', margin: 'sm', contents: [
                        { type: 'text', text: '莊家損益', size: 'sm', color: '#757575', flex: 1 },
                        { type: 'text', text: `${isHouseWin ? '+' : ''}${houseProfit.toLocaleString()}`, size: 'sm', weight: 'bold', color: isHouseWin ? '#4CAF50' : '#D32F2F', align: 'end' }
                    ]
                },
                {
                    type: 'box', layout: 'horizontal', margin: 'md', contents: [
                        { type: 'text', text: `贏家: ${totalWinners} 人`, size: 'xs', color: '#388E3C', align: 'center' },
                        { type: 'text', text: `|`, size: 'xs', color: '#BDBDBD', align: 'center' },
                        { type: 'text', text: `輸家: ${totalLosers} 人`, size: 'xs', color: '#D32F2F', align: 'center' }
                    ]
                }
            ]
        },
        footer: {
            type: 'box', layout: 'vertical', paddingAll: '0px',
            contents: []
        }
    };

    if (topWinners && topWinners.length > 0) {
        const winnersBox = {
            type: 'box', layout: 'vertical', paddingAll: 'lg', backgroundColor: '#FFFFFF',
            contents: [
                { type: 'text', text: '🔥 本場獲利 TOP 3', weight: 'bold', size: 'sm', color: '#E65100', margin: 'md' },
                flexUtils.createSeparator('sm', '#EEEEEE')
            ]
        };

        topWinners.forEach((w, i) => {
            const rankIcon = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
            winnersBox.contents.push({
                type: 'box', layout: 'horizontal', margin: 'sm', alignItems: 'center', contents: [
                    { type: 'text', text: rankIcon, size: 'sm', flex: 1 },
                    { type: 'text', text: w.displayName || '玩家', size: 'xs', weight: 'bold', flex: 4, wrap: true },
                    { type: 'text', text: `+${w.netProfit.toLocaleString()}`, size: 'xs', weight: 'bold', color: '#4CAF50', flex: 4, align: 'end' }
                ]
            });
        });

        bubble.footer.contents.push(winnersBox);
    }

    if (biggestLoser || mostPopularOption) {
        const statsBox = {
            type: 'box', layout: 'vertical', paddingAll: 'lg', backgroundColor: '#FAFAFA',
            contents: []
        };
        
        if (mostPopularOption) {
            statsBox.contents.push({
                type: 'box', layout: 'horizontal', margin: 'sm', contents: [
                    { type: 'text', text: '🔥 最熱門押注', size: 'xs', color: '#757575', flex: 2 },
                    { type: 'text', text: `${mostPopularOption.label} (${mostPopularOption.count}注)`, size: 'sm', weight: 'bold', color: '#111111', align: 'end', flex: 3 }
                ]
            });
        }
        
        if (biggestLoser) {
            statsBox.contents.push({
                type: 'box', layout: 'horizontal', margin: 'sm', contents: [
                    { type: 'text', text: '💸 最大苦主', size: 'xs', color: '#757575', flex: 2 },
                    { type: 'text', text: `${biggestLoser.displayName || '玩家'}\n${biggestLoser.netProfit.toLocaleString()}`, size: 'sm', weight: 'bold', color: '#D32F2F', align: 'end', flex: 3, wrap: true }
                ]
            });
        }
        
        bubble.footer.contents.push(statsBox);
    }

    bubble.footer.contents.push({
        type: 'box', layout: 'vertical', paddingAll: 'md', backgroundColor: '#FFFFFF',
        contents: [
            { type: 'button', style: 'primary', color: '#1976D2', action: { type: 'message', label: '🎫 查看我的注單', text: '我的運彩' } }
        ]
    });

    return bubble;
}

function buildMatchDetailsBubble(matchData, stats, totalPool, totalBettors, getTeamWithFlag) {
    const { matchId, homeTeam, awayTeam, odds } = matchData;
    const homeFlag = getTeamWithFlag(homeTeam);
    const awayFlag = getTeamWithFlag(awayTeam);

    const createStatRow = (label, statObj) => {
        return {
            type: 'box', layout: 'horizontal', margin: 'md', contents: [
                { type: 'text', text: label, size: 'sm', color: '#757575', flex: 2 },
                { type: 'text', text: `${statObj.count} 注`, size: 'sm', color: '#9E9E9E', align: 'end', flex: 1 },
                { type: 'text', text: `${statObj.amount.toLocaleString()}`, size: 'sm', weight: 'bold', color: '#111111', align: 'end', flex: 2 }
            ]
        };
    };

    const bubble = {
        type: 'bubble',
        size: 'mega',
        header: {
            type: 'box', layout: 'vertical', paddingAll: '15px', backgroundColor: '#3F51B5',
            contents: [
                { type: 'text', text: `📊 賽事下注詳情`, weight: 'bold', size: 'lg', color: '#FFFFFF' }
            ]
        },
        body: {
            type: 'box', layout: 'vertical', paddingAll: 'lg', backgroundColor: '#FAFAFA',
            contents: [
                { type: 'text', text: `ID: ${matchId}`, size: 'xs', color: '#9E9E9E', margin: 'sm' },
                { type: 'text', text: `(主) ${homeFlag} vs (客) ${awayFlag}`, weight: 'bold', size: 'lg', color: '#111111', wrap: true, margin: 'md' },
                flexUtils.createSeparator('lg', '#EEEEEE'),
                {
                    type: 'box', layout: 'horizontal', margin: 'md', contents: [
                        { type: 'text', text: '總彩池', size: 'sm', color: '#757575' },
                        { type: 'text', text: `${totalPool.toLocaleString()} 哭幣`, size: 'md', weight: 'bold', align: 'end', color: '#D32F2F' }
                    ]
                },
                {
                    type: 'box', layout: 'horizontal', margin: 'md', contents: [
                        { type: 'text', text: '總下注人數', size: 'sm', color: '#757575' },
                        { type: 'text', text: `${totalBettors} 人`, size: 'md', weight: 'bold', align: 'end', color: '#1976D2' }
                    ]
                },
                flexUtils.createSeparator('lg', '#EEEEEE'),
                { type: 'text', text: '📈 下注資金分佈', weight: 'bold', size: 'sm', color: '#111111', margin: 'lg' },
                createStatRow('🎯 主勝', stats.home),
                createStatRow('🤝 和局', stats.draw),
                createStatRow('🎯 客勝', stats.away)
            ]
        }
    };

    if (odds.over !== undefined) {
        bubble.body.contents.push(
            flexUtils.createSeparator('md', '#EEEEEE'),
            createStatRow(`📈 大 (${odds.ouPoint})`, stats.over),
            createStatRow('📉 小', stats.under),
            createStatRow('🔢 單', stats.odd),
            createStatRow('🔠 雙', stats.even)
        );
    }

    if (odds.handicapPoint !== undefined) {
        const hcHomeText = `⚔️ 讓主 (${odds.handicapPoint > 0 ? '+' : ''}${odds.handicapPoint})`;
        const hcAwayText = `🛡️ 讓客 (${odds.handicapPoint > 0 ? '-' : '+'}${Math.abs(odds.handicapPoint)})`;
        bubble.body.contents.push(
            flexUtils.createSeparator('md', '#EEEEEE'),
            createStatRow(hcHomeText, stats.hcHome),
            createStatRow(hcAwayText, stats.hcAway)
        );
    }

    return bubble;
}

module.exports = {
    buildOpenMatchBubble,
    buildManageMatchBubble,
    buildShowMatchBubble,
    buildShowMatchesEndCard,
    buildMyBetBubble,
    buildBetSlipBubble,
    buildMyBetsSummaryBubble,
    buildPaginationBubble,
    buildLeaderboardBubble,
    buildSettleReportBubble,
    buildMatchDetailsBubble
};
