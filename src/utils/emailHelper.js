const nodemailer = require('nodemailer');
const { getPool } = require('../db');
const QRCode = require('qrcode');

/**
 * Get configured nodemailer transporter using database settings or environment
 */
async function getTransporter() {
  const pool = getPool();
  const [rows] = await pool.query('SELECT key_name, key_value FROM system_settings');
  const settings = {};
  rows.forEach(r => { settings[r.key_name] = r.key_value; });

  const host = settings.smtp_host || process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(settings.smtp_port || process.env.SMTP_PORT || '587', 10);
  const secure = ((settings.smtp_secure || process.env.SMTP_SECURE) === 'true' || port === 465);
  const rawUser = settings.smtp_user || process.env.SMTP_USER || '';
  const rawPass = settings.smtp_pass || process.env.SMTP_PASS || '';
  const user = (rawUser || '').trim();
  const pass = (rawPass || '').replace(/\s+/g, '');

  if (!user || !pass) {
    throw new Error('SMTP credentials are not configured. Please set your Gmail address and App Password in Settings or .env.');
  }

  const fromAddress = settings.smtp_from || process.env.SMTP_FROM || `"Fresher Party 2026" <${user}>`;

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
    transporter,
    from: fromAddress,
    user,
    settings
  };
}

/**
 * Generate Clean Fresher Party Email HTML
 * (No VIP wording, No dress code, No external button, QR rendered directly inside pass card)
 */
function buildPassEmailHtml(student, settings, originUrl = 'http://localhost:3000', qrSrcOverride = null, qrPayload = null) {
  const eventName = settings.event_name || 'Fresher Party 2026';
  const eventVenue = settings.event_venue || 'D.Y.Patil University ATU, Talsande';
  const eventDate = settings.event_date || 'November 6, 2026 at 10:00 AM';

  const payload = qrPayload || JSON.stringify({
    app: 'FRESHER_PASS',
    token: student.qr_token,
    prn: student.prn_no || '',
    roll: student.roll_no || '',
    name: student.name || ''
  });

  const qrImageSrc = qrSrcOverride || `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=8&color=0f172a&bgcolor=ffffff&data=${encodeURIComponent(payload)}`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${eventName} - Entry Pass</title>
</head>
<body style="margin:0; padding:0; background-color:#f1f5f9; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9; width:100%; margin:0; padding:20px 0;">
    <tr>
      <td align="center" style="padding:10px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:540px; width:100%; background:#ffffff; border-radius:18px; overflow:hidden; border:1px solid #e2e8f0; box-shadow:0 8px 24px rgba(0,0,0,0.06); text-align:center;">
          
          <!-- Header Banner -->
          <tr>
            <td style="background:#2563eb; padding:28px 20px; text-align:center; color:#ffffff;">
              <div style="display:inline-block; background:rgba(255,255,255,0.22); padding:4px 14px; border-radius:9999px; font-size:11px; font-weight:800; color:#ffffff; letter-spacing:1px; text-transform:uppercase; margin-bottom:10px;">
                🎟️ OFFICIAL ENTRY PASS
              </div>
              <h1 style="margin:0; font-size:22px; font-weight:800; color:#ffffff; text-transform:uppercase; letter-spacing:0.5px;">
                ${eventName}
              </h1>
              <p style="margin:6px 0 0; color:#dbeafe; font-size:13px; font-weight:500;">
                Official College Welcome & Freshers Celebration
              </p>
            </td>
          </tr>

          <!-- Pass Body -->
          <tr>
            <td style="padding:24px 20px; text-align:center;">
              <p style="margin:0 0 16px; font-size:14px; color:#334155; line-height:1.5;">
                Hello <strong>${student.name}</strong>! Your party entry pass is ready. Please present this QR pass at the entrance gate.
              </p>

              <!-- QR Pass Card -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc; border:2px dashed #93c5fd; border-radius:16px; margin:0 0 20px; text-align:center;">
                <tr>
                  <td style="padding:20px 16px; text-align:center;">
                    
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
                      <tr>
                        <td align="center" style="background:#ffffff; padding:12px; border-radius:12px; border:1px solid #e2e8f0; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
                          <img src="${qrImageSrc}" 
                               alt="Entry Pass QR Code" 
                               width="220" 
                               height="220" 
                               style="display:block; margin:0 auto; width:220px; height:220px; max-width:100%; border:0; border-radius:6px;" />
                        </td>
                      </tr>
                    </table>

                    <div style="margin-top:12px;">
                      <span style="font-family:monospace; font-size:13px; font-weight:700; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:5px 14px; border-radius:8px; display:inline-block; letter-spacing:1px;">
                        ${student.qr_token}
                      </span>
                    </div>

                    <!-- Student Details Table -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px; border-top:1px solid #e2e8f0; text-align:left;">
                      <tr>
                        <td style="padding:8px; border-bottom:1px solid #e2e8f0; font-size:12px; color:#64748b; font-weight:600; width:40%;">Student Name</td>
                        <td style="padding:8px; border-bottom:1px solid #e2e8f0; font-size:12px; color:#0f172a; font-weight:700;">${student.name}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px; border-bottom:1px solid #e2e8f0; font-size:12px; color:#64748b; font-weight:600;">PRN Number</td>
                        <td style="padding:8px; border-bottom:1px solid #e2e8f0; font-size:12px; color:#0f172a; font-weight:700;">${student.prn_no || 'N/A'}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px; border-bottom:1px solid #e2e8f0; font-size:12px; color:#64748b; font-weight:600;">Roll Number</td>
                        <td style="padding:8px; border-bottom:1px solid #e2e8f0; font-size:12px; color:#0f172a; font-weight:700;">${student.roll_no || 'N/A'}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px; font-size:12px; color:#64748b; font-weight:600;">Department</td>
                        <td style="padding:8px; font-size:12px; color:#0f172a; font-weight:700;">${student.department || 'General'}</td>
                      </tr>
                    </table>

                  </td>
                </tr>
              </table>

              <!-- Venue & Schedule -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eff6ff; border-left:4px solid #2563eb; border-radius:8px; margin:0 0 18px; text-align:left;">
                <tr>
                  <td style="padding:12px 14px;">
                    <p style="margin:0 0 4px; font-size:12px; color:#1e3a8a;">📍 <strong>Venue:</strong> ${eventVenue}</p>
                    <p style="margin:0; font-size:12px; color:#1e3a8a;">🗓️ <strong>Date & Time:</strong> ${eventDate}</p>
                  </td>
                </tr>
              </table>

              <!-- Instructions -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0; text-align:left;">
                <tr>
                  <td style="padding:12px 14px;">
                    <h4 style="margin:0 0 6px; color:#334155; font-size:11px; text-transform:uppercase; font-weight:800; letter-spacing:0.5px;">
                      ⚠️ Gate Verification Notice
                    </h4>
                    <ul style="margin:0; padding-left:16px; color:#475569; font-size:11px; line-height:1.6;">
                      <li>Each pass is strictly personal and allows <strong>single entry</strong>.</li>
                      <li>Carry your College ID along with this digital pass.</li>
                    </ul>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc; text-align:center; padding:14px 20px; color:#64748b; font-size:11px; border-top:1px solid #e2e8f0;">
              © 2026 Student Organizing Committee • Fresher Party
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

/**
 * Send pass email to a single student
 */
async function sendPassEmail(student, originUrl = 'http://localhost:3000') {
  const { transporter, from, settings } = await getTransporter();

  const qrPayload = JSON.stringify({
    app: 'FRESHER_PASS',
    token: student.qr_token,
    prn: student.prn_no || '',
    roll: student.roll_no || '',
    name: student.name || ''
  });

  const qrCid = 'pass_qr_code_embedded';
  const html = buildPassEmailHtml(student, settings, originUrl, `cid:${qrCid}`, qrPayload);

  let subject = settings.email_subject || `Fresher Party 2026 - Entry Pass: ${student.name}`;
  if (subject.includes('VIP')) {
    subject = subject.replace(/VIP\s*/gi, '').trim();
  }

  const plainText = `
${settings.event_name || 'Fresher Party 2026'} - OFFICIAL ENTRY PASS

Hey ${student.name}! Your party entry pass is ready.

Pass Token: ${student.qr_token}
Student Name: ${student.name}
Roll Number: ${student.roll_no || 'N/A'}
PRN: ${student.prn_no || 'N/A'}
Department: ${student.department || 'General'}

Venue: ${settings.event_venue || 'D.Y.Patil University ATU, Talsande'}
Date & Time: ${settings.event_date || 'November 6, 2026 at 10:00 AM'}

Please present your QR entry pass at the entrance gate.
  `.trim();

  // Attach QR code as inline CID so it renders directly inside the email card
  let qrBuffer = null;
  if (student.qr_code_image && student.qr_code_image.includes('base64,')) {
    const base64Data = student.qr_code_image.split('base64,')[1];
    qrBuffer = Buffer.from(base64Data, 'base64');
  } else {
    qrBuffer = await QRCode.toBuffer(qrPayload, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 320,
      color: { dark: '#0f172a', light: '#ffffff' }
    });
  }

  const attachments = [
    {
      filename: 'entry-pass-qr.png',
      content: qrBuffer,
      cid: qrCid,
      contentType: 'image/png',
      contentDisposition: 'inline'
    }
  ];

  const cleanName = (student.name || '').replace(/[^\w\s]/gi, '').trim() || 'Student';
  const cleanEmail = (student.email || '').trim();

  const mailOptions = {
    from,
    to: `"${cleanName}" <${cleanEmail}>`,
    replyTo: from,
    subject,
    text: plainText,
    html,
    attachments,
    headers: {
      'X-Priority': '1',
      'X-MSMail-Priority': 'High',
      'Importance': 'high'
    }
  };

  const info = await transporter.sendMail(mailOptions);
  return {
    success: true,
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
