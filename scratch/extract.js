const fs = require('fs');
const log = fs.readFileSync('C:\\Users\\USER\\.gemini\\antigravity\\brain\\dc7b9c0f-37b3-4522-a847-70cfd3536590\\.system_generated\\tasks\\task-6138.log', 'utf8');

const match = log.match(/data: '({"replyToken":"test_reply_token","messages":\[{"type":"flex".*?}]})',/);
if (match) {
    const jsonStr = match[1];
    const data = JSON.parse(jsonStr);
    fs.writeFileSync('C:\\Users\\USER\\.gemini\\antigravity\\scratch\\lineBot\\scratch\\flex.json', JSON.stringify(data.messages[0].contents, null, 2));
    console.log('Extracted flex.json');
} else {
    console.log('No match found');
}
