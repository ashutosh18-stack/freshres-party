/**
 * Fixes navbar HTML structure for responsive sidebar in all pages.
 * Run once: node scripts/fix_nav.js
 */
const fs = require('fs');
const path = require('path');

const pages = [
  { file: 'passes.html',    label: 'QR Passes & Email',   icon: 'fa-ticket-simple',   activeLink: 'passes.html' },
  { file: 'students.html',  label: 'Student Directory',   icon: 'fa-users-viewfinder', activeLink: 'students.html' },
  { file: 'scanner.html',   label: 'Gate Scanner',        icon: 'fa-qrcode',           activeLink: 'scanner.html' },
  { file: 'volunteers.html',label: 'Gate Volunteers',     icon: 'fa-users-gear',       activeLink: 'volunteers.html' },
];

// Sidebar HTML template (same for every page, only active link changes)
function buildSidebar(activeLink) {
  const links = [
    { href: '/dashboard.html',  icon: 'fa-chart-pie',          label: 'Dashboard',         adminOnly: false },
    { href: '/students.html',   icon: 'fa-users-viewfinder',   label: 'Student Directory', adminOnly: false },
    { href: '/passes.html',     icon: 'fa-envelope-open-text', label: 'QR Passes & Email', adminOnly: true  },
    { href: '/scanner.html',    icon: 'fa-qrcode',             label: 'Gate Scanner',      adminOnly: false },
    { href: '/volunteers.html', icon: 'fa-users-gear',         label: 'Gate Volunteers',   adminOnly: true  },
  ];

  const navItems = links.map(l => {
    const isActive = l.href.includes(activeLink);
    const cls = isActive
      ? 'flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 transition'
      : 'flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition';
    const iconCls = isActive ? `fa-solid ${l.icon} w-5 text-blue-600 text-center` : `fa-solid ${l.icon} w-5 text-slate-500 text-center`;
    const spanCls = isActive ? 'font-semibold' : '';
    const adminCls = l.adminOnly ? ' admin-only' : '';
    return `        <a href="${l.href}" class="${cls}${adminCls}">
          <i class="${iconCls}"></i>
          <span class="${spanCls}">${l.label}</span>
        </a>`;
  }).join('\n');

  return navItems;
}

// The fixed body+header+sidebar+main block to replace the old one
function buildNewStructure(pageLabel, iconClass, activeLink, extraHeaderItems = '') {
  return `<body class="bg-slate-50 text-slate-900 antialiased" style="display:flex; flex-direction:row; min-height:100vh;">

  <!-- Mobile Top Header (hidden tablet+ via CSS) -->
  <header class="mobile-top-header" style="display:none; position:fixed; top:0; left:0; right:0; z-index:60; background:#fff; border-bottom:1px solid #e2e8f0; padding:0.875rem 1rem; align-items:center; justify-content:space-between; box-shadow:0 1px 4px rgba(15,23,42,0.07);">
    <div style="display:flex; align-items:center; gap:0.75rem;">
      <div style="width:2.25rem; height:2.25rem; border-radius:0.75rem; background:#2563eb; display:flex; align-items:center; justify-content:center;">
        <i class="fa-solid ${iconClass}" style="color:#fff; font-size:0.85rem;"></i>
      </div>
      <div>
        <span style="font-weight:800; font-size:0.95rem; color:#0f172a; display:block; line-height:1.2;">Fresher Fiesta</span>
        <span style="font-size:0.65rem; color:#64748b; font-weight:500;">${pageLabel}</span>
      </div>
    </div>
    <div style="display:flex; align-items:center; gap:0.5rem;">
      ${extraHeaderItems}
      <button id="mobile-menu-toggle" style="padding:0.5rem; background:none; border:none; cursor:pointer; color:#475569;" aria-label="Toggle Navigation">
        <i class="fa-solid fa-bars" style="font-size:1.25rem;"></i>
      </button>
    </div>
  </header>

  <!-- Sidebar -->
  <aside id="sidebar" class="flex flex-col justify-between bg-white border-r border-slate-200">
    <div>
      <!-- Brand -->
      <div class="p-6 border-b border-slate-100 flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm">
          <i class="fa-solid ${iconClass} text-base"></i>
        </div>
        <div>
          <h2 class="font-extrabold text-base text-slate-900 leading-none">Fresher Fiesta</h2>
          <span class="text-[11px] text-slate-500 font-medium">Entry Gate Platform</span>
        </div>
      </div>

      <!-- Navigation -->
      <nav class="p-4 space-y-1.5 text-sm font-medium">
${buildSidebar(activeLink)}
      </nav>
    </div>

    <!-- User Profile & Logout -->
    <div class="p-4 border-t border-slate-100 bg-slate-50/50">
      <div class="flex items-center justify-between mb-3 px-1">
        <div class="flex items-center gap-2.5 overflow-hidden">
          <div id="nav-user-avatar" class="w-8 h-8 rounded-lg bg-blue-600 text-white font-bold flex items-center justify-center text-xs shrink-0">A</div>
          <div class="overflow-hidden">
            <p id="nav-user-name" class="text-xs font-bold text-slate-900 truncate">Admin</p>
            <span id="nav-user-role" class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">ADMIN</span>
          </div>
        </div>
      </div>
      <button id="btn-logout" class="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-slate-600 hover:text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded-xl transition">
        <i class="fa-solid fa-arrow-right-from-bracket text-slate-500"></i>
        <span>Sign Out</span>
      </button>
    </div>
  </aside>

  <!-- Main Content Area -->
  <main id="main-content" class="flex flex-col min-w-0 overflow-y-auto" style="flex:1;">`;
}

const pubDir = path.join(__dirname, '..', 'public');

// passes.html
{
  const filePath = path.join(pubDir, 'passes.html');
  let html = fs.readFileSync(filePath, 'utf8');

  // Replace old body opening through old aside+main opening
  const oldBodyStart = /<body class="bg-slate-50 text-slate-900 min-h-screen flex flex-col md:flex-row antialiased">/;
  // Find where the old <aside> ends and old <main> starts
  const oldMainOpen = /<main class="flex-1 flex flex-col min-w-0 overflow-y-auto">/;

  // Extract everything between end of old <main> opening and </body>
  const mainIdx = html.indexOf('<main class="flex-1 flex flex-col min-w-0 overflow-y-auto">');
  if (mainIdx === -1) {
    console.log('passes.html: could not find old main tag - skipping');
  } else {
    const beforeBodyEnd = html.substring(0, html.indexOf('<body'));
    const afterMain = html.substring(mainIdx + '<main class="flex-1 flex flex-col min-w-0 overflow-y-auto">'.length);
    const newBlock = buildNewStructure('QR Passes & Email', 'fa-ticket-simple', 'passes.html');
    html = beforeBodyEnd + newBlock + '\n' + afterMain;
    fs.writeFileSync(filePath, html);
    console.log('passes.html updated');
  }
}

// students.html
{
  const filePath = path.join(pubDir, 'students.html');
  let html = fs.readFileSync(filePath, 'utf8');
  const mainIdx = html.indexOf('<main class="flex-1 flex flex-col min-w-0 overflow-y-auto">');
  if (mainIdx === -1) {
    console.log('students.html: could not find old main tag - skipping');
  } else {
    const beforeBodyEnd = html.substring(0, html.indexOf('<body'));
    const afterMain = html.substring(mainIdx + '<main class="flex-1 flex flex-col min-w-0 overflow-y-auto">'.length);
    const newBlock = buildNewStructure('Student Directory', 'fa-users-viewfinder', 'students.html');
    html = beforeBodyEnd + newBlock + '\n' + afterMain;
    fs.writeFileSync(filePath, html);
    console.log('students.html updated');
  }
}

// volunteers.html
{
  const filePath = path.join(pubDir, 'volunteers.html');
  let html = fs.readFileSync(filePath, 'utf8');
  const mainIdx = html.indexOf('<main class="flex-1 flex flex-col min-w-0 overflow-y-auto">');
  if (mainIdx === -1) {
    console.log('volunteers.html: could not find old main tag - skipping');
  } else {
    const beforeBodyEnd = html.substring(0, html.indexOf('<body'));
    const afterMain = html.substring(mainIdx + '<main class="flex-1 flex flex-col min-w-0 overflow-y-auto">'.length);
    const newBlock = buildNewStructure('Gate Volunteers', 'fa-users-gear', 'volunteers.html');
    html = beforeBodyEnd + newBlock + '\n' + afterMain;
    fs.writeFileSync(filePath, html);
    console.log('volunteers.html updated');
  }
}

// scanner.html — has extra buttons in header (audio, users)
{
  const filePath = path.join(pubDir, 'scanner.html');
  let html = fs.readFileSync(filePath, 'utf8');
  // scanner has a different main tag
  const mainIdx = html.indexOf('<main class="flex-1 flex flex-col min-w-0 overflow-y-auto">');
  if (mainIdx === -1) {
    console.log('scanner.html: could not find old main tag - skipping');
  } else {
    const beforeBodyEnd = html.substring(0, html.indexOf('<body'));
    const afterMain = html.substring(mainIdx + '<main class="flex-1 flex flex-col min-w-0 overflow-y-auto">'.length);
    // scanner has extra header items: audio toggle + volunteers link
    const extraItems = `<a href="/volunteers.html" title="Volunteers" style="padding:0.5rem; display:flex; align-items:center; justify-content:center; border-radius:0.625rem; background:#f1f5f9; color:#2563eb;"><i class="fa-solid fa-users text-xs"></i></a>
      <button onclick="toggleAudio()" id="btnMobileSound" style="padding:0.5rem; border-radius:0.625rem; background:#f1f5f9; border:none; cursor:pointer;" aria-label="Toggle Sound"><i class="fa-solid fa-volume-high" id="mobileSoundIcon" style="font-size:0.75rem; color:#2563eb;"></i></button>`;
    const newBlock = buildNewStructure('Gate Scanner', 'fa-qrcode', 'scanner.html', extraItems);
    html = beforeBodyEnd + newBlock + '\n' + afterMain;
    fs.writeFileSync(filePath, html);
    console.log('scanner.html updated');
  }
}

console.log('\nAll pages updated successfully!');

