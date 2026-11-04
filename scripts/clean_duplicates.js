const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
  try {
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'fresher_party_db'
    });

    console.log('[CLEANUP] Connected to MySQL.');

    // 1. Check duplicate rows with -F or +f
    const [dups] = await conn.query(
      "SELECT id, name, roll_no, prn_no, email FROM students WHERE prn_no LIKE '%-F%' OR email LIKE '%+f%'"
    );
    console.log(`[CLEANUP] Found ${dups.length} suffix duplicates to remove.`);

    if (dups.length > 0) {
      const [delRes] = await conn.query(
        "DELETE FROM students WHERE prn_no LIKE '%-F%' OR email LIKE '%+f%'"
      );
      console.log(`[CLEANUP] Deleted ${delRes.affectedRows} duplicate records.`);
    }

    // 2. Clear rejected_records table so errors center reflects accurate current state
    await conn.query("TRUNCATE TABLE rejected_records");
    console.log('[CLEANUP] Truncated rejected_records table.');

    // 3. Count remaining genuine students
    const [rows] = await conn.query(
      "SELECT COUNT(*) as total, COUNT(DISTINCT prn_no) as distinct_prns, COUNT(DISTINCT email) as distinct_emails FROM students"
    );
    console.log('[CLEANUP] Genuine Students Remaining:', rows[0]);

    await conn.end();
    console.log('[CLEANUP] Done successfully.');
  } catch (err) {
    console.error('[CLEANUP ERROR]:', err);
    process.exit(1);
  }
})();
