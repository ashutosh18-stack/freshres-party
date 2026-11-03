const { spawn, exec, execSync } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

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
      displayBanner(detectedUrl);
    }
  }

  tunnel.stdout.on('data', handleData);
  tunnel.stderr.on('data', handleData);

  tunnel.on('close', (code) => {
    console.log(`\nTunnel closed (code ${code}).`);
    process.exit(0);
  });
}

function displayBanner(url) {
  // Copy to clipboard
  try {
    exec(`powershell -command "Set-Clipboard -Value '${url}'"`, () => {});
  } catch (e) {}

  // Open browser
  try {
    exec(`start ${url}/login.html`, () => {});
  } catch (e) {}

  console.clear();
  console.log('======================================================================');
  console.log(' 🎉  YOUR FRESHER PARTY PLATFORM IS 100% LIVE ONLINE!');
  console.log('======================================================================\n');
  console.log(` 🌐  MAIN PUBLIC LIVE LINK (For All Devices & Mobiles):`);
  console.log(`     👉  ${url}\n`);
  console.log(` 📸  DIRECT MOBILE GATE SCANNER LINK:`);
  console.log(`     👉  ${url}/scanner.html\n`);
  console.log(` 📊  ADMIN DASHBOARD LINK:`);
  console.log(`     👉  ${url}/dashboard.html\n`);
  console.log('----------------------------------------------------------------------');
  console.log(' 🔑  LOGIN CREDENTIALS:');
  console.log('     👑 Admin:     admin@fresher.party  /  admin123');
  console.log('     📱 Volunteer: volunteer@fresher.party  /  volunteer123');
  console.log('----------------------------------------------------------------------');
  console.log(' 📋  Notice: The live link has been automatically COPIED to your clipboard!');
  console.log(' 💾  Auto-Sync: Data auto-saves every 30 seconds into database_backup/ (Portable!)');
  console.log(' 🚀  Opening in your default browser right now...');
  console.log('======================================================================');
  console.log(' 💡  KEEP THIS CMD WINDOW OPEN while you want the system to be live.');
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

