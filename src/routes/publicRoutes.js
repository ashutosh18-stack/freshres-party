const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const { getPool } = require('../db');

// GET /api/public/qr/:token.png (Direct binary QR stream for external viewers & passes)
router.get('/qr/:token.png', async (req, res) => {
  try {
    const { token } = req.params;
    const pool = getPool();

    const [students] = await pool.query(
      'SELECT name, roll_no, prn_no, qr_token FROM students WHERE qr_token = ?',
      [token]
    );

    if (students.length === 0) {
      return res.status(404).send('Pass not found or invalid token.');
    }

    const s = students[0];
    const payload = JSON.stringify({
      app: 'FRESHER_PASS',
      token: s.qr_token,
      prn: s.prn_no || '',
      roll: s.roll_no || '',
      name: s.name || ''
    });

    const buffer = await QRCode.toBuffer(payload, {
      errorCorrectionLevel: 'H',
      type: 'png',
      margin: 2,
      width: 400,
      color: { dark: '#1e1b4b', light: '#ffffff' }
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (err) {
    console.error('Public QR image error:', err);
    res.status(500).send('Error generating QR image.');
  }
});

// GET /api/public/pass/:token
router.get('/pass/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const pool = getPool();

    const [students] = await pool.query(
      `SELECT name, roll_no, prn_no, department, qr_token, qr_code_image, entry_status, verified_at
       FROM students
       WHERE qr_token = ?`,
      [token]
    );

    if (students.length === 0) {
      return res.status(404).json({ error: 'Pass not found or invalid token.' });
    }

    const [settingsRows] = await pool.query('SELECT key_name, key_value FROM system_settings');
    const settings = {};
    settingsRows.forEach(r => { settings[r.key_name] = r.key_value; });

    res.json({
      success: true,
      pass: students[0],
      event: {
        name: settings.event_name || 'Fresher Fiesta 2026',
        venue: settings.event_venue || 'Grand University Auditorium',
        date: settings.event_date || 'November 15, 2026 at 5:00 PM'
      }
    });
  } catch (err) {
    console.error('Public pass error:', err);
    res.status(500).json({ error: 'Failed to retrieve pass.' });
  }
});

module.exports = router;

