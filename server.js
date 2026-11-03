const express = require('express');
const path = require('path');
const http = require('http');
const https = require('https');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const { initDB } = require('./src/db');
const { getOrCreateCertificates, getLocalIpAddresses } = require('./src/utils/sslHelper');
const authRoutes = require('./src/routes/authRoutes');
const studentRoutes = require('./src/routes/studentRoutes');
const emailRoutes = require('./src/routes/emailRoutes');
const scanRoutes = require('./src/routes/scanRoutes');
const dashboardRoutes = require('./src/routes/dashboardRoutes');
const volunteerRoutes = require('./src/routes/volunteerRoutes');
const settingsRoutes = require('./src/routes/settingsRoutes');
const publicRoutes = require('./src/routes/publicRoutes');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const HTTPS_PORT = parseInt(process.env.HTTPS_PORT || '3443', 10);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Static Files
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/volunteers', volunteerRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/public', publicRoutes);

// Root redirect
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Pass digital card friendly URL: /pass/:token -> public/pass.html
app.get('/pass/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pass.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'An unexpected server error occurred.'
  });
});

// Start Servers after DB initialization
async function startServer() {
  try {
    await initDB();

    // 1. Standard HTTP Server (Laptop / Localhost)
    const httpServer = http.createServer(app);
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`====================================================`);
      console.log(`🚀 Fresher Party Entry Pass Platform is running!`);
      console.log(`📍 Web Dashboard:  http://localhost:${PORT}`);
      console.log(`📸 Gate Scanner:   http://localhost:${PORT}/scanner.html`);
      console.log(`🎟️ Passes Center:  http://localhost:${PORT}/passes.html`);
    });

    // 2. Secure HTTPS Server (Unlocks Camera on Mobile Browsers)
    const ssl = await getOrCreateCertificates();
    const httpsServer = https.createServer(ssl, app);
    httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
      const ips = getLocalIpAddresses();
      const primaryIp = ips[0] || 'localhost';
      console.log(`----------------------------------------------------`);
      console.log(`🔒 Secure HTTPS Enabled (Camera access on phones!):`);
      console.log(`📱 Mobile Scanner: https://${primaryIp}:${HTTPS_PORT}/scanner.html`);
      console.log(`💻 Local HTTPS:    https://localhost:${HTTPS_PORT}/scanner.html`);
      console.log(`====================================================`);
      console.log(`Default Credentials:`);
      console.log(`  Admin:     admin@fresher.party     / admin123`);
      console.log(`  Volunteer: volunteer@fresher.party / volunteer123`);
      console.log(`====================================================`);
    });
  } catch (error) {
    console.error('Failed to initialize and start server:', error);
    process.exit(1);
  }
}

startServer();

