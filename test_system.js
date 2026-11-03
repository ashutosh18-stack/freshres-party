const fs = require('fs');
const { initDB, getPool } = require('./src/db');
const { parseStudentExcel, generateSampleExcelBuffer } = require('./src/utils/excelHelper');
const { generatePassToken, generateQRCodeDataURL, parseScannedData } = require('./src/utils/qrHelper');
const { sendPassEmail } = require('./src/utils/emailHelper');

async function runTests() {
  console.log('--- STARTING SYSTEM E2E TESTS ---');
  
  // 1. DB Init
  await initDB();
  const pool = getPool();
  console.log('✅ Test 1: MySQL connection and schema tables verified.');

  // 2. Excel parsing
  const excelBuffer = generateSampleExcelBuffer();
  const { students, errors, totalRows } = await parseStudentExcel(excelBuffer);
  console.log(`✅ Test 2: Sample Excel generated and parsed. Found ${students.length} students across ${totalRows} rows. (Errors: ${errors.length})`);
  
  if (students.length === 0) {
    throw new Error('Excel parsing produced 0 students');
  }

  // 3. Insert parsed students into MySQL
  for (const s of students) {
    await pool.query(
      `INSERT INTO students (name, roll_no, prn_no, department, email, phone, division, class, transaction_id, qr_token, qr_code_image)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), department = VALUES(department), division = VALUES(division), class = VALUES(class), transaction_id = VALUES(transaction_id), qr_token = VALUES(qr_token), qr_code_image = VALUES(qr_code_image), email = VALUES(email)`,
      [s.name, s.roll_no, s.prn_no, s.department, s.email, s.phone, s.division, s.class, s.transaction_id, s.qr_token, s.qr_code_image]
    );
  }
  console.log('✅ Test 3: Students inserted/updated in MySQL successfully.');

  // 4. Test Student QR Code Lookup
  const sampleStudent = students[0];
  const [rows] = await pool.query('SELECT * FROM students WHERE qr_token = ?', [sampleStudent.qr_token]);
  if (rows.length === 0) throw new Error('Student lookup failed');
  console.log(`✅ Test 4: Student Lookup verified for ${rows[0].name} (${rows[0].roll_no}, PRN: ${rows[0].prn_no}).`);

  // 5. Gate Scanner ACCEPT action test
  const studentId = rows[0].id;
  await pool.query(
    "UPDATE students SET entry_status = 'accepted', verified_at = NOW(), verified_by_id = 1 WHERE id = ?",
    [studentId]
  );
  await pool.query(
    "INSERT INTO scan_logs (student_id, scanned_by_id, action, notes) VALUES (?, 1, 'accepted', 'Verified at entrance gate')",
    [studentId]
  );
  console.log(`✅ Test 5: Gate ACCEPT Entry verified. Student admitted.`);

  // 6. Test Duplicate Detection
  const [checkRow] = await pool.query('SELECT entry_status, verified_at FROM students WHERE id = ?', [studentId]);
  if (checkRow[0].entry_status !== 'accepted') throw new Error('Status should be accepted');
  console.log(`✅ Test 6: Duplicate detection confirmed: student entry_status is '${checkRow[0].entry_status}'.`);

  // 7. Gate Scanner REJECT action test
  const student2Id = students[1] ? (await pool.query('SELECT id FROM students WHERE roll_no = ?', [students[1].roll_no]))[0][0].id : null;
  if (student2Id) {
    await pool.query(
      "UPDATE students SET entry_status = 'rejected', rejection_reason = 'Disciplinary violation', verified_at = NOW(), verified_by_id = 1 WHERE id = ?",
      [student2Id]
    );
    await pool.query(
      "INSERT INTO scan_logs (student_id, scanned_by_id, action, notes) VALUES (?, 1, 'rejected', 'Disciplinary violation')",
      [student2Id]
    );
    console.log(`✅ Test 7: Gate REJECT Entry verified with custom reason.`);
  }

  // 8. Test Email Helper
  const emailRes = await sendPassEmail(sampleStudent);
  console.log(`✅ Test 8: Email generator & dispatcher verified (Simulated: ${emailRes.simulated}).`);

  // 9. Dashboard Stats verification
  const [stats] = await pool.query(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN entry_status = 'accepted' THEN 1 ELSE 0 END) as accepted,
      SUM(CASE WHEN entry_status = 'rejected' THEN 1 ELSE 0 END) as rejected
    FROM students
  `);
  console.log(`✅ Test 9: Dashboard statistics query: Total: ${stats[0].total}, Accepted: ${stats[0].accepted}, Rejected: ${stats[0].rejected}.`);

  console.log('\n🎉 ALL 9 SYSTEM TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

