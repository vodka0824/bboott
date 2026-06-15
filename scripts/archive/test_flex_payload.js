require('dotenv').config();
const axios = require('axios');
const { CHANNEL_ACCESS_TOKEN } = require('./config/constants');

const flexPayload = {
  "type": "bubble",
  "size": "mega",
  "header": {
    "type": "box",
    "layout": "vertical",
    "contents": [
      {
        "type": "text",
        "text": "💰 我的錢包",
        "weight": "bold",
        "color": "#FFD700",
        "size": "md"
      }
    ],
    "backgroundColor": "#121212",
    "paddingAll": "12px"
  },
  "body": {
    "type": "box",
    "layout": "vertical",
    "contents": [
      {
        "type": "text",
        "text": "玩家",
        "size": "md",
        "color": "#FFFFFF",
        "weight": "bold",
        "align": "center",
        "wrap": true
      },
      {
        "type": "text",
        "text": "「家徒四壁」",
        "size": "lg",
        "color": "#CE93D8",
        "weight": "bold",
        "align": "center",
        "margin": "sm"
      },
      {
        "type": "separator",
        "margin": "md"
      },
      {
        "type": "text",
        "text": "目前餘額",
        "size": "sm",
        "color": "#AAAAAA",
        "weight": "regular",
        "align": "center",
        "margin": "md"
      },
      {
        "type": "text",
        "text": "10,649,328,053 哭幣",
        "size": "xxl",
        "color": "#FFD700",
        "weight": "bold",
        "align": "center",
        "margin": "sm"
      }
    ],
    "paddingAll": "xl",
    "backgroundColor": "#1A1A1A"
  }
};

async function testPush() {
    try {
        await axios.post('https://api.line.me/v2/bot/message/push', {
            to: 'Ucf8e01b60972571bd9b5d09a65030c8b', // Admin ID
            messages: [{ type: 'flex', altText: '💰 我的哭幣', contents: flexPayload }]
        }, {
            headers: { 'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}` }
        });
        console.log("Push successful! Payload is valid.");
    } catch (e) {
        console.error("Push failed!");
        if (e.response && e.response.data) {
            console.error(JSON.stringify(e.response.data, null, 2));
        } else {
            console.error(e.message);
        }
    }
}

testPush();
