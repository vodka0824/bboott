require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const https = require('https');
const { pinggy } = require("@pinggy/pinggy");

const PORT = process.env.PORT || 3000;

function updateLineWebhook(newUrl) {
    console.log(`\n🔄 正在向 LINE 官方註冊 Webhook URL: ${newUrl} ...`);
    const options = {
      hostname: 'api.line.me',
      path: '/v2/bot/channel/webhook/endpoint',
      method: 'PUT',
      headers: {
        'Authorization': 'Bearer ' + process.env.LINE_TOKEN,
        'Content-Type': 'application/json'
      }
    };
    
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
         if (res.statusCode === 200) {
             console.log('✅ LINE Webhook 更新成功！(Pinggy SDK 極速通道已啟動)');
         } else {
             console.log(`❌ LINE Webhook 拒絕了此網址 (狀態碼: ${res.statusCode})`);
             console.log(data);
         }
      });
    });
    
    req.on('error', e => {
      console.error('更新 Webhook 時發生錯誤:', e);
    });
    
    req.write(JSON.stringify({ endpoint: newUrl }));
    req.end();
}

let healthCheckInterval = null;
let consecutiveFailures = 0;

function startHealthCheck(testUrl) {
    if (healthCheckInterval) clearInterval(healthCheckInterval);
    console.log(`[Watchdog] 開始監控隧道連線狀態: ${testUrl}`);
    
    // 每 1 分鐘檢查一次
    healthCheckInterval = setInterval(() => {
        const req = https.get(testUrl, (res) => {
            if (res.statusCode === 200) {
                consecutiveFailures = 0; // 成功則歸零
                // console.log(`[Watchdog] 連線正常 (${res.statusCode})`);
            } else {
                consecutiveFailures++;
                console.warn(`[Watchdog] 警告：連線異常 (${res.statusCode})，失敗次數：${consecutiveFailures}`);
            }
            // 必須消費 data 否則可能會導致內存洩漏
            res.on('data', () => {}); 
        }).on('error', (err) => {
            consecutiveFailures++;
            console.error(`[Watchdog] 錯誤：連線失敗 (${err.message})，失敗次數：${consecutiveFailures}`);
        });

        // 設置 10 秒超時
        req.setTimeout(10000, () => {
            req.destroy();
            console.warn(`[Watchdog] 警告：連線超時，失敗次數：${consecutiveFailures}`);
        });

        // 若連續 3 次失敗，視為斷線，強制關閉交由 startup.js 重啟
        if (consecutiveFailures >= 3) {
            console.error('[Watchdog] 🔴 連續 3 次檢查失敗，判斷為網路斷線或隧道過期！準備強制重啟...');
            process.exit(1); 
        }
    }, 60 * 1000);
}

async function startTunnel() {
    console.log(`啟動 Pinggy Tunnel (port ${PORT})...`);
    try {
        const tunnel = await pinggy.forward({ forwarding: `127.0.0.1:${PORT}` });
        const urls = await tunnel.urls();
        
        let httpsUrl = urls.find(url => url.startsWith('https://'));
        if (httpsUrl) {
            const webhookUrl = httpsUrl + '/webhook';
            console.log('\n=============================================');
            console.log(`🚀 成功取得 Pinggy URL！`);
            console.log(`   Webhook URL: ${webhookUrl}`);
            console.log('=============================================\n');
            updateLineWebhook(webhookUrl);
            
            // 啟動健康檢查 (測試根目錄 '/'，server.js 會回傳 200)
            startHealthCheck(httpsUrl);
        } else {
            console.error('Pinggy failed to return an HTTPS URL.');
        }

    } catch (error) {
        console.error('Pinggy encountered an error:', error);
        setTimeout(startTunnel, 5000);
    }
}

startTunnel();

// 💡 為了防止 Pinggy 免費版 60 分鐘強制斷線導致無回應，
// 我們依然保留 55 分鐘定期換網址的保底機制，雙管齊下！
setTimeout(() => {
    console.log('⏳ Pinggy Tunnel 已運行 55 分鐘，即將自動重啟以防止斷線...');
    process.exit(0);
}, 55 * 60 * 1000);
