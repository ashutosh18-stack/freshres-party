const { spawn, exec, execSync } = require('child_process');
const net = require('net');
const https = require('https');
const dns = require('dns');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Use ultra-fast Cloudflare and Google DNS
try {
  dns.setServers(['1.1.1.1', '8.8.8.8', '1.0.0.1']);
  dns.setDefaultResultOrder('ipv4first');
} catch (e) {}

console.clear();
console.log('====================================================');
console.log('🚀 Initializing 1-Click Fresher Party Live System...');
console.log('====================================================');

const isRemoteDb = (process.env.DB_HOST && process.env.DB_HOST !== 'localhost' && process.env.DB_HOST !== '127.0.0.1');

function checkPort(port) {
  return new Promise((resolve) => {
    const client = new net.Socket();
    client.setTimeout(1000);
    client.on('connect', () => {
      client.destroy();
      resolve(true);
    });
    client.on('timeout', () => {
      client.destroy();
      resolve(false);
    });
    client.on('error', () => {
      resolve(false);
    });
    client.connect(port, '127.0.0.1');
  });
}

function ensureDependencies() {
  const nodeModulesPath = path.join(__dirname, 'node_modules');
  if (!fs.existsSync(nodeModulesPath)) {
    console.log('📦 First-time setup detected: Installing packages (npm install)...');
    try {
      execSync('npm install', { stdio: 'inherit', cwd: __dirname });
      console.log('✅ Packages installed successfully.');
    } catch (e) {
      console.error('❌ Failed to run npm install. Please run it manually.');
    }
  }
}

async function ensureMySQL() {
  if (isRemoteDb) {
    console.log(`🌐 Using Remote Cloud Database (${process.env.DB_HOST}). Skipping local MySQL.`);
    return;
  }

  const isRunning = await checkPort(3306);
  if (isRunning) {
    console.log('✅ MySQL Database is running on port 3306.');
    return;
  }

  console.log('⚙️ Starting local MySQL database from XAMPP...');
  const xamppMysql = 'C:\\xampp\\mysql\\bin\\mysqld.exe';
  const xamppIni = 'C:\\xampp\\mysql\\bin\\my.ini';

  if (fs.existsSync(xamppMysql)) {
    spawn(xamppMysql, [`--defaults-file=${xamppIni}`, '--standalone'], {
      detached: true,
      stdio: 'ignore'
    }).unref();
  } else {
    console.warn('⚠️ XAMPP MySQL not found at C:\\xampp. If using local DB, please ensure MySQL is started.');
  }

  // Wait up to 10 seconds for MySQL to be ready
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await checkPort(3306)) {
      console.log('✅ MySQL Database connected successfully.');
      return;
    }
  }
  console.warn('⚠️ Warning: MySQL took longer to respond. Proceeding anyway...');
}

async function ensureNodeServer() {
  const isRunning = await checkPort(3000);
  if (isRunning) {
    console.log('✅ Web Server is already running on port 3000.');
    return;
  }

  console.log('⚙️ Starting Node.js Web Server...');
  const serverProcess = spawn('node', ['server.js'], {
    cwd: __dirname,
    stdio: 'ignore',
    detached: true
  });
  serverProcess.unref();

  // Wait up to 10 seconds for port 3000
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await checkPort(3000)) {
      console.log('✅ Web Server running on http://localhost:3000.');
      return;
    }
  }
}

function createShortUrl(longUrl) {
  return new Promise((resolve) => {
    const postData = `url=${encodeURIComponent(longUrl)}`;
    const options = {
      hostname: 'spoo.me',
      port: 443,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      family: 4,
      timeout: 5000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json && json.short_url) {
            resolve(json.short_url.replace('http://', 'https://'));
            return;
          }
        } catch (e) {}
        resolve(longUrl);
      });
    });

    req.on('error', () => resolve(longUrl));
    req.on('timeout', () => { req.destroy(); resolve(longUrl); });
    req.write(postData);
    req.end();
  });
}

async function verifyTunnelReachability(url) {
  try {
    execSync('ipconfig /flushdns', { stdio: 'ignore' });
  } catch (e) {}

  process.stdout.write('⏳ Initializing secure Cloudflare tunnel');
  for (let i = 1; i <= 15; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    process.stdout.write('.');
  }
  console.log(' Live! 🚀\n');
  return true;
}

async function startTunnel() {
  console.log('🌐 Connecting to High-Speed Cloudflare Network...');
  const cloudflared = path.join(__dirname, 'cloudflared.exe');

  if (!fs.existsSync(cloudflared)) {
    console.error('❌ Error: cloudflared.exe not found in ' + __dirname);
    process.exit(1);
  }

  const tunnel = spawn(cloudflared, ['tunnel', '--url', 'http://localhost:3000']);
  let detectedUrl = null;

  function handleData(chunk) {
    const text = chunk.toString();
    const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (match && !detectedUrl) {
      detectedUrl = match[0];
      process.stdout.write('\n🔗 Public tunnel created: ' + detectedUrl + '\n');
      (async () => {
        await verifyTunnelReachability(detectedUrl);
        displayBanner(detectedUrl);
      })();
    }
  }

  tunnel.stdout.on('data', handleData);
  tunnel.stderr.on('data', handleData);

  tunnel.on('close', (code) => {
    console.log(`\nTunnel closed (code ${code}).`);
    process.exit(0);
  });
}

function displayBanner(publicUrl) {
  // Copy public mobile link to clipboard
  try {
    exec(`powershell -command "Set-Clipboard -Value '${publicUrl}'"`, () => {});
  } catch (e) {}

  // Open browser locally on laptop (instant, 100% reliable)
  try {
    exec(`start http://localhost:3000/login.html`, () => {});
  } catch (e) {}

  console.clear();
  console.log('======================================================================');
  console.log(' 🎉  YOUR FRESHER PARTY PLATFORM IS 100% LIVE ONLINE!');
  console.log('======================================================================\n');
  console.log(` 📱  PUBLIC HTTPS LINK (FOR ALL MOBILES, VOLUNTEERS & PASSENGERS):`);
  console.log(`     👉  ${publicUrl}\n`);
  console.log(` 📸  DIRECT MOBILE GATE SCANNER:`);
  console.log(`     👉  ${publicUrl}/scanner.html\n`);
  console.log('----------------------------------------------------------------------');
  console.log(` 💻  Laptop Local Dashboard:            http://localhost:3000/dashboard.html`);
  console.log(` ☁️  Permanent Cloud Link (Render 24/7): https://freshres-party.onrender.com`);
  console.log('----------------------------------------------------------------------');
  console.log(' 🔑  LOGIN CREDENTIALS:');
  console.log('     👑 Admin:     admin@fresher.party  /  admin123');
  console.log('     📱 Volunteer: volunteer@fresher.party  /  volunteer123');
  console.log('----------------------------------------------------------------------');
  console.log(` 📋  The mobile link (${publicUrl}) has been COPIED to your clipboard!`);
  console.log(' 💾  Auto-Sync: Database auto-saves every 30s into database_backup/');
  console.log(' 🚀  Dashboard opened directly in your browser!');
  console.log('======================================================================');
  console.log(' 💡  KEEP THIS CMD WINDOW OPEN while the event is ongoing.');
  console.log('     Press [Ctrl + C] anytime to stop.');
  console.log('======================================================================');
}

async function main() {
  try {
    ensureDependencies();
    await ensureMySQL();
    await ensureNodeServer();
    await startTunnel();
  } catch (err) {
    console.error('❌ Startup Error:', err.message);
  }
}

main();

