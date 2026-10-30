# Tasks — Moto Pit Owner Portal

## Task 1: Database Schema Migration
Add `expenses` and `credit_notes` tables to `database.js` `initDatabase()` using `CREATE TABLE IF NOT EXISTS`.

- [x] Add `expenses` table with columns: id, expense_number, expense_date, category, description, amount (paise), payment_method, vendor, reference_number, recorded_by, created_at
- [x] Add `credit_notes` table with columns: id, credit_note_number, invoice_id, reason, amount (paise), status, created_by, created_at
- [x] Verify existing tables are not affected
- [x] Run `node database.js` to confirm migration is idempotent

## Task 2: Server Route Guard + API Helper
Add `/owner` route protection and a reusable `requireOwner()` helper in `server.js`.

- [ ] Add `/owner` route guard that redirects non-OWNER/ADMIN users to `/login?redirect=/owner`
- [~] Add `requireOwner(req)` helper that returns user if OWNER/ADMIN, null otherwise
- [~] Ensure existing routes and static file serving are not affected

## Task 3: Owner Dashboard APIs
Add dashboard KPI, sales chart, recent orders, and low-stock endpoints to `server.js`.

- [~] `GET /api/owner/dashboard/kpis` — today's revenue, today's orders, active products, low-stock count
- [~] `GET /api/owner/dashboard/sales-chart` — 7-day sales totals (grand_total by date for SUCCESS payments)
- [~] `GET /api/owner/dashboard/recent-orders` — 10 most recent orders with items
- [~] `GET /api/owner/dashboard/low-stock` — products where stock <= min_stock

## Task 4: POS Billing APIs
Add POS product search and sale completion endpoints.

- [~] `GET /api/owner/pos/search?q=` — search by name, SKU, product_code (returns active products)
- [~] `POST /api/owner/pos/sale` — atomic: validate all stock first, create order, insert items, deduct stock once per item, create invoice, return order+invoice info

## Task 5: Product Management APIs
Add product CRUD with archive/restore.

- [~] `GET /api/owner/products` — all products including ARCHIVED with joins
- [~] `POST /api/owner/products` — create with validation (name, price, GST rate, HSN, primary_image required)
- [~] `PUT /api/owner/products/:id` — update with discount recalculation
- [~] `PATCH /api/owner/products/:id/archive` — set status to ARCHIVED
- [~] `PATCH /api/owner/products/:id/restore` — set status to ACTIVE

## Task 6: Inventory APIs
Add inventory listing, adjustment, and ledger endpoints.

- [~] `GET /api/owner/inventory` — all products with stock, min_stock, reserved_stock, last transaction date
- [~] `POST /api/owner/inventory/adjust` — Add/Remove/Set with stock validation (409 on insufficient)
- [~] `GET /api/owner/inventory/:pid/ledger` — stock movement history for a product

## Task 7: Purchase Entry APIs
Add purchase list, create, and payment status endpoints.

- [~] `GET /api/owner/purchases` — all purchases with supplier names and item counts
- [~] `POST /api/owner/purchases` — validate supplier+items, compute GST per line, insert purchase+items, increment stock once per product, insert inventory_transaction PURCHASE, audit log
- [~] `PATCH /api/owner/purchases/:id/payment-status` — toggle PAID/UNPAID
- [~] `GET /api/owner/purchases/:id` — purchase detail with line items

## Task 8: GST Invoice APIs
Add invoice list, detail, and credit note endpoints.

- [~] `GET /api/owner/invoices` — all invoices with order/customer info
- [~] `GET /api/owner/invoices/:order_id` — invoice with items, tax breakdown
- [~] `POST /api/owner/invoices/:id/credit-note` — insert credit_notes record, return credit note number

## Task 9: Customer Management APIs
Add customer list, edit, and status endpoints.

- [~] `GET /api/owner/customers` — users with role CUSTOMER, with total orders count and lifetime spend
- [~] `PUT /api/owner/customers/:id` — edit full_name and phone only (reject email/role/password_hash)
- [~] `PATCH /api/owner/customers/:id/status` — set ACTIVE or SUSPENDED, audit log

## Task 10: Supplier Management APIs
Add supplier CRUD.

- [~] `GET /api/owner/suppliers` — all suppliers with purchase count and outstanding balance
- [~] `POST /api/owner/suppliers` — add supplier (validate name)
- [~] `PUT /api/owner/suppliers/:id` — edit supplier (validate name), audit log

## Task 11: Reports APIs
Add aggregated report endpoints.

- [~] `GET /api/owner/reports?from=&to=&type=sales` — total orders, revenue, tax breakdown, daily breakdown
- [~] `GET /api/owner/reports?from=&to=&type=purchases` — total purchases, cost, GST, per-supplier summary
- [~] `GET /api/owner/reports?from=&to=&type=profit` — gross revenue, purchase cost, gross profit, margin %
- [~] `GET /api/owner/reports?from=&to=&type=tax` — taxable value, CGST/SGST/IGST, HSN-wise summary

## Task 12: Expenses APIs
Add expense CRUD.

- [~] `GET /api/owner/expenses` — all expenses with added-by user name
- [~] `POST /api/owner/expenses` — create (amount in paise), audit log
- [~] `PUT /api/owner/expenses/:id` — update, audit log
- [~] `DELETE /api/owner/expenses/:id` — OWNER role only (403 for ADMIN), audit log

## Task 13: User Management APIs
Add user list, create staff, and update endpoints.

- [~] `GET /api/owner/users` — all users with last login date
- [~] `POST /api/owner/users` — create STAFF or ADMIN (reject OWNER role), hash password, audit log
- [~] `PUT /api/owner/users/:id` — update role/status (prevent changing OWNER users), audit log

## Task 14: owner.css — Dark Theme Stylesheet
Create the portal stylesheet with all component styles.

- [~] CSS variables for dark theme tokens (#111318, #17191F, #202329, #F59E0B)
- [~] Sidebar styles (fixed, collapsible, mobile drawer)
- [~] KPI card grid
- [~] Data table styles (sortable headers, status badges, hover)
- [~] Modal/dialog styles
- [~] POS layout (search + cart + payment)
- [~] Form styles (inputs, selects, buttons)
- [~] Toast notifications
- [~] Loading spinner/skeleton
- [~] Responsive breakpoints (1024px, 768px)
- [~] Print styles for invoices and receipts

## Task 15: owner.html — Portal HTML Structure
Create the portal page with sidebar, all 12 module sections, and script/link includes.

- [~] HTML head: meta, title, link to owner.css, Lucide CDN, Google Fonts
- [~] Sidebar: logo, MASTER OWNER PANEL subtitle, OWNER badge, 12 nav links with Lucide icons, user profile area
- [~] Dashboard section: KPI cards, chart canvas, recent orders table, low-stock panel, quick actions
- [~] POS section: search bar, product results, cart, customer fields, payment modal, receipt print area
- [~] Orders section: filters, status chips, paginated table, order detail modal, invoice print
- [~] Products section: search/filter bar, table, add/edit modal, archive/restore actions
- [~] Inventory section: table with highlighting, adjust modal, ledger modal, CSV export
- [~] Purchases section: table, new purchase form, detail view
- [~] Invoices section: table, print view, credit note modal
- [~] Customers section: table, detail panel, edit modal
- [~] Suppliers section: table, add/edit form, purchase history view
- [~] Reports section: date picker, report type tabs, tables, CSV export
- [~] Expenses section: summary panel, table, add/edit modal
- [~] Settings section: business form, GSTIN field, user management table

## Task 16: owner.js — API Layer + Navigation + Dashboard
Create the core JS with API helpers, SPA navigation, and dashboard rendering.

- [~] API helper functions (apiGet, apiPost, apiPut, apiPatch, apiDelete)
- [~] formatINR(paise) and parseINR(string) utility functions
- [~] showToast(message, type) function
- [~] showSection(id) navigation with hash sync and active link highlight
- [~] Mobile sidebar toggle with drawer slide-in and auto-close
- [~] loadDashboard() — fetch KPIs, render cards, load chart, load recent orders, load low-stock
- [~] Canvas bar chart renderer for 7-day sales
- [~] KPI auto-refresh every 60 seconds
- [~] Lucide icon initialization on navigation

## Task 17: owner.js — POS Module
Implement POS billing logic.

- [~] Product search with debounced input (300ms)
- [~] Add to cart, quantity controls, stock validation (prevent exceeding stock)
- [~] Cart totals computation (subtotal, CGST/SGST or IGST, grand total)
- [~] Customer name/phone walk-in fields
- [~] Payment modal (Cash/UPI/Card) with cash tendered + change calculation
- [~] Submit sale (POST /api/owner/pos/sale) with loading state and duplicate prevention
- [~] Thermal receipt rendering + window.print()
- [~] Clear cart function

## Task 18: owner.js — Orders, Products, Inventory Modules
Implement order management, product management, and inventory logic.

- [~] Orders: fetch, render table, filters, search, status update, order detail modal, invoice print
- [~] Products: fetch, render table, add/edit modal, archive/restore, bulk archive
- [~] Inventory: fetch, render table with highlighting, adjust modal, ledger modal, CSV export

## Task 19: owner.js — Purchases, Invoices, Customers, Suppliers
Implement remaining management modules.

- [~] Purchases: fetch, render table, new purchase form with line items, detail view, payment status toggle
- [~] Invoices: fetch, render table, print A4 invoice, credit note modal, search
- [~] Customers: fetch, render table, detail panel, edit modal, suspend/activate
- [~] Suppliers: fetch, render table, add/edit form, purchase history view, outstanding balance display

## Task 20: owner.js — Reports, Expenses, Settings
Implement analytics, expense tracking, and configuration.

- [~] Reports: date picker, type tabs (sales/purchases/profit/tax), fetch and render, CSV export
- [~] Expenses: fetch, render table, summary panel, add/edit modal, delete with confirmation
- [~] Settings: load form, save with GSTIN validation, user management table, create staff user, update role/status
