const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const isRemoteDb = (process.env.DB_HOST && process.env.DB_HOST !== 'localhost' && process.env.DB_HOST !== '127.0.0.1');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  multipleStatements: true,
  // Cloud MySQL providers (TiDB Cloud, Aiven, etc.) require SSL
  ...(isRemoteDb || process.env.DB_SSL === 'true' ? { ssl: { rejectUnauthorized: false } } : {})
};

const DB_NAME = process.env.DB_NAME || 'fresher_party_db';

let pool;

async function initDB() {
  try {
    // 1. On local XAMPP MySQL, ensure database exists
    if (!isRemoteDb) {
      try {
        const connection = await mysql.createConnection(dbConfig);
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
        await connection.end();
        console.log(`[DB] Connected to MySQL server at ${dbConfig.host}:${dbConfig.port}`);
      } catch (err) {
        console.warn(`[DB] Note: Could not auto-create database (might already exist):`, err.message);
      }
    }

    // 2. Create pool connected to the database
    pool = mysql.createPool({
      ...dbConfig,
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: 15,
      queueLimit: 0
    });

    // 3. Create tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(150) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('admin', 'volunteer') DEFAULT 'volunteer',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;

      CREATE TABLE IF NOT EXISTS students (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        roll_no VARCHAR(50) NOT NULL UNIQUE,
        prn_no VARCHAR(50) NOT NULL UNIQUE,
        department VARCHAR(100) NOT NULL,
        email VARCHAR(150) NOT NULL,
        phone VARCHAR(30) NULL,
        division VARCHAR(50) NULL,
        class VARCHAR(100) NULL,
        transaction_id VARCHAR(100) NULL,
        qr_token VARCHAR(100) NOT NULL UNIQUE,
        qr_code_image MEDIUMTEXT NULL,
        mail_status ENUM('pending', 'sent', 'failed') DEFAULT 'pending',
        mail_sent_at DATETIME NULL,
        entry_status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
        verified_at DATETIME NULL,
        verified_by_id INT NULL,
        rejection_reason VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_roll (roll_no),
        INDEX idx_prn (prn_no),
        INDEX idx_token (qr_token),
        INDEX idx_entry (entry_status)
      ) ENGINE=InnoDB;

      CREATE TABLE IF NOT EXISTS scan_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id INT NOT NULL,
        scanned_by_id INT NOT NULL,
        action ENUM('accepted', 'rejected', 'duplicate_attempt') NOT NULL,
        notes VARCHAR(255) NULL,
        scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
        FOREIGN KEY (scanned_by_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;

      CREATE TABLE IF NOT EXISTS system_settings (
        key_name VARCHAR(60) PRIMARY KEY,
        key_value LONGTEXT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    console.log('[DB] Core tables verified/created successfully.');

    // Ensure extra columns exist on existing databases
    await pool.query(`
      ALTER TABLE students 
        ADD COLUMN IF NOT EXISTS division VARCHAR(50) NULL AFTER phone,
        ADD COLUMN IF NOT EXISTS class VARCHAR(100) NULL AFTER division,
        ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(100) NULL AFTER class;
    `).catch(() => {});

    // 4. Seed default admin & volunteer if not already present
    const [existingUsers] = await pool.query('SELECT COUNT(*) as count FROM users');
    if (existingUsers[0].count === 0) {
      console.log('[DB] Seeding default Admin and Volunteer accounts...');
      const adminPass = await bcrypt.hash('admin123', 10);
      const volunteerPass = await bcrypt.hash('volunteer123', 10);

      await pool.query(`
        INSERT INTO users (name, email, password_hash, role) VALUES 
        (?, ?, ?, 'admin'),
        (?, ?, ?, 'volunteer')
      `, [
        'Super Admin', 'admin@fresher.party', adminPass,
        'Gate Volunteer 1', 'volunteer@fresher.party', volunteerPass
      ]);
      console.log('[DB] Default credentials seeded:');
      console.log('       Admin:     admin@fresher.party / admin123');
      console.log('       Volunteer: volunteer@fresher.party / volunteer123');
    }

    // 5. Seed default system settings
    const defaultSettings = [
      ['event_name', process.env.EVENT_NAME || 'Fresher Fiesta 2026'],
      ['event_venue', process.env.EVENT_VENUE || 'Grand University Auditorium'],
      ['event_date', process.env.EVENT_DATE || 'November 15, 2026 at 5:00 PM'],
      ['smtp_host', process.env.SMTP_HOST || 'smtp.gmail.com'],
      ['smtp_port', process.env.SMTP_PORT || '587'],
      ['smtp_secure', process.env.SMTP_SECURE || 'false'],
      ['smtp_user', process.env.SMTP_USER || ''],
      ['smtp_pass', process.env.SMTP_PASS || ''],
      ['smtp_from', process.env.SMTP_FROM || '"Fresher Fiesta 2026" <noreply@fresherfiesta.com>'],
      ['email_subject', '🎟️ Your VIP Fresher Party Entry Pass is Here!']
    ];

    for (const [k, v] of defaultSettings) {
      await pool.query(
        'INSERT IGNORE INTO system_settings (key_name, key_value) VALUES (?, ?)',
        [k, v]
      );
    }

    return pool;
  } catch (error) {
    console.error('[DB] Database initialization error:', error.message);
    throw error;
  }
}

function getPool() {
  if (!pool) {
    throw new Error('Database pool has not been initialized. Call initDB() first.');
  }
  return pool;
}

module.exports = {
  initDB,
  getPool
};

