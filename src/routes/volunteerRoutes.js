const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getPool } = require('../db');
const { requireAdmin } = require('../auth');

// GET /api/volunteers
router.get('/', requireAdmin, async (req, res) => {
  try {
    const pool = getPool();
    const [volunteers] = await pool.query(`
      SELECT u.id, u.name, u.email, u.role, u.created_at,
             COUNT(l.id) as total_scans,
             SUM(CASE WHEN l.action = 'accepted' THEN 1 ELSE 0 END) as accepted_scans,
             SUM(CASE WHEN l.action = 'rejected' THEN 1 ELSE 0 END) as rejected_scans
      FROM users u
      LEFT JOIN scan_logs l ON u.id = l.scanned_by_id
      WHERE u.role = 'volunteer'
      GROUP BY u.id
      ORDER BY u.id ASC
    `);

    res.json({ success: true, volunteers });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch volunteers list.' });
  }
});

// POST /api/volunteers (Create new volunteer)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const pool = getPool();
    const hash = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'volunteer')`,
      [name.trim(), email.trim().toLowerCase(), hash]
    );

    res.json({
      success: true,
      message: `Volunteer account created for ${name}.`,
      volunteerId: result.insertId
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }
    res.status(500).json({ error: 'Failed to create volunteer account.' });
  }
});

// DELETE /api/volunteers/:id
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const pool = getPool();
    await pool.query('DELETE FROM users WHERE id = ? AND role = "volunteer"', [req.params.id]);
    res.json({ success: true, message: 'Volunteer removed successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete volunteer.' });
  }
});

module.exports = router;

