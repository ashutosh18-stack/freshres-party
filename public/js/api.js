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
  }
};

window.API = API;

