# 🎟️ Fresher Fiesta 2026 — Entry Pass & Gate Verification Platform

A secure, responsive, full-stack web application designed for college fresher party organizers, administrators, and gate volunteers. Features Excel student data imports, automated unique QR code pass generation, email broadcasting, and a real-time gate scanner platform with **Accept** and **Cancel/Reject** actions.

---

## 🚀 Quick Start Guide

### 1. Requirements
- **MySQL / MariaDB** (via XAMPP or standalone on `localhost:3306`)
- **Node.js** (v18+)

### 2. Turn on XAMPP MySQL
Ensure the **MySQL** module in the XAMPP Control Panel is started on default port `3306`. (Default user: `root`, empty password).

### 3. Start the Server
The application auto-creates the database (`fresher_party_db`), tables, and default seed accounts on first run:
```bash
npm start
```
The server will start at: **`http://localhost:3000`**

---

## 🔐 Default Login Credentials

| Role | Email | Password | Allowed Capabilities |
| :--- | :--- | :--- | :--- |
| **👑 Super Admin** | `admin@fresher.party` | `admin123` | Full Access: Import Excel, Student Records, Pass Generation, Bulk Emailing, Gate Scanner, Volunteer Management, Settings |
| **🛡️ Gate Volunteer** | `volunteer@fresher.party` | `volunteer123` | Gate Scanner Platform + Student Directory: Scan QR passes with camera, search student list by Name/Roll, view student details & QR pass, Accept/Reject gate entry |

*(You can also use the one-click **"Fill Admin"** and **"Fill Volunteer"** buttons on the login screen).*

---

## 🌟 Key Features & Workflow

### 1. 📥 Excel Sheet Student Data Import (`/students.html`)
- **Drag & Drop Upload**: Supports `.xlsx`, `.xls`, and `.csv` files.
- **Flexible Column Headers**: Standardizes names like `Name`, `Roll No`, `PRN No`, `Department`, `Email`, and `Phone`.
- **Automatic Pass Generation**: During import, each student is automatically assigned a unique cryptographic token (`FP26-XXXX...`) and a high-resolution QR code image.
- **Sample Template Download**: Click **"Sample Excel Template"** to download a ready-to-use template (`fresher_students_sample.xlsx`).
- **Student Roster Management**: Search by Name, Roll No, PRN, or Email; filter by Department, Entry Status, and Mail Status.
- **Admin Authority to Edit Student Details & Email**: Even after a QR code is generated, admins can click the **Edit** (✏️) icon to update the student's email address, name, roll no, PRN, or department. The system auto-refreshes the QR code with the new details and can immediately re-send the pass to the updated email address! Admins can also issue a brand new QR token if an old pass was lost or compromised.

### 2. 🎟️ QR Pass Generator & Email Dispatch Center (`/passes.html`)
*The dedicated page for pass generation and email dispatching.*
- **Automated Email Dispatch**: Broadcast passes to all pending students in throttled batches to avoid mail server rate limits.
- **Real-Time Progress & Console**: Displays live progress (0% → 100%), delivery status, and logs.
- **Pass Cards & Preview**: Inspect individual passes, preview the exact HTML email that students receive, or download the QR code image.
- **Email Delivery & Simulation**: Runs in instant **Simulation Mode** if SMTP is not configured, or sends real emails via Gmail/Custom SMTP configured directly from the dashboard.

### 3. 📸 Volunteer Gate Scanner Platform (`/scanner.html`)
*Optimized for mobile phones, tablets, and laptops at the gate entrance.*
- **Live Camera Scanner**: High-speed camera recognition using `html5-qrcode` with rear/front camera selection and laser reticle.
- **Fallback Manual Search**: Type Roll No, PRN, or Token if a student's phone screen is cracked or reflective.
- **Audio Feedback**: Synthesized audio chimes for valid passes and warning buzzers for duplicate/rejected attempts.
- **Instant Student Verification Card**:
  - Displays **Student Name**, **Roll No**, **PRN No**, **Department**, and **Email**.
  - Checks MySQL database instantly.
- **The 2 Gate Action Buttons**:
  - 🟢 **ACCEPT ENTRY**: Marks the student as admitted (`entry_status = 'accepted'`), timestamps the entry, and records the volunteer ID.
  - 🔴 **CANCEL / REJECT**: Prompts for a reason (e.g. *No College ID proof*, *Dress code violation*) and marks the pass as rejected.
- **Re-Entry & Duplicate Protection**: If a previously admitted student tries to re-enter with the same pass, the system flashes a pulsing warning:
  > **⚠️ DUPLICATE SCAN: PASS ALREADY ADMITTED!**
  > Shows exact time and name of the volunteer who admitted them.

### 4. 📱 Student Digital Pass View (`/pass.html?token=...`)
- Students clicking the link in their pass email receive a mobile-optimized VIP Pass card with a holographic border, event venue & timing, and live gate admittance status badge.

### 5. 👥 Gate Volunteers Management (`/volunteers.html`)
- Administrators can create dedicated volunteer accounts with custom email and password.
- Live audit tracker showing total scans, accepted entries, and rejections handled by each volunteer.

---

## 🔒 Security Architecture

1. **Password Encryption**: All user passwords hashed using `bcryptjs` with salt rounds = 10.
2. **Session Security**: Stateless `jsonwebtoken` (JWT) with 7-day expiration and `httpOnly` secure cookies.
3. **Role-Based Access Control (RBAC)**: Volunteer accounts are strictly restricted from viewing administrative student databases, updating rosters, or altering SMTP settings.
4. **Tamper-Proof QR Tokens**: Passes use high-entropy cryptographically unique UUID tokens, preventing students from guessing or spoofing another student's pass.
5. **Gate Audit Logs**: Every scan, entry acceptance, rejection, and duplicate re-scan attempt is recorded in the `scan_logs` MySQL table with foreign keys, timestamps, and operator IDs.

---

## 📂 Project Architecture

```
freshers/
├── .env                     # Configuration (Port, DB, JWT, Event info)
├── package.json             # Dependencies and start scripts
├── server.js                # Express application entrypoint
├── src/
│   ├── db.js                # MySQL pool connection and auto-migration schema
│   ├── auth.js              # JWT authentication & RBAC middleware
│   ├── routes/
│   │   ├── authRoutes.js      # Login, logout, profile
│   │   ├── studentRoutes.js   # Excel import, student CRUD, sample download
│   │   ├── emailRoutes.js     # Pass email dispatching, batches, SMTP test
│   │   ├── scanRoutes.js      # Gate QR lookup, Accept/Reject actions, scan logs
│   │   ├── dashboardRoutes.js # Real-time statistics & KPIs
│   │   ├── volunteerRoutes.js # Volunteer accounts management
│   │   ├── settingsRoutes.js  # Event & SMTP settings
│   │   └── publicRoutes.js    # Student pass public view
│   └── utils/
│       ├── qrHelper.js        # Token generation & QR image rendering
│       ├── excelHelper.js     # Excel parsing & sample file generator
│       └── emailHelper.js     # Responsive VIP email HTML generator & transport
├── public/
│   ├── index.html           # Auth router
│   ├── login.html           # Modern glassmorphism login portal
│   ├── dashboard.html       # Admin control panel with KPI cards & feeds
│   ├── students.html        # Excel import & student database table
│   ├── passes.html          # Dedicated QR Pass & Email Dispatch Center
│   ├── scanner.html         # Volunteer Gate Scanner (Camera + Accept/Reject)
│   ├── volunteers.html      # Volunteer account manager
│   ├── pass.html            # Public student VIP pass card
│   ├── css/style.css        # Custom styles, laser animations, themes
│   └── js/
│       ├── api.js           # API client, tokens, and toast notifications
│       └── audioHelper.js   # Web Audio API sound synthesizer
└── sample/
    └── sample_students.xlsx # Sample Excel file for immediate testing
```

