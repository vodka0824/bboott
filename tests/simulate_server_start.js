
// Set minimal Env Vars required to pass startup-check.js
process.env.LINE_TOKEN = 'mock_token';
process.env.ADMIN_USER_ID = 'mock_admin';
// process.env.GOOGLE_CLOUD_PROJECT = 'mock_project'; // Now optional
process.env.PORT = 8080;

console.log("--- Simulating Server Startup ---");

try {
    // We want to catch errors during the REQUIRE phase
    const server = require('../server');
    console.log("--- Server Loaded Successfully (Require Phase Passed) ---");

    // Note: server.js starts listening immediately on require because of app.listen() at the bottom.
    // In a test, this might hang until we force exit, which is fine for verifying startup.

} catch (e) {
    console.error("!!! STARTUP CRASH DETECTED !!!");
    console.error(e);
    const fs = require('fs');
    fs.writeFileSync('startup_error.log', e.stack || String(e));
    process.exit(1);
}
