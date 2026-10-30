# Design Document — Moto Pit Owner Portal

## Overview

Extends the existing Node.js/SQLite platform with a new `owner.html` single-page portal and `/api/owner/*` endpoints in `server.js`. No existing files are modified.

---

## Architecture

### Existing Stack (Preserved)
- **Server**: `server.js` — pure Node.js `http.createServer`, no Express
- **Database**: `database.js` — SQLite via `node:sqlite` `DatabaseSync`
- **Frontend**: Vanilla HTML/CSS/JS — no React, no bundler
- **Auth**: Session tokens (cookie `motopitshop_session` or `Authorization: Bearer`), validated via `getSessionUser()`
- **Existing pages**: `index.html`, `products.html`, `account.html`, `track-order.html`, `login.html`

### New Files
| File | Purpose |
|------|---------|
| `owner.html` | Single-page owner portal (all 12 modules in one file) |
| `owner.css` | Portal-specific styles (dark theme, sidebar, cards, tables, forms) |
| `owner.js` | Portal logic (navigation, API calls, rendering, POS cart, charts) |

### Modified Files
| File | Changes |
|------|---------|
| `server.js` | Add `/owner` route guard + ~40 new `/api/owner/*` endpoints (all appended before static file serving) |
| `database.js` | Add `expenses`, `credit_notes` tables via `CREATE TABLE IF NOT EXISTS` in `initDatabase()` |

---

## Database Schema Additions

### expenses table
```sql
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_number TEXT UNIQUE NOT NULL,
  expense_date TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  amount INTEGER NOT NULL,  -- stored in paise
  payment_method TEXT DEFAULT 'CASH',
  vendor TEXT,
  reference_number TEXT,
  recorded_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (recorded_by) REFERENCES users(id)
);
```

### credit_notes table
```sql
CREATE TABLE IF NOT EXISTS credit_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  credit_note_number TEXT UNIQUE NOT NULL,
  invoice_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  amount INTEGER NOT NULL,  -- stored in paise
  status TEXT DEFAULT 'ACTIVE',
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);
```

### products table — add ARCHIVED status
The existing `status` column has no CHECK constraint, so `'ARCHIVED'` works without schema changes.

---

## API Endpoints (all under /api/owner/)

### Auth Guard
A helper function `requireOwner(req)` returns the user if role is OWNER or ADMIN, otherwise null.

### Endpoint Map

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/owner/dashboard/kpis` | Today's revenue, orders, active products, low-stock count |
| GET | `/api/owner/dashboard/sales-chart` | 7-day sales totals |
| GET | `/api/owner/dashboard/recent-orders` | 10 most recent orders |
| GET | `/api/owner/dashboard/low-stock` | Products where stock <= min_stock |
| GET | `/api/owner/pos/search?q=` | Search products by name/SKU/barcode |
| POST | `/api/owner/pos/sale` | Complete POS transaction (atomic) |
| GET | `/api/owner/products` | All products including archived |
| POST | `/api/owner/products` | Create product |
| PUT | `/api/owner/products/:id` | Update product |
| PATCH | `/api/owner/products/:id/archive` | Archive product |
| PATCH | `/api/owner/products/:id/restore` | Restore product |
| GET | `/api/owner/inventory` | All products with stock info |
| POST | `/api/owner/inventory/adjust` | Stock adjustment |
| GET | `/api/owner/inventory/:pid/ledger` | Stock movement history |
| GET | `/api/owner/purchases` | All purchase entries |
| POST | `/api/owner/purchases` | Create purchase + stock update |
| PATCH | `/api/owner/purchases/:id/payment-status` | Update payment status |
| GET | `/api/owner/invoices` | All invoices |
| GET | `/api/owner/invoices/:order_id` | Invoice by order |
| POST | `/api/owner/invoices/:id/credit-note` | Issue credit note |
| GET | `/api/owner/customers` | All customers with order stats |
| PUT | `/api/owner/customers/:id` | Edit customer name/phone |
| PATCH | `/api/owner/customers/:id/status` | Suspend/activate |
| GET | `/api/owner/suppliers` | All suppliers (new endpoint) |
| POST | `/api/owner/suppliers` | Add supplier |
| PUT | `/api/owner/suppliers/:id` | Edit supplier |
| GET | `/api/owner/reports` | Sales/purchase/tax/profit reports |
| GET | `/api/owner/expenses` | All expenses |
| POST | `/api/owner/expenses` | Add expense |
| PUT | `/api/owner/expenses/:id` | Edit expense |
| DELETE | `/api/owner/expenses/:id` | Delete expense (OWNER only) |
| GET | `/api/owner/users` | All users for management |
| POST | `/api/owner/users` | Create staff user |
| PUT | `/api/owner/users/:id` | Update user role/status |

---

## Frontend Architecture (owner.html)

### Single-Page Layout
```
<body>
  <aside id="sidebar"> ... nav links ... </aside>
  <main id="main-content">
    <section id="dashboard"> ... </section>
    <section id="pos"> ... </section>
    <section id="orders"> ... </section>
    <section id="products"> ... </section>
    <section id="inventory"> ... </section>
    <section id="purchases"> ... </section>
    <section id="invoices"> ... </section>
    <section id="customers"> ... </section>
    <section id="suppliers"> ... </section>
    <section id="reports"> ... </section>
    <section id="expenses"> ... </section>
    <section id="settings"> ... </section>
  </main>
</body>
```

### Navigation
- `showSection(id)` hides all sections, shows target, highlights active nav link
- URL hash sync: `#dashboard`, `#pos`, etc.
- Mobile: hamburger toggle, slide-in drawer, auto-close on navigation

### API Layer (owner.js)
- `apiGet(path)`, `apiPost(path, body)`, `apiPut(path, body)`, `apiPatch(path, body)`, `apiDelete(path)`
- All include credentials via cookie (same-origin)
- Centralized error handling with toast notifications
- Loading spinner overlay per section

### Money Handling
- All amounts from API are in paise (integers)
- `formatINR(paise)` → `₹1,234.56`
- All form inputs in INR, converted to paise before sending: `Math.round(parseFloat(val) * 100)`

### Chart
- Custom canvas-based bar chart (no library dependency)
- 7-day sales: bars + axis labels + hover tooltip

### GST Calculation
- Determine intra-state vs inter-state from `store_settings.STORE_STATE` vs customer state
- Intra-state: CGST = SGST = (taxable * rate/100) / 2
- Inter-state: IGST = taxable * rate/100
- Default to intra-state when customer state unknown

---

## /owner Route Guard (server.js)

```javascript
if (pathname === '/owner' || pathname === '/owner/') {
  if (!currentUser || !['OWNER', 'ADMIN'].includes(currentUser.role)) {
    res.writeHead(302, { Location: '/login?redirect=/owner&msg=login_required' });
    return res.end();
  }
  targetFile = 'owner.html';
}
```

---

## Key Design Decisions

1. **Single HTML file** — All 12 modules in one `owner.html` with `owner.css` and `owner.js` linked externally. No SPA framework.
2. **Paise storage** — All monetary DB values in paise; frontend converts to INR for display.
3. **Atomic stock ops** — POS sale validates all stock first, then commits all changes. No partial commits.
4. **Archive not delete** — Products referenced by orders are archived, never deleted.
5. **No existing file changes** — `index.html`, `products.html`, `account.html`, `track-order.html`, `style.css`, `main.js` untouched.
6. **Canvas chart** — Custom lightweight chart, no Chart.js dependency.
7. **Lucide icons via CDN** — `<script src="https://unpkg.com/lucide@latest">` loaded in owner.html.
