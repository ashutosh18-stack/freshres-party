const express = require('express');
const router = express.Router();
const { getPool } = require('../db');

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

