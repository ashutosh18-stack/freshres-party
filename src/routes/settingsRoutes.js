const express = require('express');
const router = express.Router();
const { getPool } = require('../db');
const { requireAdmin, generateToken } = require('../auth');

// POST /api/settings/verify-pin
router.post('/verify-pin', requireAdmin, (req, res) => {
  const { pin } = req.body;
  const configuredPin = process.env.ADMIN_PIN || '969396';

  if (!pin || String(pin).trim() !== String(configuredPin).trim()) {
    return res.status(401).json({ success: false, error: 'Incorrect security PIN. Access denied.' });
  }

  res.json({ success: true, message: 'Security PIN verified successfully.' });
});

// GET /api/settings
router.get('/', requireAdmin, async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query('SELECT key_name, key_value FROM system_settings');
    const dbSettings = {};
    rows.forEach(r => { dbSettings[r.key_name] = r.key_value; });

    const effectiveSettings = {
      event_name: dbSettings.event_name || process.env.EVENT_NAME || 'Fresher Fiesta 2026',
      event_venue: dbSettings.event_venue || process.env.EVENT_VENUE || 'Grand University Auditorium',
      event_date: dbSettings.event_date || process.env.EVENT_DATE || 'November 15, 2026 at 5:00 PM',
      smtp_host: dbSettings.smtp_host || process.env.SMTP_HOST || 'smtp.gmail.com',
      smtp_port: dbSettings.smtp_port || process.env.SMTP_PORT || '587',
      smtp_secure: dbSettings.smtp_secure !== undefined && dbSettings.smtp_secure !== '' ? dbSettings.smtp_secure : (process.env.SMTP_SECURE || 'false'),
      smtp_user: dbSettings.smtp_user || process.env.SMTP_USER || '',
      smtp_from: dbSettings.smtp_from || process.env.SMTP_FROM || '',
      email_subject: dbSettings.email_subject || '🎟️ Your Fresher Party Entry Pass is Here!'
    };

    const hasPass = (dbSettings.smtp_pass && dbSettings.smtp_pass.trim().length > 0) || (process.env.SMTP_PASS && process.env.SMTP_PASS.trim().length > 0);
    effectiveSettings.smtp_pass = hasPass ? '••••••••' : '';

    res.json({ success: true, settings: effectiveSettings });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve settings.' });
  }
});

// POST /api/settings
router.post('/', requireAdmin, async (req, res) => {
  try {
    const pool = getPool();
    const allowedKeys = [
      'event_name', 'event_venue', 'event_date',
      'smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_pass', 'smtp_from', 'email_subject'
    ];

    for (const key of allowedKeys) {
      if (req.body[key] !== undefined) {
        // Don't overwrite password if sent as mask '••••••••' or empty
        if (key === 'smtp_pass' && (req.body[key] === '••••••••' || req.body[key] === '')) {
          continue;
        }

        await pool.query(
          `INSERT INTO system_settings (key_name, key_value) VALUES (?, ?)
           ON DUPLICATE KEY UPDATE key_value = VALUES(key_value)`,
          [key, String(req.body[key])]
        );
      }
    }

    res.json({ success: true, message: 'Settings saved successfully.' });
  } catch (err) {
    console.error('Settings save error:', err);
    res.status(500).json({ error: 'Failed to update settings.' });
  }
});

module.exports = router;

