const express = require('express');
const router = express.Router();
const multer = require('multer');
const { getPool } = require('../db');
const { requireAdmin, requireVolunteerOrAdmin } = require('../auth');
const { parseStudentExcel, generateSampleExcelBuffer } = require('../utils/excelHelper');
const { generatePassToken, generateQRCodeDataURL } = require('../utils/qrHelper');
const { sendPassEmail } = require('../utils/emailHelper');

// Configure multer for file upload (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB max
});

// GET /api/students/sample-excel
// Download sample excel template
router.get('/sample-excel', (req, res) => {
  try {
    const buffer = generateSampleExcelBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="fresher_students_sample.xlsx"');
    res.send(buffer);
  } catch (err) {
    console.error('Error generating sample excel:', err);
    res.status(500).json({ error: 'Failed to generate sample Excel file.' });
  }
});

// POST /api/students/import (Admin only)
// Upload Excel or CSV file to import students
router.post('/import', requireAdmin, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Please choose an Excel or CSV file to upload.' });
  }

  const isForce = (req.body.force === 'true' || req.body.force === true);

  try {
    const { students, errors, totalRows, sheetsCount } = await parseStudentExcel(req.file.buffer, { force: isForce });

    if (students.length === 0) {
      return res.status(400).json({
        error: 'No valid student rows found in the sheet.',
        details: errors
      });
    }

    const pool = getPool();
    let insertedCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;
    const dbErrors = [];

    for (const s of students) {
      try {
        // 1. Check if student already exists by PRN or by Email (never create duplicates or double passes)
        const [existingRows] = await pool.query(
          'SELECT * FROM students WHERE prn_no = ? OR email = ? LIMIT 1',
          [s.prn_no, s.email]
        );

        if (existingRows.length > 0) {
          const existing = existingRows[0];
          // Check if any details changed
          const hasChanges = (
            (existing.name || '').trim() !== (s.name || '').trim() ||
            (existing.roll_no || '').trim() !== (s.roll_no || '').trim() ||
            (existing.department || '').trim() !== (s.department || '').trim() ||
            (s.phone && (existing.phone || '').trim() !== s.phone.trim()) ||
            (s.division && (existing.division || '').trim() !== s.division.trim()) ||
            (s.class && (existing.class || '').trim() !== s.class.trim()) ||
            (s.transaction_id && (existing.transaction_id || '').trim() !== s.transaction_id.trim()) ||
            (s.email && (existing.email || '').toLowerCase() !== s.email.toLowerCase()) ||
            (s.prn_no && (existing.prn_no || '').toLowerCase() !== s.prn_no.toLowerCase())
          );

          if (hasChanges) {
            await pool.query(
              `UPDATE students 
               SET name = ?, roll_no = ?, department = ?, 
                   email = ?, prn_no = ?,
                   phone = COALESCE(?, phone), division = COALESCE(?, division), 
                   class = COALESCE(?, class), transaction_id = COALESCE(?, transaction_id)
               WHERE id = ?`,
              [s.name, s.roll_no, s.department, s.email, s.prn_no, s.phone || null, s.division || null, s.class || null, s.transaction_id || null, existing.id]
            );
            updatedCount++;
          } else {
            // Already in database with identical details -> no changes, no duplicate created
            unchangedCount++;
          }
        } else {
          // Genuinely new student record -> insert and issue QR pass
          await pool.query(
            `INSERT INTO students (name, roll_no, prn_no, department, email, phone, division, class, transaction_id, qr_token, qr_code_image, mail_status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [s.name, s.roll_no, s.prn_no, s.department, s.email, s.phone || null, s.division || null, s.class || null, s.transaction_id || null, s.qr_token, s.qr_code_image]
          );
          insertedCount++;
        }
      } catch (err) {
        let errMsg = err.message;
        if (err.code === 'ER_DUP_ENTRY') {
          if (err.message && (err.message.includes('uq_email') || err.message.includes('email'))) {
            errMsg = `Email "${s.email}" is already used by another student.`;
          } else if (err.message && err.message.includes('prn_no')) {
            errMsg = `PRN "${s.prn_no}" is already registered.`;
          }
        }
        dbErrors.push({
          name: s.name,
          phone: s.phone || 'N/A',
          email: s.email || 'N/A',
          prn: s.prn_no,
          roll_no: s.roll_no,
          error: errMsg
        });
      }
    }

    // Persist any rejected records into database table for the Errors / Problems center
    const fileName = req.file.originalname || 'uploaded_sheet.xlsx';
    for (const errItem of errors) {
      await pool.query(
        `INSERT INTO rejected_records (file_name, row_number, student_name, phone, roll_no, prn_no, email, error_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [fileName, errItem.row || null, errItem.name || 'N/A', errItem.phone || 'N/A', errItem.roll_no || errItem.roll || 'N/A', errItem.prn_no || 'N/A', errItem.email || 'N/A', errItem.error]
      ).catch(() => {});
    }

    for (const dbErr of dbErrors) {
      await pool.query(
        `INSERT INTO rejected_records (file_name, row_number, student_name, phone, roll_no, prn_no, email, error_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [fileName, null, dbErr.name || 'N/A', dbErr.phone || 'N/A', dbErr.roll_no || 'N/A', dbErr.prn || dbErr.prn_no || 'N/A', dbErr.email || 'N/A', dbErr.error]
      ).catch(() => {});
    }

    res.json({
      success: true,
      message: isForce 
        ? `⚡ Force Import: ${insertedCount} newly registered, ${updatedCount} updated, ${unchangedCount} unchanged (no duplicates).`
        : `Import processed: ${insertedCount} newly added, ${updatedCount} updated, ${unchangedCount} unchanged (no duplicates).`,
      stats: {
        totalRowsInFile: totalRows,
        sheetsCount: sheetsCount || 1,
        importedCount: insertedCount,
        updatedCount: updatedCount,
        unchangedCount: unchangedCount,
        skippedErrors: errors.length + dbErrors.length,
        isForceMode: isForce
      },
      validationErrors: errors,
      databaseErrors: dbErrors
    });
  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ error: err.message || 'Failed to process Excel file.' });
  }
});

// GET /api/students/rejected-records (List all upload & system rejected records)
router.get('/rejected-records', requireAdmin, async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT * FROM rejected_records ORDER BY id DESC LIMIT 500`
    );
    res.json({
      success: true,
      count: rows.length,
      records: rows
    });
  } catch (err) {
    console.error('Fetch rejected records error:', err);
    res.status(500).json({ error: 'Failed to fetch rejected records.' });
  }
});

// DELETE /api/students/rejected-records (Clear rejected records)
router.delete('/rejected-records', requireAdmin, async (req, res) => {
  try {
    const pool = getPool();
    await pool.query('TRUNCATE TABLE rejected_records');
    res.json({ success: true, message: 'Rejected records log cleared successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear rejected records.' });
  }
});

// GET /api/students (List students with search, filters, pagination)
router.get('/', requireVolunteerOrAdmin, async (req, res) => {
  try {
    const pool = getPool();
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '15', 10)));
    const offset = (page - 1) * limit;

    const search = req.query.search ? req.query.search.trim() : '';
    const department = req.query.department ? req.query.department.trim() : '';
    const entryStatus = req.query.entry_status ? req.query.entry_status.trim() : '';
    const mailStatus = req.query.mail_status ? req.query.mail_status.trim() : '';

    let whereClauses = [];
    let params = [];

    if (search) {
      whereClauses.push('(s.name LIKE ? OR s.roll_no LIKE ? OR s.prn_no LIKE ? OR s.email LIKE ? OR s.division LIKE ? OR s.class LIKE ? OR s.transaction_id LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term, term, term, term, term, term);
    }

    if (department && department !== 'all') {
      whereClauses.push('s.department = ?');
      params.push(department);
    }

    if (entryStatus && entryStatus !== 'all') {
      whereClauses.push('s.entry_status = ?');
      params.push(entryStatus);
    }

    if (mailStatus && mailStatus !== 'all') {
      whereClauses.push('s.mail_status = ?');
      params.push(mailStatus);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Total count query
    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM students s ${whereSql}`,
      params
    );
    const total = countResult[0].total;

    // Data query with verified_by name
    const [students] = await pool.query(
      `SELECT s.id, s.name, s.roll_no, s.prn_no, s.department, s.email, s.phone,
              s.division, s.class, s.transaction_id,
              s.qr_token, s.qr_code_image, s.mail_status, s.mail_sent_at,
              s.entry_status, s.verified_at, s.rejection_reason, s.created_at,
              u.name as verified_by_name
       FROM students s
       LEFT JOIN users u ON s.verified_by_id = u.id
       ${whereSql}
       ORDER BY s.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    // Get unique departments for filter dropdown
    const [depts] = await pool.query('SELECT DISTINCT department FROM students WHERE department IS NOT NULL ORDER BY department ASC');

    res.json({
      success: true,
      students,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1
      },
      departments: depts.map(d => d.department)
    });
  } catch (err) {
    console.error('Students fetch error:', err);
    res.status(500).json({ error: 'Failed to retrieve student records.' });
  }
});

// GET /api/students/:id (Get single student)
router.get('/:id', requireVolunteerOrAdmin, async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT s.*, u.name as verified_by_name 
       FROM students s
       LEFT JOIN users u ON s.verified_by_id = u.id
       WHERE s.id = ?`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Student record not found.' });
    }

    res.json({ success: true, student: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch student details.' });
  }
});

// POST /api/students (Add single student manually)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { name, roll_no, prn_no, department, email, phone, division, class: sClass, transaction_id } = req.body;
    if (!name || (!prn_no && !roll_no) || !email) {
      return res.status(400).json({ error: 'Name, PRN Number (Unique), and Email (Unique) are mandatory fields.' });
    }

    const pNo = (prn_no || roll_no).trim();
    const rNo = (roll_no ? roll_no.trim() : '-');
    const dept = (department || sClass || (division ? ('Division ' + division) : '') || 'General').trim();

    const token = generatePassToken('FP26');
    const qrImage = await generateQRCodeDataURL(token, { name: name.trim(), roll_no: rNo, prn_no: pNo, department: dept });

    const pool = getPool();
    const [result] = await pool.query(
      `INSERT INTO students (name, roll_no, prn_no, department, email, phone, division, class, transaction_id, qr_token, qr_code_image, mail_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [name.trim(), rNo, pNo, dept, email.trim(), phone ? phone.trim() : null, division ? division.trim() : null, sClass ? sClass.trim() : null, transaction_id ? transaction_id.trim() : null, token, qrImage]
    );

    res.json({
      success: true,
      message: 'Student data saved. Email is pending — click "Forward Mail" to send pass to student.',
      studentId: result.insertId,
      qr_token: token,
      mail_status: 'pending'
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      if (err.message && (err.message.includes('uq_email') || err.message.includes('email'))) {
        return res.status(400).json({ error: 'A student with this Email Address already exists.' });
      }
      if (err.message && err.message.includes('prn_no')) {
        return res.status(400).json({ error: 'A student with this PRN Number already exists.' });
      }
      return res.status(400).json({ error: 'A student with this PRN Number or Email already exists.' });
    }
    console.error('Add student error:', err);
    res.status(500).json({ error: 'Failed to add student record.' });
  }
});

// PUT /api/students/:id (Admin authority to update email, details, and refresh QR)
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { name, roll_no, prn_no, department, email, phone, division, class: sClass, transaction_id, issue_new_token, resend_email } = req.body;
    
    if (!name || (!roll_no && !prn_no) || !email) {
      return res.status(400).json({ error: 'Name, Roll No, and Email are required fields.' });
    }

    const pool = getPool();
    const [existingRows] = await pool.query('SELECT * FROM students WHERE id = ?', [req.params.id]);
    if (existingRows.length === 0) {
      return res.status(404).json({ error: 'Student record not found.' });
    }

    const existing = existingRows[0];
    const emailChanged = (existing.email.toLowerCase().trim() !== email.toLowerCase().trim());
    
    const rNo = (roll_no || existing.roll_no).trim();
    const pNo = (prn_no || existing.prn_no || rNo).trim();
    const dept = (department || sClass || existing.department || 'General').trim();

    // Determine token: keep existing or issue brand new token if requested
    let token = existing.qr_token;
    let entryStatus = existing.entry_status;
    let verifiedAt = existing.verified_at;
    let verifiedById = existing.verified_by_id;

    if (!token || issue_new_token) {
      token = generatePassToken('FP26');
      entryStatus = 'pending';
      verifiedAt = null;
      verifiedById = null;
    }

    // Refresh QR code image with the updated details and token
    const updatedStudentData = {
      name: name.trim(),
      roll_no: rNo,
      prn_no: pNo,
      department: dept,
      email: email.trim(),
      phone: phone !== undefined ? (phone ? phone.trim() : null) : existing.phone,
      division: division !== undefined ? (division ? division.trim() : null) : existing.division,
      class: sClass !== undefined ? (sClass ? sClass.trim() : null) : existing.class,
      transaction_id: transaction_id !== undefined ? (transaction_id ? transaction_id.trim() : null) : existing.transaction_id,
      qr_token: token
    };

    const qrImage = await generateQRCodeDataURL(token, updatedStudentData);

    let mailStatus = existing.mail_status;
    let mailSentAt = existing.mail_sent_at;
    let emailSentNow = false;

    // If email address changed and not immediately resent, set to pending so new pass can be emailed
    if (emailChanged && !resend_email) {
      mailStatus = 'pending';
      mailSentAt = null;
    }

    // If resend_email was requested, send pass email immediately to updated address
    if (resend_email) {
      try {
        const origin = `${req.protocol}://${req.get('host')}`;
        await sendPassEmail({ ...updatedStudentData, id: existing.id, qr_code_image: qrImage }, origin);
        mailStatus = 'sent';
        mailSentAt = new Date();
        emailSentNow = true;
      } catch (mailErr) {
        console.warn('Failed to dispatch updated email immediately:', mailErr.message);
        mailStatus = 'failed';
      }
    }

    // Save changes to MySQL
    await pool.query(
      `UPDATE students 
       SET name = ?, roll_no = ?, prn_no = ?, department = ?, email = ?, phone = ?,
           division = ?, class = ?, transaction_id = ?,
           qr_token = ?, qr_code_image = ?, mail_status = ?, mail_sent_at = ?,
           entry_status = ?, verified_at = ?, verified_by_id = ?
       WHERE id = ?`,
      [
        updatedStudentData.name,
        updatedStudentData.roll_no,
        updatedStudentData.prn_no,
        updatedStudentData.department,
        updatedStudentData.email,
        updatedStudentData.phone,
        updatedStudentData.division,
        updatedStudentData.class,
        updatedStudentData.transaction_id,
        token,
        qrImage,
        mailStatus,
        mailSentAt,
        entryStatus,
        verifiedAt,
        verifiedById,
        req.params.id
      ]
    );

    let successMsg = `Student details updated successfully.`;
    if (emailChanged) {
      successMsg += ` Email updated to ${updatedStudentData.email}.`;
    }
    if (emailSentNow) {
      successMsg += ` Pass forwarded to new email address!`;
    } else if (emailChanged) {
      successMsg += ` Mail status set to Pending — click Forward Mail to send pass.`;
    }

    res.json({
      success: true,
      message: successMsg,
      student: {
        id: existing.id,
        ...updatedStudentData,
        qr_code_image: qrImage,
        mail_status: mailStatus,
        mail_sent_at: mailSentAt,
        entry_status: entryStatus
      }
    });

  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      if (err.message && (err.message.includes('uq_email') || err.message.includes('email'))) {
        return res.status(400).json({ error: 'Another student already has this Email Address.' });
      }
      if (err.message && err.message.includes('prn_no')) {
        return res.status(400).json({ error: 'Another student already has this PRN Number.' });
      }
      return res.status(400).json({ error: 'Another student already has this PRN Number or Email Address.' });
    }
    console.error('Update student error:', err);
    res.status(500).json({ error: 'Failed to update student record: ' + err.message });
  }
});

// DELETE /api/students/:id (Delete student)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const pool = getPool();
    await pool.query('DELETE FROM students WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Student record deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete student record.' });
  }
});

// POST /api/students/generate-all-qrs (Regenerate or generate missing QRs)
router.post('/generate-all-qrs', requireAdmin, async (req, res) => {
  try {
    const pool = getPool();
    const [students] = await pool.query('SELECT id, name, roll_no, prn_no, department, qr_token, qr_code_image FROM students');
    
    let generatedCount = 0;
    for (const s of students) {
      let token = s.qr_token;
      if (!token) {
        token = generatePassToken('FP26');
      }
      if (!s.qr_code_image || !s.qr_token) {
        const qrImage = await generateQRCodeDataURL(token, s);
        await pool.query('UPDATE students SET qr_token = ?, qr_code_image = ? WHERE id = ?', [token, qrImage, s.id]);
        generatedCount++;
      }
    }

    res.json({
      success: true,
      message: `Pass verification completed. Generated/Refreshed ${generatedCount} QR passes.`
    });
  } catch (err) {
    console.error('QR generation error:', err);
    res.status(500).json({ error: 'Failed to generate QR passes.' });
  }
});

module.exports = router;

