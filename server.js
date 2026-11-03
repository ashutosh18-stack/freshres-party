const express = require('express');
const path = require('path');
const http = require('http');
const https = require('https');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
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

// 1. Security Headers (Helmet)
app.use(helmet({
  contentSecurityPolicy: false, // Allows inline scripts & verified CDNs (Tailwind, FontAwesome)
  crossOriginEmbedderPolicy: false
}));

// 2. Rate Limiting Protection (Brute Force Defense)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: 20, // max 20 login attempts per IP
  message: { error: 'Too many login attempts from this IP. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

const pinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6, // max 6 incorrect PIN attempts per IP
  message: { error: 'Security lockout: Too many incorrect PIN attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500, // max 500 requests per 15 minutes for standard actions
  standardHeaders: true,
  legacyHeaders: false
});

// Gate scan route needs higher throughput for high-speed scanning
const scanLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 120, // 120 scans per minute
  standardHeaders: true,
  legacyHeaders: false
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Apply rate limiters
app.use('/api/auth/login', authLimiter);
app.use('/api/settings/verify-pin', pinLimiter);
app.use('/api/scan', scanLimiter);
app.use('/api', apiLimiter);

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

// Error handling middleware (sanitized for production)
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred. Please contact event administrator.'
      : (err.message || 'An unexpected server error occurred.')
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
      console.log(`🚀 Fresher Party Platform (Secured with Helmet & Rate Limiter)`);
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
      console.log(`Security: Rate-limiting & Brute-force protection ACTIVE.`);
      console.log(`====================================================`);
    });
  } catch (error) {
    console.error('Failed to initialize and start server:', error);
    process.exit(1);
  }
}

startServer();

