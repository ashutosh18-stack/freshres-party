const nodemailer = require('nodemailer');
const { getPool } = require('../db');

/**
 * Get configured nodemailer transporter
 */
async function getTransporter() {
  const pool = getPool();
  const [rows] = await pool.query('SELECT key_name, key_value FROM system_settings');
  const settings = {};
  rows.forEach(r => { settings[r.key_name] = r.key_value; });

  // Prefer process.env if provided, otherwise DB settings
  const host = process.env.SMTP_HOST || settings.smtp_host || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || settings.smtp_port || '587', 10);
  const secure = ((process.env.SMTP_SECURE || settings.smtp_secure) === 'true' || port === 465);
  const rawUser = process.env.SMTP_USER || settings.smtp_user || '';
  const rawPass = process.env.SMTP_PASS || settings.smtp_pass || '';
  const user = rawUser.trim();
  // Strip all whitespace from the app password (e.g. "qzuz lvjl unzf bbgv" -> "qzuzlvjlunzfbbgv")
  const pass = rawPass.replace(/\s+/g, '');

  // If user/pass is empty, check if ethereal test transporter can be used or simulate
  if (!user || !pass) {
    return {
      isSimulator: true,
      from: settings.smtp_from || process.env.SMTP_FROM || '"Fresher Fiesta 2026" <noreply@fresherfiesta.com>',
      settings
    };
  }

  // Determine appropriate From address. For Gmail, sender address should match authenticated account
  let fromAddress = settings.smtp_from || process.env.SMTP_FROM;
  if (!fromAddress || (host.includes('gmail.com') && fromAddress.includes('@fresherfiesta.com'))) {
    fromAddress = `"${settings.event_name || 'Fresher Fiesta 2026'}" <${user}>`;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: false
    }
  });

  return {
    isSimulator: false,
    transporter,
    from: fromAddress,
    settings
  };
}

/**
 * Generate VIP Fresher Party Email HTML
 */
function buildPassEmailHtml(student, settings, originUrl = 'http://localhost:3000') {
  const eventName = settings.event_name || 'Fresher Fiesta 2026';
  const eventVenue = settings.event_venue || 'Grand University Auditorium';
  const eventDate = settings.event_date || 'November 15, 2026 at 5:00 PM';
  const passUrl = `${originUrl}/pass.html?token=${student.qr_token}`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${eventName} - Entry Pass</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0f172a; }
    .container { max-width: 580px; margin: 30px auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .header { background: #2563eb; padding: 32px 24px; text-align: center; color: #ffffff; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 0.5px; color: #ffffff; text-transform: uppercase; }
    .header p { margin: 6px 0 0; color: #dbeafe; font-size: 14px; font-weight: 500; }
    .badge { display: inline-block; background: rgba(255,255,255,0.2); padding: 4px 14px; border-radius: 9999px; font-size: 11px; font-weight: 700; color: #ffffff; margin-bottom: 12px; letter-spacing: 1px; }
    .content { padding: 28px 24px; text-align: center; }
    .greeting { font-size: 15px; color: #334155; margin-bottom: 20px; line-height: 1.5; }
    .pass-card { background: #f8fafc; border: 2px dashed #bfdbfe; border-radius: 14px; padding: 24px; margin: 20px 0; text-align: center; }
    .qr-container { background: #ffffff; padding: 12px; border-radius: 12px; display: inline-block; margin: 10px auto; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
    .qr-container img { display: block; width: 180px; height: 180px; }
    .token-box { font-family: monospace; font-size: 13px; font-weight: 700; background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 6px 14px; border-radius: 8px; display: inline-block; margin-top: 8px; letter-spacing: 1.5px; }
    .info-table { width: 100%; border-collapse: collapse; margin-top: 18px; text-align: left; }
    .info-table td { padding: 9px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
    .info-table td.label { color: #64748b; font-weight: 500; width: 35%; }
    .info-table td.value { color: #0f172a; font-weight: 700; }
    .event-details { background: #eff6ff; border-left: 4px solid #2563eb; border-radius: 8px; padding: 14px; margin: 22px 0; text-align: left; }
    .event-details p { margin: 5px 0; font-size: 13px; color: #1e3a8a; }
    .event-details strong { color: #0f172a; }
    .btn { display: inline-block; background: #2563eb; color: #ffffff !important; text-decoration: none; padding: 12px 26px; border-radius: 10px; font-weight: 700; font-size: 14px; margin: 10px 0; }
    .rules { background: #f1f5f9; border-radius: 10px; padding: 14px 18px; text-align: left; margin-top: 22px; }
    .rules h4 { margin: 0 0 8px; color: #334155; font-size: 13px; text-transform: uppercase; font-weight: 700; }
    .rules ul { margin: 0; padding-left: 18px; color: #475569; font-size: 12px; line-height: 1.6; }
    .footer { text-align: center; padding: 18px; color: #64748b; font-size: 12px; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="badge">OFFICIAL ENTRY PASS</div>
      <h1>${eventName}</h1>
      <p>Welcome to College Life & Freshers Celebration</p>
    </div>
    
    <div class="content">
      <p class="greeting">Hey <strong>${student.name}</strong>! Your party entry pass is ready. Please present this QR code at the entrance gate.</p>
      
      <div class="pass-card">
        <div class="qr-container">
          <img src="cid:student-qr-code" alt="Fresher Party QR Code" />
        </div>
        <div>
          <span class="token-box">${student.qr_token}</span>
        </div>

        <table class="info-table">
          <tr>
            <td class="label">Student Name</td>
            <td class="value">${student.name}</td>
          </tr>
          <tr>
            <td class="label">Roll Number</td>
            <td class="value">${student.roll_no}</td>
          </tr>
          <tr>
            <td class="label">PRN Number</td>
            <td class="value">${student.prn_no}</td>
          </tr>
          <tr>
            <td class="label">Department</td>
            <td class="value">${student.department}</td>
          </tr>
        </table>
      </div>

      <div class="event-details">
        <p>📍 <strong>Venue:</strong> ${eventVenue}</p>
        <p>🗓️ <strong>Date & Time:</strong> ${eventDate}</p>
        <p>👔 <strong>Dress Code:</strong> Retro Glam / Formal Chic</p>
      </div>

      <div>
        <a href="${passUrl}" class="btn" target="_blank">📱 View Digital Pass on Phone</a>
      </div>

      <div class="rules">
        <h4>⚠️ Entry Instructions</h4>
        <ul>
          <li>This QR pass is unique to you and strictly non-transferable.</li>
          <li>Each pass allows a single entry; once scanned by gate volunteers it will be locked.</li>
          <li>Keep your college ID card or valid photo ID ready along with this QR pass.</li>
          <li>Do not share your QR code screenshot with anyone else.</li>
        </ul>
      </div>
    </div>

    <div class="footer">
      <p>© 2026 Student Council & Organizing Committee • All Rights Reserved</p>
      <p>If you have any questions or didn't register, please contact the student coordinator desk.</p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Send pass email to a single student
 */
async function sendPassEmail(student, originUrl = 'http://localhost:3000') {
  const { isSimulator, transporter, from, settings } = await getTransporter();
  const subject = settings.email_subject || `🎟️ Your VIP Pass for ${settings.event_name || 'Fresher Fiesta 2026'}`;
  const html = buildPassEmailHtml(student, settings, originUrl);

  // Extract base64 image data from qr_code_image data URL
  const qrMatches = student.qr_code_image ? student.qr_code_image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/) : null;
  const qrAttachment = qrMatches ? [{
    filename: `pass-${student.roll_no}.png`,
    content: Buffer.from(qrMatches[2], 'base64'),
    cid: 'student-qr-code'
  }] : [];

  if (isSimulator) {
    console.log(`[EMAIL SIMULATOR] Simulated delivery to ${student.name} <${student.email}> | Pass Token: ${student.qr_token}`);
    return {
      success: true,
      simulated: true,
      messageId: `sim-${Date.now()}-${student.id}`,
      note: 'Sent via Local Simulator (No SMTP credentials configured yet. Configure SMTP in settings for real dispatch).'
    };
  }

  const mailOptions = {
    from,
    to: `"${student.name}" <${student.email}>`,
    subject,
    html,
    attachments: qrAttachment
  };

  const info = await transporter.sendMail(mailOptions);
  return {
    success: true,
    simulated: false,
    messageId: info.messageId,
    response: info.response
  };
}

/**
 * Test SMTP connection
 */
async function testSmtpConnection(customConfig = {}) {
  const host = customConfig.smtp_host || process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(customConfig.smtp_port || process.env.SMTP_PORT || '587', 10);
  const secure = (customConfig.smtp_secure === 'true' || customConfig.smtp_secure === true || port === 465);
  const rawUser = customConfig.smtp_user || process.env.SMTP_USER || '';
  let rawPass = customConfig.smtp_pass;

  if (!rawPass || rawPass === '••••••••') {
    const pool = getPool();
    const [rows] = await pool.query("SELECT key_value FROM system_settings WHERE key_name = 'smtp_pass'");
    rawPass = (rows.length > 0 && rows[0].key_value) ? rows[0].key_value : process.env.SMTP_PASS;
  }

  const user = (rawUser || '').trim();
  const pass = (rawPass || '').replace(/\s+/g, '');

  if (!user || !pass) {
    throw new Error('SMTP Username and Password cannot be empty for testing.');
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: { rejectUnauthorized: false }
  });

  await transporter.verify();
  return { success: true, message: 'SMTP connection verified successfully!' };
}

module.exports = {
  sendPassEmail,
  testSmtpConnection,
  buildPassEmailHtml
};

