const { pinggy } = require("@pinggy/pinggy");

async function startTunnel() {
    try {
        console.log(`啟動 Pinggy Tunnel (port 3000)...`);
        const tunnel = await pinggy.forward({ forwarding: `127.0.0.1:3000` });
        console.log("Tunnel established!");
        const urls = await tunnel.urls();
        console.log("URLs:", urls);
        process.exit(0);
    } catch (e) {
        console.error("Pinggy Error:", e);
        process.exit(1);
    }
}

startTunnel();
