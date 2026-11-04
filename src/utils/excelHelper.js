const xlsx = require('xlsx');
const { generatePassToken, generateQRCodeDataURL } = require('./qrHelper');

/**
 * Standardize column names from Google Forms / Excel exports to known keys
 */
function normalizeHeader(header) {
  const raw = String(header || '').trim();
  const h = raw.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Student Name
  if (h.includes('studentname') || h === 'name' || h.includes('fullname') || h.includes('candidatename')) {
    return 'name';
  }

  // Roll Number
  if (h.startsWith('roll') || h.includes('rollno') || h.includes('seatno')) {
    return 'roll_no';
  }

  // PRN Number (e.g. 'PRN No:', 'PRN No', 'PRN', 'Registration No')
  if (h.startsWith('prn') || h.includes('prnno') || h.includes('regno') || h.includes('registrationno')) {
    return 'prn_no';
  }

  // Division (e.g. 'DIVISION', 'Div', 'Section')
  if (h.startsWith('div') || h.includes('division') || h.includes('section')) {
    return 'division';
  }

  // Class / Year (e.g. 'Class', 'Year', 'Standard', 'Std')
  if (h.startsWith('class') || h.includes('standard') || h.includes('std')) {
    return 'class';
  }

  // Department / Branch (if explicitly provided)
  if (h.startsWith('dept') || h.includes('department') || h.includes('branch') || h.includes('stream') || h.includes('course')) {
    return 'department';
  }

  // Email Address
  if (h.includes('email') || h.includes('mail')) {
    return 'email';
  }

  // Phone / Mobile Number
  if (h.includes('phone') || h.includes('mobile') || h.includes('contact') || h.includes('whatsapp')) {
    return 'phone';
  }

  // Transaction ID
  if (h.includes('transaction') || h.includes('txnid') || h.includes('utr')) {
    return 'transaction_id';
  }

  // Timestamp
  if (h.includes('timestamp') || h.includes('time')) {
    return 'timestamp';
  }

  // Payment Screenshot
  if (h.includes('screenshot')) {
    return 'payment_screenshot';
  }

  // Declaration / Undertaking
  if (h.includes('undertak') || h.includes('declare')) {
    return 'declaration';
  }

  return h;
}

/**
 * Parse an Excel/CSV file buffer into clean student objects
 */
async function parseStudentExcel(fileBuffer) {
  const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  
  const rawRows = xlsx.utils.sheet_to_json(worksheet, { defval: '' });
  if (!rawRows || rawRows.length === 0) {
    throw new Error('The uploaded Excel sheet contains no data rows.');
  }

  const students = [];
  const errors = [];
  const seenPrns = new Set();
  const seenEmails = new Set();

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const rowNum = i + 2; // +2 for 1-based index and header row

    const student = {};
    for (const [key, value] of Object.entries(raw)) {
      const normalizedKey = normalizeHeader(key);
      student[normalizedKey] = String(value || '').trim();
    }

    // Roll number is optional and CAN BE DUPLICATE across divisions/departments
    if (!student.roll_no) {
      student.roll_no = '-';
    }

    // PRN Number is mandatory and MUST BE UNIQUE
    if (!student.prn_no) {
      // Check if PRN is in another column or fallback
      if (student.roll_no && student.roll_no !== '-') {
        student.prn_no = student.roll_no;
      }
    }

    // Required fields check: Student Name, PRN No, and Email
    if (!student.name) {
      errors.push({
        row: rowNum,
        name: 'N/A',
        roll: student.roll_no,
        error: 'Missing required field: Student Name is mandatory.'
      });
      continue;
    }

    if (!student.prn_no) {
      errors.push({
        row: rowNum,
        name: student.name,
        roll: student.roll_no,
        error: 'Missing required field: PRN Number is mandatory and must be unique.'
      });
      continue;
    }

    if (!student.email) {
      errors.push({
        row: rowNum,
        name: student.name,
        roll: student.roll_no,
        error: 'Missing required field: Email Address is mandatory and must be unique.'
      });
      continue;
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(student.email)) {
      errors.push({
        row: rowNum,
        name: student.name,
        roll: student.roll_no,
        error: `Invalid email address format: "${student.email}".`
      });
      continue;
    }

    // Duplicate PRN check inside the same sheet
    const normalizedPrn = student.prn_no.toLowerCase();
    if (seenPrns.has(normalizedPrn)) {
      errors.push({
        row: rowNum,
        name: student.name,
        roll: student.roll_no,
        error: `Duplicate PRN "${student.prn_no}" found multiple times in this sheet.`
      });
      continue;
    }
    seenPrns.add(normalizedPrn);

    // Duplicate Email check inside the same sheet
    const normalizedEmail = student.email.toLowerCase();
    if (seenEmails.has(normalizedEmail)) {
      errors.push({
        row: rowNum,
        name: student.name,
        roll: student.roll_no,
        error: `Duplicate Email "${student.email}" found multiple times in this sheet.`
      });
      continue;
    }
    seenEmails.add(normalizedEmail);

    // Derive Department from Class & Division if Department column was not in the sheet
    const deptValue = (
      student.department ||
      (student.class && student.division ? `${student.class} (Div ${student.division})` : '') ||
      student.class ||
      (student.division ? `Division ${student.division}` : '') ||
      'General'
    ).trim();
    student.department = deptValue;

    // Generate unique pass token and QR code for this student
    const token = generatePassToken('FP26');
    const qrDataUrl = await generateQRCodeDataURL(token, {
      name: student.name,
      roll_no: student.roll_no,
      prn_no: student.prn_no,
      department: student.department
    });

    students.push({
      name: student.name,
      roll_no: student.roll_no,
      prn_no: student.prn_no,
      department: student.department,
      division: student.division || null,
      class: student.class || null,
      transaction_id: student.transaction_id || null,
      email: student.email,
      phone: student.phone || '',
      qr_token: token,
      qr_code_image: qrDataUrl
    });
  }

  return { students, errors, totalRows: rawRows.length };
}

/**
 * Generate a sample Excel buffer matching the exact college Google Form / Excel sheet format
 */
function generateSampleExcelBuffer() {
  const sampleData = [
    {
      'Timestamp': '2026-11-03 10:15:22',
      'Student Name': 'Aarav Sharma',
      'Roll No': 'CS-2026-001',
      'DIVISION': 'A',
      'Class': 'B.Tech CS First Year',
      'payment screenshot': 'drive.google.com/file/d/sample1',
      'Email': 'aarav.sharma@example.com',
      'PRN No:': 'PRN2026101',
      'Phone No': '+91 9876543210',
      'I solemnly undertake that I will maintain proper discipline': 'Yes',
      'Transaction Id': 'TXN88992019',
      'Payment ScreenShot': 'Drive Link'
    },
    {
      'Timestamp': '2026-11-03 10:18:45',
      'Student Name': 'Ananya Patel',
      'Roll No': 'IT-2026-042',
      'DIVISION': 'B',
      'Class': 'B.Tech IT First Year',
      'payment screenshot': 'drive.google.com/file/d/sample2',
      'Email': 'ananya.patel@example.com',
      'PRN No:': 'PRN2026102',
      'Phone No': '+91 9876543211',
      'I solemnly undertake that I will maintain proper discipline': 'Yes',
      'Transaction Id': 'TXN88992020',
      'Payment ScreenShot': 'Drive Link'
    },
    {
      'Timestamp': '2026-11-03 10:22:10',
      'Student Name': 'Rohan Deshmukh',
      'Roll No': 'ME-2026-015',
      'DIVISION': 'A',
      'Class': 'B.Tech ME First Year',
      'payment screenshot': 'drive.google.com/file/d/sample3',
      'Email': 'rohan.deshmukh@example.com',
      'PRN No:': 'PRN2026103',
      'Phone No': '+91 9876543212',
      'I solemnly undertake that I will maintain proper discipline': 'Yes',
      'Transaction Id': 'TXN88992021',
      'Payment ScreenShot': 'Drive Link'
    }
  ];

  const worksheet = xlsx.utils.json_to_sheet(sampleData);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, 'Students');

  worksheet['!cols'] = [
    { wch: 20 }, // Timestamp
    { wch: 22 }, // Student Name
    { wch: 14 }, // Roll No
    { wch: 10 }, // DIVISION
    { wch: 24 }, // Class
    { wch: 20 }, // payment screenshot
    { wch: 28 }, // Email
    { wch: 15 }, // PRN No:
    { wch: 16 }, // Phone No
    { wch: 25 }, // Undertake
    { wch: 18 }, // Transaction Id
    { wch: 20 }  // Payment ScreenShot
  ];

  return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  parseStudentExcel,
  generateSampleExcelBuffer
};
