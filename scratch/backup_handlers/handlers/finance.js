/**
 * 分期計算模組
 */
const lineUtils = require('../utils/line');

/**
 * 分唄/銀角分期計算
 */
async function handleFinancing(replyToken, amount, type) {
    let results = [];
    let title = '';

    if (type === 'fenbei') {
        title = '💰 分唄分期';
        const rates = {
            6: 0.1745,
            9: 0.11833,
            12: 0.09041,
            15: 0.07366,
            18: 0.06277,
            21: 0.05452,
            24: 0.04833,
            30: 0.04
        };
        results = [6, 9, 12, 15, 18, 21, 24, 30].map(term => {
            const monthly = Math.floor(amount * rates[term]);
            return `${term}期: ${monthly}`;
        });
    } else {
        title = '💰 銀角分期';
        const rates = {
            3: 1.026,
            6: 1.04,
            9: 1.055,
            12: 1.065,
            18: 1.09,
            24: 1.115
        };
        results = Object.keys(rates).map(term => {
            const total = Math.round(amount * rates[term]);
            return `${term}期: ${Math.round(total / term)}`;
        });
    }

    await lineUtils.replyText(replyToken, `${title}\n${results.join('\n')}`);
}

/**
 * 刷卡分期計算
 */
async function handleCreditCard(replyToken, amount) {
    const isSmall = amount * 0.0249 < 498;

    const calc = (rate, term) => {
        const total = Math.round(amount * rate + (isSmall ? 0 : 498));
        return `${term}期: ${Math.round(total / term)}`;
    };

    let results = [];
    if (isSmall) {
        results = [
            `付清: ${Math.round(amount * 1.0449)}`,
            calc(1.0549, 3),
            calc(1.0599, 6),
            calc(1.0849, 12),
            calc(1.0849, 24)
        ];
    } else {
        results = [
            `付清: ${Math.round(amount * 1.02) + 498}`,
            calc(1.03, 3),
            calc(1.035, 6),
            calc(1.06, 12),
            calc(1.06, 24)
        ];
    }

    await lineUtils.replyText(replyToken, `💳 刷卡分期\n${results.join('\n')}`);
}

// 包裝函數以匹配路由名稱
async function handleInstallmentFenbei(replyToken, amount) {
    return handleFinancing(replyToken, amount, 'fenbei');
}

async function handleInstallmentYinjiao(replyToken, amount) {
    return handleFinancing(replyToken, amount, 'yinjiao');
}

async function handleInstallmentCredit(replyToken, amount) {
    return handleCreditCard(replyToken, amount);
}

module.exports = {
    handleFinancing,
    handleCreditCard,
    handleInstallmentFenbei,
    handleInstallmentYinjiao,
    handleInstallmentCredit
};

