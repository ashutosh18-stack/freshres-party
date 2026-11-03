const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
const { getPool } = require('../db');

/**
 * Resolve public origin URL for email links so they can be opened from mobile devices
 */
function resolvePublicOrigin(originUrl = '') {
  // If a remote public URL was provided (not localhost / 127.0.0.1), use it
  if (originUrl && !originUrl.includes('localhost') && !originUrl.includes('127.0.0.1')) {
    return originUrl.replace(/\/+$/, '');
  }

  // Check live tunnel status saved by launch_live.js
  try {
    const liveStatusFile = path.join(__dirname, '../../public/live_status.json');
    if (fs.existsSync(liveStatusFile)) {
      const data = JSON.parse(fs.readFileSync(liveStatusFile, 'utf8'));
      if (data.tunnelUrl && data.tunnelUrl.startsWith('https://')) {
        return data.tunnelUrl.replace(/\/+$/, '');
      }
      if (data.cloudUrl && data.cloudUrl.startsWith('https://')) {
        return data.cloudUrl.replace(/\/+$/, '');
      }
    }
  } catch (e) {
    // Ignore JSON read errors
  }

  // Check environment variable
  if (process.env.PUBLIC_URL && process.env.PUBLIC_URL.startsWith('http')) {
    return process.env.PUBLIC_URL.replace(/\/+$/, '');
  }

  // Permanent cloud deployment fallback
  return 'https://freshres-party.onrender.com';
}

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
 * Generate Fresher Party Email HTML
 */
function buildPassEmailHtml(student, settings, originUrl = 'http://localhost:3000') {
  const eventName = settings.event_name || 'Fresher Fiesta 2026';
  const eventVenue = settings.event_venue || 'Grand University Auditorium';
  const eventDate = settings.event_date || 'November 15, 2026 at 5:00 PM';
  
  const publicOrigin = resolvePublicOrigin(originUrl);
  const passUrl = `${publicOrigin}/pass/${student.qr_token}`;

  // Structured QR payload identical to camera gate scanner expectation
  const qrPayload = JSON.stringify({
    app: 'FRESHER_PASS',
    token: student.qr_token,
    prn: student.prn_no || '',
    roll: student.roll_no || '',
    name: student.name || ''
  });

  // Public high-resolution QR image URL via high-availability CDN (Google Image Proxy safe)
  const cloudQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=8&color=0f172a&bgcolor=ffffff&data=${encodeURIComponent(qrPayload)}`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${eventName} - Entry Pass</title>
</head>
<body style="margin:0; padding:0; background-color:#f1f5f9; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#0f172a; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9; width:100%; margin:0; padding:20px 0;">
    <tr>
      <td align="center" style="padding:10px;">
        <!-- Card Container -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px; width:100%; background:#ffffff; border-radius:18px; overflow:hidden; border:1px solid #e2e8f0; box-shadow:0 10px 25px -5px rgba(0,0,0,0.06); text-align:center;">
          
          <!-- Blue Header Banner -->
          <tr>
            <td style="background:#2563eb; padding:32px 24px; text-align:center; color:#ffffff;">
              <div style="display:inline-block; background:rgba(255,255,255,0.2); padding:5px 16px; border-radius:9999px; font-size:11px; font-weight:800; color:#ffffff; letter-spacing:1.5px; text-transform:uppercase; margin-bottom:12px;">
                ✨ OFFICIAL ENTRY PASS
              </div>
              <h1 style="margin:0; font-size:24px; font-weight:800; letter-spacing:0.5px; color:#ffffff; text-transform:uppercase; line-height:1.2;">
                ${eventName}
              </h1>
              <p style="margin:6px 0 0; color:#dbeafe; font-size:13px; font-weight:500;">
                Official College Welcome & Freshers Celebration
              </p>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding:28px 22px; text-align:center;">
              
              <p style="margin:0 0 18px; font-size:15px; color:#334155; line-height:1.5;">
                Hey <strong>${student.name}</strong>! Your party entry pass is ready. Please present this QR code at the entrance gate.
              </p>

              <!-- Dashed Pass Box -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc; border:2px dashed #93c5fd; border-radius:16px; margin:0 0 20px; text-align:center;">
                <tr>
                  <td style="padding:24px 18px; text-align:center;">
                    
                    <!-- QR Code Display Box -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
                      <tr>
                        <td align="center" style="background:#ffffff; padding:14px; border-radius:14px; border:1px solid #e2e8f0; box-shadow:0 4px 10px rgba(0,0,0,0.05); text-align:center;">
                          <img src="${cloudQrUrl}" 
                               alt="Fresher Party QR Code" 
                               width="220" 
                               height="220" 
                               style="display:block; margin:0 auto; width:220px; height:220px; max-width:100%; border:0; outline:none; text-decoration:none; border-radius:8px;" />
                        </td>
                      </tr>
                    </table>

                    <!-- Token Box -->
                    <div style="margin-top:14px;">
                      <span style="font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size:13px; font-weight:700; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:6px 16px; border-radius:8px; display:inline-block; letter-spacing:1.5px;">
                        ${student.qr_token}
                      </span>
                    </div>

                    <!-- Student Info Grid -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px; border-top:1px solid #e2e8f0; text-align:left;">
                      <tr>
                        <td style="padding:9px 8px; border-bottom:1px solid #e2e8f0; font-size:13px; color:#64748b; font-weight:500; width:38%;">Student Name</td>
                        <td style="padding:9px 8px; border-bottom:1px solid #e2e8f0; font-size:13px; color:#0f172a; font-weight:700;">${student.name}</td>
                      </tr>
                      <tr>
                        <td style="padding:9px 8px; border-bottom:1px solid #e2e8f0; font-size:13px; color:#64748b; font-weight:500;">Roll Number</td>
                        <td style="padding:9px 8px; border-bottom:1px solid #e2e8f0; font-size:13px; color:#0f172a; font-weight:700;">${student.roll_no || 'N/A'}</td>
                      </tr>
                      <tr>
                        <td style="padding:9px 8px; border-bottom:1px solid #e2e8f0; font-size:13px; color:#64748b; font-weight:500;">PRN Number</td>
                        <td style="padding:9px 8px; border-bottom:1px solid #e2e8f0; font-size:13px; color:#0f172a; font-weight:700;">${student.prn_no || 'N/A'}</td>
                      </tr>
                      <tr>
                        <td style="padding:9px 8px; font-size:13px; color:#64748b; font-weight:500;">Department</td>
                        <td style="padding:9px 8px; font-size:13px; color:#0f172a; font-weight:700;">${student.department || 'General'}</td>
                      </tr>
                    </table>

                  </td>
                </tr>
              </table>

              <!-- Event Details Info Box -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eff6ff; border-left:4px solid #2563eb; border-radius:10px; margin:0 0 22px; text-align:left;">
                <tr>
                  <td style="padding:14px 16px;">
                    <p style="margin:0 0 6px; font-size:13px; color:#1e3a8a;">📍 <strong>Venue:</strong> ${eventVenue}</p>
                    <p style="margin:0; font-size:13px; color:#1e3a8a;">🗓️ <strong>Date & Time:</strong> ${eventDate}</p>
                  </td>
                </tr>
              </table>

              <!-- Rules & Instructions -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc; border-radius:10px; border:1px solid #e2e8f0; text-align:left;">
                <tr>
                  <td style="padding:14px 18px;">
                    <h4 style="margin:0 0 8px; color:#334155; font-size:12px; text-transform:uppercase; font-weight:800; letter-spacing:0.5px;">
                      ⚠️ Gate Entry Instructions
                    </h4>
                    <ul style="margin:0; padding-left:18px; color:#475569; font-size:12px; line-height:1.65;">
                      <li>This QR pass is unique to you and strictly non-transferable.</li>
                      <li>Each pass allows a <strong>single entry</strong>; once scanned at the entrance gate it is automatically locked.</li>
                      <li>Keep your college ID card ready along with this QR pass.</li>
                      <li>A PNG image of your QR code pass is also attached to this email for offline use.</li>
                    </ul>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc; text-align:center; padding:18px 24px; color:#64748b; font-size:12px; border-top:1px solid #e2e8f0; line-height:1.5;">
              <p style="margin:0 0 4px;">© 2026 Student Council & Organizing Committee • All Rights Reserved</p>
              <p style="margin:0; font-size:11px; color:#94a3b8;">If you did not register for this event, please contact the student coordinator desk.</p>
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
  const { isSimulator, transporter, from, settings } = await getTransporter();
  const subject = settings.email_subject || `🎟️ Your Entry Pass for ${settings.event_name || 'Fresher Fiesta 2026'}`;
  const html = buildPassEmailHtml(student, settings, originUrl);

  const publicOrigin = resolvePublicOrigin(originUrl);
  const passUrl = `${publicOrigin}/pass/${student.qr_token}`;

  // Structured QR payload identical to camera gate scanner expectation
  const qrPayload = JSON.stringify({
    app: 'FRESHER_PASS',
    token: student.qr_token,
    prn: student.prn_no || '',
    roll: student.roll_no || '',
    name: student.name || ''
  });

  // Generate crisp 400x400 PNG buffer for high-res attachment
  let qrPngBuffer;
  try {
    qrPngBuffer = await QRCode.toBuffer(qrPayload, {
      errorCorrectionLevel: 'H',
      type: 'png',
      margin: 2,
      width: 400,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });
  } catch (qrErr) {
    console.warn('QRCode buffer generation error, falling back to base64 if present:', qrErr);
    if (student.qr_code_image) {
      const match = student.qr_code_image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (match) {
        qrPngBuffer = Buffer.from(match[2], 'base64');
      }
    }
  }

  // RFC-compliant CID for inline attachment fallback
  const cidIdentifier = `pass-qr-${student.qr_token.toLowerCase()}@fresherfiesta.com`;

  const attachments = qrPngBuffer ? [
    {
      filename: `pass-${student.roll_no || student.id}.png`,
      content: qrPngBuffer,
      contentType: 'image/png',
      cid: cidIdentifier,
      contentDisposition: 'attachment'
    }
  ] : [];

  if (isSimulator) {
    console.log(`[EMAIL SIMULATOR] Simulated delivery to ${student.name} <${student.email}> | Pass Token: ${student.qr_token}`);
    return {
      success: true,
      simulated: true,
      messageId: `sim-${Date.now()}-${student.id}`,
      note: 'Sent via Local Simulator (No SMTP credentials configured yet. Configure SMTP in settings for real dispatch).'
    };
  }

  const plainText = `
🎟️ ${settings.event_name || 'Fresher Fiesta 2026'} - OFFICIAL ENTRY PASS

Hey ${student.name}! Your party entry pass is ready.

Pass Token: ${student.qr_token}
Student: ${student.name}
Roll Number: ${student.roll_no || 'N/A'}
PRN: ${student.prn_no || 'N/A'}
Department: ${student.department || 'General'}

Venue: ${settings.event_venue || 'Grand University Auditorium'}
Date & Time: ${settings.event_date || 'November 15, 2026 at 5:00 PM'}

(A scannable QR code PNG image is attached to this email. Please present it at the entrance gate).
  `.trim();

  const mailOptions = {
    from,
    to: `"${student.name}" <${student.email}>`,
    subject,
    text: plainText,
    html,
    attachments
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
  buildPassEmailHtml,
  resolvePublicOrigin
};
