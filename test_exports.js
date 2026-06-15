require('dotenv').config();
const eco = require('./handlers/economy');
const prof = require('./handlers/profession');
console.log('economy exports:', Object.keys(eco));
console.log('profession exports:', Object.keys(prof));
