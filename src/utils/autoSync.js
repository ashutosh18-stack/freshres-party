const fs = require('fs');
const path = require('path');

const BACKUP_DIR = path.join(__dirname, '..', '..', 'database_backup');
const BACKUP_SQL = path.join(BACKUP_DIR, 'auto_sync.sql');
const BACKUP_INFO = path.join(BACKUP_DIR, 'backup_info.json');

// Ensure backup folder exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

/**
 * Cleanly format SQL values
 */
function sqlVal(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return val;
  if (val instanceof Date) return `'${val.toISOString().slice(0, 19).replace('T', ' ')}'`;
  return `'${String(val).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/**
 * Dump MySQL tables to auto_sync.sql every 30 seconds
 */
async function performBackup(pool) {
  try {
    const [settings] = await pool.query('SELECT * FROM system_settings');
    const [users] = await pool.query('SELECT * FROM users');
    const [students] = await pool.query('SELECT * FROM students');
    const [scans] = await pool.query('SELECT * FROM scan_logs');

    let sql = `-- Fresher Party Auto-Sync Backup\n`;
    sql += `-- Generated: ${new Date().toISOString()}\n`;
    sql += `SET FOREIGN_KEY_CHECKS = 0;\n\n`;

    // 1. Settings
    if (settings.length > 0) {
      sql += `-- System Settings (${settings.length})\n`;
      for (const row of settings) {
        sql += `REPLACE INTO system_settings (key_name, key_value, updated_at) VALUES (${sqlVal(row.key_name)}, ${sqlVal(row.key_value)}, ${sqlVal(row.updated_at)});\n`;
      }
      sql += `\n`;
    }

    // 2. Users
    if (users.length > 0) {
      sql += `-- Users (${users.length})\n`;
      for (const u of users) {
        sql += `REPLACE INTO users (id, name, email, password_hash, role, created_at) VALUES (${sqlVal(u.id)}, ${sqlVal(u.name)}, ${sqlVal(u.email)}, ${sqlVal(u.password_hash)}, ${sqlVal(u.role)}, ${sqlVal(u.created_at)});\n`;
      }
      sql += `\n`;
    }

    // 3. Students
    if (students.length > 0) {
      sql += `-- Students (${students.length})\n`;
      for (const s of students) {
        sql += `REPLACE INTO students (id, name, roll_no, prn_no, department, email, phone, division, class, transaction_id, qr_token, qr_code_image, mail_status, mail_sent_at, entry_status, verified_at, verified_by_id, rejection_reason, created_at, updated_at) VALUES (${sqlVal(s.id)}, ${sqlVal(s.name)}, ${sqlVal(s.roll_no)}, ${sqlVal(s.prn_no)}, ${sqlVal(s.department)}, ${sqlVal(s.email)}, ${sqlVal(s.phone)}, ${sqlVal(s.division)}, ${sqlVal(s.class)}, ${sqlVal(s.transaction_id)}, ${sqlVal(s.qr_token)}, ${sqlVal(s.qr_code_image)}, ${sqlVal(s.mail_status)}, ${sqlVal(s.mail_sent_at)}, ${sqlVal(s.entry_status)}, ${sqlVal(s.verified_at)}, ${sqlVal(s.verified_by_id)}, ${sqlVal(s.rejection_reason)}, ${sqlVal(s.created_at)}, ${sqlVal(s.updated_at)});\n`;
      }
      sql += `\n`;
    }

    // 4. Scan Logs
    if (scans.length > 0) {
      sql += `-- Scan Logs (${scans.length})\n`;
      for (const sc of scans) {
        sql += `REPLACE INTO scan_logs (id, student_id, scanned_by_id, action, notes, scanned_at) VALUES (${sqlVal(sc.id)}, ${sqlVal(sc.student_id)}, ${sqlVal(sc.scanned_by_id)}, ${sqlVal(sc.action)}, ${sqlVal(sc.notes)}, ${sqlVal(sc.scanned_at)});\n`;
      }
      sql += `\n`;
    }

    sql += `SET FOREIGN_KEY_CHECKS = 1;\n`;

    // Write to disk
    fs.writeFileSync(BACKUP_SQL, sql, 'utf8');

    // Write summary info
    const info = {
      lastUpdated: new Date().toLocaleString(),
      timestamp: Date.now(),
      totalStudents: students.length,
      totalScans: scans.length,
      totalUsers: users.length
    };
    fs.writeFileSync(BACKUP_INFO, JSON.stringify(info, null, 2), 'utf8');

  } catch (err) {
    console.error('[AutoSync Error]', err.message);
  }
}

/**
 * Restore data from auto_sync.sql if current database has 0 students
 */
async function autoRestoreIfEmpty(pool) {
  try {
    if (!fs.existsSync(BACKUP_SQL)) return;

    const [rows] = await pool.query('SELECT COUNT(*) as count FROM students');
    if (rows[0].count === 0) {
      const sql = fs.readFileSync(BACKUP_SQL, 'utf8');
      if (sql && sql.includes('REPLACE INTO students')) {
        console.log('[AutoSync] Empty database detected. Restoring data from database_backup/auto_sync.sql...');
        await pool.query(sql);
        const [updatedRows] = await pool.query('SELECT COUNT(*) as count FROM students');
        console.log(`[AutoSync] Successfully restored ${updatedRows[0].count} students and event data!`);
      }
    }
  } catch (err) {
    console.warn('[AutoSync Restore Note]', err.message);
  }
}

/**
 * Start 30-second interval
 */
function startAutoSync(pool) {
  // First backup immediately after start
  setTimeout(() => performBackup(pool), 5000);

  // Every 30 seconds
  setInterval(() => {
    performBackup(pool);
  }, 30 * 1000);

  console.log('🔄 Auto-Sync Active: Backing up MySQL data to database_backup/ every 30 seconds.');
}

module.exports = {
  startAutoSync,
  autoRestoreIfEmpty,
  performBackup
};
