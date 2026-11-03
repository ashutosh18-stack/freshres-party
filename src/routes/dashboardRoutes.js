const express = require('express');
const router = express.Router();
const { getPool } = require('../db');
const { requireVolunteerOrAdmin } = require('../auth');

// GET /api/dashboard/stats
router.get('/stats', requireVolunteerOrAdmin, async (req, res) => {
  try {
    const pool = getPool();

    // Student counts
    const [statsRows] = await pool.query(`
      SELECT
        COUNT(*) as total_students,
        SUM(CASE WHEN qr_token IS NOT NULL THEN 1 ELSE 0 END) as passes_generated,
        SUM(CASE WHEN mail_status = 'sent' THEN 1 ELSE 0 END) as emails_sent,
        SUM(CASE WHEN mail_status = 'pending' THEN 1 ELSE 0 END) as emails_pending,
        SUM(CASE WHEN mail_status = 'failed' THEN 1 ELSE 0 END) as emails_failed,
        SUM(CASE WHEN entry_status = 'accepted' THEN 1 ELSE 0 END) as total_accepted,
        SUM(CASE WHEN entry_status = 'rejected' THEN 1 ELSE 0 END) as total_rejected,
        SUM(CASE WHEN entry_status = 'pending' THEN 1 ELSE 0 END) as total_pending_entry
      FROM students
    `);

    // Department breakdown
    const [deptRows] = await pool.query(`
      SELECT
        department,
        COUNT(*) as total,
        SUM(CASE WHEN entry_status = 'accepted' THEN 1 ELSE 0 END) as accepted,
        SUM(CASE WHEN entry_status = 'rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN entry_status = 'pending' THEN 1 ELSE 0 END) as pending
      FROM students
      GROUP BY department
      ORDER BY total DESC
    `);

    // Active volunteers count
    const [volunteerRows] = await pool.query(`
      SELECT COUNT(*) as volunteer_count FROM users WHERE role = 'volunteer'
    `);

    // Recent 5 scans
    const [recentScans] = await pool.query(`
      SELECT l.id, l.action, l.notes, l.scanned_at,
             s.name as student_name, s.roll_no, s.department,
             u.name as volunteer_name
      FROM scan_logs l
      JOIN students s ON l.student_id = s.id
      JOIN users u ON l.scanned_by_id = u.id
      ORDER BY l.id DESC
      LIMIT 6
    `);

    const stats = statsRows[0];
    const total = stats.total_students || 0;
    const accepted = stats.total_accepted || 0;
    const turnoutRate = total > 0 ? Math.round((accepted / total) * 100) : 0;

    res.json({
      success: true,
      stats: {
        totalStudents: total,
        passesGenerated: stats.passes_generated || 0,
        emailsSent: stats.emails_sent || 0,
        emailsPending: stats.emails_pending || 0,
        emailsFailed: stats.emails_failed || 0,
        totalAccepted: accepted,
        totalRejected: stats.total_rejected || 0,
        totalPendingEntry: stats.total_pending_entry || 0,
        turnoutRate,
        volunteerCount: volunteerRows[0].volunteer_count
      },
      departmentBreakdown: deptRows,
      recentScans
    });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ error: 'Failed to retrieve dashboard metrics.' });
  }
});

module.exports = router;

