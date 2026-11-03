const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

/**
 * Generate a unique cryptographic token for a student pass
 */
function generatePassToken(prefix = 'FP26') {
  const uniquePart = uuidv4().replace(/-/g, '').substring(0, 16).toUpperCase();
  return `${prefix}-${uniquePart}`;
}

/**
 * Generate high-resolution DataURL QR Code
 * Payload contains structured JSON with verification token
 */
async function generateQRCodeDataURL(token, studentData = {}) {
  const payload = JSON.stringify({
    app: 'FRESHER_PASS',
    token: token,
    prn: studentData.prn_no || '',
    roll: studentData.roll_no || '',
    name: studentData.name || ''
  });

  return await QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'H',
    type: 'image/png',
    margin: 2,
    width: 320,
    color: {
      dark: '#1e1b4b', // deep indigo
      light: '#ffffff'
    }
  });
}

/**
 * Parse scanned QR string safely
 * Can parse structured JSON or fallback to raw token string
 */
function parseScannedData(rawString) {
  if (!rawString) return null;
  const trimmed = rawString.trim();

  // Try parsing JSON
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed.token) {
      return parsed.token;
    }
  } catch (e) {
    // Not JSON, check if it's a URL
  }

  // If it's a URL like http://localhost:3000/pass/FP26-XXXXX
  const urlMatch = trimmed.match(/\/pass\/([A-Za-z0-9-_]+)/);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }

  // Otherwise treat as direct token or roll/prn fallback
  return trimmed;
}

module.exports = {
  generatePassToken,
  generateQRCodeDataURL,
  parseScannedData
};

