const { spawn } = require('child_process');

console.log('Testing Pinggy SSH output...');
const tunnel = spawn('ssh', ['-p', '443', '-R0:127.0.0.1:3000', 'a.pinggy.io', '-o', 'StrictHostKeyChecking=no']);

tunnel.stdout.on('data', (data) => {
    console.log('[STDOUT]', data.toString());
});

tunnel.stderr.on('data', (data) => {
    console.log('[STDERR]', data.toString());
});

tunnel.on('close', (code) => {
    console.log('SSH closed with code', code);
});
