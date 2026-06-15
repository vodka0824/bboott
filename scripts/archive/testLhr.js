require('dotenv').config();
const https = require('https');

function updateLineWebhook(newUrl) {
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
             console.log('✅ LINE Webhook 更新成功！');
         } else {
             console.log(`❌ LINE Webhook 拒絕了此網址 (狀態碼: ${res.statusCode})`);
             console.log(data);
         }
      });
    });
    
    req.write(JSON.stringify({ endpoint: newUrl }));
    req.end();
}

updateLineWebhook('https://dfaa73234f4297.lhr.life/webhook');
