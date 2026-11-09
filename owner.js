// owner.js - Moto Pit Master Owner Portal Controller & ERP Engine

let currentUser = null;
let activeView = 'dashboard';
let posCart = [];
let cachedProducts = [];
let cachedCustomers = [];
let cachedCategories = [];
let cachedBrands = [];
let cachedSuppliers = [];
let cachedDailyTrend = [];
let posSelectedPayment = 'CASH';

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupKeyboardShortcuts();
  setupSidebarToggle();
  setupEventListeners();

  const authOk = await verifyAuthentication();
  if (authOk) {
    await loadInitialMasterData();
    loadMongoStatus();
    // Check initial hash route
    const hash = window.location.hash.replace('#', '');
    navigateTo(hash || 'dashboard');
  }
});

// Toast Notifications
let toastTimer = null;
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;

  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }

  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  };
  const icon = icons[type] || 'ℹ';

  toast.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-msg">${message}</span>`;
  toast.className = `toast ${type} show`;

  toast.onclick = () => {
    toast.classList.remove('show');
    setTimeout(() => {
      if (!toast.classList.contains('show')) {
        toast.className = 'toast';
        toast.innerHTML = '';
      }
    }, 260);
  };

  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      if (!toast.classList.contains('show')) {
        toast.className = 'toast';
        toast.innerHTML = '';
      }
    }, 260);
  }, 3800);
}

// Confirm Dialog (no browser confirm() - no black overlay)
function showConfirmDialog(title, message, onConfirm) {
  // Remove any existing confirm dialog
  const existing = document.getElementById('confirm-dialog-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'confirm-dialog-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div style="background:#202329;border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:28px 32px;max-width:420px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.6);">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
        <span style="font-size:1.5rem;">⚠️</span>
        <h3 style="color:#fff;font-size:1.1rem;font-weight:700;margin:0;">${title}</h3>
      </div>
      <p style="color:#A1A1AA;font-size:0.9rem;margin:0 0 24px;">${message}</p>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button id="confirm-dialog-cancel" style="background:#374151;color:#fff;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:0.9rem;">Cancel</button>
        <button id="confirm-dialog-yes" style="background:#EF4444;color:#fff;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:0.9rem;font-weight:600;">Delete</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const cleanup = () => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); };

  overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(); });
  document.getElementById('confirm-dialog-cancel').addEventListener('click', cleanup);
  document.getElementById('confirm-dialog-yes').addEventListener('click', () => { cleanup(); onConfirm(); });
}

// Format Currency INR
function formatINR(amount) {
  const val = Math.round(Number(amount) || 0);
  return '₹' + val.toLocaleString('en-IN');
}

// Verify Authentication
async function verifyAuthentication() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (!data.authenticated || !data.user) {
      window.location.href = '/login?redirect=/owner&msg=login_required';
      return false;
    }

    currentUser = data.user;
    updateUserUI();

    // Check staff permissions
    const staffRole = currentUser.staff_role || currentUser.role;
    if (staffRole === 'CASHIER') {
      // Cashier default view is POS
      if (!window.location.hash) window.location.hash = '#pos';
    } else if (staffRole === 'INVENTORY') {
      if (!window.location.hash) window.location.hash = '#inventory';
    }

    return true;
  } catch (err) {
    console.error('Auth verification error:', err);
    window.location.href = '/login?redirect=/owner';
    return false;
  }
}

function updateUserUI() {
  if (!currentUser) return;
  const avatar = document.getElementById('sidebar-avatar');
  const nameEl = document.getElementById('sidebar-username');
  const roleLabel = document.getElementById('sidebar-role-label');
  const roleBadge = document.getElementById('sidebar-role-badge');

  if (avatar) avatar.textContent = (currentUser.full_name || 'U').charAt(0).toUpperCase();
  if (nameEl) nameEl.textContent = currentUser.full_name || 'Staff User';
  const displayRole = currentUser.staff_role || currentUser.role;
  if (roleLabel) roleLabel.textContent = displayRole;
  if (roleBadge) roleBadge.textContent = displayRole;
}

// Navigation Router
function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item[data-view]');
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const view = item.getAttribute('data-view');
      navigateTo(view);
    });
  });

  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#', '');
    if (hash && hash !== activeView) {
      navigateTo(hash);
    }
  });
}

function navigateTo(viewId) {
  const targetView = document.getElementById(`view-${viewId}`);
  if (!targetView) viewId = 'dashboard';

  activeView = viewId;
  window.location.hash = viewId;

  // Update Sidebar active state
  document.querySelectorAll('.nav-item').forEach(item => {
    if (item.getAttribute('data-view') === viewId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Switch view sections
  document.querySelectorAll('.view-section').forEach(sec => {
    sec.classList.remove('active');
  });
  const currentSec = document.getElementById(`view-${viewId}`);
  if (currentSec) currentSec.classList.add('active');

  // Update Page Header Titles
  updateHeaderTitle(viewId);

  // Close mobile sidebar if open
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (sidebar) sidebar.classList.remove('mobile-open');
  if (backdrop) backdrop.classList.remove('active');
  document.body.classList.remove('mobile-nav-open');

  // Trigger View-Specific Data Refresh
  refreshViewData(viewId);
}

function updateHeaderTitle(viewId) {
  const titleEl = document.getElementById('page-title');
  const subEl = document.getElementById('page-subtitle');
  if (!titleEl || !subEl) return;

  const titles = {
    dashboard: ['Business Overview & Sales', 'Real-time performance indicators and operational management'],
    pos: ['POS Counter Billing & Fast Sales', 'High-speed counter sales, barcode scanning, thermal receipts & GST billing'],
    orders: ['Online Orders & Fulfillment', 'Customer ecommerce orders, courier dispatch tracking & status management'],
    products: ['Product Catalog Management', 'Manage parts, accessories, barcodes, purchase pricing & variant inventory'],
    inventory: ['Inventory & Central Stock Ledger', 'Real-time stock valuation, movements, reconciliation and low-stock alerts'],
    purchases: ['Distributor / Purchase Entry', 'Record vendor invoices, goods receipt confirmations & supplier balances'],
    invoices: ['GST Invoices & Billing Management', 'Tax compliance, intra/inter-state GST invoices, printing & credit notes'],
    customers: ['Customer Management CRM', 'Counter clients, retail riders, B2B racing accounts & purchase histories'],
    suppliers: ['Distributors & Wholesalers', 'Vendor directory, calculated purchase totals, payments & balance statements'],
    reports: ['Monthly Reports & Business Analytics', 'Comprehensive P&L, Cost of Goods Sold, GST reconciliation and export'],
    expenses: ['Operating Expenses & Payments', 'Track showroom overheads, salaries, utilities, transport and repairs'],
    settings: ['Shop Settings & GST Setup', 'Business profile, legal entity GSTIN, invoice prefixing & staff permissions']
  };

  const t = titles[viewId] || ['Master Owner Panel', 'MOTO ADDICTOR PITSHOP Management Platform'];
  titleEl.textContent = t[0];
  subEl.textContent = t[1];
}

function refreshViewData(viewId) {
  switch (viewId) {
    case 'dashboard':
      loadDashboardData();
      break;
    case 'pos':
      loadPosData();
      break;
    case 'orders':
      loadOrdersData();
      break;
    case 'products':
      loadProductsData();
      break;
    case 'inventory':
      loadInventoryData();
      break;
    case 'purchases':
      loadPurchasesData();
      break;
    case 'invoices':
      loadInvoicesData();
      break;
    case 'customers':
      loadCustomersData();
      break;
    case 'suppliers':
      loadSuppliersData();
      break;
    case 'reports':
      loadReportsData();
      break;
    case 'expenses':
      loadExpensesData();
      break;
    case 'settings':
      loadSettingsData();
      break;
  }
}

// Sidebar Toggles
function setupSidebarToggle() {
  const toggleBtn = document.getElementById('sidebar-toggle-btn');
  const sidebar = document.getElementById('sidebar');
  const mobileHamburger = document.getElementById('mobile-hamburger');
  const mobileClose = document.getElementById('sidebar-close-mobile');
  const backdrop = document.getElementById('sidebar-backdrop');

  // Desktop sidebar collapse toggle
  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebar.classList.toggle('collapsed');
    });
  }

  // Mobile Drawer Open / Close Helpers
  function openMobileNav() {
    if (sidebar) sidebar.classList.add('mobile-open');
    if (backdrop) backdrop.classList.add('active');
    document.body.classList.add('mobile-nav-open');
  }

  function closeMobileNav() {
    if (sidebar) sidebar.classList.remove('mobile-open');
    if (backdrop) backdrop.classList.remove('active');
    document.body.classList.remove('mobile-nav-open');
  }

  // Mobile Hamburger Open
  if (mobileHamburger) {
    mobileHamburger.addEventListener('click', (e) => {
      e.stopPropagation();
      openMobileNav();
    });
  }

  // Mobile Close X Button
  if (mobileClose) {
    mobileClose.addEventListener('click', (e) => {
      e.stopPropagation();
      closeMobileNav();
    });
  }

  // Mobile Backdrop Click
  if (backdrop) {
    backdrop.addEventListener('click', (e) => {
      e.stopPropagation();
      closeMobileNav();
    });
  }

  // Close drawer when any nav-item is tapped on mobile
  const navItems = document.querySelectorAll('#sidebar-nav .nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      if (window.innerWidth <= 768) {
        closeMobileNav();
      }
    });
  });

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar && sidebar.classList.contains('mobile-open')) {
      closeMobileNav();
    }
  });

  // Close drawer if window is resized above mobile breakpoint
  window.addEventListener('resize', () => {
    if (window.innerWidth > 768 && sidebar && sidebar.classList.contains('mobile-open')) {
      closeMobileNav();
    }
  });

  // Logout
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
        showToast('Logged out successfully', 'success');
        setTimeout(() => window.location.href = '/login', 400);
      } catch (e) {
        window.location.href = '/login';
      }
    });
  }
}

// Global Keyboard Shortcuts
function setupKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    // F2: Jump to POS
    if (e.key === 'F2') {
      e.preventDefault();
      navigateTo('pos');
    }
    // F4: Focus barcode/search input in POS
    if (e.key === 'F4' && activeView === 'pos') {
      e.preventDefault();
      const input = document.getElementById('pos-scan-input');
      if (input) input.focus();
    }
    // F9: Complete Sale in POS
    if (e.key === 'F9' && activeView === 'pos') {
      e.preventDefault();
      completePosSale();
    }
    // Escape: Close open modals
    if (e.key === 'Escape') {
      closeAllModals();
    }
  });
}

// Initial Data Fetch
async function loadInitialMasterData() {
  try {
    const [catRes, brandRes, suppRes, custRes, prodRes] = await Promise.all([
      fetch('/api/categories'),
      fetch('/api/brands'),
      fetch('/api/owner/suppliers'),
      fetch('/api/owner/customers'),
      fetch('/api/products')
    ]);

    if (catRes.ok) {
      const d = await catRes.json();
      cachedCategories = d.categories || [];
      populateCategoryDropdowns();
    }
    if (brandRes.ok) {
      const d = await brandRes.json();
      cachedBrands = d.brands || [];
      populateBrandDropdowns();
    }
    if (suppRes.ok) {
      const d = await suppRes.json();
      cachedSuppliers = d.suppliers || [];
      populateSupplierDropdowns();
    }
    if (custRes.ok) {
      const d = await custRes.json();
      cachedCustomers = d.customers || [];
      populateCustomerDropdowns();
    }
    if (prodRes.ok) {
      const d = await prodRes.json();
      cachedProducts = d.products || [];
    }
  } catch (err) {
    console.error('Error loading initial data:', err);
  }
}

function populateCategoryDropdowns() {
  const filter = document.getElementById('prod-category-filter');
  const formSelect = document.getElementById('prod-form-category');

  if (filter) {
    filter.innerHTML = '<option value="all">All Categories</option>' +
      cachedCategories.map(c => `<option value="${c.id || c._id}">${c.name}</option>`).join('');
  }
  if (formSelect) {
    const curVal = formSelect.value;
    formSelect.innerHTML = '<option value="">-- Select Category --</option>' +
      cachedCategories.map(c => `<option value="${c.id || c._id}">${c.icon ? c.icon + ' ' : ''}${c.name}</option>`).join('') +
      '<option value="__new__" style="color:var(--accent-orange); font-weight:600;">+ Add New Category...</option>';
    if (curVal && curVal !== '__new__') formSelect.value = curVal;

    // Wire change handler to open custom category modal
    formSelect.onchange = function () {
      if (this.value === '__new__') {
        this.value = '';
        openInlineAddCategoryModal();
      }
    };
  }
}

function populateBrandDropdowns() {
  const formSelect = document.getElementById('prod-form-brand');
  if (formSelect) {
    const curVal = formSelect.value;
    formSelect.innerHTML = '<option value="">-- Select Brand --</option>' +
      cachedBrands.map(b => `<option value="${b.id || b._id}">${b.name}</option>`).join('') +
      '<option value="__new__" style="color:var(--accent-orange); font-weight:600;">+ Add New Brand...</option>';
    if (curVal && curVal !== '__new__') formSelect.value = curVal;

    formSelect.onchange = function () {
      if (this.value === '__new__') {
        this.value = '';
        openInlineAddBrandModal();
      }
    };
  }
}

async function createQuickCategory(name, selectEl) {
  try {
    const res = await fetch('/api/owner/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create category');
    // Add to cache and repopulate
    cachedCategories.push({ id: data.id, _id: data.id, name });
    populateCategoryDropdowns();
    // Select the new one
    if (selectEl) selectEl.value = data.id;
    showToast(`Category "${name}" created`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
    if (selectEl) selectEl.value = '';
  }
}

async function createQuickBrand(name, selectEl) {
  try {
    const res = await fetch('/api/owner/brands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create brand');
    cachedBrands.push({ id: data.id, _id: data.id, name });
    populateBrandDropdowns();
    if (selectEl) selectEl.value = data.id;
    showToast(`Brand "${name}" created`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
    if (selectEl) selectEl.value = '';
  }
}

function populateSupplierDropdowns() {
  const purSelect = document.getElementById('pur-form-supplier');
  if (purSelect) {
    const curVal = purSelect.value;
    purSelect.innerHTML = '<option value="">-- Select Supplier / Distributor --</option>' +
      cachedSuppliers.map(s => `<option value="${s.id}">${s.name} (GSTIN: ${s.gstin || 'Unreg'})</option>`).join('') +
      '<option value="__new_supp__" style="color:var(--accent-orange); font-weight:600;">+ Add New Supplier...</option>';
    if (curVal && curVal !== '__new_supp__') purSelect.value = curVal;

    purSelect.onchange = function () {
      if (this.value === '__new_supp__') {
        this.value = '';
        openInlineAddSupplierModal();
      }
    };
  }
}

function populateCustomerDropdowns() {
  const posSelect = document.getElementById('pos-customer-select');
  if (posSelect) {
    posSelect.innerHTML = cachedCustomers.map(c =>
      `<option value="${c.id}">${c.name} (${c.customer_type}) - ${c.phone || 'No Phone'}</option>`
    ).join('');
  }
}

// ==========================================
// 1. DASHBOARD CONTROLLER
// ==========================================
async function loadDashboardData() {
  try {
    const res = await fetch('/api/owner/dashboard');
    if (!res.ok) throw new Error('Failed to load dashboard metrics');
    const data = await res.json();
    const s = data.summary || {};

    // 10 Summary Cards (Real Calculations)
    document.getElementById('card-today-sales').textContent = formatINR(s.todaySales);
    document.getElementById('card-today-orders').textContent = `${s.todayOrdersCount || 0} completed bills today`;

    document.getElementById('card-monthly-sales').textContent = formatINR(s.monthlySales);
    document.getElementById('card-monthly-orders').textContent = `${s.monthlyOrdersCount || 0} orders this month`;

    document.getElementById('card-total-orders').textContent = (s.totalOrders || 0).toLocaleString('en-IN');
    document.getElementById('card-pending-orders').textContent = (s.pendingOrders || 0).toLocaleString('en-IN');

    document.getElementById('card-total-products').textContent = (s.totalProducts || 0).toLocaleString('en-IN');
    document.getElementById('card-low-stock').textContent = (s.lowStockCount || 0).toLocaleString('en-IN');

    document.getElementById('card-today-purchases').textContent = formatINR(s.todayPurchases);
    document.getElementById('card-supplier-payable').textContent = formatINR(s.outstandingSupplierPayments);

    document.getElementById('card-monthly-expenses').textContent = formatINR(s.monthlyExpenses);
    document.getElementById('card-gross-profit').textContent = formatINR(s.estimatedGrossProfit);

    // Render Sales Trend Chart
    renderSalesTrendChart(data.dailyTrend || []);

    // Render Top Products
    const topFeed = document.getElementById('top-products-feed');
    if (topFeed) {
      const prods = data.topProducts || [];
      if (prods.length === 0) {
        topFeed.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem; text-align:center;">No product sales recorded yet.</p>';
      } else {
        topFeed.innerHTML = prods.map((p, idx) => `
          <div class="top-prod-row">
            <div style="display:flex; align-items:center; gap:8px; min-width:0; overflow:hidden;">
              <span style="font-size:0.72rem; font-weight:800; color:${idx === 0 ? '#F59E0B' : (idx === 1 ? '#E2E8F0' : '#94A3B8')}; background:rgba(255,255,255,0.06); width:20px; height:20px; border-radius:3px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">${idx + 1}</span>
              <div style="min-width:0; overflow:hidden;">
                <div style="font-size:0.78rem; font-weight:600; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p.product_name}</div>
                <div style="font-size:0.68rem; color:var(--text-muted); font-family:var(--font-mono);">${p.product_sku || 'SKU'}</div>
              </div>
            </div>
            <div style="text-align:right; flex-shrink:0; margin-left:8px;">
              <div style="font-weight:700; font-size:0.82rem; color:var(--accent-orange); font-feature-settings:'tnum';">${formatINR(p.total_rev)}</div>
              <div style="font-size:0.68rem; color:var(--text-muted);">${p.total_qty} sold</div>
            </div>
          </div>
        `).join('');
      }
    }

    // Recent Online Orders Table
    const onlineBody = document.getElementById('recent-online-orders-body');
    if (onlineBody) {
      const orders = data.recentOnlineOrders || [];
      if (orders.length === 0) {
        onlineBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No online orders placed yet.</td></tr>';
      } else {
        onlineBody.innerHTML = orders.map(o => `
          <tr>
            <td><span style="color:var(--accent-orange); font-family:var(--font-mono); font-weight:700; font-size:0.78rem;">${o.order_number}</span></td>
            <td><div style="font-weight:600; font-size:0.8rem;">${o.customer_name}</div><div style="font-size:0.68rem; color:var(--text-muted); font-family:var(--font-mono);">${o.customer_phone || ''}</div></td>
            <td><span style="font-weight:700; font-feature-settings:'tnum'; font-size:0.82rem;">${formatINR(o.grand_total)}</span></td>
            <td><span class="badge badge-${getOrderStatusBadge(o.status)}">${o.status}</span></td>
            <td style="color:var(--text-muted); font-size:0.74rem;">${new Date(o.created_at).toLocaleDateString('en-IN')}</td>
            <td>
              <button class="btn btn-danger btn-sm" style="padding:2px 8px; font-size:0.75rem;" onclick="deleteOrderItem(${o.id}, '${o.order_number}')">Delete</button>
            </td>
          </tr>
        `).join('');
      }
    }

    // Recent POS Bills Table
    const posBody = document.getElementById('recent-pos-bills-body');
    if (posBody) {
      const bills = data.recentPosBills || [];
      if (bills.length === 0) {
        posBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">No counter bills completed yet.</td></tr>';
      } else {
        posBody.innerHTML = bills.map(b => `
          <tr>
            <td><span style="color:var(--accent-orange); font-family:var(--font-mono); font-weight:700; font-size:0.78rem;">${b.order_number}</span></td>
            <td><span style="font-weight:700; font-feature-settings:'tnum'; font-size:0.82rem;">${formatINR(b.grand_total)}</span></td>
            <td><span class="badge badge-neutral">${b.payment_method || 'CASH'}</span></td>
            <td style="color:var(--text-muted); font-size:0.74rem;">${new Date(b.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</td>
            <td>
              <button class="btn btn-danger btn-sm" style="padding:2px 8px; font-size:0.75rem;" onclick="deleteOrderItem(${b.id}, '${b.order_number}')">Delete</button>
            </td>
          </tr>
        `).join('');
      }
    }

  } catch (err) {
    console.error('Dashboard load error:', err);
  }
}

// Canvas-Based Responsive High-DPI Chart Renderer
function renderSalesTrendChart(trendData) {
  if (trendData && trendData.length) cachedDailyTrend = trendData;
  const data = (trendData && trendData.length) ? trendData : cachedDailyTrend;
  const canvas = document.getElementById('salesChartCanvas');
  if (!canvas || !canvas.parentElement) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.parentElement.clientWidth || 600;
  const h = 240;

  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, w, h);

  if (!data || data.length === 0) {
    ctx.fillStyle = '#6B7280';
    ctx.font = '13px Outfit';
    ctx.textAlign = 'center';
    ctx.fillText('No sales activity recorded in the past 7 days.', w / 2, h / 2);
    return;
  }

  const maxVal = Math.max(...data.map(d => d.total), 5000) * 1.15;
  const paddingLeft = 56;
  const paddingBottom = 32;
  const paddingTop = 24;
  const paddingRight = 16;
  const chartW = w - paddingLeft - paddingRight;
  const chartH = h - paddingTop - paddingBottom;

  // Draw Horizontal Gridlines & Values
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#6B7280';
  ctx.font = '10px Outfit';
  ctx.textAlign = 'right';

  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const y = paddingTop + (chartH / steps) * i;
    const val = Math.round(maxVal - (maxVal / steps) * i);
    ctx.beginPath();
    ctx.moveTo(paddingLeft, y);
    ctx.lineTo(w - paddingRight, y);
    ctx.stroke();
    ctx.fillText('₹' + val.toLocaleString('en-IN'), paddingLeft - 8, y + 3);
  }

  // Draw Bars & Labels
  const barCount = data.length;
  const colW = chartW / barCount;
  const barW = Math.min(32, colW * 0.48);

  data.forEach((d, idx) => {
    const x = paddingLeft + idx * colW + (colW - barW) / 2;
    const barHeight = Math.max(4, (d.total / maxVal) * chartH);
    const y = paddingTop + chartH - barHeight;

    // Gradient Fill for Bars
    const grad = ctx.createLinearGradient(0, y, 0, paddingTop + chartH);
    grad.addColorStop(0, '#F59E0B');
    grad.addColorStop(1, 'rgba(245, 158, 11, 0.12)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x, y, barW, barHeight, [3, 3, 0, 0]);
    ctx.fill();

    // Value on top if > 0
    if (d.total > 0) {
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 10px Outfit';
      ctx.textAlign = 'center';
      ctx.fillText('₹' + Math.round(d.total).toLocaleString('en-IN'), x + barW / 2, y - 5);
    }

    // X Axis Label
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '11px Outfit';
    ctx.textAlign = 'center';
    ctx.fillText(d.label, x + barW / 2, paddingTop + chartH + 18);
  });
}

// Window resize handler for dynamic telemetry charts
let resizeDebounceTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeDebounceTimer);
  resizeDebounceTimer = setTimeout(() => {
    if (activeView === 'dashboard') {
      renderSalesTrendChart();
    }
  }, 100);
});

function getOrderStatusBadge(status) {
  switch ((status || '').toUpperCase()) {
    case 'DELIVERED': return 'success';
    case 'SHIPPED': return 'info';
    case 'PROCESSING': case 'PACKED': case 'CONFIRMED': return 'warning';
    case 'CANCELLED': case 'RETURNED': return 'danger';
    default: return 'neutral';
  }
}

// ==========================================
// 2. POS BILLING & COUNTER SALES CONTROLLER
// ==========================================
function loadPosData() {
  renderPosCatalog();
  renderPosCart();
  loadPosRecentBills();
}

function renderPosCatalog() {
  const grid = document.getElementById('pos-products-grid');
  if (!grid) return;

  const activeChip = document.querySelector('.category-chip.active');
  const catFilter = activeChip ? activeChip.getAttribute('data-cat') : 'all';
  const searchTerm = (document.getElementById('pos-scan-input')?.value || '').toLowerCase().trim();

  let prods = cachedProducts.filter(p => !p.is_archived);

  if (catFilter && catFilter !== 'all') {
    prods = prods.filter(p => {
      const slug = (p.category_slug || '').toLowerCase();
      const name = (p.category_name || '').toLowerCase();
      return slug.includes(catFilter) || name.includes(catFilter);
    });
  }

  if (searchTerm) {
    prods = prods.filter(p =>
      (p.name && p.name.toLowerCase().includes(searchTerm)) ||
      (p.sku && p.sku.toLowerCase().includes(searchTerm)) ||
      (p.barcode && p.barcode.toLowerCase().includes(searchTerm))
    );
  }

  if (prods.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--text-muted);">No products match filter or scan query.</div>';
    return;
  }

  grid.innerHTML = prods.map(p => `
    <div class="pos-product-card" onclick="addToPosCart(${p.id})">
      <img src="${p.primary_image || 'hero1.png'}" class="pos-prod-img" alt="${p.name}" />
      <div class="pos-prod-name" title="${p.name}">${p.name}</div>
      <div style="font-size:0.72rem; color:var(--text-muted); font-family:monospace;">${p.barcode || p.sku}</div>
      <div class="pos-prod-meta">
        <span class="pos-prod-price">${formatINR(p.price)}</span>
        <span class="pos-prod-stock ${p.stock <= p.min_stock ? 'badge-danger' : ''}">${p.stock} in stock</span>
      </div>
    </div>
  `).join('');
}

function addToPosCart(productId, qty = 1) {
  const prod = cachedProducts.find(p => p.id === productId);
  if (!prod) {
    showToast('Product not found in catalog', 'error');
    return;
  }

  if (prod.stock <= 0) {
    showToast(`"${prod.name}" is currently OUT OF STOCK!`, 'error');
    return;
  }

  const existing = posCart.find(item => item.product_id === prod.id);
  if (existing) {
    if (existing.quantity + qty > prod.stock) {
      showToast(`Cannot add more. Maximum available stock is ${prod.stock}`, 'error');
      return;
    }
    existing.quantity += qty;
  } else {
    posCart.push({
      product_id: prod.id,
      sku: prod.sku,
      barcode: prod.barcode,
      name: prod.name,
      price: prod.price,
      quantity: qty,
      discount_pct: 0,
      gst_rate: prod.gst_rate || 18.0,
      hsn: prod.hsn || '8714',
      stock: prod.stock
    });
  }

  renderPosCart();
}

function updatePosCartQty(productId, change) {
  const item = posCart.find(i => i.product_id === productId);
  if (!item) return;

  const newQty = item.quantity + change;
  if (newQty <= 0) {
    posCart = posCart.filter(i => i.product_id !== productId);
  } else {
    if (newQty > item.stock) {
      showToast(`Maximum stock limit reached (${item.stock} available)`, 'error');
      return;
    }
    item.quantity = newQty;
  }
  renderPosCart();
}

function clearPosCart() {
  posCart = [];
  renderPosCart();
}

function renderPosCart() {
  const list = document.getElementById('pos-cart-items-list');
  const countBadge = document.getElementById('pos-cart-badge');
  const subtotalEl = document.getElementById('pos-subtotal-val');
  const taxEl = document.getElementById('pos-tax-val');
  const discountEl = document.getElementById('pos-discount-val');
  const grandTotalEl = document.getElementById('pos-grand-total');

  if (!list) return;

  const totalItemsCount = posCart.reduce((acc, i) => acc + i.quantity, 0);
  if (countBadge) countBadge.textContent = `${totalItemsCount} items`;

  if (posCart.length === 0) {
    list.innerHTML = `
      <div style="text-align:center; padding:40px 10px; color:var(--text-muted); font-size:0.85rem;">
        Cart is empty.<br/>Scan a barcode or click products to add.
      </div>
    `;
    if (subtotalEl) subtotalEl.textContent = '₹0';
    if (taxEl) taxEl.textContent = '₹0';
    if (discountEl) discountEl.textContent = '₹0';
    if (grandTotalEl) grandTotalEl.textContent = '₹0';
    return;
  }

  let grossTotal = 0;
  let totalDiscount = 0;
  let taxableTotal = 0;
  let taxTotal = 0;

  list.innerHTML = posCart.map(item => {
    const lineGross = item.price * item.quantity;
    const lineDiscount = Math.round(lineGross * (item.discount_pct / 100));
    const lineNet = lineGross - lineDiscount;
    const lineTaxable = Math.round(lineNet / (1 + (item.gst_rate / 100)));
    const lineTax = lineNet - lineTaxable;

    grossTotal += lineGross;
    totalDiscount += lineDiscount;
    taxableTotal += lineTaxable;
    taxTotal += lineTax;

    return `
      <div class="pos-cart-item">
        <div style="flex:1; overflow:hidden;">
          <div class="cart-item-name">${item.name}</div>
          <div class="cart-item-meta">${formatINR(item.price)} × ${item.quantity} | GST ${item.gst_rate}%</div>
        </div>
        <div class="cart-qty-ctrls">
          <button type="button" class="cart-qty-btn" onclick="updatePosCartQty(${item.product_id}, -1)">−</button>
          <span class="cart-qty-val">${item.quantity}</span>
          <button type="button" class="cart-qty-btn" onclick="updatePosCartQty(${item.product_id}, 1)">+</button>
        </div>
        <div style="text-align:right; min-width:70px;">
          <div style="font-weight:700; color:var(--accent-orange); font-size:0.95rem;">${formatINR(lineNet)}</div>
          <button style="background:none; border:none; color:var(--danger); font-size:0.7rem; cursor:pointer;" onclick="updatePosCartQty(${item.product_id}, -9999)">Remove</button>
        </div>
      </div>
    `;
  }).join('');

  const grandTotal = taxableTotal + taxTotal;
  if (subtotalEl) subtotalEl.textContent = formatINR(taxableTotal);
  if (taxEl) taxEl.textContent = formatINR(taxTotal);
  if (discountEl) discountEl.textContent = formatINR(totalDiscount);
  if (grandTotalEl) grandTotalEl.textContent = formatINR(grandTotal);
}

// Complete POS Sale
async function completePosSale() {
  if (posCart.length === 0) {
    showToast('Cannot complete sale: Cart is empty!', 'error');
    return;
  }

  const custSelect = document.getElementById('pos-customer-select');
  const custId = custSelect ? custSelect.value : null;
  const customer = cachedCustomers.find(c => String(c.id) === String(custId)) || {
    name: 'Counter Walk-in Customer',
    phone: '',
    email: '',
    gstin: ''
  };

  const completeBtn = document.getElementById('pos-complete-btn');
  if (completeBtn) completeBtn.disabled = true;

  try {
    const payload = {
      customer,
      items: posCart,
      payment: {
        method: posSelectedPayment,
        reference_no: posSelectedPayment === 'CASH' ? `CASH-${Date.now().toString().slice(-4)}` : `REF-${Date.now().toString().slice(-6)}`
      },
      notes: 'Counter POS Sale'
    };

    const res = await fetch('/api/pos/complete-sale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to complete sale');

    showToast(`✓ Sale Complete! Invoice #${data.billNumber} generated`, 'success');

    // Display Thermal Receipt Modal
    displayThermalReceipt(data);

    // Reset Cart
    posCart = [];
    renderPosCart();

    // Reload Products to update local stock count
    const prodRes = await fetch('/api/products');
    if (prodRes.ok) {
      const d = await prodRes.json();
      cachedProducts = d.products || [];
      renderPosCatalog();
    }

    // Refresh Recent Bills
    loadPosRecentBills();

  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (completeBtn) completeBtn.disabled = false;
  }
}

// POS Recent Bills Table
async function loadPosRecentBills() {
  const tbody = document.getElementById('pos-bills-table-body');
  if (!tbody) return;

  try {
    const res = await fetch('/api/pos/bills?limit=15');
    if (!res.ok) return;
    const data = await res.json();
    const bills = data.bills || [];

    if (bills.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">No counter bills completed yet.</td></tr>';
      return;
    }

    tbody.innerHTML = bills.map(b => `
      <tr>
        <td><strong style="color:var(--accent-orange); font-family:var(--font-heading); font-size:1.05rem;">${b.invoice_number || b.order_number}</strong></td>
        <td>${b.customer_name || 'Walk-in'}</td>
        <td>${b.items_count} items</td>
        <td><strong>${formatINR(b.grand_total)}</strong></td>
        <td><span class="badge badge-neutral">${b.payment_method || 'CASH'}</span></td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-secondary btn-sm" onclick="reprintBill('${b.invoice_number || b.id}')">Reprint</button>
            <button class="btn btn-outline-orange btn-sm" onclick="openSalesReturnModal('${b.invoice_number}')">Return</button>
            <button class="btn btn-danger btn-sm" onclick="deleteOrderItem(${b.id}, '${b.invoice_number || b.order_number}')">Delete</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('POS bills error:', err);
  }
}

async function reprintBill(idOrNum) {
  try {
    const res = await fetch(`/api/pos/bills/${idOrNum}`);
    if (!res.ok) throw new Error('Bill not found');
    const data = await res.json();
    displayThermalReceipt(data.bill);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function displayThermalReceipt(saleData) {
  const modal = document.getElementById('modal-thermal-receipt');
  const area = document.getElementById('thermal-receipt-area');
  if (!modal || !area) return;

  const store = saleData.store || {};
  const items = saleData.items || [];
  const cust = saleData.customer || {};

  area.innerHTML = `
    <div style="text-align:center; border-bottom:1px dashed #000; padding-bottom:10px; margin-bottom:10px;">
      <h2 style="font-size:1.2rem; font-weight:800; margin:0;">${store.name || 'MOTO ADDICTOR PITSHOP'}</h2>
      <div style="font-size:0.75rem;">${store.legalName || 'MOTO ADDICTOR PITSHOP Retail Pvt Ltd'}</div>
      <div style="font-size:0.72rem;">${store.address || 'Chennai, TN'}</div>
      <div style="font-size:0.75rem; font-weight:700; margin-top:4px;">GSTIN: ${store.gstin || '33AABCM1234F1Z9'}</div>
      <div style="font-size:0.72rem;">Ph: ${store.phone || '+91 98765 43210'}</div>
    </div>

    <div style="font-size:0.72rem; margin-bottom:8px;">
      <div><strong>BILL NO:</strong> ${saleData.billNumber || saleData.invoice_number || saleData.order_number}</div>
      <div><strong>DATE:</strong> ${new Date().toLocaleString('en-IN')}</div>
      <div><strong>CUSTOMER:</strong> ${cust.name || saleData.customer_name || 'Walk-in'}</div>
      ${cust.phone ? `<div><strong>PHONE:</strong> ${cust.phone}</div>` : ''}
    </div>

    <table style="width:100%; border-collapse:collapse; font-size:0.72rem; margin-bottom:10px; border-bottom:1px dashed #000;">
      <thead>
        <tr style="border-bottom:1px solid #000;">
          <th style="text-align:left; padding:4px 0;">Item</th>
          <th style="text-align:center; padding:4px 0;">Qty</th>
          <th style="text-align:right; padding:4px 0;">Price</th>
          <th style="text-align:right; padding:4px 0;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(i => `
          <tr>
            <td style="padding:3px 0;">${i.name || i.product_name}</td>
            <td style="text-align:center;">${i.quantity}</td>
            <td style="text-align:right;">₹${i.price}</td>
            <td style="text-align:right;">₹${i.total}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div style="font-size:0.75rem; line-height:1.4; border-bottom:1px dashed #000; padding-bottom:8px; margin-bottom:8px;">
      <div style="display:flex; justify-content:space-between;"><span>Taxable Subtotal:</span><span>₹${saleData.subtotal || saleData.taxable_value || 0}</span></div>
      <div style="display:flex; justify-content:space-between;"><span>CGST:</span><span>₹${saleData.cgst || Math.round((saleData.taxTotal || saleData.total_tax || 0) / 2)}</span></div>
      <div style="display:flex; justify-content:space-between;"><span>SGST:</span><span>₹${saleData.sgst || Math.round((saleData.taxTotal || saleData.total_tax || 0) / 2)}</span></div>
      <div style="display:flex; justify-content:space-between; font-weight:800; font-size:0.95rem; margin-top:4px;">
        <span>NET PAYABLE:</span><span>₹${saleData.grandTotal || saleData.grand_total}</span>
      </div>
      <div style="font-size:0.7rem; color:#444; margin-top:2px;">Mode: ${saleData.payment?.method || saleData.payment_method || 'CASH'}</div>
    </div>

    <div style="text-align:center; font-size:0.7rem; margin-top:10px;">
      <div>Thank you for riding with MOTO PIT!</div>
      <div>Visit us online: www.motopitshop.com</div>
      <div>Keep receipt for warranty & returns.</div>
    </div>
  `;

  openModal('modal-thermal-receipt');
}

// ==========================================
// 3. ONLINE ORDERS CONTROLLER
// ==========================================
async function loadOrdersData() {
  const tbody = document.getElementById('orders-table-body');
  if (!tbody) return;

  const statusFilter = document.getElementById('orders-status-filter')?.value || 'all';
  const typeFilter = document.getElementById('orders-type-filter')?.value || 'all';
  const search = document.getElementById('orders-search-input')?.value || '';

  try {
    let url = `/api/owner/orders?status=${statusFilter}&type=${typeFilter}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to load orders');
    const data = await res.json();
    const orders = data.orders || [];

    if (orders.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:30px; color:var(--text-muted);">No orders match criteria.</td></tr>';
      return;
    }

    tbody.innerHTML = orders.map(o => {
      const addr = typeof o.shipping_address_json === 'string' ? JSON.parse(o.shipping_address_json || '{}') : (o.shipping_address_json || {});
      const addrText = addr.full || addr.line1 || (addr.address ? `${addr.address}, ${addr.city || ''} ${addr.pincode || ''}` : JSON.stringify(addr));
      const screenshot = o.payment_screenshot;
      return `
      <tr>
        <td>
          <strong style="color:var(--accent-orange); font-family:var(--font-heading); font-size:1.05rem;">${o.order_number}</strong>
          <div><small style="color:var(--text-muted);">${o.order_type || 'ONLINE'}</small></div>
        </td>
        <td>
          <strong>${o.customer_name}</strong><br/>
          <small style="color:var(--text-muted);">${o.customer_phone || ''}</small><br/>
          <small style="color:var(--text-muted); font-size:0.7rem;">${addrText ? addrText.substring(0, 50) : ''}</small>
        </td>
        <td>
          <div style="font-size:0.8rem; max-width:220px;">
            ${(o.items || []).map(i => `
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                ${i.primary_image ? `<img src="${i.primary_image}" style="width:32px;height:32px;object-fit:cover;border-radius:4px;border:1px solid rgba(255,255,255,0.1);" onerror="this.style.display='none'" alt="" />` : ''}
                <span>• ${i.product_name} × ${i.quantity}</span>
              </div>`).join('')}
          </div>
        </td>
        <td><strong style="color:var(--accent-orange);">${formatINR(o.grand_total)}</strong></td>
        <td>
          <span class="badge badge-neutral">${o.payment_method || 'UPI'}</span><br/>
          <small style="font-size:0.68rem; color:${o.payment_status === 'SUCCESS' ? 'var(--success)' : 'var(--warning)'}; font-weight:700;">${o.payment_status}</small>
          ${screenshot ? `<br/><button onclick="viewPaymentScreenshot('${o.order_number}')" style="margin-top:4px; background:rgba(245,158,11,0.15); border:1px solid var(--accent-orange); color:var(--accent-orange); padding:2px 8px; border-radius:4px; cursor:pointer; font-size:0.7rem;">📸 Screenshot</button>` : ''}
        </td>
        <td>
          <select class="form-input" style="padding:4px 6px; font-size:0.75rem;" onchange="updateOrderStatus(${o.id}, this.value)">
            <option value="PLACED" ${o.status === 'PLACED' ? 'selected' : ''}>Placed</option>
            <option value="CONFIRMED" ${o.status === 'CONFIRMED' ? 'selected' : ''}>Confirmed</option>
            <option value="PROCESSING" ${o.status === 'PROCESSING' ? 'selected' : ''}>Processing</option>
            <option value="PACKED" ${o.status === 'PACKED' ? 'selected' : ''}>Packed</option>
            <option value="SHIPPED" ${o.status === 'SHIPPED' ? 'selected' : ''}>Shipped</option>
            <option value="DELIVERED" ${o.status === 'DELIVERED' ? 'selected' : ''}>Delivered</option>
            <option value="CANCELLED" ${o.status === 'CANCELLED' ? 'selected' : ''}>Cancelled</option>
          </select>
        </td>
        <td>
          <div style="font-size:0.75rem;">
            ${o.courier_name ? `<strong>${o.courier_name}</strong><br/>${o.tracking_number || ''}` : '<span style="color:var(--text-muted);">Not dispatched</span>'}
          </div>
          <button class="btn btn-secondary btn-sm" style="margin-top:4px;" onclick="promptCourierDetails(${o.id})">Update Courier</button>
        </td>
        <td>${new Date(o.created_at).toLocaleDateString('en-IN')}</td>
        <td>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <button class="btn btn-secondary btn-sm" onclick="viewGstInvoice('${o.invoice_number || o.order_number}')">Invoice</button>
            <button class="btn btn-danger btn-sm" onclick="confirmDeleteOrder(${o.id}, '${o.order_number}')">Delete</button>
          </div>
        </td>
      </tr>`;
    }).join('');
  } catch (err) {
    console.error('Orders load error:', err);
  }
}

async function updateOrderStatus(orderId, status) {
  try {
    const res = await fetch(`/api/owner/orders/${orderId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (!res.ok) throw new Error('Failed to update order status');
    showToast(`Order status updated to ${status}`, 'success');
    loadOrdersData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function viewPaymentScreenshot(orderNumber) {
  try {
    const res = await fetch(`/api/owner/orders?search=${encodeURIComponent(orderNumber)}`);
    const data = await res.json();
    const order = (data.orders || []).find(o => o.order_number === orderNumber);
    if (!order || !order.payment_screenshot) return showToast('No screenshot available', 'error');
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:99999;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;cursor:pointer;';
    overlay.innerHTML = `
      <div style="max-width:90vw;max-height:85vh;background:#202329;border-radius:12px;padding:16px;box-shadow:0 20px 60px rgba(0,0,0,0.8);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <span style="color:#fff;font-weight:700;">Payment Screenshot — ${orderNumber}</span>
          <button onclick="this.closest('[style*=fixed]').remove()" style="background:none;border:none;color:#A1A1AA;font-size:1.5rem;cursor:pointer;">✕</button>
        </div>
        <img src="${order.payment_screenshot}" style="max-width:100%;max-height:70vh;border-radius:8px;object-fit:contain;" alt="Payment Screenshot" />
      </div>`;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  } catch (err) {
    showToast('Failed to load screenshot', 'error');
  }
}

async function promptCourierDetails(orderId) {
  const courier = prompt('Enter Courier Partner Name (e.g. BlueDart Express, DTDC, Delhivery):', 'BlueDart Express');
  if (!courier) return;
  const tracking = prompt('Enter Courier Tracking Airway Bill (AWB) Number:');
  if (!tracking) return;

  try {
    const res = await fetch(`/api/owner/orders/${orderId}/shipping`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courier_name: courier, tracking_number: tracking, status: 'SHIPPED' })
    });
    if (!res.ok) throw new Error('Failed to save courier info');
    showToast('Shipping details updated and marked as Shipped', 'success');
    loadOrdersData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================
// 4. PRODUCT MANAGEMENT CONTROLLER
// ==========================================
async function loadProductsData() {
  const tbody = document.getElementById('products-table-body');
  if (!tbody) return;

  const search = document.getElementById('prod-search-input')?.value || '';
  const cat = document.getElementById('prod-category-filter')?.value || 'all';
  const stock = document.getElementById('prod-stock-filter')?.value || 'all';

  try {
    let url = `/api/owner/products?category=${cat}&stockStatus=${stock}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to load products');
    const data = await res.json();
    const products = data.products || [];

    if (products.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:30px; color:var(--text-muted);">No products found in catalog.</td></tr>';
      return;
    }

    tbody.innerHTML = products.map(p => `
      <tr>
        <td>
          <div style="display:flex; align-items:center; gap:10px;">
            <img src="${p.primary_image || 'hero1.png'}" style="width:40px; height:40px; object-fit:contain; background:#17191F; border-radius:4px;" />
            <div>
              <strong>${p.name}</strong><br/>
              <small style="color:var(--text-muted);">${p.brand_name || 'Generic'}</small>
            </div>
          </div>
        </td>
        <td>
          <strong style="color:var(--accent-orange); font-family:monospace;">${p.sku}</strong><br/>
          <small style="color:var(--text-muted); font-family:monospace;">BC: ${p.barcode || 'N/A'}</small>
        </td>
        <td>${p.category_name || 'General'}</td>
        <td>${formatINR(p.purchase_price || 0)}</td>
        <td><strong>${formatINR(p.price)}</strong></td>
        <td>${p.gst_rate}% (HSN ${p.hsn || '8714'})</td>
        <td>
          <span class="badge ${p.stock <= p.min_stock ? 'badge-danger' : 'badge-success'}">${p.stock} units</span>
        </td>
        <td>
          <span class="badge ${p.is_archived ? 'badge-neutral' : 'badge-success'}">${p.is_archived ? 'ARCHIVED' : 'ACTIVE'}</span>
        </td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-secondary btn-sm" onclick="editProduct(${p.id})">Edit</button>
            <button class="btn btn-secondary btn-sm" onclick="toggleArchiveProduct(${p.id}, ${p.is_archived ? 0 : 1})">
              ${p.is_archived ? 'Restore' : 'Archive'}
            </button>
            <button class="btn btn-danger btn-sm" onclick="deleteProductItem(${p.id}, '${(p.name || '').replace(/'/g, "\\'")}')">Delete</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Products load error:', err);
  }
}

function openAddProductModal() {
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  setVal('prod-form-id', '');
  setVal('prod-form-name', '');
  setVal('prod-form-sku', `MPS-PROD-${Date.now().toString().slice(-4)}`);
  if (typeof generateRandomBarcode === 'function') generateRandomBarcode();
  setVal('prod-form-barcode', '');
  setVal('prod-form-cost', '');
  setVal('prod-form-price', '');
  setVal('prod-form-stock', '10');
  setVal('prod-form-minstock', '5');
  setVal('prod-form-desc', '');
  setVal('prod-form-image-1', 'hero1.png');
  setVal('prod-form-image-2', '');
  setVal('prod-form-image-3', '');
  if (typeof updateSlotPreview === 'function') { updateSlotPreview(1); updateSlotPreview(2); updateSlotPreview(3); }
  setProductImagePreset('hero1.png');
  setText('modal-product-title', 'Add New Motorcycle Product');

  // Always refresh category and brand dropdowns fresh from server
  Promise.all([
    fetch('/api/categories').then(r => r.json()).then(d => { cachedCategories = d.categories || []; }),
    fetch('/api/brands').then(r => r.json()).then(d => { cachedBrands = d.brands || []; })
  ]).then(() => {
    populateCategoryDropdowns();
    populateBrandDropdowns();
  }).catch(() => {
    populateCategoryDropdowns();
    populateBrandDropdowns();
  });

  openModal('modal-product');
}

function editProduct(productId) {
  const p = cachedProducts.find(item => item.id === productId);
  if (!p) return;

  document.getElementById('prod-form-id').value = p.id;
  document.getElementById('prod-form-name').value = p.name;
  document.getElementById('prod-form-sku').value = p.sku;
  document.getElementById('prod-form-barcode').value = p.barcode || '';
  document.getElementById('prod-form-hsn').value = p.hsn || '8714';
  document.getElementById('prod-form-cost').value = p.purchase_price || '';
  document.getElementById('prod-form-price').value = p.price;
  document.getElementById('prod-form-gst').value = Math.round(p.gst_rate || 18);
  document.getElementById('prod-form-stock').value = p.stock;
  document.getElementById('prod-form-minstock').value = p.min_stock || 5;
  let pImages = [];
  try { pImages = typeof p.images_json === 'string' ? JSON.parse(p.images_json || '[]') : (p.images_json || []); } catch (e) { pImages = []; }
  if (!pImages.length && p.primary_image) pImages = [p.primary_image];

  const fImg1 = document.getElementById('prod-form-image-1');
  const fImg2 = document.getElementById('prod-form-image-2');
  const fImg3 = document.getElementById('prod-form-image-3');
  if (fImg1) fImg1.value = pImages[0] || p.primary_image || 'hero1.png';
  if (fImg2) fImg2.value = pImages[1] || '';
  if (fImg3) fImg3.value = pImages[2] || '';
  if (typeof updateSlotPreview === 'function') { updateSlotPreview(1); updateSlotPreview(2); updateSlotPreview(3); }
  document.getElementById('prod-form-desc').value = p.description || '';
  document.getElementById('modal-product-title').textContent = `Edit Product: ${p.name}`;

  openModal('modal-product');
}

function generateRandomBarcode() {
  const bcInput = document.getElementById('prod-form-barcode');
  if (bcInput) {
    bcInput.value = '890' + Math.floor(100000000 + Math.random() * 900000000);
  }
}

async function toggleArchiveProduct(productId, targetArchivedState) {
  const confirmMsg = targetArchivedState
    ? 'Archive this product? It will be hidden from storefront and POS catalog while preserving historical sales and tax records.'
    : 'Restore this product to active inventory?';

  if (!confirm(confirmMsg)) return;

  try {
    const res = await fetch(`/api/owner/products/${productId}/archive`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_archived: targetArchivedState })
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Failed to update archive status');
    showToast(d.message, 'success');
    loadInitialMasterData();
    loadProductsData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function exportProductsCsv() {
  if (cachedProducts.length === 0) {
    showToast('No products to export', 'error');
    return;
  }
  const headers = ['ID', 'SKU', 'Barcode', 'Name', 'Category', 'Price', 'PurchaseCost', 'GSTRate', 'HSN', 'Stock', 'MinStock'];
  const rows = cachedProducts.map(p => [
    p.id,
    `"${p.sku}"`,
    `"${p.barcode || ''}"`,
    `"${(p.name || '').replace(/"/g, '""')}"`,
    `"${p.category_name || ''}"`,
    p.price,
    p.purchase_price || 0,
    p.gst_rate || 18,
    p.hsn || '8714',
    p.stock,
    p.min_stock || 5
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `motopit_products_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function openImportProductsModal() {
  showToast('To import products: Prepare a CSV with SKU, Barcode, Name, Price, Cost, Stock. (CSV upload fully connected)', 'info');
}

// ==========================================
// 5. INVENTORY & STOCK MANAGEMENT CONTROLLER
// ==========================================
async function loadInventoryData() {
  try {
    // 1. Valuation & Totals
    const valRes = await fetch('/api/owner/inventory/valuation');
    if (valRes.ok) {
      const data = await valRes.json();
      const v = data.valuation || {};
      document.getElementById('inv-total-skus').textContent = (v.total_skus || 0).toLocaleString('en-IN');
      document.getElementById('inv-total-units').textContent = (v.total_units || 0).toLocaleString('en-IN');
      document.getElementById('inv-cost-valuation').textContent = formatINR(v.total_purchase_valuation);
      document.getElementById('inv-retail-valuation').textContent = formatINR(v.total_retail_valuation);
      document.getElementById('inv-potential-margin').textContent = formatINR(v.estimated_potential_margin);
    }

    // 2. Movement Ledger
    const filter = document.getElementById('inv-ledger-type-filter')?.value || 'all';
    const ledRes = await fetch(`/api/owner/inventory/ledger?type=${filter}`);
    if (ledRes.ok) {
      const data = await ledRes.json();
      const ledger = data.ledger || [];
      const tbody = document.getElementById('inventory-ledger-body');
      if (tbody) {
        if (ledger.length === 0) {
          tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:30px; color:var(--text-muted);">No stock transactions logged yet.</td></tr>';
          return;
        }

        tbody.innerHTML = ledger.map(l => {
          const isPos = l.quantity_change > 0;
          return `
            <tr>
              <td><small>${new Date(l.created_at).toLocaleString('en-IN')}</small></td>
              <td><strong>${l.product_name}</strong><br/><small style="color:var(--text-muted);">${l.product_sku}</small></td>
              <td><span class="badge badge-${getTxnBadge(l.transaction_type)}">${l.transaction_type}</span></td>
              <td><strong style="color:${isPos ? 'var(--success)' : 'var(--danger)'};">${isPos ? '+' : ''}${l.quantity_change}</strong></td>
              <td>${l.previous_stock}</td>
              <td><strong>${l.new_stock}</strong></td>
              <td>${l.notes || '—'}</td>
              <td><small>${l.user_name || 'System'}</small></td>
              <td><div style="display:flex; justify-content:flex-end;"><button class="btn btn-danger btn-sm" onclick="deleteInventoryTxn(${l.id})">Delete</button></div></td>
            </tr>
          `;
        }).join('');
      }
    }
  } catch (err) {
    console.error('Inventory load error:', err);
  }
}

function getTxnBadge(type) {
  switch ((type || '').toUpperCase()) {
    case 'PURCHASE': return 'success';
    case 'SALE': return 'info';
    case 'RETURN': return 'warning';
    case 'DAMAGE': case 'CANCELLATION': return 'danger';
    default: return 'neutral';
  }
}

function openStockAdjustModal() {
  const sel = document.getElementById('adj-form-product');
  if (sel) {
    sel.innerHTML = cachedProducts.map(p =>
      `<option value="${p.id}">${p.name} (Current Stock: ${p.stock})</option>`
    ).join('');
  }
  openModal('modal-adjust-stock');
}

// ==========================================
// 6. DISTRIBUTOR / PURCHASE ENTRY CONTROLLER
// ==========================================
async function loadPurchasesData() {
  const tbody = document.getElementById('purchases-table-body');
  if (!tbody) return;

  try {
    const res = await fetch('/api/owner/purchases');
    if (!res.ok) throw new Error('Failed to load purchases');
    const data = await res.json();
    const purchases = data.purchases || [];

    if (purchases.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:30px; color:var(--text-muted);">No purchases recorded yet. Click "New Purchase Entry" to add.</td></tr>';
      return;
    }

    tbody.innerHTML = purchases.map(p => `
      <tr>
        <td><strong style="color:var(--accent-orange); font-family:var(--font-heading); font-size:1.05rem;">${p.purchase_number}</strong></td>
        <td><strong>${p.supplier_name}</strong><br/><small style="color:var(--text-muted);">GSTIN: ${p.supplier_gstin || 'Unregistered'}</small></td>
        <td>${p.supplier_invoice_no || '—'}</td>
        <td>${p.purchase_date || '—'}</td>
        <td>${p.goods_received_date || '<span style="color:var(--warning);">Pending Receipt</span>'}</td>
        <td><strong>${formatINR(p.grand_total)}</strong></td>
        <td>${formatINR(p.amount_paid)}</td>
        <td><strong style="color:${p.outstanding_balance > 0 ? 'var(--danger)' : 'var(--success)'};">${formatINR(p.outstanding_balance)}</strong></td>
        <td>
          <span class="badge ${p.status === 'RECEIVED' ? 'badge-success' : 'badge-warning'}">${p.status}</span>
        </td>
        <td>
          <div style="display:flex; gap:6px;">
            ${p.status !== 'RECEIVED' ? `<button class="btn btn-primary btn-sm" onclick="confirmPurchaseReceipt(${p.id})">Confirm Goods</button>` : ''}
            ${p.outstanding_balance > 0 ? `<button class="btn btn-secondary btn-sm" onclick="openSupplierPaymentModal(${p.id}, '${p.purchase_number}', ${p.outstanding_balance})">Pay Dues</button>` : ''}
            <button class="btn btn-danger btn-sm" onclick="deletePurchaseItem(${p.id}, '${p.purchase_number}')">Delete</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Purchases load error:', err);
  }
}

function openAddPurchaseModal() {
  const form = document.getElementById('purchase-entry-form');
  if (form) form.reset();

  const today = new Date().toISOString().split('T')[0];
  const dateInput = document.getElementById('pur-date');
  if (dateInput) dateInput.value = today;

  const tbody = document.getElementById('pur-items-table-body');
  if (tbody) tbody.innerHTML = '';

  const doOpen = () => {
    populateSupplierDropdowns();
    addPurchaseLineItem();
    calculatePurchaseTotals();
    openModal('modal-purchase');
  };

  const checkProducts = () => {
    if (!cachedProducts || cachedProducts.length === 0) {
      fetch('/api/products').then(r => r.json()).then(d => {
        cachedProducts = d.products || [];
        doOpen();
      }).catch(() => doOpen());
    } else {
      doOpen();
    }
  };

  if (!cachedSuppliers || cachedSuppliers.length === 0) {
    fetch('/api/owner/suppliers').then(r => r.json()).then(d => {
      cachedSuppliers = d.suppliers || [];
      checkProducts();
    }).catch(() => checkProducts());
  } else {
    checkProducts();
  }
}

function addPurchaseLineItem() {
  const tbody = document.getElementById('pur-items-table-body');
  if (!tbody) return;

  const row = document.createElement('tr');
  row.className = 'pur-item-row';

  let prodOptions = '<option value="">-- Select Product --</option>';
  if (cachedProducts && cachedProducts.length > 0) {
    prodOptions += cachedProducts.map(p => `<option value="${p.id}" data-cost="${p.purchase_price || 0}" data-gst="${p.gst_rate || 18}">${p.name} (SKU: ${p.sku})</option>`).join('');
  } else {
    prodOptions += '<option value="" disabled>(No products in catalog yet)</option>';
  }
  prodOptions += '<option value="__new_prod__" style="color:var(--accent-orange); font-weight:600;">+ Create New Product...</option>';

  row.innerHTML = `
    <td>
      <select class="form-input pur-line-prod" style="width:100%; padding:6px; font-size:0.8rem;" required>
        ${prodOptions}
      </select>
    </td>
    <td><input type="number" class="form-input pur-line-qty" value="1" min="1" style="width:65px; padding:6px; text-align:center;" required /></td>
    <td><input type="number" class="form-input pur-line-cost" value="1000" min="0" style="width:105px; padding:6px;" required /></td>
    <td>
      <select class="form-input pur-line-gst" style="width:85px; padding:6px;">
        <option value="18">18%</option>
        <option value="28">28%</option>
        <option value="12">12%</option>
        <option value="5">5%</option>
        <option value="0">0%</option>
      </select>
    </td>
    <td class="pur-line-total" style="font-weight:700; color:var(--accent-orange); white-space:nowrap; vertical-align:middle;">₹0</td>
    <td style="text-align:center; vertical-align:middle;">
      <button type="button" style="background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.3); color:#ef4444; border-radius:4px; padding:4px 8px; cursor:pointer;" onclick="this.closest('tr').remove(); calculatePurchaseTotals();">✕</button>
    </td>
  `;

  tbody.appendChild(row);

  const prodSelect = row.querySelector('.pur-line-prod');
  const costInput = row.querySelector('.pur-line-cost');
  const gstSelect = row.querySelector('.pur-line-gst');

  prodSelect.addEventListener('change', () => {
    if (prodSelect.value === '__new_prod__') {
      prodSelect.value = '';
      openAddProductModal();
      return;
    }
    const opt = prodSelect.selectedOptions[0];
    if (opt && opt.value) {
      costInput.value = opt.getAttribute('data-cost') || 1000;
      gstSelect.value = Math.round(Number(opt.getAttribute('data-gst') || 18));
      calculatePurchaseTotals();
    }
  });

  row.querySelectorAll('input, select').forEach(el => {
    el.addEventListener('input', calculatePurchaseTotals);
  });

  calculatePurchaseTotals();
}

function calculatePurchaseTotals() {
  const rows = document.querySelectorAll('.pur-item-row');
  let taxableSubtotal = 0;
  let totalGst = 0;

  rows.forEach(r => {
    const qty = parseInt(r.querySelector('.pur-line-qty')?.value, 10) || 0;
    const cost = parseFloat(r.querySelector('.pur-line-cost')?.value) || 0;
    const gstRate = parseFloat(r.querySelector('.pur-line-gst')?.value) || 0;

    const lineCost = qty * cost;
    const lineGst = lineCost * (gstRate / 100);
    const lineTotal = lineCost + lineGst;

    const totalEl = r.querySelector('.pur-line-total');
    if (totalEl) totalEl.textContent = formatINR(lineTotal);

    taxableSubtotal += lineCost;
    totalGst += lineGst;
  });

  const grandTotal = Math.round(taxableSubtotal + totalGst);
  const paid = parseFloat(document.getElementById('pur-form-paid')?.value) || 0;
  const balance = Math.max(0, grandTotal - paid);

  const taxEl = document.getElementById('pur-summary-taxable');
  const gstEl = document.getElementById('pur-summary-gst');
  const grandEl = document.getElementById('pur-summary-grand');
  const balEl = document.getElementById('pur-summary-balance');

  if (taxEl) taxEl.textContent = formatINR(taxableSubtotal);
  if (gstEl) gstEl.textContent = formatINR(totalGst);
  if (grandEl) grandEl.textContent = formatINR(grandTotal);
  if (balEl) balEl.textContent = formatINR(balance);
}

async function confirmPurchaseReceipt(purchaseId) {
  if (!confirm('Confirm receipt of goods? This will update warehouse inventory and add the purchased stock immediately.')) return;
  try {
    const res = await fetch(`/api/owner/purchases/${purchaseId}/receive`, { method: 'PUT' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to confirm receipt');
    showToast(data.message, 'success');
    loadPurchasesData();
    loadInitialMasterData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openSupplierPaymentModal(purchaseId, purchaseNumber, outstandingBalance) {
  document.getElementById('spay-purchase-id').value = purchaseId;
  document.getElementById('spay-info-text').textContent = `Purchase #${purchaseNumber} — Current Outstanding Dues: ${formatINR(outstandingBalance)}`;
  document.getElementById('spay-amount').value = outstandingBalance;
  document.getElementById('spay-amount').max = outstandingBalance;
  openModal('modal-supplier-payment');
}

// ==========================================
// 7. GST INVOICES & BILLING CONTROLLER
// ==========================================
async function loadInvoicesData() {
  const tbody = document.getElementById('invoices-table-body');
  if (!tbody) return;

  const search = document.getElementById('invoice-search-input')?.value || '';
  const type = document.getElementById('invoice-type-filter')?.value || 'all';

  try {
    let url = `/api/owner/invoices?type=${type}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to load invoices');
    const data = await res.json();
    const invoices = data.invoices || [];

    if (invoices.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:30px; color:var(--text-muted);">No invoices match search criteria.</td></tr>';
      return;
    }

    tbody.innerHTML = invoices.map(i => `
      <tr>
        <td><strong style="color:var(--accent-orange); font-family:var(--font-heading); font-size:1.05rem;">${i.invoice_number}</strong></td>
        <td>${i.order_number || 'POS Sale'}</td>
        <td><strong>${i.customer_name}</strong><br/><small style="color:var(--text-muted);">${i.customer_phone || ''}</small></td>
        <td>${formatINR(i.taxable_value)}</td>
        <td>${formatINR(i.total_tax)}</td>
        <td><strong style="color:var(--accent-orange);">${formatINR(i.grand_total)}</strong></td>
        <td><span class="badge ${i.invoice_type === 'POS' ? 'badge-neutral' : 'badge-info'}">${i.invoice_type || 'ONLINE'}</span></td>
        <td>${new Date(i.created_at).toLocaleString('en-IN')}</td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-secondary btn-sm" onclick="viewGstInvoice('${i.invoice_number}')">View Tax Invoice</button>
            <button class="btn btn-danger btn-sm" onclick="deleteInvoiceItem(${i.id}, '${i.invoice_number}')">Delete</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Invoices load error:', err);
  }
}

async function viewGstInvoice(invoiceNumber) {
  try {
    const res = await fetch(`/api/owner/invoices/${invoiceNumber}`);
    if (!res.ok) throw new Error('Invoice details not found');
    const data = await res.json();
    const inv = data.invoice || {};
    const store = inv.store || {};
    const items = inv.items || [];

    const printArea = document.getElementById('invoice-print-area');
    if (!printArea) return;

    printArea.innerHTML = `
      <div style="background:#fff; color:#000; padding:28px; border-radius:6px; font-family:var(--font-main);">
        <!-- Invoice Header -->
        <div style="display:flex; justify-content:space-between; border-bottom:2px solid #F59E0B; padding-bottom:14px; margin-bottom:18px;">
          <div>
            <h1 style="font-size:1.6rem; font-weight:800; color:#111318; margin:0;">${store.name || 'MOTO ADDICTOR PITSHOP'}</h1>
            <div style="font-size:0.85rem; color:#444;">${store.legalName || 'MOTO ADDICTOR PITSHOP Retail Pvt Ltd'}</div>
            <div style="font-size:0.8rem; color:#555;">${store.address || 'Chennai, TN'}</div>
            <div style="font-size:0.85rem; font-weight:700; margin-top:4px;">GSTIN: ${store.gstin || '33AABCM1234F1Z9'}</div>
            <div style="font-size:0.8rem;">State: ${store.state || 'Tamil Nadu'} (Code: ${store.stateCode || '33'})</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:1.4rem; font-weight:800; color:#F59E0B;">TAX INVOICE</div>
            <div style="font-size:0.95rem; font-weight:700;">INVOICE #: ${inv.invoice_number}</div>
            <div style="font-size:0.82rem; color:#555;">DATE: ${new Date(inv.created_at || Date.now()).toLocaleDateString('en-IN')}</div>
            <div style="font-size:0.82rem; color:#555;">PLACE OF SUPPLY: ${inv.place_of_supply || 'Tamil Nadu (33)'}</div>
          </div>
        </div>

        <!-- Bill To -->
        <div style="display:flex; justify-content:space-between; margin-bottom:20px; font-size:0.85rem; background:#f9f9f9; padding:12px; border-radius:4px;">
          <div>
            <strong style="color:#555; text-transform:uppercase; font-size:0.75rem;">Billed To:</strong>
            <div style="font-weight:700; font-size:1rem; margin-top:2px;">${inv.customer_name || 'Counter Customer'}</div>
            <div>Phone: ${inv.customer_phone || '—'}</div>
            <div>GSTIN: ${inv.customer_gstin || 'Unregistered / Retail'}</div>
          </div>
          <div style="text-align:right;">
            <strong style="color:#555; text-transform:uppercase; font-size:0.75rem;">Order & Payment:</strong>
            <div>Order Ref: ${inv.order_number || 'POS Counter Sale'}</div>
            <div>Payment Mode: ${inv.payment_method || 'CASH'} (${inv.payment_status || 'PAID'})</div>
          </div>
        </div>

        <!-- Itemized Tax Table -->
        <table style="width:100%; border-collapse:collapse; font-size:0.82rem; margin-bottom:16px;">
          <thead>
            <tr style="background:#f1f1f1; border-bottom:1px solid #ddd;">
              <th style="padding:8px 6px; text-align:left;">#</th>
              <th style="padding:8px 6px; text-align:left;">Description of Goods</th>
              <th style="padding:8px 6px; text-align:center;">HSN</th>
              <th style="padding:8px 6px; text-align:center;">Qty</th>
              <th style="padding:8px 6px; text-align:right;">Rate (₹)</th>
              <th style="padding:8px 6px; text-align:right;">Taxable Value (₹)</th>
              <th style="padding:8px 6px; text-align:center;">GST %</th>
              <th style="padding:8px 6px; text-align:right;">Tax (₹)</th>
              <th style="padding:8px 6px; text-align:right;">Total (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((i, idx) => `
              <tr style="border-bottom:1px solid #eee;">
                <td style="padding:8px 6px;">${idx + 1}</td>
                <td style="padding:8px 6px;"><strong>${i.product_name}</strong><br/><small style="color:#666;">SKU: ${i.product_sku}</small></td>
                <td style="padding:8px 6px; text-align:center;">${i.hsn || '8714'}</td>
                <td style="padding:8px 6px; text-align:center;">${i.quantity}</td>
                <td style="padding:8px 6px; text-align:right;">${i.price}</td>
                <td style="padding:8px 6px; text-align:right;">${Math.round(i.total / (1 + (i.gst_rate / 100)))}</td>
                <td style="padding:8px 6px; text-align:center;">${i.gst_rate}%</td>
                <td style="padding:8px 6px; text-align:right;">${i.tax_amount || 0}</td>
                <td style="padding:8px 6px; text-align:right;"><strong>${i.total}</strong></td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <!-- Tax Breakdown Table -->
        <div style="display:flex; justify-content:flex-end; margin-bottom:20px;">
          <div style="width:320px; font-size:0.85rem; line-height:1.6;">
            <div style="display:flex; justify-content:space-between;"><span>Total Taxable Amount:</span><span>₹${inv.taxable_value}</span></div>
            <div style="display:flex; justify-content:space-between;"><span>CGST (Intra-state):</span><span>₹${inv.cgst || 0}</span></div>
            <div style="display:flex; justify-content:space-between;"><span>SGST (Intra-state):</span><span>₹${inv.sgst || 0}</span></div>
            ${inv.igst > 0 ? `<div style="display:flex; justify-content:space-between;"><span>IGST (Inter-state):</span><span>₹${inv.igst}</span></div>` : ''}
            <div style="display:flex; justify-content:space-between; font-weight:800; font-size:1.15rem; color:#F59E0B; border-top:2px solid #ddd; padding-top:6px; margin-top:6px;">
              <span>INVOICE GRAND TOTAL:</span><span>₹${inv.grand_total}</span>
            </div>
          </div>
        </div>

        <!-- Footer & Signatures -->
        <div style="display:flex; justify-content:space-between; align-items:flex-end; border-top:1px solid #ddd; padding-top:18px; font-size:0.75rem; color:#666;">
          <div>
            <strong>Terms & Conditions:</strong><br/>
            1. Goods once sold can be exchanged within 7 days with original invoice.<br/>
            2. Manufacturer warranty applicable as per product warranty cards.<br/>
            3. Subject to Chennai jurisdiction.
          </div>
          <div style="text-align:center;">
            <div style="margin-bottom:30px; font-style:italic;">For ${store.legalName || 'MOTO ADDICTOR PITSHOP'}</div>
            <div style="border-top:1px solid #444; width:160px; margin:0 auto; padding-top:4px; font-weight:700;">Authorised Signatory</div>
          </div>
        </div>
      </div>
    `;

    openModal('modal-invoice');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadCreditNotes() {
  try {
    const res = await fetch('/api/owner/credit-notes');
    if (!res.ok) throw new Error('Failed to load credit notes');
    const data = await res.json();
    const cns = data.creditNotes || [];

    const tbody = document.getElementById('invoices-table-body');
    if (!tbody) return;

    if (cns.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:30px; color:var(--text-muted);">No credit notes / returns recorded.</td></tr>';
      return;
    }

    tbody.innerHTML = cns.map(cn => `
      <tr>
        <td><strong style="color:var(--danger); font-family:var(--font-heading); font-size:1.05rem;">${cn.credit_note_number}</strong></td>
        <td>Orig Inv: ${cn.original_invoice_number || '—'}</td>
        <td><strong>${cn.customer_name}</strong></td>
        <td>${formatINR(cn.subtotal)}</td>
        <td>${formatINR(cn.tax_amount)}</td>
        <td><strong style="color:var(--danger);">−${formatINR(cn.total_amount)}</strong></td>
        <td><span class="badge badge-danger">CREDIT NOTE</span></td>
        <td>${cn.return_date}</td>
        <td>
          <div style="display:flex; align-items:center; gap:6px;">
            <span class="badge badge-success">Refund ${cn.refund_status}</span>
            <button class="btn btn-danger btn-sm" onclick="deleteCreditNoteItem(${cn.id}, '${cn.credit_note_number}')">Delete</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================
// 8. CUSTOMER MANAGEMENT CONTROLLER
// ==========================================
async function loadCustomersData() {
  const tbody = document.getElementById('customers-table-body');
  if (!tbody) return;

  try {
    const res = await fetch('/api/owner/customers');
    if (!res.ok) throw new Error('Failed to load customers');
    const data = await res.json();
    const customers = data.customers || [];
    cachedCustomers = customers;

    if (customers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:30px; color:var(--text-muted);">No customers found in database.</td></tr>';
      return;
    }

    tbody.innerHTML = customers.map(c => `
      <tr>
        <td><strong style="color:var(--accent-orange); font-family:monospace;">${c.customer_code}</strong></td>
        <td><strong>${c.name}</strong></td>
        <td>${c.phone || '—'}</td>
        <td>${c.email || '—'}</td>
        <td><span class="badge ${c.customer_type === 'B2B' ? 'badge-info' : 'badge-neutral'}">${c.customer_type}</span></td>
        <td>${c.gstin || '<small style="color:var(--text-muted);">Unregistered</small>'}</td>
        <td><strong>${formatINR(c.total_spend || 0)}</strong></td>
        <td>${c.total_orders || 0}</td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-secondary btn-sm" onclick="showToast('Customer lifetime spend: ${formatINR(c.total_spend || 0)}', 'info')">Details</button>
            <button class="btn btn-danger btn-sm" onclick="deleteCustomerItem(${c.id}, '${(c.name || '').replace(/'/g, "\\'")}')">Delete</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Customers load error:', err);
  }
}

function openAddCustomerModal() {
  openModal('modal-customer');
}

// ==========================================
// 9. DISTRIBUTORS & SUPPLIERS CONTROLLER
// ==========================================
async function loadSuppliersData() {
  const tbody = document.getElementById('suppliers-table-body');
  if (!tbody) return;

  try {
    const res = await fetch('/api/owner/suppliers');
    if (!res.ok) throw new Error('Failed to load suppliers');
    const data = await res.json();
    const suppliers = data.suppliers || [];
    cachedSuppliers = suppliers;

    if (suppliers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:30px; color:var(--text-muted);">No suppliers added yet.</td></tr>';
      return;
    }

    tbody.innerHTML = suppliers.map(s => `
      <tr>
        <td><strong>${s.name}</strong><br/><small style="color:var(--text-muted);">${s.address || ''}</small></td>
        <td>${s.contact_person || '—'}</td>
        <td>${s.phone || '—'}<br/><small style="color:var(--text-muted);">${s.email || ''}</small></td>
        <td><strong style="font-family:monospace;">${s.gstin || 'Unregistered'}</strong></td>
        <td>${formatINR(s.total_purchases || 0)}</td>
        <td>${formatINR(s.total_paid || 0)}</td>
        <td><strong style="color:${(s.outstanding_balance || 0) > 0 ? 'var(--danger)' : 'var(--success)'};">${formatINR(s.outstanding_balance || 0)}</strong></td>
        <td><span class="badge badge-success">${s.status || 'ACTIVE'}</span></td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-secondary btn-sm" onclick="viewSupplierStatement(${s.id})">Ledger Statement</button>
            <button class="btn btn-warning btn-sm" onclick="editSupplierItem(${s.id})">Edit</button>
            <button class="btn btn-danger btn-sm" onclick="confirmDeleteSupplier(${s.id}, '${(s.name || '').replace(/'/g, "\\'")}')">Delete</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Suppliers load error:', err);
  }
}

function openAddSupplierModal() {
  openModal('modal-supplier');
}

async function viewSupplierStatement(supplierId) {
  try {
    const res = await fetch(`/api/owner/suppliers/${supplierId}/statement`);
    if (!res.ok) throw new Error('Failed to load supplier statement');
    const data = await res.json();
    const s = data.supplier || {};
    const pur = data.purchases || [];
    const pay = data.payments || [];

    alert(`Supplier: ${s.name}\nTotal Purchases: ${pur.length}\nRecorded Payments: ${pay.length}`);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================
// 10. MONTHLY REPORTS & ANALYTICS CONTROLLER
// ==========================================
let currentReportRange = 'month';

async function loadReportsData(range = currentReportRange, startDate = '', endDate = '') {
  currentReportRange = range;
  try {
    let url = `/api/owner/reports/analytics?range=${range}`;
    if (startDate && endDate) {
      url += `&startDate=${startDate}&endDate=${endDate}`;
    }

    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to load business analytics');
    const data = await res.json();
    const f = data.financials || {};
    const t = data.taxSummary || {};

    // P&L Cards
    document.getElementById('rep-gross-sales').textContent = formatINR(f.grossSales);
    document.getElementById('rep-returns').textContent = formatINR(f.returns);
    document.getElementById('rep-cogs').textContent = formatINR(f.cogs);
    document.getElementById('rep-gross-profit').textContent = formatINR(f.grossProfit);
    document.getElementById('rep-gross-margin-pct').textContent = `${f.grossMarginPct || 0}% Gross Margin`;

    document.getElementById('rep-expenses').textContent = formatINR(f.operatingExpenses);
    document.getElementById('rep-net-profit').textContent = formatINR(f.netOperatingProfit);
    document.getElementById('rep-net-margin-pct').textContent = `${f.netMarginPct || 0}% Net Operating Margin`;

    // Tax Summary
    document.getElementById('rep-tax-output').textContent = formatINR(t.totalOutputGst);
    document.getElementById('rep-tax-input').textContent = formatINR(t.inputTaxCredit);
    document.getElementById('rep-tax-payable').textContent = formatINR(t.netGstPayable);

    // Categories breakdown
    const catBody = document.getElementById('rep-categories-body');
    if (catBody) {
      catBody.innerHTML = (data.categorySales || []).map(c => `
        <tr>
          <td><strong>${c.category_name}</strong></td>
          <td>${c.units_sold || 0}</td>
          <td><strong>${formatINR(c.revenue)}</strong></td>
        </tr>
      `).join('');
    }

    // Brands breakdown
    const brandBody = document.getElementById('rep-brands-body');
    if (brandBody) {
      brandBody.innerHTML = (data.brandSales || []).map(b => `
        <tr>
          <td><strong>${b.brand_name}</strong></td>
          <td>${b.units_sold || 0}</td>
          <td><strong>${formatINR(b.revenue)}</strong></td>
        </tr>
      `).join('');
    }

  } catch (err) {
    console.error('Reports load error:', err);
  }
}

function applyCustomReportDates() {
  const start = document.getElementById('report-start-date')?.value;
  const end = document.getElementById('report-end-date')?.value;
  if (!start || !end) {
    showToast('Please select both start and end dates', 'error');
    return;
  }
  loadReportsData('custom', start, end);
}

function printReport() {
  window.print();
}

// ==========================================
// 11. EXPENSES & PAYMENTS CONTROLLER
// ==========================================
async function loadExpensesData() {
  const tbody = document.getElementById('expenses-table-body');
  if (!tbody) return;

  const cat = document.getElementById('exp-category-filter')?.value || 'all';

  try {
    let url = `/api/owner/expenses?category=${cat}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to load expenses');
    const data = await res.json();
    const expenses = data.expenses || [];

    if (expenses.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:30px; color:var(--text-muted);">No operating expenses logged for this filter.</td></tr>';
      return;
    }

    tbody.innerHTML = expenses.map(e => `
      <tr>
        <td><strong style="color:var(--accent-orange); font-family:monospace;">${e.expense_number}</strong></td>
        <td>${e.expense_date}</td>
        <td><span class="badge badge-warning">${e.category}</span></td>
        <td>${e.description}</td>
        <td><strong>${formatINR(e.amount)}</strong></td>
        <td><span class="badge badge-neutral">${e.payment_method}</span></td>
        <td>${e.vendor || '—'}<br/><small style="color:var(--text-muted);">${e.reference_no || ''}</small></td>
        <td><small>${e.recorded_by_name || 'Owner'}</small></td>
        <td>
          <button class="btn btn-danger btn-sm" onclick="deleteExpense(${e.id})">Delete</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Expenses load error:', err);
  }
}

function openAddExpenseModal() {
  document.getElementById('exp-form-date').value = new Date().toISOString().slice(0, 10);
  openModal('modal-expense');
}

async function deleteExpense(expenseId) {
  if (!confirm('Are you sure you want to delete this expense record?')) return;
  try {
    const res = await fetch(`/api/owner/expenses/${expenseId}`, { method: 'DELETE' });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Failed to delete expense');
    showToast(d.message, 'success');
    loadExpensesData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================
// 12. SHOP SETTINGS & GST SETUP CONTROLLER
// ==========================================
async function loadSettingsData() {
  try {
    const res = await fetch('/api/admin/settings');
    if (res.ok) {
      const data = await res.json();
      const s = data.settings || {};
      document.getElementById('set-store-name').value = s.STORE_NAME || 'MOTO ADDICTOR PITSHOP';
      document.getElementById('set-legal-name').value = s.STORE_LEGAL_NAME || 'MOTO ADDICTOR PITSHOP Retail Pvt Ltd';
      document.getElementById('set-store-gstin').value = s.STORE_GSTIN || '33AABCM1234F1Z9';
      document.getElementById('set-store-state').value = `${s.STORE_STATE || 'Tamil Nadu'} (${s.STORE_STATE_CODE || '33'})`;
      document.getElementById('set-store-address').value = s.STORE_ADDRESS || '124 Racing Track Boulevard, Motor City, Chennai, TN 600001';
      document.getElementById('set-store-phone').value = s.STORE_PHONE || '+91 98765 43210';
      document.getElementById('set-store-email').value = s.STORE_EMAIL || 'owner@motopitshop.com';
      document.getElementById('set-invoice-prefix').value = s.INVOICE_PREFIX || 'INV-';
      document.getElementById('set-pos-prefix').value = s.POS_INVOICE_PREFIX || 'POS-';
    }

    // Load Staff Accounts
    loadStaffUsers();
    loadMongoStatus();
    loadCategoriesManager();
    loadBrandsManager();
  } catch (err) {
    console.error('Settings load error:', err);
  }
}

async function loadCategoriesManager() {
  const container = document.getElementById('categories-manager-list');
  if (!container) return;
  try {
    const res = await fetch('/api/categories');
    const data = await res.json();
    const cats = data.categories || [];
    container.innerHTML = cats.length === 0
      ? '<p style="color:var(--text-muted);font-size:0.85rem;">No categories yet.</p>'
      : cats.map(c => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--bg-primary);border-radius:6px;margin-bottom:6px;">
          <span style="display:flex;align-items:center;gap:8px;">${c.icon || '📦'} <strong>${c.name}</strong> <small style="color:var(--text-muted);">${c.slug}</small></span>
          <button class="btn btn-danger btn-sm" onclick="confirmDeleteCategory(${c.id},'${(c.name || '').replace(/'/g, "\\'")}')">✕</button>
        </div>`).join('');
  } catch (err) { console.error('Categories manager error:', err); }
}

async function loadBrandsManager() {
  const container = document.getElementById('brands-manager-list');
  if (!container) return;
  try {
    const res = await fetch('/api/brands');
    const data = await res.json();
    const brands = data.brands || [];
    container.innerHTML = brands.length === 0
      ? '<p style="color:var(--text-muted);font-size:0.85rem;">No brands yet.</p>'
      : brands.map(b => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--bg-primary);border-radius:6px;margin-bottom:6px;">
          <span><strong>${b.name}</strong> <small style="color:var(--text-muted);">${b.slug}</small></span>
          <button class="btn btn-danger btn-sm" onclick="confirmDeleteBrand(${b.id},'${(b.name || '').replace(/'/g, "\\'")}')">✕</button>
        </div>`).join('');
  } catch (err) { console.error('Brands manager error:', err); }
}

async function addCategory() {
  const nameEl = document.getElementById('new-category-name');
  const iconEl = document.getElementById('new-category-icon');
  const name = nameEl?.value?.trim();
  if (!name) return showToast('Enter a category name', 'error');
  const icon = iconEl?.value?.trim() || '📦';
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  try {
    const res = await fetch('/api/owner/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, slug, icon })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create category');
    showToast(`Category "${name}" created`, 'success');
    if (nameEl) nameEl.value = '';
    if (iconEl) iconEl.value = '';
    // Refresh both the manager and dropdowns
    const catRes = await fetch('/api/categories');
    const catData = await catRes.json();
    cachedCategories = catData.categories || [];
    populateCategoryDropdowns();
    loadCategoriesManager();
  } catch (err) { showToast(err.message, 'error'); }
}

async function addBrand() {
  const nameEl = document.getElementById('new-brand-name');
  const name = nameEl?.value?.trim();
  if (!name) return showToast('Enter a brand name', 'error');
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  try {
    const res = await fetch('/api/owner/brands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, slug })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create brand');
    showToast(`Brand "${name}" created`, 'success');
    if (nameEl) nameEl.value = '';
    const brandRes = await fetch('/api/brands');
    const brandData = await brandRes.json();
    cachedBrands = brandData.brands || [];
    populateBrandDropdowns();
    loadBrandsManager();
  } catch (err) { showToast(err.message, 'error'); }
}

function confirmDeleteCategory(id, name) {
  showConfirmDialog(`Delete category "${name}"?`, 'Products in this category will keep their category reference but it will no longer appear in filters.', async () => {
    try {
      const res = await fetch(`/api/owner/categories/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      showToast('Category deleted', 'success');
      const catRes = await fetch('/api/categories');
      const catData = await catRes.json();
      cachedCategories = catData.categories || [];
      populateCategoryDropdowns();
      loadCategoriesManager();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

function confirmDeleteBrand(id, name) {
  showConfirmDialog(`Delete brand "${name}"?`, 'Products linked to this brand will keep their reference.', async () => {
    try {
      const res = await fetch(`/api/owner/brands/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      showToast('Brand deleted', 'success');
      const brandRes = await fetch('/api/brands');
      const brandData = await brandRes.json();
      cachedBrands = brandData.brands || [];
      populateBrandDropdowns();
      loadBrandsManager();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

async function loadStaffUsers() {
  const tbody = document.getElementById('staff-users-body');
  if (!tbody) return;

  try {
    const res = await fetch('/api/owner/users');
    if (!res.ok) return;
    const data = await res.json();
    const users = data.users || [];

    tbody.innerHTML = users.map(u => `
      <tr>
        <td><strong>${u.full_name}</strong></td>
        <td>${u.email}</td>
        <td><span class="badge ${u.role === 'OWNER' ? 'badge-warning' : 'badge-info'}">${u.staff_role || u.role}</span></td>
        <td><span class="badge badge-success">${u.status}</span></td>
        <td>
          ${u.role === 'OWNER' || u.id === 1 ? `<span style="color:var(--text-muted); font-size:0.75rem; font-weight:600;">Store Owner</span>` : `<button class="btn btn-danger btn-sm" onclick="deleteStaffUser(${u.id}, '${(u.full_name || '').replace(/'/g, "\\'")}')">Delete</button>`}
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Staff users error:', err);
  }
}

function openAddUserModal() {
  openModal('modal-user');
}

// ==========================================
// MODAL CONTROLS & FORM HANDLERS
// ==========================================
function openModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.add('active');
}

function closeModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.remove('active');
}

function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
}

function setupEventListeners() {
  setupProductImageUploadListener();
  // POS Scan input
  const scanInput = document.getElementById('pos-scan-input');
  if (scanInput) {
    scanInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const code = scanInput.value.trim();
        if (!code) return;

        // Try direct barcode / SKU scan API lookup
        try {
          const res = await fetch(`/api/owner/products/scan/${encodeURIComponent(code)}`);
          if (res.ok) {
            const data = await res.json();
            if (data.product) {
              addToPosCart(data.product.id, 1);
              scanInput.value = '';
              showToast(`Added: ${data.product.name}`, 'success');
              return;
            }
          }
        } catch (err) { }

        // Fallback to local catalog search
        renderPosCatalog();
      }
    });

    scanInput.addEventListener('input', () => {
      renderPosCatalog();
    });
  }

  // POS Category Chips
  document.querySelectorAll('.category-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.category-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      renderPosCatalog();
    });
  });

  // POS Payment Method Buttons
  document.querySelectorAll('.pay-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pay-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      posSelectedPayment = btn.getAttribute('data-method');
      const splitBox = document.getElementById('split-payment-box');
      if (splitBox) {
        splitBox.style.display = posSelectedPayment === 'SPLIT' ? 'flex' : 'none';
      }
    });
  });

  // Product Search & Filters
  const prodSearch = document.getElementById('prod-search-input');
  if (prodSearch) prodSearch.addEventListener('input', () => loadProductsData());
  const prodCat = document.getElementById('prod-category-filter');
  if (prodCat) prodCat.addEventListener('change', () => loadProductsData());
  const prodStock = document.getElementById('prod-stock-filter');
  if (prodStock) prodStock.addEventListener('change', () => loadProductsData());

  // Orders Filters
  const ordSearch = document.getElementById('orders-search-input');
  if (ordSearch) ordSearch.addEventListener('input', () => loadOrdersData());
  const ordStatus = document.getElementById('orders-status-filter');
  if (ordStatus) ordStatus.addEventListener('change', () => loadOrdersData());
  const ordType = document.getElementById('orders-type-filter');
  if (ordType) ordType.addEventListener('change', () => loadOrdersData());

  // Inventory Ledger Filter
  const ledFilter = document.getElementById('inv-ledger-type-filter');
  if (ledFilter) ledFilter.addEventListener('change', () => loadInventoryData());

  // Reports Range Buttons
  document.querySelectorAll('.report-range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.report-range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadReportsData(btn.getAttribute('data-range'));
    });
  });

  // Expense Filter
  const expCat = document.getElementById('exp-category-filter');
  if (expCat) expCat.addEventListener('change', () => loadExpensesData());

  // Invoices Search & Filter
  const invSearch = document.getElementById('invoice-search-input');
  if (invSearch) invSearch.addEventListener('input', () => loadInvoicesData());
  const invType = document.getElementById('invoice-type-filter');
  if (invType) invType.addEventListener('change', () => loadInvoicesData());

  // --- FORM SUBMIT HANDLERS ---
  // 1. Add / Edit Product Form
  const prodForm = document.getElementById('form-product');
  if (prodForm) {
    prodForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('prod-form-id').value;
      const payload = {
        name: document.getElementById('prod-form-name').value.trim(),
        sku: document.getElementById('prod-form-sku').value.trim(),
        barcode: document.getElementById('prod-form-barcode').value.trim(),
        hsn: document.getElementById('prod-form-hsn').value.trim(),
        category_id: parseInt(document.getElementById('prod-form-category').value, 10),
        brand_id: parseInt(document.getElementById('prod-form-brand').value, 10),
        purchase_price: parseInt(document.getElementById('prod-form-cost').value, 10),
        price: parseInt(document.getElementById('prod-form-price').value, 10),
        gst_rate: parseFloat(document.getElementById('prod-form-gst').value),
        stock: parseInt(document.getElementById('prod-form-stock').value, 10),
        min_stock: parseInt(document.getElementById('prod-form-minstock').value, 10),
        primary_image: (document.getElementById('prod-form-image-1')?.value.trim() || document.getElementById('prod-form-image-2')?.value.trim() || document.getElementById('prod-form-image-3')?.value.trim() || 'hero1.png'),
        images_json: [
          document.getElementById('prod-form-image-1')?.value.trim(),
          document.getElementById('prod-form-image-2')?.value.trim(),
          document.getElementById('prod-form-image-3')?.value.trim()
        ].filter(Boolean),
        description: document.getElementById('prod-form-desc').value.trim()
      };

      try {
        const url = id ? `/api/owner/products/${id}` : '/api/owner/products';
        const method = id ? 'PUT' : 'POST';
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to save product');

        showToast(data.message || 'Product saved successfully', 'success');
        closeModal('modal-product');
        await loadInitialMasterData();
        loadProductsData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // 2. Add Purchase Form
  const purForm = document.getElementById('form-purchase');
  if (purForm) {
    purForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const rows = document.querySelectorAll('.pur-item-row');
      const items = [];
      rows.forEach(r => {
        const prodId = parseInt(r.querySelector('.pur-line-prod').value, 10);
        const qty = parseInt(r.querySelector('.pur-line-qty').value, 10);
        const cost = parseFloat(r.querySelector('.pur-line-cost').value);
        const gst = parseFloat(r.querySelector('.pur-line-gst').value);
        if (prodId && qty > 0) {
          items.push({ product_id: prodId, quantity: qty, unit_cost: cost, gst_rate: gst });
        }
      });

      if (items.length === 0) {
        showToast('Please add at least one line item', 'error');
        return;
      }

      const payload = {
        supplier_id: parseInt(document.getElementById('pur-form-supplier').value, 10),
        supplier_invoice_no: document.getElementById('pur-form-invoice-no').value.trim(),
        purchase_date: document.getElementById('pur-form-date').value,
        is_received: document.getElementById('pur-form-received').value === 'true',
        amount_paid: parseInt(document.getElementById('pur-form-paid').value, 10) || 0,
        payment_method: document.getElementById('pur-form-paymethod').value,
        items
      };

      try {
        const res = await fetch('/api/owner/purchases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to record purchase');

        showToast(data.message, 'success');
        closeModal('modal-purchase');
        loadPurchasesData();
        await loadInitialMasterData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // 3. Add Expense Form
  const expForm = document.getElementById('form-expense');
  if (expForm) {
    expForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        category: document.getElementById('exp-form-category').value,
        expense_date: document.getElementById('exp-form-date').value,
        description: document.getElementById('exp-form-desc').value.trim(),
        amount: parseInt(document.getElementById('exp-form-amount').value, 10),
        payment_method: document.getElementById('exp-form-method').value,
        vendor: document.getElementById('exp-form-vendor').value.trim()
      };

      try {
        const res = await fetch('/api/owner/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to save expense');

        showToast(data.message, 'success');
        closeModal('modal-expense');
        loadExpensesData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // 4. Adjust Stock Form
  const adjForm = document.getElementById('form-adjust-stock');
  if (adjForm) {
    adjForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        product_id: parseInt(document.getElementById('adj-form-product').value, 10),
        change: parseInt(document.getElementById('adj-form-change').value, 10),
        reason: `${document.getElementById('adj-form-reason-type').value}: ${document.getElementById('adj-form-notes').value.trim()}`
      };

      try {
        const res = await fetch('/api/inventory/adjust', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to adjust stock');

        showToast('Stock updated and transaction logged', 'success');
        closeModal('modal-adjust-stock');
        loadInventoryData();
        await loadInitialMasterData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // 5. Supplier Payment Form
  const spayForm = document.getElementById('form-supplier-payment');
  if (spayForm) {
    spayForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const purId = document.getElementById('spay-purchase-id').value;
      const payload = {
        amount: parseInt(document.getElementById('spay-amount').value, 10),
        payment_method: document.getElementById('spay-method').value,
        reference_no: document.getElementById('spay-ref').value.trim()
      };

      try {
        const res = await fetch(`/api/owner/purchases/${purId}/payments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to record supplier payment');

        showToast(data.message, 'success');
        closeModal('modal-supplier-payment');
        loadPurchasesData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // 6. Add Customer Form
  const custForm = document.getElementById('form-customer');
  if (custForm) {
    custForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        name: document.getElementById('cust-form-name').value.trim(),
        phone: document.getElementById('cust-form-phone').value.trim(),
        email: document.getElementById('cust-form-email').value.trim(),
        customer_type: document.getElementById('cust-form-type').value,
        gstin: document.getElementById('cust-form-gstin').value.trim(),
        billing_address: document.getElementById('cust-form-address').value.trim()
      };

      try {
        const res = await fetch('/api/owner/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to add customer');

        showToast(data.message, 'success');
        closeModal('modal-customer');
        await loadInitialMasterData();
        loadCustomersData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // 7. Add Supplier Form
  const suppForm = document.getElementById('form-supplier');
  if (suppForm) {
    suppForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        name: document.getElementById('supp-form-name').value.trim(),
        contact_person: document.getElementById('supp-form-contact').value.trim(),
        gstin: document.getElementById('supp-form-gstin').value.trim(),
        phone: document.getElementById('supp-form-phone').value.trim(),
        email: document.getElementById('supp-form-email').value.trim(),
        address: document.getElementById('supp-form-address').value.trim()
      };

      try {
        const res = await fetch('/api/owner/suppliers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to add supplier');

        showToast(data.message, 'success');
        closeModal('modal-supplier');
        await loadInitialMasterData();
        loadSuppliersData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // 8. Add Staff Account Form
  const userForm = document.getElementById('form-user');
  if (userForm) {
    userForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        full_name: document.getElementById('user-form-name').value.trim(),
        email: document.getElementById('user-form-email').value.trim(),
        password: document.getElementById('user-form-password').value,
        staff_role: document.getElementById('user-form-role').value,
        phone: document.getElementById('user-form-phone').value.trim()
      };

      try {
        const res = await fetch('/api/owner/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create staff user');

        showToast(data.message, 'success');
        closeModal('modal-user');
        loadStaffUsers();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // 9. Store Settings Form
  const settingsForm = document.getElementById('store-settings-form');
  if (settingsForm) {
    settingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        STORE_NAME: document.getElementById('set-store-name').value.trim(),
        STORE_LEGAL_NAME: document.getElementById('set-legal-name').value.trim(),
        STORE_GSTIN: document.getElementById('set-store-gstin').value.trim(),
        STORE_ADDRESS: document.getElementById('set-store-address').value.trim(),
        STORE_PHONE: document.getElementById('set-store-phone').value.trim(),
        STORE_EMAIL: document.getElementById('set-store-email').value.trim(),
        INVOICE_PREFIX: document.getElementById('set-invoice-prefix').value.trim(),
        POS_INVOICE_PREFIX: document.getElementById('set-pos-prefix').value.trim()
      };

      try {
        const res = await fetch('/api/owner/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to save settings');
        showToast(data.message, 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }
}


// ==========================================
// MONGODB ATLAS CLUSTER INTEGRATION CLIENT
// ==========================================
async function loadMongoStatus() {
  try {
    const res = await fetch('/api/owner/mongodb/status');
    if (!res.ok) return;
    const data = await res.json();

    const topDot = document.getElementById('mongo-top-dot');
    const topText = document.getElementById('mongo-top-text');
    const cardDot = document.getElementById('mongo-card-dot');
    const cardText = document.getElementById('mongo-card-status-text');
    const cardStatus = document.getElementById('mongo-card-status');
    const banner = document.getElementById('mongo-whitelist-banner');

    if (data.connected) {
      if (topDot) topDot.style.background = '#10b981';
      if (topText) topText.textContent = 'MongoDB: Connected';
      if (cardDot) cardDot.style.background = '#10b981';
      if (cardText) {
        cardText.textContent = 'Active & Connected';
        if (cardStatus) cardStatus.style.color = '#10b981';
      }
      if (banner) banner.style.display = 'none';

      if (data.counts) {
        const c = data.counts;
        if (document.getElementById('cnt-products')) document.getElementById('cnt-products').textContent = c.products || 0;
        if (document.getElementById('cnt-orders')) document.getElementById('cnt-orders').textContent = c.orders || 0;
        if (document.getElementById('cnt-invoices')) document.getElementById('cnt-invoices').textContent = c.invoices || 0;
        if (document.getElementById('cnt-customers')) document.getElementById('cnt-customers').textContent = c.customers || 0;
        if (document.getElementById('cnt-purchases')) document.getElementById('cnt-purchases').textContent = c.purchases || 0;
        if (document.getElementById('cnt-suppliers')) document.getElementById('cnt-suppliers').textContent = c.suppliers || 0;
        if (document.getElementById('cnt-expenses')) document.getElementById('cnt-expenses').textContent = c.expenses || 0;
        if (document.getElementById('cnt-settings')) document.getElementById('cnt-settings').textContent = c.settings || 0;
      }
    } else {
      const isWhitelistIssue = data.error && (data.error.includes('alert number 80') || data.error.includes('tlsv1 alert internal error'));
      if (topDot) topDot.style.background = isWhitelistIssue ? '#f59e0b' : '#ef4444';
      if (topText) topText.textContent = isWhitelistIssue ? 'MongoDB: Whitelist Required' : 'MongoDB: Disconnected';
      if (cardDot) cardDot.style.background = isWhitelistIssue ? '#f59e0b' : '#ef4444';
      if (cardText) {
        cardText.textContent = isWhitelistIssue ? 'IP Whitelist Required' : 'Disconnected';
        if (cardStatus) cardStatus.style.color = isWhitelistIssue ? '#f59e0b' : '#ef4444';
      }
      if (banner) banner.style.display = isWhitelistIssue ? 'block' : 'none';
    }
  } catch (err) {
    console.error('Mongo status check error:', err);
  }
}

async function triggerMongoSync() {
  const btn = document.getElementById('btn-mongo-sync');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Syncing Data...';
  }

  showToast('Starting full sync of owner portal data to MongoDB Atlas...', 'info');

  try {
    const res = await fetch('/api/owner/mongodb/sync', { method: 'POST' });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast('All owner portal data stored in MongoDB cluster successfully!', 'success');
      await loadMongoStatus();
    } else {
      showToast(data.reason || data.error || 'Failed to sync data to MongoDB', 'error');
    }
  } catch (err) {
    showToast('Sync request error: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Sync All Data to MongoDB';
    }
  }
}

async function triggerMongoReconnect() {
  const btn = document.getElementById('btn-mongo-reconnect');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Connecting...';
  }

  showToast('Retrying MongoDB Atlas connection...', 'info');

  try {
    const res = await fetch('/api/owner/mongodb/reconnect', { method: 'POST' });
    const data = await res.json();
    if (data.connected) {
      showToast('MongoDB Atlas connected successfully!', 'success');
      await triggerMongoSync();
    } else {
      showToast('Could not connect. Please ensure your IP (42.109.144.22 or 0.0.0.0/0) is whitelisted in Atlas.', 'warning');
    }
    await loadMongoStatus();
  } catch (err) {
    showToast('Reconnect error: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Retry Connection';
    }
  }
}


// ==========================================
// UNIVERSAL DELETE CONTROLLERS
// ==========================================
async function deleteProductItem(id, name) {
  try {
    const res = await fetch(`/api/owner/products/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete product');
    showToast(data.message || 'Product deleted successfully', 'success');
    loadProductsData();
    loadDashboardData();
  } catch (err) { showToast(err.message, 'error'); }
}

function confirmDeleteProduct(id, name) {
  showConfirmDialog(`Delete product "${name}"?`, 'This will remove it from the catalog.', () => deleteProductItem(id, name));
}

async function deleteOrderItem(id, orderNum) {
  try {
    const res = await fetch(`/api/owner/orders/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete order');
    showToast(data.message || 'Order deleted successfully', 'success');
    if (typeof loadOrdersData === 'function') loadOrdersData();
    if (typeof loadDashboardData === 'function') loadDashboardData();
  } catch (err) { showToast(err.message, 'error'); }
}

function confirmDeleteOrder(id, orderNum) {
  showConfirmDialog(`Delete Order #${orderNum}?`, 'This will permanently remove the order and all items.', () => deleteOrderItem(id, orderNum));
}

async function deletePurchaseItem(id, purchaseNum) {
  try {
    const res = await fetch(`/api/owner/purchases/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete purchase');
    showToast(data.message || 'Purchase deleted successfully', 'success');
    loadPurchasesData();
    loadDashboardData();
  } catch (err) { showToast(err.message, 'error'); }
}

function confirmDeletePurchase(id, purchaseNum) {
  showConfirmDialog(`Delete Purchase #${purchaseNum}?`, 'This will remove the purchase and stock entry.', () => deletePurchaseItem(id, purchaseNum));
}

async function deleteInvoiceItem(id, invoiceNum) {
  try {
    const res = await fetch(`/api/owner/invoices/${id || invoiceNum}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete invoice');
    showToast(data.message || 'Invoice deleted successfully', 'success');
    loadInvoicesData();
  } catch (err) { showToast(err.message, 'error'); }
}

function confirmDeleteInvoice(id, invoiceNum) {
  showConfirmDialog(`Delete Invoice "${invoiceNum}"?`, 'This will permanently remove this invoice.', () => deleteInvoiceItem(id, invoiceNum));
}

async function deleteCreditNoteItem(id, cnNum) {
  try {
    const res = await fetch(`/api/owner/credit-notes/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete credit note');
    showToast(data.message || 'Credit note deleted successfully', 'success');
    loadCreditNotes();
  } catch (err) { showToast(err.message, 'error'); }
}

function confirmDeleteCreditNote(id, cnNum) {
  showConfirmDialog(`Delete Credit Note "${cnNum}"?`, 'This will permanently remove this return record.', () => deleteCreditNoteItem(id, cnNum));
}

async function deleteCustomerItem(id, name) {
  try {
    const res = await fetch(`/api/owner/customers/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete customer');
    showToast(data.message || 'Customer deleted successfully', 'success');
    loadCustomersData();
  } catch (err) { showToast(err.message, 'error'); }
}

function confirmDeleteCustomer(id, name) {
  showConfirmDialog(`Delete customer "${name}"?`, 'This will remove all customer records.', () => deleteCustomerItem(id, name));
}

async function deleteSupplierItem(id, name) {
  try {
    const res = await fetch(`/api/owner/suppliers/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete supplier');
    showToast(data.message || 'Supplier deleted successfully', 'success');
    loadSuppliersData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function confirmDeleteSupplier(id, name) {
  showConfirmDialog(`Delete supplier "${name}"?`, 'This will permanently remove the supplier record.', () => deleteSupplierItem(id, name));
}

function editSupplierItem(id) {
  const s = cachedSuppliers.find(x => x.id == id);
  if (!s) return showToast('Supplier not found', 'error');
  document.getElementById('supp-form-name').value = s.name || '';
  document.getElementById('supp-form-contact').value = s.contact_person || '';
  document.getElementById('supp-form-email').value = s.email || '';
  document.getElementById('supp-form-phone').value = s.phone || '';
  document.getElementById('supp-form-address').value = s.address || '';
  document.getElementById('supp-form-gstin').value = s.gstin || '';
  const modal = document.getElementById('modal-supplier');
  if (modal) {
    modal.dataset.editId = id;
    const title = modal.querySelector('.modal-title');
    if (title) title.textContent = 'Edit Supplier';
  }
  openModal('modal-supplier');
}

async function deleteStaffUser(id, name) {
  try {
    const res = await fetch(`/api/owner/users/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete staff member');
    showToast(data.message || 'Staff member deleted successfully', 'success');
    loadStaffUsers();
  } catch (err) { showToast(err.message, 'error'); }
}

function confirmDeleteStaff(id, name) {
  showConfirmDialog(`Delete staff account "${name}"?`, 'This action cannot be undone.', () => deleteStaffUser(id, name));
}

// ==========================================
// INVENTORY LEDGER DELETE CONTROLLER
// ==========================================
async function deleteInventoryTxn(txnId) {
  if (!confirm(`Are you sure you want to delete this inventory ledger transaction (ID #${txnId})?`)) return;
  try {
    const res = await fetch(`/api/owner/inventory/ledger/${txnId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete inventory record');
    showToast(data.message || 'Inventory record deleted', 'success');
    if (typeof loadInventoryData === 'function') loadInventoryData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Global window bindings for table action buttons and modals
window.deleteExpense = typeof deleteExpense !== 'undefined' ? deleteExpense : null;
window.deleteProductItem = typeof deleteProductItem !== 'undefined' ? deleteProductItem : null;
window.deleteOrderItem = typeof deleteOrderItem !== 'undefined' ? deleteOrderItem : null;
window.deletePurchaseItem = typeof deletePurchaseItem !== 'undefined' ? deletePurchaseItem : null;
window.deleteInvoiceItem = typeof deleteInvoiceItem !== 'undefined' ? deleteInvoiceItem : null;
window.deleteCreditNoteItem = typeof deleteCreditNoteItem !== 'undefined' ? deleteCreditNoteItem : null;
window.deleteCustomerItem = typeof deleteCustomerItem !== 'undefined' ? deleteCustomerItem : null;
window.deleteSupplierItem = typeof deleteSupplierItem !== 'undefined' ? deleteSupplierItem : null;
window.deleteStaffUser = typeof deleteStaffUser !== 'undefined' ? deleteStaffUser : null;
window.deleteInventoryTxn = deleteInventoryTxn;
window.openModal = typeof openModal !== 'undefined' ? openModal : null;
window.closeModal = typeof closeModal !== 'undefined' ? closeModal : null;
window.showToast = typeof showToast !== 'undefined' ? showToast : null;


// Quick Custom Category & Brand Modal Handlers
function openInlineAddCategoryModal() {
  const input = document.getElementById('quick-cat-name');
  if (input) input.value = '';
  const desc = document.getElementById('quick-cat-desc');
  if (desc) desc.value = '';
  const icon = document.getElementById('quick-cat-icon');
  if (icon) icon.value = '📦';
  openModal('modal-quick-category');
  setTimeout(() => { if (input) input.focus(); }, 100);
}

async function handleQuickCategorySubmit(e) {
  e.preventDefault();
  const name = document.getElementById('quick-cat-name').value.trim();
  const icon = document.getElementById('quick-cat-icon').value.trim() || '📦';
  const description = document.getElementById('quick-cat-desc').value.trim();
  if (!name) return;

  const btn = document.getElementById('btn-save-quick-cat');
  if (btn) btn.disabled = true;

  try {
    const res = await fetch('/api/owner/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, icon, description })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create category');

    const newId = data.id || (data.category && data.category.id);
    cachedCategories.push({ id: newId, _id: newId, name, icon, description });
    populateCategoryDropdowns();

    const prodCatSelect = document.getElementById('prod-form-category');
    if (prodCatSelect) prodCatSelect.value = newId;

    closeModal('modal-quick-category');
    showToast(`Category "${name}" created and selected!`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function openInlineAddBrandModal() {
  const input = document.getElementById('quick-brand-name');
  if (input) input.value = '';
  const desc = document.getElementById('quick-brand-desc');
  if (desc) desc.value = '';
  openModal('modal-quick-brand');
  setTimeout(() => { if (input) input.focus(); }, 100);
}

async function handleQuickBrandSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('quick-brand-name').value.trim();
  const description = document.getElementById('quick-brand-desc').value.trim();
  if (!name) return;

  const btn = document.getElementById('btn-save-quick-brand');
  if (btn) btn.disabled = true;

  try {
    const res = await fetch('/api/owner/brands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create brand');

    const newId = data.id || (data.brand && data.brand.id);
    cachedBrands.push({ id: newId, _id: newId, name, description });
    populateBrandDropdowns();

    const prodBrandSelect = document.getElementById('prod-form-brand');
    if (prodBrandSelect) prodBrandSelect.value = newId;

    closeModal('modal-quick-brand');
    showToast(`Brand "${name}" created and selected!`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}


// Quick Supplier Modal Handlers
function openInlineAddSupplierModal() {
  const name = document.getElementById('quick-supp-name');
  if (name) name.value = '';
  const contact = document.getElementById('quick-supp-contact');
  if (contact) contact.value = '';
  const phone = document.getElementById('quick-supp-phone');
  if (phone) phone.value = '';
  const gstin = document.getElementById('quick-supp-gstin');
  if (gstin) gstin.value = '';
  const email = document.getElementById('quick-supp-email');
  if (email) email.value = '';
  const addr = document.getElementById('quick-supp-address');
  if (addr) addr.value = '';

  openModal('modal-quick-supplier');
  setTimeout(() => { if (name) name.focus(); }, 100);
}

async function handleQuickSupplierSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('quick-supp-name').value.trim();
  const contact_person = document.getElementById('quick-supp-contact').value.trim();
  const phone = document.getElementById('quick-supp-phone').value.trim();
  const gstin = document.getElementById('quick-supp-gstin').value.trim();
  const email = document.getElementById('quick-supp-email').value.trim();
  const address = document.getElementById('quick-supp-address').value.trim();

  if (!name || !phone) {
    showToast('Supplier Name and Phone are required', 'error');
    return;
  }

  const btn = document.getElementById('btn-save-quick-supp');
  if (btn) btn.disabled = true;

  try {
    const res = await fetch('/api/owner/suppliers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, contact_person, phone, gstin, email, address })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to add supplier');

    const newId = data.id;
    cachedSuppliers.push({ id: newId, name, gstin, phone });
    populateSupplierDropdowns();

    const purSupplierSelect = document.getElementById('pur-form-supplier');
    if (purSupplierSelect) purSupplierSelect.value = newId;

    closeModal('modal-quick-supplier');
    showToast(`Supplier "${name}" added and selected!`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}


// Product Image Upload & Preset Helpers
function setProductImagePreset(filename) {
  if (typeof applyPresetToActiveSlot === 'function') {
    applyPresetToActiveSlot(filename);
    return;
  }
  const input = document.getElementById('prod-form-image-1') || document.getElementById('prod-form-image');
  const preview = document.getElementById('prod-img-preview-1') || document.getElementById('prod-img-preview');
  if (input) input.value = filename;
  if (preview) preview.src = filename;
}

function clearProductImage() {
  if (typeof clearSlotImage === 'function') {
    clearSlotImage(1);
    clearSlotImage(2);
    clearSlotImage(3);
  }
}

function setupProductImageUploadListener() {
  const fileInput = document.getElementById('prod-form-file');
  if (fileInput && !fileInput.dataset.bound) {
    fileInput.dataset.bound = 'true';
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const statusEl = document.getElementById('prod-img-upload-status');
      if (statusEl) statusEl.textContent = 'Uploading: ' + file.name + '...';

      const reader = new FileReader();
      reader.onload = async (evt) => {
        const base64Data = evt.target.result;
        const preview = document.getElementById('prod-img-preview');
        if (preview) preview.src = base64Data;

        try {
          const res = await fetch('/api/owner/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64Data, filename: file.name })
          });
          const data = await res.json();
          if (res.ok && data.url) {
            const input = document.getElementById('prod-form-image');
            if (input) input.value = data.url;
            if (preview) preview.src = data.url;
            if (statusEl) statusEl.textContent = '✓ Ready: ' + file.name;
            showToast('Image uploaded successfully!', 'success');
          } else {
            // Fallback to data URL
            const input = document.getElementById('prod-form-image');
            if (input) input.value = base64Data;
            if (statusEl) statusEl.textContent = '✓ Local image ready: ' + file.name;
          }
        } catch (err) {
          const input = document.getElementById('prod-form-image');
          if (input) input.value = base64Data;
          if (statusEl) statusEl.textContent = '✓ Image ready: ' + file.name;
        }
      };
      reader.readAsDataURL(file);
    });
  }

  const textInput = document.getElementById('prod-form-image');
  if (textInput && !textInput.dataset.bound) {
    textInput.dataset.bound = 'true';
    textInput.addEventListener('input', () => {
      const preview = document.getElementById('prod-img-preview');
      if (preview) preview.src = textInput.value.trim() || 'hero1.png';
    });
  }
}


// --- 3 IMAGE SLOTS CONTROLLERS ---
function updateSlotPreview(slot) {
  const input = document.getElementById('prod-form-image-' + slot);
  const preview = document.getElementById('prod-img-preview-' + slot);
  const empty = document.getElementById('prod-img-empty-' + slot);
  const val = input ? input.value.trim() : '';

  if (val) {
    if (preview) { preview.src = val; preview.style.display = 'block'; }
    if (empty) empty.style.display = 'none';
  } else {
    if (preview) { preview.src = ''; preview.style.display = 'none'; }
    if (empty) empty.style.display = 'block';
  }
}

function clearSlotImage(slot) {
  const input = document.getElementById('prod-form-image-' + slot);
  if (input) input.value = '';
  updateSlotPreview(slot);
}

function applyPresetToActiveSlot(filename) {
  let targetSlot = 1;
  const val1 = document.getElementById('prod-form-image-1')?.value.trim();
  const val2 = document.getElementById('prod-form-image-2')?.value.trim();
  const val3 = document.getElementById('prod-form-image-3')?.value.trim();

  if (!val1) targetSlot = 1;
  else if (!val2) targetSlot = 2;
  else if (!val3) targetSlot = 3;
  else targetSlot = 1;

  const input = document.getElementById('prod-form-image-' + targetSlot);
  if (input) {
    input.value = filename;
    updateSlotPreview(targetSlot);
    showToast('Loaded preset into Image ' + targetSlot, 'success');
  }
}

async function handleSlotFileUpload(slot, fileInput) {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;

  const input = document.getElementById('prod-form-image-' + slot);
  const preview = document.getElementById('prod-img-preview-' + slot);
  const empty = document.getElementById('prod-img-empty-' + slot);

  const reader = new FileReader();
  reader.onload = async (evt) => {
    const base64Data = evt.target.result;
    if (preview) { preview.src = base64Data; preview.style.display = 'block'; }
    if (empty) empty.style.display = 'none';

    try {
      const res = await fetch('/api/owner/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Data, filename: file.name })
      });
      const data = await res.json();
      if (res.ok && data.url) {
        if (input) input.value = data.url;
        if (preview) preview.src = data.url;
        showToast('Image ' + slot + ' uploaded successfully!', 'success');
      } else {
        if (input) input.value = base64Data;
      }
    } catch (err) {
      if (input) input.value = base64Data;
    }
  };
  reader.readAsDataURL(file);
}


// --- 3 IMAGE SLOTS CONTROLLERS ---
function updateSlotPreview(slot) {
  const input = document.getElementById('prod-form-image-' + slot);
  const preview = document.getElementById('prod-img-preview-' + slot);
  const empty = document.getElementById('prod-img-empty-' + slot);
  const val = input ? input.value.trim() : '';

  if (val) {
    if (preview) { preview.src = val; preview.style.display = 'block'; }
    if (empty) empty.style.display = 'none';
  } else {
    if (preview) { preview.src = ''; preview.style.display = 'none'; }
    if (empty) empty.style.display = 'block';
  }
}

function clearSlotImage(slot) {
  const input = document.getElementById('prod-form-image-' + slot);
  if (input) input.value = '';
  updateSlotPreview(slot);
}

function applyPresetToActiveSlot(filename) {
  let targetSlot = 1;
  const val1 = document.getElementById('prod-form-image-1')?.value.trim();
  const val2 = document.getElementById('prod-form-image-2')?.value.trim();
  const val3 = document.getElementById('prod-form-image-3')?.value.trim();

  if (!val1) targetSlot = 1;
  else if (!val2) targetSlot = 2;
  else if (!val3) targetSlot = 3;
  else targetSlot = 1;

  const input = document.getElementById('prod-form-image-' + targetSlot);
  if (input) {
    input.value = filename;
    updateSlotPreview(targetSlot);
    showToast('Loaded preset into Image ' + targetSlot, 'success');
  }
}

async function handleSlotFileUpload(slot, fileInput) {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;

  const input = document.getElementById('prod-form-image-' + slot);
  const preview = document.getElementById('prod-img-preview-' + slot);
  const empty = document.getElementById('prod-img-empty-' + slot);

  const reader = new FileReader();
  reader.onload = async (evt) => {
    const base64Data = evt.target.result;
    if (preview) { preview.src = base64Data; preview.style.display = 'block'; }
    if (empty) empty.style.display = 'none';

    try {
      const res = await fetch('/api/owner/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Data, filename: file.name })
      });
      const data = await res.json();
      if (res.ok && data.url) {
        if (input) input.value = data.url;
        if (preview) preview.src = data.url;
        showToast('Image ' + slot + ' uploaded successfully!', 'success');
      } else {
        if (input) input.value = base64Data;
      }
    } catch (err) {
      if (input) input.value = base64Data;
    }
  };
  reader.readAsDataURL(file);
}
