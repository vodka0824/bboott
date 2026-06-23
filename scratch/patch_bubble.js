const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../services/robberyCombatService.js');
let content = fs.readFileSync(filePath, 'utf8');

// Update titleMap
content = content.replace(/blackmail: '📸 抓到把柄',/, `blackmail: '📸 抓到把柄',\n            bodyguard_arrest: '💂 保鑣壓制',`);

// Update buildRobResultBubble
// In `jailed`
const jailedBodyRegex = /} else if \(result\.outcome === 'jailed'\) \{([\s\S]*?)bubble = flexUtils\.createBubble\(\{/;
const newJailedBody = `} else if (result.outcome === 'jailed' || result.outcome === 'bodyguard_arrest') {
        const texts = [];
        if (result.outcome === 'bodyguard_arrest') {
            texts.push(flexUtils.createText({ text: \`你一靠近就被 \${result.targetName} 的特勤保鑣發現！\`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, wrap: true }));
            texts.push(flexUtils.createText({ text: \`「有刺客！保護議員！」\`, size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'md', wrap: true }));
            texts.push(flexUtils.createText({ text: \`你當場被保鑣壓制並移送法辦，罪名為危害國家安全！\`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, margin: 'md', wrap: true }));
        } else {
            texts.push(flexUtils.createText({ text: \`\${result.fromName} 在作案過程中行蹤敗露，遭警方逮捕！\`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, wrap: true }));
        }

        if (result.lostCoins > 0) {
            texts.push(flexUtils.createSeparator('md'));
            texts.push(flexUtils.createText({ text: \`法院沒收了你的部分財產：\\n-\${result.lostCoins.toLocaleString()} 哭幣\`, size: 'sm', color: '#D32F2F', margin: 'md', wrap: true }));
        }

        if (result.weaponConfiscated) {
            texts.push(flexUtils.createText({ text: \`🚨 【襲警重罰】警方沒收了你身上的主武器！\`, size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'sm', wrap: true }));
        }
        
        if (result.lostCouncilor) {
            texts.push(flexUtils.createText({ text: \`🏛️ 【政治醜聞】你身為議員卻親自下海搶劫，當場遭議會革職，政治生涯徹底結束！\`, size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'sm', wrap: true }));
        }

        texts.push(flexUtils.createSeparator('md'));
        texts.push(flexUtils.createText({ text: \`👮 前科次數增加為：\${result.newCrimeRecord} 次\`, size: 'xs', color: flexUtils.COLORS.TEXT_MUTED, margin: 'md' }));
        texts.push(flexUtils.createText({ text: \`⏳ 必須坐牢 \${result.penaltyMins} 分鐘\`, size: 'md', weight: 'bold', color: '#B71C1C', margin: 'sm' }));

        bubble = flexUtils.createBubble({`;
content = content.replace(jailedBodyRegex, newJailedBody);

// In `counterAttack`
const counterBodyRegex = /} else if \(result\.outcome === 'counterAttack'\) \{([\s\S]*?)bubble = flexUtils\.createBubble\(\{/;
const newCounterBody = `} else if (result.outcome === 'counterAttack') {
        const texts = [];
        texts.push(flexUtils.createText({ text: \`\${result.fromName} 搶劫不成，反而被 \${result.targetName} 狠狠修理了一頓！\`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, wrap: true }));
        if (result.lostCoins > 0) {
            texts.push(flexUtils.createSeparator('md'));
            texts.push(flexUtils.createText({ text: \`你被打得鼻青臉腫，從口袋裡掉出了 \${result.lostCoins.toLocaleString()} 哭幣，被對方撿走了！\`, size: 'sm', color: '#D32F2F', margin: 'md', wrap: true }));
        }
        if (result.medicalDebt > 0) {
            texts.push(flexUtils.createText({ text: \`🏥 【重傷負債】你身無分文付不出醫藥費，背上了 \${result.medicalDebt.toLocaleString()} 哭幣的醫療負債！\n(系統將強制扣除你的未來收入直至還清，期間戰力減半且無法搶劫)\`, size: 'sm', weight: 'bold', color: '#B71C1C', margin: 'md', wrap: true }));
        }
        if (result.brokenEquip) {
            texts.push(flexUtils.createText({ text: \`💥 【裝備損壞】你在扭打中弄壞了裝備，\${result.brokenEquip} 降級了！\`, size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'sm', wrap: true }));
        }
        
        bubble = flexUtils.createBubble({`;
content = content.replace(counterBodyRegex, newCounterBody);

// In `mafiaBossCounter`
const bossCounterBodyRegex = /} else if \(result\.outcome === 'mafiaBossCounter'\) \{([\s\S]*?)bubble = flexUtils\.createBubble\(\{/;
const newBossCounterBody = `} else if (result.outcome === 'mafiaBossCounter') {
        const texts = [];
        texts.push(flexUtils.createText({ text: \`你惹到了黑道高層 \${result.targetName}，對方連武器都沒拿出來，光靠氣場就震碎了你的理智！\`, size: 'sm', color: flexUtils.COLORS.TEXT_MUTED, wrap: true }));
        if (result.lostCoins > 0) {
            texts.push(flexUtils.createSeparator('md'));
            texts.push(flexUtils.createText({ text: \`你嚇得交出了 \${result.lostCoins.toLocaleString()} 哭幣當作保護費！\`, size: 'sm', color: '#D32F2F', margin: 'md', wrap: true }));
        }
        if (result.medicalDebt > 0) {
            texts.push(flexUtils.createText({ text: \`🏥 【重傷負債】你身無分文付不出醫藥費，背上了 \${result.medicalDebt.toLocaleString()} 哭幣的醫療負債！\`, size: 'sm', weight: 'bold', color: '#B71C1C', margin: 'md', wrap: true }));
        }
        if (result.brokenEquip) {
            texts.push(flexUtils.createText({ text: \`💥 【裝備損壞】你嚇得跌倒，\${result.brokenEquip} 降級了！\`, size: 'sm', weight: 'bold', color: '#D32F2F', margin: 'sm', wrap: true }));
        }

        bubble = flexUtils.createBubble({`;
content = content.replace(bossCounterBodyRegex, newBossCounterBody);

// DB Update check
const hasBalanceChangeRegex = /const hasBalanceChange = \['counterAttack', 'mafiaBossCounter', 'jailed', 'councilorEvade', 'success', 'blackmail'\].includes\(outcome\);/;
content = content.replace(hasBalanceChangeRegex, `const hasBalanceChange = ['counterAttack', 'mafiaBossCounter', 'jailed', 'bodyguard_arrest', 'councilorEvade', 'success', 'blackmail'].includes(outcome);`);

const balanceColRegex = /if \(outcome === 'jailed'\) balanceCol = '#D32F2F';/;
content = content.replace(balanceColRegex, `if (outcome === 'jailed' || outcome === 'bodyguard_arrest') balanceCol = '#D32F2F';`);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Bubble Patched.');
