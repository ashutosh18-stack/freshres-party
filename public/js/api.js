// Global API and Auth Helper
const API = {
  getToken() {
    return localStorage.getItem('fp_token');
  },

  getUser() {
    try {
      const u = localStorage.getItem('fp_user');
      return u ? JSON.parse(u) : null;
    } catch (e) {
      return null;
    }
  },

  setAuth(token, user) {
    localStorage.setItem('fp_token', token);
    localStorage.setItem('fp_user', JSON.stringify(user));
  },

  clearAuth() {
    localStorage.removeItem('fp_token');
    localStorage.removeItem('fp_user');
    localStorage.removeItem('fullscreen_locked');
    localStorage.removeItem('dashboard_manual_exit');
  },

  async request(url, options = {}) {
    const token = this.getToken();
    const headers = options.headers || {};

    // Don't set Content-Type for FormData (multipart)
    if (!(options.body instanceof FormData)) {
      if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, { ...options, headers });
      
      if (response.status === 401) {
        this.clearAuth();
        if (!window.location.pathname.endsWith('login.html')) {
          window.location.href = '/login.html';
        }
        throw new Error('Session expired. Please log in again.');
      }

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || `Request failed with status ${response.status}`);
      }

      return data;
    } catch (err) {
      throw err;
    }
  },

  async logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {}
    this.clearAuth();
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
    window.location.href = '/login.html';
  },

  requireAuth(adminOnly = false) {
    const token = this.getToken();
    const user = this.getUser();

    if (!token || !user) {
      window.location.href = '/login.html';
      return false;
    }

    if (adminOnly && user.role !== 'admin') {
      API.toast('Access denied: Admins only', 'error');
      setTimeout(() => {
        window.location.href = '/scanner.html';
      }, 1000);
      return false;
    }

    return true;
  },

  // Toast Notification System
  toast(message, type = 'info', duration = 3500) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'fixed top-5 right-5 z-50 flex flex-col gap-2 max-w-sm pointer-events-none';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    const toastBorder = {
      success: 'border-emerald-300 text-emerald-900',
      error: 'border-rose-300 text-rose-900',
      warning: 'border-amber-300 text-amber-900',
      info: 'border-blue-300 text-blue-900'
    };

    const icons = {
      success: 'fa-circle-check text-emerald-600',
      error: 'fa-circle-xmark text-rose-600',
      warning: 'fa-triangle-exclamation text-amber-600',
      info: 'fa-circle-info text-blue-600'
    };

    toast.className = `flex items-center gap-3 px-4 py-3 rounded-xl border bg-white shadow-lg transition-all duration-300 transform translate-y-2 opacity-0 pointer-events-auto ${toastBorder[type] || toastBorder.info}`;
    toast.innerHTML = `
      <i class="fa-solid ${icons[type] || icons.info} text-base"></i>
      <span class="text-sm font-medium flex-1 text-slate-800">${message}</span>
      <button class="text-slate-400 hover:text-slate-600 transition" onclick="this.parentElement.remove()">
        <i class="fa-solid fa-xmark text-xs"></i>
      </button>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.remove('translate-y-2', 'opacity-0');
    }, 10);

    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-x-4');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  // Setup navigation user badge & logout hook
  setupNav() {
    const user = this.getUser();
    if (!user) return;

    const nameEl = document.getElementById('nav-user-name');
    const roleEl = document.getElementById('nav-user-role');
    const avatarEl = document.getElementById('nav-user-avatar');

    if (nameEl) nameEl.textContent = user.name;
    if (roleEl) {
      roleEl.textContent = user.role.toUpperCase();
      roleEl.className = `text-[10px] font-bold px-2 py-0.5 rounded-full ${
        user.role === 'admin' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-slate-100 text-slate-700 border border-slate-200'
      }`;
    }
    if (avatarEl) {
      avatarEl.textContent = user.name.charAt(0).toUpperCase();
      avatarEl.className = 'w-8 h-8 rounded-lg bg-blue-600 text-white font-bold flex items-center justify-center text-xs shrink-0';
    }

    // Hide admin-only menu items for volunteers
    if (user.role !== 'admin') {
      document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
    }

    // Bind logout button
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        API.logout();
      });
    }

    // ── Responsive Sidebar Setup ──────────────────────────────────────────────
    // Desktop (≥1024px) : sidebar is sticky in normal flow — CSS only, no JS
    // Tablet  (768–1023): sidebar fixed overlay, starts open, manual toggle button
    // Mobile  (<768px)  : sidebar fixed overlay, starts hidden, hamburger opens it

    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    const main = document.getElementById('main-content') || document.querySelector('main');
    if (main && !main.id) main.id = 'main-content';

    // ── Show mobile header on small screens ──
    const mobileHeader = document.querySelector('.mobile-top-header');
    const applyMobileHeader = () => {
      if (!mobileHeader) return;
      if (window.innerWidth < 768) {
        mobileHeader.style.display = 'flex';
        if (main) main.style.paddingTop = '3.5rem'; // make room for fixed header
      } else {
        mobileHeader.style.display = 'none';
        if (main) main.style.paddingTop = '';
      }
    };
    applyMobileHeader();

    // ── Create backdrop (mobile only) ──
    let backdrop = document.getElementById('sidebar-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'sidebar-backdrop';
      backdrop.className = 'sidebar-overlay';
      document.body.appendChild(backdrop);
    }

    // ── Create tablet toggle button ──
    let tabletBtn = document.getElementById('tablet-sidebar-toggle');
    if (!tabletBtn) {
      tabletBtn = document.createElement('button');
      tabletBtn.id = 'tablet-sidebar-toggle';
      tabletBtn.setAttribute('aria-label', 'Toggle Sidebar');
      tabletBtn.innerHTML = '<i class="fa-solid fa-bars-staggered"></i>';
      document.body.appendChild(tabletBtn);
    }

    // ── Viewport breakpoint helpers ──
    const isTablet = () => window.innerWidth >= 768 && window.innerWidth < 1024;
    const isMobile = () => window.innerWidth < 768;

    // ── Tablet: open (sidebar slides in, content shrinks) ──
    const tabletOpen = () => {
      sidebar.classList.remove('sidebar-hidden');
      document.body.classList.remove('sidebar-is-hidden');
      if (main) main.classList.remove('sidebar-hidden-content');
      tabletBtn.innerHTML = '<i class="fa-solid fa-chevron-left text-xs"></i>';
      tabletBtn.title = 'Hide Sidebar';
    };

    // ── Tablet: close (sidebar slides out, content expands) ──
    const tabletClose = () => {
      sidebar.classList.add('sidebar-hidden');
      document.body.classList.add('sidebar-is-hidden');
      if (main) main.classList.add('sidebar-hidden-content');
      tabletBtn.innerHTML = '<i class="fa-solid fa-bars-staggered"></i>';
      tabletBtn.title = 'Show Sidebar';
    };

    // ── Mobile: open (slides in over content, backdrop appears) ──
    const mobileOpen = () => {
      sidebar.classList.add('sidebar-open');
      backdrop.classList.add('visible');
      document.body.style.overflow = 'hidden';
    };

    // ── Mobile: close ──
    const mobileClose = () => {
      sidebar.classList.remove('sidebar-open');
      backdrop.classList.remove('visible');
      document.body.style.overflow = '';
    };

    // ── Initialize state for current viewport ──
    const initSidebarState = () => {
      sidebar.classList.remove('sidebar-open', 'sidebar-hidden');
      document.body.classList.remove('sidebar-is-hidden');
      if (main) main.classList.remove('sidebar-hidden-content');
      backdrop.classList.remove('visible');
      document.body.style.overflow = '';
      applyMobileHeader();

      if (isTablet()) {
        // Tablet: open by default
        tabletBtn.innerHTML = '<i class="fa-solid fa-chevron-left text-xs"></i>';
        tabletBtn.title = 'Hide Sidebar';
      }
      // Desktop & Mobile: CSS handles the rest
    };

    initSidebarState();

    // ── Tablet toggle button ──
    tabletBtn.addEventListener('click', () => {
      if (!isTablet()) return;
      if (sidebar.classList.contains('sidebar-hidden')) {
        tabletOpen();
      } else {
        tabletClose();
      }
    });

    // ── Mobile hamburger ──
    const mobileToggle = document.getElementById('mobile-menu-toggle');
    if (mobileToggle) {
      mobileToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!isMobile()) return;
        if (sidebar.classList.contains('sidebar-open')) {
          mobileClose();
        } else {
          mobileOpen();
        }
      });
    }

    // ── Backdrop closes mobile sidebar ──
    backdrop.addEventListener('click', () => {
      if (isMobile()) mobileClose();
    });

    // ── Nav links close sidebar on mobile ──
    sidebar.querySelectorAll('nav a').forEach(link => {
      link.addEventListener('click', () => {
        if (isMobile()) mobileClose();
      });
    });

    // ── Re-init on window resize ──
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(initSidebarState, 100);
    });

    // ── Fullscreen System Initialization ──
    this.initFullScreenSystem();
  },

  isDashboard() {
    const p = window.location.pathname.toLowerCase();
    return p.endsWith('/dashboard.html') || p.endsWith('/dashboard') || p === '/dashboard.html';
  },

  requestFullScreen() {
    const docEl = document.documentElement;
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      if (docEl.requestFullscreen) {
        return docEl.requestFullscreen().catch(() => {});
      } else if (docEl.webkitRequestFullscreen) {
        return docEl.webkitRequestFullscreen();
      }
    }
  },

  exitFullScreen() {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      if (document.exitFullscreen) {
        return document.exitFullscreen().catch(() => {});
      } else if (document.webkitExitFullscreen) {
        return document.webkitExitFullscreen();
      }
    }
  },

  toggleFullScreen() {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      this.requestFullScreen();
      if (this.isDashboard()) {
        localStorage.removeItem('dashboard_manual_exit');
      }
      this.toast('Full Screen activated', 'info', 1500);
    } else {
      this.exitFullScreen();
      if (this.isDashboard()) {
        localStorage.setItem('dashboard_manual_exit', 'true');
      }
      this.toast('Exited Full Screen', 'info', 1500);
    }
  },

  initFullScreenSystem() {
    const p = window.location.pathname.toLowerCase();
    const isLogin = p.endsWith('/login.html') || p.endsWith('/login') || p.endsWith('/index.html') || p === '/';
    const isPublicPass = p.includes('pass.html') || p.startsWith('/pass/');
    if (isLogin || isPublicPass) return;

    const isDash = this.isDashboard();

    if (!isDash) {
      // 1. On non-dashboard pages, remove any Fullscreen toggle buttons (only dashboard keeps it)
      document.querySelectorAll('.btn-fullscreen-toggle').forEach(btn => btn.remove());

      // 2. Clear dashboard manual exit flag on navigation to other pages
      localStorage.removeItem('dashboard_manual_exit');

      // 3. Enforce Full Screen Lock
      this.enforceFullScreenLock();
    } else {
      // On dashboard: keep the fullscreen and exit fullscreen toggle buttons
      this.initDashboardFullScreenButtons();

      // If user hasn't explicitly exited on dashboard, attempt fullscreen automatically
      if (!localStorage.getItem('dashboard_manual_exit')) {
        this.requestFullScreen();
      }
    }
  },

  initDashboardFullScreenButtons() {
    const updateIcons = () => {
      const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
      document.querySelectorAll('.btn-fullscreen-toggle').forEach(btn => {
        const icon = btn.querySelector('i');
        const text = btn.querySelector('.fs-text');
        if (icon) {
          icon.className = isFS ? 'fa-solid fa-compress text-blue-600' : 'fa-solid fa-expand text-blue-600';
        }
        if (text) {
          text.textContent = isFS ? 'Exit Full Screen' : 'Full Screen';
        }
        btn.title = isFS ? 'Exit Full Screen' : 'Full Screen';
      });
    };

    document.querySelectorAll('.btn-fullscreen-toggle').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.toggleFullScreen();
      });
    });

    document.addEventListener('fullscreenchange', updateIcons);
    document.addEventListener('webkitfullscreenchange', updateIcons);
    updateIcons();
  },

  enforceFullScreenLock() {
    // Attempt fullscreen immediately
    this.requestFullScreen();

    // Create fullscreen lock modal overlay if not exists
    let overlay = document.getElementById('fs-lock-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'fs-lock-overlay';
      overlay.style.cssText = 'position:fixed; inset:0; z-index:9999999; background:rgba(15,23,42,0.96); backdrop-filter:blur(10px); display:none; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:24px; color:#ffffff; cursor:pointer; user-select:none;';
      overlay.innerHTML = `
        <div style="width:72px; height:72px; border-radius:50%; background:#2563eb; display:flex; align-items:center; justify-content:center; margin-bottom:18px; box-shadow:0 0 30px rgba(37,99,235,0.5);">
          <i class="fa-solid fa-expand" style="font-size:28px; color:#ffffff;"></i>
        </div>
        <h2 style="font-size:22px; font-weight:800; margin-bottom:8px; letter-spacing:0.5px;">Full Screen Mode Locked</h2>
        <p style="font-size:13px; color:#94a3b8; max-width:380px; margin-bottom:24px; line-height:1.6;">
          This gate platform is locked to full screen mode for security and operations.
        </p>
        <button style="padding:13px 32px; background:#2563eb; color:#ffffff; font-weight:800; font-size:14px; border:none; border-radius:14px; display:inline-flex; align-items:center; gap:10px; cursor:pointer; box-shadow:0 6px 18px rgba(37,99,235,0.4);">
          <i class="fa-solid fa-lock"></i> Tap Anywhere to Resume Full Screen
        </button>
      `;
      document.body.appendChild(overlay);

      // Clicking anywhere on the overlay re-enters fullscreen
      overlay.addEventListener('click', (e) => {
        e.stopPropagation();
        this.requestFullScreen();
      });
    }

    const checkLockState = () => {
      const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
      if (!isFS) {
        overlay.style.display = 'flex';
      } else {
        overlay.style.display = 'none';
        // Attempt keyboard lock on Escape if supported
        if (navigator.keyboard && navigator.keyboard.lock) {
          navigator.keyboard.lock(['Escape']).catch(() => {});
        }
      }
    };

    document.addEventListener('fullscreenchange', checkLockState);
    document.addEventListener('webkitfullscreenchange', checkLockState);

    // Any touch/click interaction on window ensures fullscreen if not already in fullscreen
    window.addEventListener('click', () => {
      const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
      if (!isFS) {
        this.requestFullScreen();
      }
    }, { capture: true });

    window.addEventListener('touchstart', () => {
      const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
      if (!isFS) {
        this.requestFullScreen();
      }
    }, { capture: true });

    // Initial check after short delay
    setTimeout(checkLockState, 300);
  }
};

// Automatic startup of Fullscreen system on document ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => API.initFullScreenSystem());
} else {
  API.initFullScreenSystem();
}

window.API = API;

