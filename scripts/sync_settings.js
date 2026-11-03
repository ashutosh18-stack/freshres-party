const { initDB, getPool } = require('../src/db');
require('dotenv').config();

async function sync() {
  await initDB();
  const pool = getPool();
  const pairs = {
    smtp_host: process.env.SMTP_HOST || 'smtp.gmail.com',
    smtp_port: process.env.SMTP_PORT || '587',
    smtp_secure: process.env.SMTP_SECURE || 'false',
    smtp_user: (process.env.SMTP_USER || '').trim(),
    smtp_pass: (process.env.SMTP_PASS || '').replace(/\s+/g, ''),
    smtp_from: process.env.SMTP_FROM || '',
    event_name: process.env.EVENT_NAME || 'Fresher PARTY 2026 MCA',
    event_venue: process.env.EVENT_VENUE || 'D.Y.Patil University ATU, Talsande',
    event_date: process.env.EVENT_DATE || 'November 6, 2026 at 10:00 AM'
  };

  for (const [k, v] of Object.entries(pairs)) {
    await pool.query(
      'INSERT INTO system_settings (key_name, key_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE key_value = VALUES(key_value)',
      [k, v]
    );
  }

  console.log('--- ALL SYSTEM SETTINGS SYNCED ---');
  const [rows] = await pool.query('SELECT key_name, key_value FROM system_settings');
  rows.forEach(r => console.log(r.key_name, '=', r.key_value));
  process.exit(0);
}

sync().catch(e => {
  console.error('Sync failed:', e);
  process.exit(1);
});

