const express = require('express');
const router = express.Router();
const { getPool } = require('../db');
const { requireVolunteerOrAdmin } = require('../auth');
const { parseScannedData } = require('../utils/qrHelper');

// POST /api/scan/lookup
// Lookup student by scanned QR code data or manual roll/PRN/token
router.post('/lookup', requireVolunteerOrAdmin, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'No QR code or student token provided.' });
    }

    const tokenOrIdentifier = parseScannedData(code);
    const pool = getPool();

    // Search by qr_token first, then fallback to roll_no or prn_no for manual typing
    const [rows] = await pool.query(
      `SELECT s.id, s.name, s.roll_no, s.prn_no, s.department, s.email, s.phone,
              s.qr_token, s.entry_status, s.verified_at, s.rejection_reason,
              u.name as verified_by_name
       FROM students s
       LEFT JOIN users u ON s.verified_by_id = u.id
       WHERE s.qr_token = ? OR s.roll_no = ? OR s.prn_no = ?
       LIMIT 1`,
      [tokenOrIdentifier, tokenOrIdentifier, tokenOrIdentifier]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        found: false,
        error: 'No student found matching this QR code. Pass may be invalid or not registered in the system.'
      });
    }

    const student = rows[0];
    const isDuplicate = student.entry_status === 'accepted';
    const isRejected = student.entry_status === 'rejected';

    res.json({
      found: true,
      student,
      isDuplicate,
      isRejected,
      status: student.entry_status
    });
  } catch (err) {
    console.error('Scan lookup error:', err);
    res.status(500).json({ error: 'Server error while checking student pass.' });
  }
});

// POST /api/scan/action
// Perform ACCEPT or REJECT on student pass
router.post('/action', requireVolunteerOrAdmin, async (req, res) => {
  try {
    const { studentId, action, reason, forceAccept } = req.body;
    if (!studentId || !action) {
      return res.status(400).json({ error: 'Missing student ID or action.' });
    }

    if (!['accept', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Must be accept or reject.' });
    }

    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT s.*, u.name as verified_by_name 
       FROM students s 
       LEFT JOIN users u ON s.verified_by_id = u.id 
       WHERE s.id = ?`,
      [studentId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Student record not found.' });
    }

    const student = rows[0];
    const volunteerId = req.user.id;
    const volunteerName = req.user.name;

    // Duplicate check on accept
    if (action === 'accept' && student.entry_status === 'accepted' && !forceAccept) {
      // Log duplicate scan attempt
      await pool.query(
        `INSERT INTO scan_logs (student_id, scanned_by_id, action, notes)
         VALUES (?, ?, 'duplicate_attempt', ?)`,
        [student.id, volunteerId, `Re-scan attempt. Original entry: ${student.verified_at}`]
      );

      return res.status(409).json({
        conflict: true,
        error: `Pass already used! Student ${student.name} was admitted on ${new Date(student.verified_at).toLocaleTimeString()} by ${student.verified_by_name || 'Volunteer'}.`,
        student
      });
    }

    if (action === 'accept') {
      await pool.query(
        `UPDATE students 
         SET entry_status = 'accepted', verified_at = NOW(), verified_by_id = ?, rejection_reason = NULL
         WHERE id = ?`,
        [volunteerId, studentId]
      );

      await pool.query(
        `INSERT INTO scan_logs (student_id, scanned_by_id, action, notes)
         VALUES (?, ?, 'accepted', ?)`,
        [studentId, volunteerId, 'Verified and Admitted through Gate']
      );

      return res.json({
        success: true,
        action: 'accepted',
        message: `✅ ENTRY ACCEPTED! Welcome ${student.name} to Fresher Fiesta 2026.`,
        student: {
          id: student.id,
          name: student.name,
          roll_no: student.roll_no,
          department: student.department,
          entry_status: 'accepted',
          verified_at: new Date()
        }
      });
    } else {
      // REJECT action
      const rejectionReason = reason ? reason.trim() : 'Rejected at entrance gate';
      await pool.query(
        `UPDATE students 
         SET entry_status = 'rejected', verified_at = NOW(), verified_by_id = ?, rejection_reason = ?
         WHERE id = ?`,
        [volunteerId, rejectionReason, studentId]
      );

      await pool.query(
        `INSERT INTO scan_logs (student_id, scanned_by_id, action, notes)
         VALUES (?, ?, 'rejected', ?)`,
        [studentId, volunteerId, rejectionReason]
      );

      return res.json({
        success: true,
        action: 'rejected',
        message: `❌ ENTRY REJECTED for ${student.name}. Reason: ${rejectionReason}`,
        student: {
          id: student.id,
          name: student.name,
          roll_no: student.roll_no,
          department: student.department,
          entry_status: 'rejected',
          rejection_reason: rejectionReason
        }
      });
    }
  } catch (err) {
    console.error('Scan action error:', err);
    res.status(500).json({ error: 'Failed to record gate verification.' });
  }
});

// GET /api/scan/recent
// Get recent scans for live feed
router.get('/recent', requireVolunteerOrAdmin, async (req, res) => {
  try {
    const pool = getPool();
    const [logs] = await pool.query(
      `SELECT l.id, l.action, l.notes, l.scanned_at,
              s.id as student_id, s.name as student_name, s.roll_no, s.department,
              u.name as volunteer_name
       FROM scan_logs l
       JOIN students s ON l.student_id = s.id
       JOIN users u ON l.scanned_by_id = u.id
       ORDER BY l.id DESC
       LIMIT 25`
    );

    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve scan activity logs.' });
  }
});

module.exports = router;

