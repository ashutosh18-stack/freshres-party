const express = require('express');
const router = express.Router();
const { getPool } = require('../db');
const { requireAdmin } = require('../auth');
const { sendPassEmail, testSmtpConnection, buildPassEmailHtml } = require('../utils/emailHelper');

// GET /api/email/stats
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const pool = getPool();
    const [counts] = await pool.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN mail_status = 'sent' THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN mail_status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN mail_status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM students
    `);

    res.json({ success: true, stats: counts[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch email statistics.' });
  }
});

// GET /api/email/preview/:studentId
// Returns the HTML preview of the email pass
router.get('/preview/:studentId', requireAdmin, async (req, res) => {
  try {
    const pool = getPool();
    const [students] = await pool.query('SELECT * FROM students WHERE id = ?', [req.params.studentId]);
    if (students.length === 0) {
      return res.status(404).send('Student not found.');
    }

    const [rows] = await pool.query('SELECT key_name, key_value FROM system_settings');
    const settings = {};
    rows.forEach(r => { settings[r.key_name] = r.key_value; });

    const student = students[0];
    const origin = `${req.protocol}://${req.get('host')}`;
    let html = buildPassEmailHtml(student, settings, origin);

    // For browser preview, replace cid with the actual base64 image
    if (student.qr_code_image) {
      html = html.replace('src="cid:pass_qr_code_embedded"', `src="${student.qr_code_image}"`);
      html = html.replace('src="cid:student-qr-code"', `src="${student.qr_code_image}"`);
    }

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    res.status(500).send('Error generating email preview.');
  }
});

// POST /api/email/send/:studentId (Send single email)
router.post('/send/:studentId', requireAdmin, async (req, res) => {
  try {
    const pool = getPool();
    const [students] = await pool.query('SELECT * FROM students WHERE id = ?', [req.params.studentId]);
    if (students.length === 0) {
      return res.status(404).json({ error: 'Student record not found.' });
    }

    const student = students[0];
    const origin = `${req.protocol}://${req.get('host')}`;

    try {
      const result = await sendPassEmail(student, origin);
      await pool.query(
        "UPDATE students SET mail_status = 'sent', mail_sent_at = NOW() WHERE id = ?",
        [student.id]
      );

      res.json({
        success: true,
        message: `Pass emailed to ${student.name} (${student.email}) successfully.`,
        simulated: result.simulated || false,
        note: result.note || null
      });
    } catch (sendErr) {
      console.error(`Failed to email student ${student.id}:`, sendErr.message);
      await pool.query(
        "UPDATE students SET mail_status = 'failed' WHERE id = ?",
        [student.id]
      );
      res.status(500).json({
        error: `Email sending failed: ${sendErr.message}`,
        mail_status: 'failed'
      });
    }
  } catch (err) {
    res.status(500).json({ error: 'Internal server error while processing email.' });
  }
});

// POST /api/email/send-batch (Send to next batch of pending or failed students)
router.post('/send-batch', requireAdmin, async (req, res) => {
  try {
    const pool = getPool();
    const limit = Math.min(25, Math.max(1, parseInt(req.body.batch_size || '10', 10)));
    const targetStatus = req.body.status || 'pending'; // 'pending' or 'failed' or 'all'

    let whereSql = "WHERE qr_token IS NOT NULL";
    if (targetStatus === 'pending') {
      whereSql += " AND mail_status = 'pending'";
    } else if (targetStatus === 'failed') {
      whereSql += " AND mail_status = 'failed'";
    }

    const [students] = await pool.query(
      `SELECT * FROM students ${whereSql} ORDER BY id ASC LIMIT ?`,
      [limit]
    );

    if (students.length === 0) {
      return res.json({
        success: true,
        message: 'No pending students left to send emails to.',
        batchCount: 0,
        remainingCount: 0
      });
    }

    const origin = `${req.protocol}://${req.get('host')}`;
    let sentCount = 0;
    let failedCount = 0;
    const logs = [];

    for (const student of students) {
      try {
        const result = await sendPassEmail(student, origin);
        await pool.query(
          "UPDATE students SET mail_status = 'sent', mail_sent_at = NOW() WHERE id = ?",
          [student.id]
        );
        sentCount++;
        logs.push({ id: student.id, name: student.name, email: student.email, status: 'sent', simulated: result.simulated });
        // Add 350ms throttle delay between emails to protect sender reputation on Gmail
        await new Promise(r => setTimeout(r, 350));
      } catch (err) {
        await pool.query(
          "UPDATE students SET mail_status = 'failed' WHERE id = ?",
          [student.id]
        );
        failedCount++;
        logs.push({ id: student.id, name: student.name, email: student.email, status: 'failed', error: err.message });
      }
    }

    // Check remaining pending
    const [remainRows] = await pool.query("SELECT COUNT(*) as remaining FROM students WHERE mail_status = 'pending'");
    const remaining = remainRows[0].remaining;

    res.json({
      success: true,
      message: `Batch complete: ${sentCount} sent, ${failedCount} failed. ${remaining} pending remaining.`,
      batchCount: students.length,
      sentCount,
      failedCount,
      remainingCount: remaining,
      logs
    });
  } catch (err) {
    console.error('Batch send error:', err);
    res.status(500).json({ error: 'Failed to process batch emails.' });
  }
});

// POST /api/email/test-smtp
router.post('/test-smtp', requireAdmin, async (req, res) => {
  try {
    const config = req.body;
    const result = await testSmtpConnection(config);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;

