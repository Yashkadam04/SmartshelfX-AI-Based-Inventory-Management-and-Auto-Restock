const { spawn } = require('child_process');
const os = require('os');

// ─── ANSI colours ───────────────────────────────────────────────
const R = '\x1b[0m';
const C = '\x1b[36m';
const Y = '\x1b[33m';
const G = '\x1b[32m';
const W = '\x1b[97m';
const DIM = '\x1b[2m';
const B = '\x1b[1m';

const isWin = os.platform() === 'win32';

function spawnNg(port) {
    // Windows requires .cmd extension; Unix uses plain npx
    if (isWin) {
        return spawn(
            'cmd',
            ['/c', 'npx', 'ng', 'serve', '--port', String(port), '--disable-host-check'],
            { stdio: 'pipe', shell: false }
        );
    }
    return spawn(
        'npx',
        ['ng', 'serve', '--port', String(port), '--disable-host-check'],
        { stdio: 'pipe', shell: true }
    );
}

function banner() {
    console.clear();
    console.log('');
    console.log(W + B + '  ╔══════════════════════════════════════════════════════════╗' + R);
    console.log(W + B + '  ║       Smart' + C + 'Shelf' + W + 'X  ·  Development Server              ║' + R);
    console.log(W + B + '  ╚══════════════════════════════════════════════════════════╝' + R);
    console.log('');
    console.log(Y + B + '  Starting two Angular instances...' + R);
    console.log(DIM + '  (Both will be ready in ~30-60 seconds)' + R);
    console.log('');
    console.log(Y + '  ╔════════════════════════════════════════════════════════╗' + R);
    console.log(Y + '  ║  🔐  ADMIN LOGIN          http://localhost:4201        ║' + R);
    console.log(Y + '  ╚════════════════════════════════════════════════════════╝' + R);
    console.log('');
    console.log(C + '  ╔════════════════════════════════════════════════════════╗' + R);
    console.log(C + '  ║  👤  MANAGER / VENDOR LOGIN  http://localhost:4200     ║' + R);
    console.log(C + '  ╚════════════════════════════════════════════════════════╝' + R);
    console.log('');
    console.log(DIM + '  Press Ctrl+C to stop both servers.' + R);
    console.log('');
}

banner();

const adminServer = spawnNg(4201);
const usersServer = spawnNg(4200);

let adminReady = false;
let usersReady = false;

// Angular 19 ready signals
const READY = ['compiled', 'bundle generation complete', 'built in', 'watching for', 'application bundle'];

function isReady(msg) {
    const l = msg.toLowerCase();
    return READY.some(p => l.includes(p));
}

function checkBothReady() {
    if (adminReady && usersReady) {
        console.log('');
        console.log(G + B + '  ✔  Both servers are ready!' + R);
        console.log('');
        console.log(Y + B + '  🔐  Admin Login       →  http://localhost:4201' + R);
        console.log(C + B + '  👤  Manager / Vendor  →  http://localhost:4200' + R);
        console.log('');
    }
}

function wire(proc, label, color, port, isAdmin) {
    const handle = (data) => {
        const msg = data.toString();

        // Print each non-empty line
        msg.split('\n').forEach(line => {
            const t = line.trim();
            if (t) console.log(DIM + '  [' + label + '] ' + t + R);
        });

        // Detect ready
        if (isAdmin && !adminReady && isReady(msg)) {
            adminReady = true;
            console.log(color + B + '\n  ✔  [' + label + '] Ready → http://localhost:' + port + R);
            checkBothReady();
        }
        if (!isAdmin && !usersReady && isReady(msg)) {
            usersReady = true;
            console.log(color + B + '\n  ✔  [' + label + '] Ready → http://localhost:' + port + R);
            checkBothReady();
        }
    };

    proc.stdout.on('data', handle);
    proc.stderr.on('data', handle);
    proc.on('error', err => console.error(color + '  [' + label + '] Spawn error: ' + err.message + R));
    proc.on('exit', code => { if (code) console.log(color + '  [' + label + '] exited with code ' + code + R); });
}

wire(adminServer, 'ADMIN', Y, 4201, true);
wire(usersServer, 'USERS', C, 4200, false);

// Fallback: show links after 90s regardless
setTimeout(() => {
    if (!adminReady || !usersReady) {
        console.log('');
        console.log(Y + '  ⏱  Still compiling — try the URLs now:' + R);
        console.log(Y + B + '  🔐  Admin       →  http://localhost:4201' + R);
        console.log(C + B + '  👤  Users       →  http://localhost:4200' + R);
        console.log('');
    }
}, 90000);

process.on('SIGINT', () => {
    console.log('\n' + Y + '  Shutting down...' + R);
    adminServer.kill();
    usersServer.kill();
    process.exit(0);
});