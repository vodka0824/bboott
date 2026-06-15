const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const BOT_DIR = __dirname;
const LOG_DIR = path.join(BOT_DIR, 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function log(tag, msg) {
    const ts = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
    const line = `[${ts}] [${tag}] ${msg}`;
    console.log(line);
    fs.appendFileSync(path.join(LOG_DIR, 'startup.log'), line + '\n');
}

function launchProcess(name, script, delay = 3000) {
    let child = null;
    let restarting = false;

    function start() {
        log(name, `啟動中... (${script})`);
        child = spawn('node', [path.join(BOT_DIR, script)], {
            cwd: BOT_DIR,
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
            detached: true,
            env: { ...process.env }
        });

        const logStream = fs.createWriteStream(path.join(LOG_DIR, `${name}.log`), { flags: 'a' });
        child.stdout.pipe(logStream);
        child.stderr.pipe(logStream);

        child.on('exit', (code, signal) => {
            log(name, `進程已退出 (code=${code}, signal=${signal})`);
            logStream.end();
            if (!restarting) {
                setTimeout(start, delay);
            }
        });

        child.on('error', (err) => { log(name, `啟動錯誤: ${err.message}`); });
        log(name, `已啟動 (PID: ${child.pid})`);
    }
    start();
}

log('Startup', '========= LineBot 全自動啟動器 =========');

setTimeout(() => {
    launchProcess('LineBot', 'server.js', 5000);
    setTimeout(() => {
        launchProcess('Tunnel', 'ngrok-runner.js', 10000);
    }, 3000);
}, 2000);

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
