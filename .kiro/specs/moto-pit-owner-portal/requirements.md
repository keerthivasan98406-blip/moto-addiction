# Requirements Document

## Introduction

The Moto Pit Owner Portal is a production-ready, full-featured business management dashboard accessible at `/owner` for users with the OWNER or ADMIN role. It extends the existing Moto Pitshop Node.js/SQLite platform by adding a new `owner.html` page and a set of protected API endpoints to `server.js`. The portal provides complete control over all operational aspects of the motorcycle accessories retail business: sales, inventory, purchasing, GST compliance, reporting, and configuration — all within a dark-themed, single-page interface using vanilla HTML/CSS/JS. The existing customer-facing website (index.html, products.html, account.html, track-order.html) and all existing API endpoints must remain fully functional and unmodified.

---

## Glossary

- **Owner_Portal**: The single-page dashboard at `/owner` (served as `owner.html`) available only to users with role `OWNER` or `ADMIN`.
- **Portal_Server**: The existing `server.js` Node.js HTTP server, extended with new API endpoints for the portal.
- **DB**: The existing SQLite database (`motopitshop.db`) accessed via `node:sqlite` `DatabaseSync`.
- **POS**: Point-of-Sale module within the Owner_Portal for counter/walk-in sales.
- **GST**: Indian Goods and Services Tax. Intra-state transactions use CGST + SGST (split equally). Inter-state transactions use IGST.
- **Paise**: Smallest Indian currency unit (1 INR = 100 paise). All monetary values in the DB are stored as integers in paise.
- **INR**: Indian Rupee, the display currency (values divided by 100 for display).
- **SKU**: Stock Keeping Unit, unique product identifier.
- **HSN**: Harmonized System Nomenclature code used for GST classification.
- **GSTIN**: Goods and Services Tax Identification Number (15-character alphanumeric).
- **KPI**: Key Performance Indicator metric displayed on the dashboard.
- **Low_Stock_Alert**: A product whose current `stock` is less than or equal to its `min_stock` value.
- **Inventory_Transaction**: A record in the `inventory_transactions` table tracking every stock change.
- **Purchase_Entry**: A supplier goods receipt entry that increases stock and creates a purchase record.
- **Credit_Note**: A document issued to reverse or reduce a previously raised GST invoice.
- **Expense**: A business cost entry that does not originate from a product purchase.
- **Session_Token**: The `motopitshop_session` cookie or `Authorization: Bearer` header value used for authentication.
- **Audit_Log**: A record in the `audit_logs` table capturing every privileged action taken.
- **Archive**: Setting a product's `status` to `'ARCHIVED'` instead of deleting it, preserving order history.

---

## Requirements

### Requirement 1: Access Control and Authentication

**User Story:** As the shop owner, I want the portal to be accessible only to authorised staff, so that business data is protected from unauthorised access.

#### Acceptance Criteria

1. WHEN a request is made to `/owner`, THE Portal_Server SHALL verify the requestor holds the `OWNER` or `ADMIN` role via the Session_Token before serving `owner.html`; IF the role check fails, THE Portal_Server SHALL redirect the requestor to `/login?redirect=/owner`.
2. WHEN any owner portal API endpoint (prefixed `/api/owner/`) is called, THE Portal_Server SHALL validate the Session_Token and confirm the role is `OWNER` or `ADMIN`; IF validation fails, THE Portal_Server SHALL return HTTP 403 with `{"error": "Unauthorized"}`.
3. THE Owner_Portal SHALL read the current user's session from the `motopitshop_session` cookie on page load and redirect to `/login` if no valid session exists.
4. THE Owner_Portal SHALL display the authenticated user's name and role in the sidebar header at all times.
5. WHEN a user logs out from the Owner_Portal, THE Portal_Server SHALL attempt to invalidate the session; THE Portal_Server SHALL always redirect the user to `/login` regardless of whether session invalidation succeeds or fails.

---

### Requirement 2: Owner Dashboard

**User Story:** As the shop owner, I want a real-time dashboard with KPI cards and charts, so that I can assess business health at a glance.

#### Acceptance Criteria

1. THE Owner_Portal Dashboard SHALL display the following KPI cards computed from DB data: today's total revenue (sum of `grand_total` for orders with `payment_status = 'SUCCESS'` on the current date), total orders today, total active products count, and count of Low_Stock_Alerts.
2. WHEN the Dashboard is loaded, THE Portal_Server SHALL compute KPI values from the `orders`, `order_items`, `products`, and `inventory_transactions` tables using a single API call to `GET /api/owner/dashboard/kpis`.
3. THE Owner_Portal Dashboard SHALL render a 7-day sales bar chart using data from `GET /api/owner/dashboard/sales-chart`, where each bar represents the total `grand_total` of `SUCCESS`-payment orders for that calendar day.
4. THE Owner_Portal Dashboard SHALL list the 10 most recent orders with columns: order number, customer name, grand total (in INR), status badge, and a View button.
5. THE Owner_Portal Dashboard SHALL list all Low_Stock_Alerts (products where `stock <= min_stock`) with product name, current stock, min stock, and a quick-adjust button.
6. THE Owner_Portal Dashboard SHALL provide Quick Action buttons: "New POS Sale", "Add Product", "Record Purchase", and "View Reports", each navigating to the corresponding portal module.
7. WHEN the dashboard KPI data is older than 60 seconds, THE Owner_Portal SHALL automatically refresh the KPIs via continuous background polling regardless of whether the dashboard tab is in focus, without a full page reload.

---

### Requirement 3: POS Billing / Counter Sales

**User Story:** As the shop owner or staff, I want a Point-of-Sale interface for walk-in customers, so that I can bill counter sales quickly, collect payment, deduce stock, and print receipts.

#### Acceptance Criteria

1. THE Owner_Portal POS module SHALL provide a product search field that queries `GET /api/owner/pos/search?q=` and returns matching products by name, SKU, or barcode, displaying product name, SKU, price (INR), and available stock.
2. WHEN a product is selected in the POS, THE Owner_Portal SHALL add it to the cart with quantity 1 and allow the operator to increase or decrease quantity; IF the requested quantity exceeds available `stock`, THE Owner_Portal SHALL display an inline error and prevent further increase.
3. THE Owner_Portal POS cart SHALL compute and display: line-item totals, subtotal (taxable value), GST breakdown (CGST + SGST for intra-state, IGST for inter-state based on store settings), and grand total — all in INR.
4. WHEN the "Charge" button is clicked in POS, THE Owner_Portal SHALL present a payment modal with options: Cash, UPI, Card; WHERE the Cash option is selected, THE Owner_Portal SHALL accept a "Cash Tendered" amount and display change due.
5. WHEN a POS sale is confirmed, THE Portal_Server SHALL via `POST /api/owner/pos/sale`: create an order record in the `orders` table with `payment_method` set to the chosen method, insert `order_items`, deduct stock from `products` exactly once per item, insert an `inventory_transactions` record of type `'SALE'` for each item, create an `invoices` record, and return the new order ID and invoice number.
6. IF any product in a POS sale has insufficient stock at the time of confirmation, THE Portal_Server SHALL return HTTP 409 and THE Owner_Portal SHALL display an out-of-stock error without creating any order or modifying any stock.
7. WHEN a POS sale completes successfully, THE Owner_Portal SHALL open a print-ready thermal receipt (80mm layout) showing: store name, GSTIN, date/time, itemised list with HSN and GST, totals, and payment method — using the browser's `window.print()`.
8. THE Owner_Portal POS module SHALL support adding a walk-in customer name and phone number (not requiring a registered account).
9. WHEN the POS cart is cleared, THE Owner_Portal SHALL reset all cart state to empty without affecting any DB records.

---

### Requirement 4: Online Order Management

**User Story:** As the shop owner, I want to manage all online orders from a single view, so that I can process fulfilment, update statuses, and handle customer queries efficiently.

#### Acceptance Criteria

1. THE Owner_Portal Orders module SHALL fetch all orders via `GET /api/orders` (existing endpoint) and display them in a paginated table (50 orders per page) with columns: order number, date, customer name, grand total, payment status badge, order status badge, and action buttons.
2. THE Owner_Portal Orders module SHALL provide filter controls for: date range (from/to), order status, and payment status, applied client-side against the fetched orders list.
3. THE Owner_Portal Orders module SHALL provide a search input that filters displayed orders by order number or customer name in real time.
4. WHEN the "View" button is clicked for an order, THE Owner_Portal SHALL open a modal displaying: all order items with quantities and prices, shipping address, payment method and reference, and a timeline of status changes.
5. WHEN an order status is changed via a dropdown in the Orders module, THE Owner_Portal SHALL call `PUT /api/orders/:id` (existing endpoint) with the new status and display a success or error toast notification.
6. THE Owner_Portal Orders module SHALL provide a "Print Invoice" button for each order that renders a GST-compliant A4 invoice using data from `GET /api/owner/invoices/:order_id` and triggers `window.print()`.
7. THE Owner_Portal Orders module SHALL display the count of orders in each status (PLACED, CONFIRMED, PROCESSING, PACKED, SHIPPED, DELIVERED, CANCELLED) as summary chips above the table.

---

### Requirement 5: Product Management

**User Story:** As the shop owner, I want full CRUD control over products including variants, GST/HSN configuration, and archiving, so that the product catalogue is always accurate.

#### Acceptance Criteria

1. THE Owner_Portal Products module SHALL display all products (including ARCHIVED) from `GET /api/owner/products` in a searchable, filterable table showing: thumbnail, name, SKU, category, brand, price (INR), stock, GST rate, and status badge.
2. WHEN the "Add Product" button is clicked, THE Owner_Portal SHALL display a full-form modal with fields: name, SKU, product code, category, brand, description, price (INR), compare-at price, GST rate (dropdown: 0%, 5%, 12%, 18%, 28%), HSN code, initial stock, min stock threshold, supplier, primary image URL, and additional images.
3. WHEN a product is saved via `POST /api/owner/products`, THE Portal_Server SHALL validate that name, price, GST rate, HSN, and primary image are provided; IF any required field is missing, THE Portal_Server SHALL return HTTP 400 with a descriptive error message; otherwise THE Portal_Server SHALL insert the product, log an Audit_Log entry, and return the new product ID.
4. WHEN an existing product is edited and saved via `PUT /api/owner/products/:id`, THE Portal_Server SHALL update all supplied fields, recalculate the discount percentage from price and compare-at price, update `updated_at`, and log an Audit_Log entry.
5. WHEN the "Archive" action is triggered for a product, THE Portal_Server SHALL via `PATCH /api/owner/products/:id/archive` set the product's `status` to `'ARCHIVED'` and return HTTP 200; THE Portal_Server SHALL NOT delete the product record.
6. WHEN a product is archived, THE Owner_Portal SHALL move it to an "Archived" tab in the Products module and exclude it from the active product count KPI.
7. THE Owner_Portal Products module SHALL provide a "Restore" button for archived products that calls `PATCH /api/owner/products/:id/restore` to set the status back to `'ACTIVE'`.
8. THE Owner_Portal Products module SHALL support bulk archive of multiple selected products via a "Bulk Archive" button.

---

### Requirement 6: Inventory and Stock Management

**User Story:** As the shop owner, I want a complete inventory ledger with adjustment tools and movement history, so that stock levels are always accurate and auditable.

#### Acceptance Criteria

1. THE Owner_Portal Inventory module SHALL fetch and display all products with their current stock, min stock, reserved stock, and last transaction date via `GET /api/owner/inventory`.
2. THE Owner_Portal Inventory module SHALL highlight rows where `stock <= min_stock` in amber/orange to indicate Low_Stock_Alerts.
3. WHEN the "Adjust Stock" button is clicked for a product, THE Owner_Portal SHALL present a modal with fields: adjustment type (Add / Remove / Set), quantity, and reason; WHEN submitted, THE Portal_Server SHALL via `POST /api/owner/inventory/adjust` update the product's `stock`, insert an `inventory_transactions` record, and log an Audit_Log entry.
4. IF the adjustment type is "Remove" and the requested quantity exceeds current stock, THE Portal_Server SHALL return HTTP 409 with `{"error": "Insufficient stock"}` and THE Owner_Portal SHALL display the error without modifying any DB record.
5. THE Owner_Portal Inventory module SHALL display a stock movement ledger for each product, loaded via `GET /api/owner/inventory/:product_id/ledger`, showing: date, transaction type, quantity change, previous stock, new stock, and notes.
6. THE Owner_Portal Inventory module SHALL provide a CSV export of the full inventory list via a "Export CSV" button, generating the file client-side from the fetched data.
7. THE Owner_Portal Inventory module SHALL display a "Low Stock Summary" panel listing all products with `stock <= min_stock`, with a count badge in the sidebar navigation.

---

### Requirement 7: Distributor / Purchase Entry

**User Story:** As the shop owner, I want to record supplier purchases and goods receipts, so that stock is updated accurately and procurement is tracked.

#### Acceptance Criteria

1. THE Owner_Portal Purchases module SHALL display all purchase entries from `GET /api/owner/purchases` in a table with columns: purchase number, supplier name, date, total cost (INR), GST amount, grand total, payment status, and receipt status.
2. WHEN the "New Purchase" button is clicked, THE Owner_Portal SHALL display a purchase entry form with fields: supplier (dropdown from `GET /api/suppliers`), supplier invoice number, purchase date, and a dynamic line-items table (product, quantity, unit cost in INR).
3. WHEN a purchase entry is saved via `POST /api/owner/purchases`, THE Portal_Server SHALL: validate that supplier, date, and at least one line item with product, quantity, and unit cost are provided; compute the total cost and GST amount per line item using each product's own `gst_rate`; insert a record into `purchases` and `purchase_items`; increment `stock` for each product in `products` exactly once; insert an `inventory_transactions` record of type `'PURCHASE'` for each product (one aggregated row per product per transaction, with the `quantity_change` holding the total quantity); and log an Audit_Log entry.
4. IF any product referenced in a purchase entry does not exist in the DB, THE Portal_Server SHALL return HTTP 400 and THE Owner_Portal SHALL highlight the invalid row; THE Portal_Server SHALL NOT partially commit any changes.
5. THE Owner_Portal Purchases module SHALL allow marking a purchase's payment status as PAID or UNPAID via `PATCH /api/owner/purchases/:id/payment-status`.
6. THE Owner_Portal Purchases module SHALL display a purchase detail view showing all line items with unit costs and totals when the "View" button is clicked.

---

### Requirement 8: GST Invoice Management

**User Story:** As the shop owner, I want to generate and manage Indian GST-compliant invoices and credit notes, so that the business meets its tax obligations.

#### Acceptance Criteria

1. THE Owner_Portal Invoices module SHALL fetch all invoices from `GET /api/owner/invoices` and display: invoice number, date, customer name, order number, taxable value, CGST, SGST, IGST, total tax, and grand total (all in INR).
2. WHEN a "Print Invoice" button is clicked, THE Owner_Portal SHALL render a printable A4 GST invoice containing: store name, address, and GSTIN; customer name and GSTIN (if available); invoice number and date; itemised table with product name, HSN, quantity, unit price, GST rate, CGST, SGST or IGST, and line total; summary of taxable value, tax breakdown, and grand total in both numerals and words.
3. THE Owner_Portal Invoices module SHALL apply CGST + SGST (each at half the product's GST rate) for intra-state sales and IGST (at the full GST rate) for inter-state sales, determined by comparing the customer's state with the store's registered state from `store_settings`; WHEN the customer's state cannot be determined (e.g., missing address or GSTIN), THE Owner_Portal SHALL default to intra-state (CGST + SGST) treatment.
4. WHEN the "Issue Credit Note" button is clicked for an invoice, THE Owner_Portal SHALL display a form with reason and amount fields; WHEN submitted, THE Portal_Server SHALL via `POST /api/owner/invoices/:id/credit-note` insert a record into a `credit_notes` table (created with `CREATE TABLE IF NOT EXISTS`) and return the credit note number.
5. THE Owner_Portal Invoices module SHALL support searching invoices by invoice number or customer name.
6. THE Portal_Server SHALL ensure monetary values in invoices are stored and retrieved as integers in paise and converted to INR (divided by 100) only at the display layer in the frontend.

---

### Requirement 9: Customer Management

**User Story:** As the shop owner, I want to view and manage the customer database with full order history, so that I can understand customer behaviour and resolve issues quickly.

#### Acceptance Criteria

1. THE Owner_Portal Customers module SHALL fetch all users with `role = 'CUSTOMER'` from `GET /api/owner/customers` and display: full name, email, phone, registration date, total orders count, and total lifetime spend (sum of `grand_total` for orders with `payment_status = 'SUCCESS'`).
2. THE Owner_Portal Customers module SHALL provide a search input filtering by name, email, or phone in real time.
3. WHEN a customer row is clicked, THE Owner_Portal SHALL open a detail panel showing: profile information, all orders with status and amounts, and total spend.
4. THE Owner_Portal Customers module SHALL allow editing a customer's `full_name` and `phone` via `PUT /api/owner/customers/:id`; THE Portal_Server SHALL restrict editing of `email`, `role`, and `password_hash` via this endpoint.
5. THE Owner_Portal Customers module SHALL allow suspending or activating a customer account via `PATCH /api/owner/customers/:id/status`; WHEN a customer is suspended, THE Portal_Server SHALL set the user's `status` to `'SUSPENDED'` and log an Audit_Log entry.

---

### Requirement 10: Supplier / Distributor Management

**User Story:** As the shop owner, I want to manage supplier records with purchase history and outstanding payments, so that vendor relationships are tracked and payments are not missed.

#### Acceptance Criteria

1. THE Owner_Portal Suppliers module SHALL display all suppliers from `GET /api/suppliers` (existing endpoint) with name, contact person, phone, email, GSTIN, and status.
2. WHEN the "Add Supplier" button is clicked, THE Owner_Portal SHALL show a form; WHEN submitted via `POST /api/owner/suppliers`, THE Portal_Server SHALL insert a new supplier record, validate that name is provided, and return HTTP 201.
3. WHEN an existing supplier is edited via `PUT /api/owner/suppliers/:id`, THE Portal_Server SHALL update the supplied fields, validate name is non-empty, and log an Audit_Log entry.
4. THE Owner_Portal Suppliers module SHALL display a per-supplier purchase history listing all `purchases` records for that supplier with total amounts and payment status.
5. THE Owner_Portal Suppliers module SHALL display the outstanding balance for each supplier (sum of `grand_total` for purchases with `payment_status = 'UNPAID'`).

---

### Requirement 11: Monthly Reports

**User Story:** As the shop owner, I want date-ranged financial reports with CSV export, so that I can analyse business performance and prepare for GST filings.

#### Acceptance Criteria

1. THE Owner_Portal Reports module SHALL provide a date range picker (from date, to date) that filters all report data; WHEN a date range is applied, THE Owner_Portal SHALL call `GET /api/owner/reports?from=&to=&type=` and re-render the report.
2. THE Owner_Portal Reports module SHALL render a Sales Report showing: total orders, total revenue, total tax collected (CGST, SGST, IGST separately), and a daily breakdown table with date, order count, and revenue.
3. THE Owner_Portal Reports module SHALL always render a Purchase Report containing all of the following fields: total purchases, total purchase cost, total GST paid on purchases, and a per-supplier summary; these fields MUST be present regardless of whether any purchases exist in the selected date range.
4. THE Owner_Portal Reports module SHALL render a Profit Report showing: gross revenue, total purchase cost, gross profit, and gross margin percentage — computed from orders and purchases within the selected date range.
5. THE Owner_Portal Reports module SHALL render a Tax Report (GSTR-1 summary) showing: total taxable value, CGST collected, SGST collected, IGST collected, total GST collected, and HSN-wise tax summary — suitable for manual GSTR-1 filing.
6. WHEN the "Export CSV" button is clicked for any report, THE Owner_Portal SHALL generate and download a CSV file client-side from the fetched report data, with appropriate column headers.
7. THE Portal_Server `/api/owner/reports` endpoint SHALL accept `type` parameter values of `sales`, `purchases`, `profit`, and `tax`, and return the appropriate aggregated data from the DB.

---

### Requirement 12: Expenses and Payments

**User Story:** As the shop owner, I want to record and categorise business expenses, so that I can track costs that are not product purchases.

#### Acceptance Criteria

1. THE Owner_Portal Expenses module SHALL fetch all expenses from `GET /api/owner/expenses` and display: date, category, description, amount (INR), and added-by user name.
2. WHEN the "Add Expense" button is clicked, THE Owner_Portal SHALL show a form with fields: date, category (dropdown: Rent, Utilities, Marketing, Salaries, Logistics, Miscellaneous), description, and amount (INR); WHEN submitted via `POST /api/owner/expenses`, THE Portal_Server SHALL insert a record into an `expenses` table (created with `CREATE TABLE IF NOT EXISTS`) with the amount stored in paise, log an Audit_Log entry, and return HTTP 201.
3. WHEN an expense is edited via `PUT /api/owner/expenses/:id`, THE Portal_Server SHALL update all supplied fields, convert the amount to paise, and log an Audit_Log entry.
4. WHEN an expense is deleted via `DELETE /api/owner/expenses/:id`, THE Portal_Server SHALL remove the record and log an Audit_Log entry; THE Portal_Server SHALL restrict this endpoint to users with role `OWNER` only and return HTTP 403 Forbidden for any other role.
5. THE Owner_Portal Expenses module SHALL display a monthly total for the current month and a category-wise breakdown as a summary panel.

---

### Requirement 13: Shop Settings and Configuration

**User Story:** As the shop owner, I want to configure business details, invoice settings, and manage staff users, so that the system reflects accurate business information and access is controlled.

#### Acceptance Criteria

1. THE Owner_Portal Settings module SHALL load current store settings from `GET /api/admin/settings` (existing endpoint) and pre-populate editable fields: business name, owner name, tagline, store email, store phone, store address, GSTIN, currency, invoice prefix, and order prefix.
2. WHEN settings are saved via the Settings form, THE Owner_Portal SHALL call `POST /api/admin/settings` (existing endpoint) with all changed key-value pairs and display a success toast on HTTP 200.
3. THE Portal_Server SHALL validate that the GSTIN field, when provided, matches the 15-character Indian GSTIN format (`^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$`); IF the GSTIN format is invalid, THE Portal_Server SHALL return HTTP 400 with `{"error": "Invalid GSTIN format"}`; WHEN the GSTIN is valid and no other validation failure exists, THE Portal_Server SHALL return HTTP 200.
4. THE Owner_Portal Settings module SHALL display a User Management table listing all users from `GET /api/owner/users` with columns: name, email, role, status, and last login date.
5. WHEN an admin creates a new staff user via `POST /api/owner/users`, THE Portal_Server SHALL hash the password, insert the user with the specified role (`STAFF` or `ADMIN`), and log an Audit_Log entry; THE Portal_Server SHALL reject role values of `OWNER` from this endpoint to prevent privilege escalation.
6. WHEN a user's role or status is changed via `PUT /api/owner/users/:id`, THE Portal_Server SHALL update the record, log an Audit_Log entry, and return HTTP 200; THE Portal_Server SHALL prevent changing the role of any user with `role = 'OWNER'` via this endpoint.

---

### Requirement 14: UI Design System and Navigation

**User Story:** As the shop owner, I want a premium dark-themed portal with responsive navigation, so that the interface is professional and usable on both desktop and mobile devices.

#### Acceptance Criteria

1. THE Owner_Portal SHALL use a dark theme with the following colour tokens: background `#111318`, sidebar `#17191F`, card surfaces `#202329`, accent `#F59E0B` (amber/orange), text primary `#F1F5F9`, and text muted `#64748B`.
2. THE Owner_Portal SHALL render a fixed-width left sidebar on desktop (≥ 1024px) and a slide-in hamburger drawer on mobile (< 1024px); both renderings SHALL always contain: the Moto Pitshop logo/brand, navigation links to all 12 modules, and the logged-in user name and role — these content requirements are global invariants independent of viewport state.
3. THE Owner_Portal SHALL use Lucide Icons loaded from the CDN (`https://unpkg.com/lucide@latest`) for all sidebar navigation icons and action buttons; IF the Lucide CDN fails to load, the requirement is considered violated regardless of icon usage state.
4. THE Owner_Portal SHALL implement single-page navigation by showing/hiding module sections (`<section>` elements) without full page reloads; WHEN a navigation link is clicked, THE Owner_Portal SHALL update the active link highlight and render only the target section's content.
5. THE Owner_Portal SHALL display toast notifications for all async operation outcomes (success in green, error in red) that auto-dismiss after 3 seconds.
6. THE Owner_Portal SHALL be implemented entirely in vanilla HTML, CSS, and JavaScript with no external framework, bundler, or build step.
7. WHILE the Owner_Portal is making an API call, THE Owner_Portal SHALL display a loading spinner or skeleton state for the relevant section to prevent multiple concurrent submissions.

---

### Requirement 15: Data Integrity and Non-Regression

**User Story:** As the shop owner, I want the portal to preserve all existing website functionality and data integrity, so that customer-facing operations are never disrupted.

#### Acceptance Criteria

1. THE Portal_Server SHALL serve all new owner portal API endpoints under the `/api/owner/` prefix, ensuring zero path collision with any existing endpoint.
2. THE Portal_Server SHALL add all new DB tables (e.g., `expenses`, `credit_notes`) using `CREATE TABLE IF NOT EXISTS` statements, ensuring the database schema migration is non-destructive and idempotent.
3. THE Portal_Server SHALL ensure that every stock-modifying operation (POS sale, purchase entry, inventory adjustment) results in exactly one `inventory_transactions` record per product per transaction; WHEN a single transaction involves multiple units of the same product, THE Portal_Server SHALL insert one aggregated row with the `quantity_change` field holding the total, preventing duplicate stock changes.
4. FOR ALL monetary values entering or leaving the DB via owner portal endpoints, THE Portal_Server SHALL store values in paise (integer) and THE Owner_Portal SHALL display values in INR (value ÷ 100, formatted to 2 decimal places).
5. THE Portal_Server SHALL preserve all existing API endpoints (`/api/products`, `/api/orders`, `/api/auth/*`, `/api/categories`, `/api/brands`, `/api/bikes`, `/api/support/tickets`, `/api/admin/settings`, `/api/payments/create`, `/api/orders/track`) and their existing behaviour without modification.
6. THE Owner_Portal SHALL not modify or override the existing `style.css`, `main.js`, `index.html`, `products.html`, `account.html`, or `track-order.html` files.
