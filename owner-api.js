const fs = require('fs');
const path = require('path');
// owner-api.js - Complete Business Logic and API Endpoints for Moto Pit Master Owner Portal
const crypto = require('crypto');
const { db, hashPassword } = require('./database.js');
const { syncTableRecordToMongo, deleteFromMongo, getMongoStatus, connectMongo } = require('./mongodb.js');
const { migrateAllToMongo } = require('./migrate-to-mongo.js');

function getStoreSettings() {
  try {
    const rows = db.prepare('SELECT * FROM store_settings').all();
    const settings = {};
    rows.forEach(r => settings[r.key] = r.value);
    return settings;
  } catch (err) {
    return {};
  }
}
function parseDateRange(range, start, end) {
  const now = new Date();
  let startDate = '';
  let endDate = '';

  if (range === 'today') {
    startDate = now.toISOString().slice(0, 10);
    endDate = startDate;
  } else if (range === 'yesterday') {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    startDate = y.toISOString().slice(0, 10);
    endDate = startDate;
  } else if (range === 'week') {
    const w = new Date(now);
    w.setDate(w.getDate() - 7);
    startDate = w.toISOString().slice(0, 10);
    endDate = now.toISOString().slice(0, 10);
  } else if (range === 'month' || !range) {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    endDate = now.toISOString().slice(0, 10);
  } else if (range === 'last_month') {
    startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
    endDate = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);
  } else if (range === 'year') {
    startDate = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
    endDate = now.toISOString().slice(0, 10);
  } else if (range === 'custom' && start && end) {
    startDate = start;
    endDate = end;
  } else {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    endDate = now.toISOString().slice(0, 10);
  }

  return { startDate, endDate };
}

async function handleOwnerApi(req, res, pathname, parsedUrl, currentUser, parseJsonBody, sendJson, logAudit) {
  const isOwnerStaff = currentUser && (currentUser.role === 'OWNER' || currentUser.role === 'ADMIN' || currentUser.role === 'STAFF');

  if (pathname === '/api/owner/mongodb/status' && req.method === 'GET') {
    const status = getMongoStatus();
    let counts = {};
    try {
      counts = {
        products: db.prepare('SELECT COUNT(*) as c FROM products').get().c,
        orders: db.prepare('SELECT COUNT(*) as c FROM orders').get().c,
        purchases: db.prepare('SELECT COUNT(*) as c FROM purchases').get().c,
        invoices: db.prepare('SELECT COUNT(*) as c FROM invoices').get().c,
        customers: db.prepare('SELECT COUNT(*) as c FROM customers').get().c,
        suppliers: db.prepare('SELECT COUNT(*) as c FROM suppliers').get().c,
        expenses: db.prepare('SELECT COUNT(*) as c FROM expenses').get().c
      };
    } catch(e) {}
    return sendJson(res, 200, {
      ...status,
      counts
    });
  }

  if (pathname === '/api/owner/mongodb/sync' && req.method === 'POST') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    try {
      const syncResult = await migrateAllToMongo();
      if (syncResult.success) {
        logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'MONGODB_FULL_SYNC', 'MONGODB', null, 'SUCCESS', syncResult.counts);
        return sendJson(res, 200, { message: 'All owner portal data synchronized to MongoDB cluster successfully', ...syncResult });
      } else {
        return sendJson(res, 500, { error: syncResult.error, reason: syncResult.reason });
      }
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (pathname === '/api/owner/mongodb/reconnect' && req.method === 'POST') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    try {
      await connectMongo();
      const status = getMongoStatus();
      return sendJson(res, 200, { ...status });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // --- CATEGORY & BRAND MANAGEMENT ---
  if (pathname === '/api/owner/categories' && req.method === 'POST') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    try {
      const body = await parseJsonBody(req);
      const { name, slug, icon, description } = body;
      if (!name || !name.trim()) return sendJson(res, 400, { error: 'Category name is required' });
      const generatedSlug = (slug || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
      const maxOrder = db.prepare('SELECT MAX(display_order) as mo FROM categories').get();
      const nextOrder = ((maxOrder && maxOrder.mo) || 0) + 1;
      const existing = db.prepare('SELECT id FROM categories WHERE slug = ?').get(generatedSlug);
      if (existing) return sendJson(res, 400, { error: `Category with slug "${generatedSlug}" already exists` });
      const result = db.prepare('INSERT INTO categories (slug, name, icon, description, display_order) VALUES (?, ?, ?, ?, ?)').run(generatedSlug, name.trim(), icon || '📦', description || '', nextOrder);
      try { syncTableRecordToMongo(db, 'categories', result.lastInsertRowid); } catch(e) {}
      logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'CREATE_CATEGORY', 'CATEGORY', result.lastInsertRowid, 'SUCCESS', { name, slug: generatedSlug });
      return sendJson(res, 201, { 
        message: 'Category created successfully', 
        id: result.lastInsertRowid,
        category: {
          id: result.lastInsertRowid,
          name: name.trim(),
          slug: generatedSlug,
          icon: icon || '📦',
          description: description || ''
        }
      });
    } catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname === '/api/owner/categories' && req.method === 'GET') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    const categories = db.prepare('SELECT * FROM categories ORDER BY display_order ASC').all();
    return sendJson(res, 200, { categories });
  }

  if (pathname.match(/^\/api\/owner\/categories\/\d+$/) && req.method === 'DELETE') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    const id = parseInt(pathname.split('/')[4], 10);
    try {
      db.prepare('DELETE FROM categories WHERE id = ?').run(id);
      try { deleteFromMongo('categories', id); } catch(e) {}
      logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'DELETE_CATEGORY', 'CATEGORY', id, 'SUCCESS');
      return sendJson(res, 200, { message: 'Category deleted successfully' });
    } catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname === '/api/owner/brands' && req.method === 'POST') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    try {
      const body = await parseJsonBody(req);
      const { name, slug, logo, description } = body;
      if (!name || !name.trim()) return sendJson(res, 400, { error: 'Brand name is required' });
      const generatedSlug = (slug || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
      const existing = db.prepare('SELECT id FROM brands WHERE slug = ?').get(generatedSlug);
      if (existing) return sendJson(res, 400, { error: `Brand with slug "${generatedSlug}" already exists` });
      const result = db.prepare('INSERT INTO brands (slug, name, logo, description) VALUES (?, ?, ?, ?)').run(generatedSlug, name.trim(), logo || '', description || '');
      try { syncTableRecordToMongo(db, 'brands', result.lastInsertRowid); } catch(e) {}
      logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'CREATE_BRAND', 'BRAND', result.lastInsertRowid, 'SUCCESS', { name, slug: generatedSlug });
      return sendJson(res, 201, { 
        message: 'Brand created successfully', 
        id: result.lastInsertRowid,
        brand: {
          id: result.lastInsertRowid,
          name: name.trim(),
          slug: generatedSlug,
          logo: logo || '',
          description: description || ''
        }
      });
    } catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname === '/api/owner/brands' && req.method === 'GET') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    const brands = db.prepare('SELECT * FROM brands ORDER BY name ASC').all();
    return sendJson(res, 200, { brands });
  }

  if (pathname.match(/^\/api\/owner\/brands\/\d+$/) && req.method === 'DELETE') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    const id = parseInt(pathname.split('/')[4], 10);
    try {
      db.prepare('DELETE FROM brands WHERE id = ?').run(id);
      logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'DELETE_BRAND', 'BRAND', id, 'SUCCESS');
      return sendJson(res, 200, { message: 'Brand deleted successfully' });
    } catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  // --- 1. OWNER DASHBOARD METRICS ---
  if (pathname === '/api/owner/dashboard' && req.method === 'GET') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized: Staff/Owner access required' });

    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      const monthStartStr = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
      const prevMonthStartStr = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().slice(0, 10);
      const prevMonthEndStr = new Date(new Date().getFullYear(), new Date().getMonth(), 0).toISOString().slice(0, 10);

      // Summary Cards
      const todaySalesRow = db.prepare(`
        SELECT COALESCE(SUM(grand_total), 0) as total, COUNT(*) as count 
        FROM orders 
        WHERE date(created_at) = ? AND status != 'CANCELLED'
      `).get(todayStr);

      const monthSalesRow = db.prepare(`
        SELECT COALESCE(SUM(grand_total), 0) as total, COUNT(*) as count 
        FROM orders 
        WHERE date(created_at) >= ? AND status != 'CANCELLED'
      `).get(monthStartStr);

      const prevMonthSalesRow = db.prepare(`
        SELECT COALESCE(SUM(grand_total), 0) as total 
        FROM orders 
        WHERE date(created_at) >= ? AND date(created_at) <= ? AND status != 'CANCELLED'
      `).get(prevMonthStartStr, prevMonthEndStr);

      const totalOrdersRow = db.prepare(`SELECT COUNT(*) as count FROM orders`).get();
      const pendingOrdersRow = db.prepare(`
        SELECT COUNT(*) as count FROM orders 
        WHERE status IN ('PLACED', 'CONFIRMED', 'PROCESSING', 'PACKED')
      `).get();

      const totalProductsRow = db.prepare(`SELECT COUNT(*) as count FROM products WHERE is_archived = 0`).get();
      const lowStockRow = db.prepare(`SELECT COUNT(*) as count FROM products WHERE stock <= min_stock AND is_archived = 0`).get();

      const todayPurchasesRow = db.prepare(`
        SELECT COALESCE(SUM(grand_total), 0) as total FROM purchases WHERE date(purchase_date) = ?
      `).get(todayStr);

      const outstandingSuppliersRow = db.prepare(`
        SELECT COALESCE(SUM(outstanding_balance), 0) as total FROM purchases WHERE status = 'RECEIVED'
      `).get();

      const monthlyExpensesRow = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE date(expense_date) >= ?
      `).get(monthStartStr);

      // Estimated Gross Profit for current month = Month Sales Subtotal - Month COGS
      const monthCogsRow = db.prepare(`
        SELECT COALESCE(SUM(oi.quantity * COALESCE(p.purchase_price, 0)), 0) as cogs,
               COALESCE(SUM(oi.total), 0) as net_sales
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        LEFT JOIN products p ON oi.product_id = p.id
        WHERE date(o.created_at) >= ? AND o.status != 'CANCELLED'
      `).get(monthStartStr);

      const estimatedGrossProfit = Math.max(0, (monthSalesRow.total || 0) - (monthCogsRow.cogs || 0));

      // 7-Day Sales Trend
      const dailyTrend = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dStr = d.toISOString().slice(0, 10);
        const dayName = d.toLocaleDateString('en-IN', { weekday: 'short' });
        const row = db.prepare(`
          SELECT COALESCE(SUM(grand_total), 0) as total, COUNT(*) as count
          FROM orders 
          WHERE date(created_at) = ? AND status != 'CANCELLED'
        `).get(dStr);
        dailyTrend.push({ date: dStr, label: dayName, total: row.total, count: row.count });
      }

      // Recent Online Orders
      const recentOnlineOrders = db.prepare(`
        SELECT id, order_number, customer_name, customer_phone, grand_total, status, payment_status, created_at, order_type
        FROM orders
        WHERE order_type = 'ONLINE' OR order_type IS NULL
        ORDER BY id DESC LIMIT 5
      `).all();

      // Recent POS Sales
      const recentPosBills = db.prepare(`
        SELECT id, order_number, customer_name, grand_total, status, payment_method, created_at, order_type
        FROM orders
        WHERE order_type = 'POS'
        ORDER BY id DESC LIMIT 5
      `).all();

      // Low Stock Alerts List
      const lowStockProducts = db.prepare(`
        SELECT id, sku, barcode, name, stock, min_stock, price, primary_image
        FROM products
        WHERE stock <= min_stock AND is_archived = 0
        ORDER BY stock ASC LIMIT 8
      `).all();

      // Top Selling Products
      const topProducts = db.prepare(`
        SELECT oi.product_name, oi.product_sku, SUM(oi.quantity) as total_qty, SUM(oi.total) as total_rev
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE o.status != 'CANCELLED'
        GROUP BY oi.product_name, oi.product_sku
        ORDER BY total_qty DESC LIMIT 5
      `).all();

      // Category breakdown
      const categorySales = db.prepare(`
        SELECT c.name as category_name, COALESCE(SUM(oi.total), 0) as revenue, COUNT(oi.id) as item_count
        FROM categories c
        LEFT JOIN products p ON p.category_id = c.id
        LEFT JOIN order_items oi ON oi.product_id = p.id
        LEFT JOIN orders o ON oi.order_id = o.id AND o.status != 'CANCELLED'
        GROUP BY c.id, c.name
        ORDER BY revenue DESC LIMIT 5
      `).all();

      // Pending Supplier Invoices
      const pendingPurchases = db.prepare(`
        SELECT p.id, p.purchase_number, p.supplier_invoice_no, p.grand_total, p.amount_paid, p.outstanding_balance, p.purchase_date, s.name as supplier_name
        FROM purchases p
        JOIN suppliers s ON p.supplier_id = s.id
        WHERE p.outstanding_balance > 0
        ORDER BY p.id DESC LIMIT 5
      `).all();

      // Recent Invoices
      const recentInvoices = db.prepare(`
        SELECT id, invoice_number, customer_name, customer_phone, grand_total, total_tax, invoice_type, created_at
        FROM invoices
        ORDER BY id DESC LIMIT 5
      `).all();

      return sendJson(res, 200, {
        summary: {
          todaySales: todaySalesRow.total,
          todayOrdersCount: todaySalesRow.count,
          monthlySales: monthSalesRow.total,
          monthlyOrdersCount: monthSalesRow.count,
          prevMonthSales: prevMonthSalesRow.total,
          totalOrders: totalOrdersRow.count,
          pendingOrders: pendingOrdersRow.count,
          totalProducts: totalProductsRow.count,
          lowStockCount: lowStockRow.count,
          todayPurchases: todayPurchasesRow.total,
          outstandingSupplierPayments: outstandingSuppliersRow.total,
          monthlyExpenses: monthlyExpensesRow.total,
          estimatedGrossProfit
        },
        dailyTrend,
        recentOnlineOrders,
        recentPosBills,
        lowStockProducts,
        topProducts,
        categorySales,
        pendingPurchases,
        recentInvoices
      });
    } catch (err) {
      console.error('Owner Dashboard API Error:', err);
      return sendJson(res, 500, { error: err.message });
    }
  }

  // --- 2. POS BILLING & COUNTER SALES ---
  if (pathname === '/api/pos/complete-sale' && req.method === 'POST') {
    if (!canAccessPos) return sendJson(res, 403, { error: 'Unauthorized: Cashier or Manager access required for POS sales' });

    try {
      const body = await parseJsonBody(req);
      const { customer, items, payment, notes, place_of_supply, is_interstate } = body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return sendJson(res, 400, { error: 'Cart must contain at least one product' });
      }

      // Check stock and gather product info
      const validatedItems = [];
      let calculatedSubtotal = 0;
      let calculatedTaxTotal = 0;
      let calculatedCgst = 0;
      let calculatedSgst = 0;
      let calculatedIgst = 0;
      let calculatedDiscountTotal = 0;

      const settings = getStoreSettings();
      const taxInclusive = settings.TAX_INCLUSIVE !== 'false';

      for (const item of items) {
        const prodId = parseInt(item.product_id || item.id, 10);
        const qty = parseInt(item.quantity || 1, 10);
        const prod = db.prepare('SELECT * FROM products WHERE id = ?').get(prodId);

        if (!prod) {
          return sendJson(res, 404, { error: `Product ID #${prodId} not found in catalog` });
        }

        if (prod.stock < qty) {
          return sendJson(res, 400, {
            error: `Insufficient stock for "${prod.name}". Available: ${prod.stock}, Requested: ${qty}`
          });
        }

        const unitPrice = parseFloat(item.price || prod.price);
        const discountPct = parseFloat(item.discount_pct || 0);
        const lineGross = unitPrice * qty;
        const lineDiscount = Math.round(lineGross * (discountPct / 100));
        const lineDiscounted = lineGross - lineDiscount;
        const gstRate = parseFloat(item.gst_rate || prod.gst_rate || 18.0);

        let lineTaxable = lineDiscounted;
        let lineTax = 0;

        if (taxInclusive) {
          lineTaxable = Math.round(lineDiscounted / (1 + (gstRate / 100)));
          lineTax = lineDiscounted - lineTaxable;
        } else {
          lineTax = Math.round(lineDiscounted * (gstRate / 100));
        }

        let lineCgst = 0;
        let lineSgst = 0;
        let lineIgst = 0;

        if (is_interstate) {
          lineIgst = lineTax;
        } else {
          lineCgst = Math.round(lineTax / 2);
          lineSgst = lineTax - lineCgst;
        }

        calculatedSubtotal += lineTaxable;
        calculatedTaxTotal += lineTax;
        calculatedCgst += lineCgst;
        calculatedSgst += lineSgst;
        calculatedIgst += lineIgst;
        calculatedDiscountTotal += lineDiscount;

        validatedItems.push({
          product_id: prod.id,
          sku: prod.sku,
          barcode: prod.barcode,
          name: prod.name,
          price: unitPrice,
          quantity: qty,
          discount_pct: discountPct,
          discount_val: lineDiscount,
          taxable: lineTaxable,
          gst_rate: gstRate,
          hsn: prod.hsn || '8714',
          tax_amount: lineTax,
          cgst: lineCgst,
          sgst: lineSgst,
          igst: lineIgst,
          total: taxInclusive ? lineDiscounted : (lineTaxable + lineTax),
          current_stock: prod.stock
        });
      }

      const grandTotal = taxInclusive ? (calculatedSubtotal + calculatedTaxTotal) : (calculatedSubtotal + calculatedTaxTotal);
      const posPrefix = settings.POS_INVOICE_PREFIX || 'POS-';
      const billNumber = `${posPrefix}${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
      const orderNumber = `MPS-POS-${Date.now().toString().slice(-6)}`;

      const custName = (customer && customer.name) ? customer.name.trim() : (body.customer_name ? body.customer_name.trim() : 'Counter Walk-in Customer');
      const custPhone = (customer && customer.phone) ? customer.phone.trim() : (body.customer_phone ? body.customer_phone.trim() : '');
      const custEmail = (customer && customer.email) ? customer.email.trim() : (body.customer_email ? body.customer_email.trim() : '');
      const custGstin = (customer && customer.gstin) ? customer.gstin.trim() : (body.customer_gstin ? body.customer_gstin.trim() : '');
      const custAddress = (customer && customer.address) ? customer.address.trim() : (body.customer_address ? body.customer_address.trim() : 'Store Counter Sale');

      const payMethod = (payment && payment.method) ? payment.method : (body.payment_method || 'CASH');
      const payRef = (payment && payment.reference_no) ? payment.reference_no : (body.payment_reference || `CASH-${Date.now().toString().slice(-6)}`);

      // Atomic DB Execution
      const insertOrder = db.prepare(`
        INSERT INTO orders (
          order_number, user_id, customer_name, customer_email, customer_phone,
          shipping_address_json, status, payment_status, payment_method, payment_ref,
          subtotal, tax_total, cgst_total, sgst_total, igst_total, discount_total, grand_total,
          order_type, pos_cashier_id, notes
        ) VALUES (?, ?, ?, ?, ?, ?, 'DELIVERED', 'SUCCESS', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'POS', ?, ?)
      `);

      const orderResult = insertOrder.run(
        orderNumber,
        currentUser ? currentUser.id : 1,
        custName,
        custEmail,
        custPhone,
        JSON.stringify({ address: custAddress, gstin: custGstin }),
        payMethod,
        payRef,
        calculatedSubtotal,
        calculatedTaxTotal,
        calculatedCgst,
        calculatedSgst,
        calculatedIgst,
        calculatedDiscountTotal,
        grandTotal,
        currentUser ? currentUser.id : null,
        notes || 'Counter Sale Completed'
      );

      const orderId = orderResult.lastInsertRowid;

      // Insert Order Items & Deduct Stock Exactly Once
      const insertItem = db.prepare(`
        INSERT INTO order_items (
          order_id, product_id, product_name, product_sku, price, quantity,
          hsn, gst_rate, tax_amount, total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const deductStock = db.prepare(`
        UPDATE products SET stock = stock - ?, updated_at = datetime('now') WHERE id = ?
      `);

      const logTxn = db.prepare(`
        INSERT INTO inventory_transactions (
          product_id, transaction_type, quantity_change, previous_stock, new_stock, notes, user_id
        ) VALUES (?, 'SALE', ?, ?, ?, ?, ?)
      `);

      for (const vi of validatedItems) {
        insertItem.run(orderId, vi.product_id, vi.name, vi.sku, vi.price, vi.quantity, vi.hsn, vi.gst_rate, vi.tax_amount, vi.total);
        deductStock.run(vi.quantity, vi.product_id);
        const newStock = vi.current_stock - vi.quantity;
        logTxn.run(vi.product_id, -vi.quantity, vi.current_stock, newStock, `POS Bill #${billNumber}`, currentUser ? currentUser.id : 1);
      }

      // Generate Invoice
      const insertInvoice = db.prepare(`
        INSERT INTO invoices (
          invoice_number, order_id, user_id, customer_name, customer_phone, customer_gstin,
          store_name, store_address, store_gstin, taxable_value, cgst, sgst, igst,
          total_tax, grand_total, invoice_type, place_of_supply, state_code, payment_method, payment_status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'POS', ?, ?, ?, 'PAID', ?)
      `);

      const invRes = insertInvoice.run(
        billNumber,
        orderId,
        currentUser ? currentUser.id : 1,
        custName,
        custPhone,
        custGstin,
        settings.STORE_NAME || 'MOTO ADDICTOR PITSHOP',
        settings.STORE_ADDRESS || '124 Racing Track Boulevard, Motor City, Chennai, TN 600001',
        settings.STORE_GSTIN || '33AABCM1234F1Z9',
        calculatedSubtotal,
        calculatedCgst,
        calculatedSgst,
        calculatedIgst,
        calculatedTaxTotal,
        grandTotal,
        place_of_supply || 'Tamil Nadu (33)',
        settings.STORE_STATE_CODE || '33',
        payMethod,
        notes || 'Paid at counter'
      );

      const invoiceId = invRes.lastInsertRowid;

      // Customer Record Update or Creation
      if (custPhone) {
        const existingCust = db.prepare('SELECT id, total_spend, total_orders FROM customers WHERE phone = ?').get(custPhone);
        if (existingCust) {
          db.prepare(`
            UPDATE customers SET
              total_spend = total_spend + ?,
              total_orders = total_orders + 1,
              name = COALESCE(NULLIF(?, ''), name),
              email = COALESCE(NULLIF(?, ''), email),
              gstin = COALESCE(NULLIF(?, ''), gstin),
              updated_at = datetime('now')
            WHERE id = ?
          `).run(grandTotal, custName, custEmail, custGstin, existingCust.id);
        } else {
          const custCode = `MPS-CUST-${Date.now().toString().slice(-4)}`;
          db.prepare(`
            INSERT INTO customers (customer_code, name, phone, email, billing_address, gstin, customer_type, total_spend, total_orders)
            VALUES (?, ?, ?, ?, ?, ?, 'RETAIL', ?, 1)
          `).run(custCode, custName, custPhone, custEmail, custAddress, custGstin, grandTotal);
        }
      }

      logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'POS_SALE', 'ORDER', orderId, 'SUCCESS', {
        billNumber,
        grandTotal,
        itemsCount: validatedItems.length,
        paymentMethod: payment.method
      });

      // Synchronize POS Sale, GST Invoice & Customer to MongoDB
      syncTableRecordToMongo(db, 'orders', orderId);
      syncTableRecordToMongo(db, 'invoices', invoiceId);
      if (custPhone) {
        const custRec = db.prepare('SELECT id FROM customers WHERE phone = ?').get(custPhone);
        if (custRec) syncTableRecordToMongo(db, 'customers', custRec.id);
      }

      return sendJson(res, 201, {
        success: true,
        message: 'POS bill created successfully',
        billNumber,
        orderId,
        order_id: orderId,
        invoiceId,
        invoice_id: invoiceId,
        orderNumber,
        grandTotal,
        subtotal: calculatedSubtotal,
        taxTotal: calculatedTaxTotal,
        cgst: calculatedCgst,
        sgst: calculatedSgst,
        igst: calculatedIgst,
        items: validatedItems,
        customer: { name: custName, phone: custPhone, gstin: custGstin, address: custAddress },
        payment: { method: payMethod, reference_no: payRef },
        store: {
          name: settings.STORE_NAME || 'MOTO ADDICTOR PITSHOP',
          legalName: settings.STORE_LEGAL_NAME || 'MOTO ADDICTOR PITSHOP Retail Pvt Ltd',
          address: settings.STORE_ADDRESS || '124 Racing Track Boulevard, Motor City, Chennai, TN 600001',
          phone: settings.STORE_PHONE || '+91 98765 43210',
          gstin: settings.STORE_GSTIN || '33AABCM1234F1Z9',
          state: settings.STORE_STATE || 'Tamil Nadu',
          stateCode: settings.STORE_STATE_CODE || '33'
        },
        timestamp: new Date().toISOString()
      });

    } catch (err) {
      console.error('POS Sale Error:', err);
      return sendJson(res, 500, { error: err.message });
    }
  }

  // POS Recent Bills
  if (pathname === '/api/pos/bills' && req.method === 'GET') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });

    const search = parsedUrl.searchParams.get('search');
    const limit = parseInt(parsedUrl.searchParams.get('limit') || '50', 10);

    let query = `
      SELECT o.id, o.order_number, i.invoice_number, o.customer_name, o.customer_phone,
             o.grand_total, o.payment_method, o.status, o.created_at,
             COUNT(oi.id) as items_count
      FROM orders o
      LEFT JOIN invoices i ON o.id = i.order_id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.order_type = 'POS'
    `;
    const params = [];

    if (search) {
      query += ` AND (o.customer_name LIKE ? OR o.customer_phone LIKE ? OR i.invoice_number LIKE ? OR o.order_number LIKE ?)`;
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    query += ` GROUP BY o.id ORDER BY o.id DESC LIMIT ?`;
    params.push(limit);

    const bills = db.prepare(query).all(...params);
    return sendJson(res, 200, { bills });
  }

  // POS Bill Reprint / Details
  if (pathname.startsWith('/api/pos/bills/') && req.method === 'GET') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });

    const idOrNum = pathname.split('/')[4];
    const order = db.prepare(`
      SELECT o.*, i.invoice_number, i.store_name, i.store_address, i.store_gstin, i.place_of_supply, i.state_code
      FROM orders o
      LEFT JOIN invoices i ON o.id = i.order_id
      WHERE o.id = ? OR o.order_number = ? OR i.invoice_number = ?
    `).get(idOrNum, idOrNum, idOrNum);

    if (!order) return sendJson(res, 404, { error: 'Bill record not found' });

    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    const settings = getStoreSettings();

    return sendJson(res, 200, {
      bill: {
        ...order,
        items,
        store: {
          name: settings.STORE_NAME || 'MOTO ADDICTOR PITSHOP',
          legalName: settings.STORE_LEGAL_NAME || 'MOTO ADDICTOR PITSHOP Retail Pvt Ltd',
          address: settings.STORE_ADDRESS || '124 Racing Track Boulevard, Motor City, Chennai, TN 600001',
          phone: settings.STORE_PHONE || '+91 98765 43210',
          gstin: settings.STORE_GSTIN || '33AABCM1234F1Z9',
          state: settings.STORE_STATE || 'Tamil Nadu',
          stateCode: settings.STORE_STATE_CODE || '33'
        }
      }
    });
  }

  // POS Sales Return & Credit Note
  if (pathname === '/api/pos/returns' && req.method === 'POST') {
    if (!canAccessPos) return sendJson(res, 403, { error: 'Unauthorized: Cashier or Manager access required for returns' });

    try {
      const body = await parseJsonBody(req);
      const { invoice_number, items, reason, refund_method } = body;

      if (!invoice_number || !items || !items.length) {
        return sendJson(res, 400, { error: 'Invoice number and return items are required' });
      }

      const invoice = db.prepare('SELECT * FROM invoices WHERE invoice_number = ?').get(invoice_number);
      if (!invoice) return sendJson(res, 404, { error: 'Original invoice not found' });

      let returnSubtotal = 0;
      let returnTaxTotal = 0;

      const cnNumber = `CN-${Date.now().toString().slice(-6)}`;
      const insertCn = db.prepare(`
        INSERT INTO credit_notes (
          credit_note_number, order_id, invoice_id, customer_name, customer_phone,
          subtotal, tax_amount, total_amount, reason, stock_restored, refund_status, refund_method
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'COMPLETED', ?)
      `);

      const insertCnItem = db.prepare(`
        INSERT INTO credit_note_items (
          credit_note_id, product_id, product_name, quantity, price, tax_amount, total, condition
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const restoreStock = db.prepare(`
        UPDATE products SET stock = stock + ?, updated_at = datetime('now') WHERE id = ?
      `);

      const logTxn = db.prepare(`
        INSERT INTO inventory_transactions (
          product_id, transaction_type, quantity_change, previous_stock, new_stock, notes, user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      // Calculate totals
      items.forEach(i => {
        const itemTotal = (i.price || 0) * (i.quantity || 1);
        const itemTax = Math.round(itemTotal * 0.18 / 1.18);
        returnSubtotal += (itemTotal - itemTax);
        returnTaxTotal += itemTax;
      });

      const totalRefund = returnSubtotal + returnTaxTotal;

      const cnResult = insertCn.run(
        cnNumber,
        invoice.order_id,
        invoice.id,
        invoice.customer_name,
        invoice.customer_phone || '',
        returnSubtotal,
        returnTaxTotal,
        totalRefund,
        reason || 'Counter return',
        refund_method || 'CASH'
      );

      const cnId = cnResult.lastInsertRowid;

      for (const item of items) {
        const itemTotal = (item.price || 0) * (item.quantity || 1);
        const itemTax = Math.round(itemTotal * 0.18 / 1.18);
        insertCnItem.run(cnId, item.product_id, item.product_name, item.quantity, item.price, itemTax, itemTotal, item.condition || 'GOOD');

        if (item.product_id) {
          const prod = db.prepare('SELECT stock FROM products WHERE id = ?').get(item.product_id);
          if (prod) {
            const isGood = (item.condition || 'GOOD') === 'GOOD';
            if (isGood) {
              restoreStock.run(item.quantity, item.product_id);
              logTxn.run(item.product_id, 'RETURN', item.quantity, prod.stock, prod.stock + item.quantity, `Credit Note #${cnNumber} return`, currentUser.id);
            } else {
              logTxn.run(item.product_id, 'DAMAGE', 0, prod.stock, prod.stock, `Damaged returned item #${cnNumber} (not added to sellable stock)`, currentUser.id);
            }
          }
        }
      }

      logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'SALES_RETURN', 'INVOICE', invoice.id, 'SUCCESS', {
        creditNoteNumber: cnNumber,
        totalRefund,
        itemsCount: items.length
      });

      // Synchronize Credit Note to MongoDB
      syncTableRecordToMongo(db, 'credit_notes', cnId);

      return sendJson(res, 201, {
        success: true,
        message: 'Credit note created and stock updated',
        creditNoteNumber: cnNumber,
        credit_note_id: cnId,
        creditNoteId: cnId,
        totalRefund
      });
    } catch (err) {
      console.error('POS Return Error:', err);
      return sendJson(res, 500, { error: err.message });
    }
  }

  
  // Image Upload Endpoint for Owner Portal
  if (pathname === '/api/owner/upload' && req.method === 'POST') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });

    try {
      const body = await parseJsonBody(req);
      const { image, filename } = body;
      if (!image) {
        return sendJson(res, 400, { error: 'No image data provided' });
      }

      let base64Data = image;
      let ext = '.png';
      if (image.startsWith('data:image/')) {
        const matches = image.match(/^data:image\/([a-zA-Z0-9-+]+);base64,(.+)$/);
        if (matches) {
          ext = '.' + (matches[1] === 'jpeg' ? 'jpg' : matches[1]);
          base64Data = matches[2];
        }
      } else if (filename && filename.includes('.')) {
        ext = path.extname(filename);
      }

      const uploadsFolder = path.join(__dirname, 'uploads');
      if (!fs.existsSync(uploadsFolder)) {
        fs.mkdirSync(uploadsFolder, { recursive: true });
      }

      const safeName = 'prod-' + Date.now() + '-' + Math.floor(Math.random() * 1000) + ext;
      const targetFilePath = path.join(uploadsFolder, safeName);
      const buffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(targetFilePath, buffer);

      const publicUrl = '/uploads/' + safeName;
      return sendJson(res, 200, {
        success: true,
        url: publicUrl,
        filename: safeName
      });
    } catch (err) {
      console.error('Image upload error:', err);
      return sendJson(res, 500, { error: 'Failed to upload image: ' + err.message });
    }
  }

  // --- 3. PRODUCT MANAGEMENT & BARCODES ---
  if (pathname === '/api/owner/products' && req.method === 'GET') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });

    const search = parsedUrl.searchParams.get('search');
    const category = parsedUrl.searchParams.get('category');
    const brand = parsedUrl.searchParams.get('brand');
    const stockStatus = parsedUrl.searchParams.get('stockStatus');
    const showArchived = parsedUrl.searchParams.get('archived') === 'true';

    let query = `
      SELECT p.*, c.name as category_name, b.name as brand_name, s.name as supplier_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN brands b ON p.brand_id = b.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (!showArchived) {
      query += ` AND p.is_archived = 0`;
    }

    if (search) {
      query += ` AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ? OR p.product_code LIKE ? OR p.hsn LIKE ?)`;
      const term = `%${search}%`;
      params.push(term, term, term, term, term);
    }

    if (category && category !== 'all') {
      query += ` AND (c.slug = ? OR c.id = ?)`;
      params.push(category, category);
    }

    if (brand && brand !== 'all') {
      query += ` AND (b.slug = ? OR b.id = ?)`;
      params.push(brand, brand);
    }

    if (stockStatus === 'low') {
      query += ` AND p.stock <= p.min_stock AND p.stock > 0`;
    } else if (stockStatus === 'out') {
      query += ` AND p.stock <= 0`;
    } else if (stockStatus === 'in') {
      query += ` AND p.stock > p.min_stock`;
    }

    query += ` ORDER BY p.id DESC`;

    const products = db.prepare(query).all(...params);
    return sendJson(res, 200, { products });
  }

  // Lookup product by barcode or SKU for POS scanning
  if (pathname.startsWith('/api/owner/products/scan/') && req.method === 'GET') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });

    const code = decodeURIComponent(pathname.split('/')[5] || '').trim();
    if (!code) return sendJson(res, 400, { error: 'Scan code is required' });

    const product = db.prepare(`
      SELECT p.*, c.name as category_name, b.name as brand_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN brands b ON p.brand_id = b.id
      WHERE (p.barcode = ? OR p.sku = ? OR p.product_code = ?) AND p.is_archived = 0
    `).get(code, code, code);

    if (!product) {
      return sendJson(res, 404, { error: `No active product found for barcode / SKU: ${code}` });
    }

    return sendJson(res, 200, { product, ...product });
  }

  // Full product creation with barcode and variants
  if (pathname === '/api/owner/products' && req.method === 'POST') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });

    try {
      const body = await parseJsonBody(req);
      const {
        name, sku, barcode, brand_id, category_id, supplier_id, description,
        price, old_price, purchase_price, gst_rate, hsn, stock, min_stock,
        primary_image, images_json, variants_json, warranty, weight
      } = body;

      if (!name || !price) {
        return sendJson(res, 400, { error: 'Product name and selling price are required' });
      }

      // Detect duplicate SKU or Barcode
      const genSku = (sku || `MPS-${Date.now().toString().slice(-6)}`).trim();
      const existingSku = db.prepare('SELECT id FROM products WHERE sku = ?').get(genSku);
      if (existingSku) {
        return sendJson(res, 400, { error: `A product with SKU "${genSku}" already exists` });
      }

      let genBarcode = barcode ? barcode.trim() : `890${Date.now().toString().slice(-9)}`;
      if (barcode) {
        const existingBarcode = db.prepare('SELECT id FROM products WHERE barcode = ?').get(genBarcode);
        if (existingBarcode) {
          return sendJson(res, 400, { error: `A product with Barcode "${genBarcode}" already exists` });
        }
      }

      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') + '-' + Date.now().toString().slice(-4);

      const safeBrandId = brand_id && !isNaN(parseInt(brand_id, 10)) ? parseInt(brand_id, 10) : null;
      const safeCatId = category_id && !isNaN(parseInt(category_id, 10)) ? parseInt(category_id, 10) : null;
      const safeSuppId = supplier_id && !isNaN(parseInt(supplier_id, 10)) ? parseInt(supplier_id, 10) : null;
      const safePrice = parseInt(price, 10) || 0;
      const safeOldPrice = old_price && !isNaN(parseInt(old_price, 10)) ? parseInt(old_price, 10) : null;
      const safeGstRate = parseFloat(gst_rate) || 18.0;
      const safeMinStock = parseInt(min_stock, 10) || 5;

      const purPrice = purchase_price && !isNaN(parseInt(purchase_price, 10)) ? parseInt(purchase_price, 10) : Math.round(safePrice * 0.70);
      const initialStock = stock && !isNaN(parseInt(stock, 10)) ? parseInt(stock, 10) : 0;
      const img = primary_image ? primary_image.trim() : 'hero1.png';
      const safeDiscount = safeOldPrice && safeOldPrice > safePrice ? Math.round(((safeOldPrice - safePrice) / safeOldPrice) * 100) : 0;

      const insert = db.prepare(`
        INSERT INTO products (
          sku, barcode, product_code, name, slug, brand_id, category_id, supplier_id,
          description, price, old_price, purchase_price, discount, gst_rate, hsn,
          stock, min_stock, primary_image, images_json, variants_json, warranty, weight, is_archived
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = insert.run(
        genSku, genBarcode, genSku, name.trim(), slug,
        safeBrandId, safeCatId, safeSuppId,
        description || '', safePrice, safeOldPrice, purPrice, safeDiscount, safeGstRate, hsn || '8714',
        initialStock, safeMinStock, img, (typeof images_json === 'string' ? images_json : JSON.stringify(images_json || [img])),
        JSON.stringify(variants_json || []), warranty || '1 Year Manufacturer', weight || '1.0 kg', 0
      );

      const productId = result.lastInsertRowid;

      // Log opening stock
      if (initialStock > 0) {
        db.prepare(`
          INSERT INTO inventory_transactions (
            product_id, transaction_type, quantity_change, previous_stock, new_stock, notes, user_id
          ) VALUES (?, 'PURCHASE', ?, 0, ?, 'Initial opening stock entry', ?)
        `).run(productId, initialStock, initialStock, currentUser.id);
      }

      logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'CREATE_PRODUCT', 'PRODUCT', productId, 'SUCCESS', {
        name,
        sku: genSku,
        barcode: genBarcode,
        price
      });

      // Synchronize New Product to MongoDB
      syncTableRecordToMongo(db, 'products', productId);

      return sendJson(res, 201, {
        message: 'Product created successfully',
        id: productId,
        product_id: productId,
        sku: genSku,
        barcode: genBarcode
      });

    } catch (err) {
      console.error('Owner Add Product Error:', err);
      return sendJson(res, 500, { error: err.message });
    }
  }

  // Full product update
  if (pathname.startsWith('/api/owner/products/') && req.method === 'PUT') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });

    const id = parseInt(pathname.split('/')[4], 10);
    try {
      const body = await parseJsonBody(req);
      const {
        name, barcode, brand_id, category_id, supplier_id, description,
        price, old_price, purchase_price, gst_rate, hsn, stock, min_stock,
        primary_image, variants_json, warranty, weight
      } = body;

      const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
      if (!existing) return sendJson(res, 404, { error: 'Product not found' });

      let discount = existing.discount;
      if (old_price && price && old_price > price) {
        discount = Math.round(((old_price - price) / old_price) * 100);
      }

      // Check barcode conflict
      if (barcode && barcode !== existing.barcode) {
        const conflict = db.prepare('SELECT id FROM products WHERE barcode = ? AND id != ?').get(barcode, id);
        if (conflict) {
          return sendJson(res, 400, { error: `Barcode ${barcode} already in use by another product` });
        }
      }

      db.prepare(`
        UPDATE products SET
          name = COALESCE(?, name),
          barcode = COALESCE(?, barcode),
          brand_id = COALESCE(?, brand_id),
          category_id = COALESCE(?, category_id),
          supplier_id = COALESCE(?, supplier_id),
          description = COALESCE(?, description),
          price = COALESCE(?, price),
          old_price = ?,
          purchase_price = COALESCE(?, purchase_price),
          discount = ?,
          gst_rate = COALESCE(?, gst_rate),
          hsn = COALESCE(?, hsn),
          stock = COALESCE(?, stock),
          min_stock = COALESCE(?, min_stock),
          primary_image = COALESCE(?, primary_image),
          images_json = COALESCE(?, images_json),
          variants_json = COALESCE(?, variants_json),
          warranty = COALESCE(?, warranty),
          weight = COALESCE(?, weight),
          updated_at = datetime('now')
        WHERE id = ?
      `).run(
        name, barcode, brand_id, category_id, supplier_id, description,
        price, old_price || null, purchase_price, discount, gst_rate, hsn,
        stock, min_stock, primary_image, images_json ? (typeof images_json === 'string' ? images_json : JSON.stringify(images_json)) : null, variants_json ? JSON.stringify(variants_json) : null,
        warranty, weight, id
      );

      // Log stock change if modified manually
      if (stock !== undefined && parseInt(stock, 10) !== existing.stock) {
        const diff = parseInt(stock, 10) - existing.stock;
        db.prepare(`
          INSERT INTO inventory_transactions (
            product_id, transaction_type, quantity_change, previous_stock, new_stock, notes, user_id
          ) VALUES (?, 'ADJUSTMENT', ?, ?, ?, 'Stock updated via Product Edit', ?)
        `).run(id, diff, existing.stock, stock, currentUser.id);
      }

      logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'UPDATE_PRODUCT', 'PRODUCT', id, 'SUCCESS');
      syncTableRecordToMongo(db, 'products', id);
      return sendJson(res, 200, { message: 'Product updated successfully' });

    } catch (err) {
      console.error('Owner Update Product Error:', err);
      return sendJson(res, 500, { error: err.message });
    }
  }

  // Soft Archive / Unarchive Product Safeguard
  if (pathname.startsWith('/api/owner/products/') && pathname.endsWith('/archive') && req.method === 'PUT') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });

    const id = parseInt(pathname.split('/')[4], 10);
    try {
      const body = await parseJsonBody(req);
      const archiveState = body.is_archived ? 1 : 0;

      db.prepare('UPDATE products SET is_archived = ?, updated_at = datetime("now") WHERE id = ?').run(archiveState, id);
      syncTableRecordToMongo(db, 'products', id);
      logAudit(currentUser.id, currentUser.full_name, currentUser.role, archiveState ? 'ARCHIVE_PRODUCT' : 'UNARCHIVE_PRODUCT', 'PRODUCT', id, 'SUCCESS');

      return sendJson(res, 200, {
        message: archiveState ? 'Product archived successfully' : 'Product restored from archive'
      });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // Safe Deletion Safeguard (with cascade cleanup)
  if (pathname.startsWith('/api/owner/products/') && req.method === 'DELETE') {
    if (!currentUser || !['OWNER', 'ADMIN'].includes(currentUser.role)) {
      return sendJson(res, 403, { error: 'Unauthorized: Admin or Owner role required' });
    }

    const id = parseInt(pathname.split('/')[4], 10);
    try {
      // Clean up product relations in database
      try { db.prepare('DELETE FROM product_bikes WHERE product_id = ?').run(id); } catch(e){}
      try { db.prepare('DELETE FROM product_reviews WHERE product_id = ?').run(id); } catch(e){}
      try { db.prepare('DELETE FROM inventory_ledger WHERE product_id = ?').run(id); } catch(e){}
      try { db.prepare('DELETE FROM order_items WHERE product_id = ?').run(id); } catch(e){}
      try { db.prepare('DELETE FROM purchase_items WHERE product_id = ?').run(id); } catch(e){}

      db.prepare('DELETE FROM products WHERE id = ?').run(id);

      // Clean up in MongoDB Atlas
      deleteFromMongo('products', { id });
      deleteFromMongo('product_bikes', { product_id: id });
      deleteFromMongo('product_reviews', { product_id: id });
      deleteFromMongo('inventory_ledger', { product_id: id });

      logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'DELETE_PRODUCT', 'PRODUCT', id, 'SUCCESS');
      return sendJson(res, 200, { message: 'Product permanently deleted' });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // --- 4. INVENTORY & STOCK LEDGER ---
  if (pathname === '/api/owner/inventory/ledger' && req.method === 'GET') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });

    const search = parsedUrl.searchParams.get('search');
    const type = parsedUrl.searchParams.get('type');
    const limit = parseInt(parsedUrl.searchParams.get('limit') || '100', 10);

    let query = `
      SELECT it.*, p.name as product_name, p.sku as product_sku, p.barcode as product_barcode, u.full_name as user_name
      FROM inventory_transactions it
      LEFT JOIN products p ON it.product_id = p.id
      LEFT JOIN users u ON it.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (type && type !== 'all') {
      query += ` AND it.transaction_type = ?`;
      params.push(type.toUpperCase());
    }

    if (search) {
      query += ` AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ? OR it.notes LIKE ?)`;
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    query += ` ORDER BY it.id DESC LIMIT ?`;
    params.push(limit);

    const ledger = db.prepare(query).all(...params);
    return sendJson(res, 200, { ledger });
  }

  // Inventory Valuation & Reconciliation Summary
  if (pathname === '/api/owner/inventory/valuation' && req.method === 'GET') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });

    const valuation = db.prepare(`
      SELECT 
        COUNT(*) as total_skus,
        COALESCE(SUM(stock), 0) as total_units,
        COALESCE(SUM(stock * purchase_price), 0) as total_purchase_valuation,
        COALESCE(SUM(stock * price), 0) as total_retail_valuation,
        COALESCE(SUM(stock * (price - purchase_price)), 0) as estimated_potential_margin
      FROM products
      WHERE is_archived = 0
    `).get();

    const lowStockList = db.prepare(`
      SELECT p.id, p.sku, p.barcode, p.name, p.stock, p.min_stock, p.purchase_price, p.price,
             c.name as category_name, s.name as supplier_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.stock <= p.min_stock AND p.is_archived = 0
      ORDER BY p.stock ASC
    `).all();

    return sendJson(res, 200, { valuation, lowStockList });
  }

  // Delete Inventory Transaction / Ledger Record
  if ((pathname.startsWith('/api/owner/inventory/ledger/') || pathname.startsWith('/api/owner/inventory-ledger/')) && req.method === 'DELETE') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    const parts = pathname.split('/');
    const id = parseInt(parts[parts.length - 1], 10);
    if (!id) return sendJson(res, 400, { error: 'Invalid transaction ID' });

    try {
      const existing = db.prepare('SELECT * FROM inventory_transactions WHERE id = ?').get(id);
      if (!existing) return sendJson(res, 404, { error: 'Inventory record not found' });

      db.prepare('DELETE FROM inventory_transactions WHERE id = ?').run(id);
      deleteFromMongo('inventory_transactions', { id });
      logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'DELETE_INVENTORY_TXN', 'INVENTORY', id, 'SUCCESS', existing);
      return sendJson(res, 200, { success: true, message: `Inventory ledger entry #${id} deleted successfully.` });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // --- 5. DISTRIBUTOR / PURCHASE ENTRY ---
  if (pathname === '/api/owner/purchases' && req.method === 'GET') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });

    const purchases = db.prepare(`
      SELECT p.*, s.name as supplier_name, s.gstin as supplier_gstin, s.phone as supplier_phone,
             COUNT(pi.id) as items_count
      FROM purchases p
      JOIN suppliers s ON p.supplier_id = s.id
      LEFT JOIN purchase_items pi ON p.id = pi.purchase_id
      GROUP BY p.id
      ORDER BY p.id DESC
    `).all();

    return sendJson(res, 200, { purchases });
  }

  // Create Purchase Entry
  if (pathname === '/api/owner/purchases' && req.method === 'POST') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });

    try {
      const body = await parseJsonBody(req);
      const {
        supplier_id, supplier_invoice_no, purchase_date, goods_received_date,
        items, payment_status, amount_paid, payment_method, notes, is_received
      } = body;

      if (!supplier_id || !items || !Array.isArray(items) || items.length === 0) {
        return sendJson(res, 400, { error: 'Supplier and purchase items are required' });
      }

      const supp = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(supplier_id);
      if (!supp) return sendJson(res, 404, { error: 'Supplier not found' });

      let totalCost = 0;
      let totalGst = 0;

      items.forEach(i => {
        const unitCost = parseFloat(i.unit_cost || i.purchase_price || 0);
        const qty = parseInt(i.quantity, 10) || 1;
        const lineTotal = unitCost * qty;
        const gstRate = parseFloat(i.gst_rate || 18.0);
        const lineGst = Math.round(lineTotal * (gstRate / 100));
        totalCost += lineTotal;
        totalGst += lineGst;
      });

      const grandTotal = totalCost + totalGst;
      const paid = Math.min(grandTotal, parseInt(amount_paid || 0, 10));
      const outstanding = grandTotal - paid;
      const status = is_received ? 'RECEIVED' : 'DRAFT';
      const purchaseNumber = `PUR-${Date.now().toString().slice(-6)}`;

      const insertPur = db.prepare(`
        INSERT INTO purchases (
          purchase_number, supplier_id, supplier_invoice_no, purchase_date, goods_received_date,
          total_cost, gst_amount, grand_total, amount_paid, outstanding_balance,
          payment_status, status, payment_method, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const purResult = insertPur.run(
        purchaseNumber,
        supplier_id,
        supplier_invoice_no || `INV-${Date.now().toString().slice(-4)}`,
        purchase_date || new Date().toISOString().slice(0, 10),
        is_received ? (goods_received_date || new Date().toISOString().slice(0, 10)) : null,
        totalCost,
        totalGst,
        grandTotal,
        paid,
        outstanding,
        paid >= grandTotal ? 'PAID' : (paid > 0 ? 'PARTIAL' : 'UNPAID'),
        status,
        payment_method || 'BANK_TRANSFER',
        notes || ''
      );

      const purchaseId = purResult.lastInsertRowid;

      // Insert Purchase Items & Increase Stock only if RECEIVED
      const insertPi = db.prepare(`
        INSERT INTO purchase_items (
          purchase_id, product_id, quantity, unit_cost, total, variant, gst_rate, tax_amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const addStock = db.prepare(`
        UPDATE products SET stock = stock + ?, purchase_price = ?, updated_at = datetime('now') WHERE id = ?
      `);

      const logTxn = db.prepare(`
        INSERT INTO inventory_transactions (
          product_id, transaction_type, quantity_change, previous_stock, new_stock, notes, user_id
        ) VALUES (?, 'PURCHASE', ?, ?, ?, ?, ?)
      `);

      for (const item of items) {
        const qty = parseInt(item.quantity, 10) || 1;
        const unitCost = parseFloat(item.unit_cost || item.purchase_price || 0);
        const lineTotal = qty * unitCost;
        const lineTax = Math.round(lineTotal * (parseFloat(item.gst_rate || 18.0) / 100));

        insertPi.run(purchaseId, item.product_id, qty, unitCost, lineTotal, item.variant || '', parseFloat(item.gst_rate || 18.0), lineTax);

        if (is_received && item.product_id) {
          const prod = db.prepare('SELECT stock FROM products WHERE id = ?').get(item.product_id);
          if (prod) {
            addStock.run(qty, unitCost, item.product_id);
            logTxn.run(item.product_id, qty, prod.stock, prod.stock + qty, `Goods received purchase #${purchaseNumber}`, currentUser ? currentUser.id : 1);
          }
        }
      }

      // Record Supplier Payment if any amount paid
      if (paid > 0) {
        const payNum = `SPAY-${Date.now().toString().slice(-6)}`;
        db.prepare(`
          INSERT INTO supplier_payments (
            payment_number, supplier_id, purchase_id, payment_date, amount, payment_method, notes, recorded_by
          ) VALUES (?, ?, ?, date('now'), ?, ?, 'Payment during purchase entry', ?)
        `).run(payNum, supplier_id, purchaseId, paid, payment_method || 'BANK_TRANSFER', currentUser.id);
      }

      logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'CREATE_PURCHASE', 'PURCHASE', purchaseId, 'SUCCESS', {
        purchaseNumber,
        grandTotal,
        status
      });

      // Synchronize Purchase, Updated Product Stocks & Supplier to MongoDB
      try {
        syncTableRecordToMongo(db, 'purchases', purchaseId);
        if (is_received) {
          items.forEach(i => {
            if (i.product_id) {
              try { syncTableRecordToMongo(db, 'products', i.product_id); } catch(e) {}
            }
          });
        }
        if (supplier_id) {
          try { syncTableRecordToMongo(db, 'suppliers', supplier_id); } catch(e) {}
        }
      } catch (syncErr) {
        console.warn('[PURCHASE SYNC WARNING]', syncErr.message);
      }

      return sendJson(res, 201, {
        success: true,
        message: is_received ? 'Purchase recorded and stock added' : 'Draft purchase entry saved',
        purchaseId,
        purchase_id: purchaseId,
        purchaseNumber,
        grandTotal,
        outstanding
      });

    } catch (err) {
      console.error('Purchase Entry Error:', err);
      return sendJson(res, 500, { error: err.message });
    }
  }

  // Confirm Goods Receipt for a Draft Purchase
  if (pathname.startsWith('/api/owner/purchases/') && pathname.endsWith('/receive') && req.method === 'PUT') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });

    const id = parseInt(pathname.split('/')[4], 10);
    try {
      const purchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(id);
      if (!purchase) return sendJson(res, 404, { error: 'Purchase record not found' });
      if (purchase.status === 'RECEIVED') {
        return sendJson(res, 400, { error: 'Goods have already been confirmed and received for this purchase' });
      }

      const items = db.prepare('SELECT * FROM purchase_items WHERE purchase_id = ?').all(id);
      const addStock = db.prepare(`
        UPDATE products SET stock = stock + ?, purchase_price = ?, updated_at = datetime('now') WHERE id = ?
      `);
      const logTxn = db.prepare(`
        INSERT INTO inventory_transactions (
          product_id, transaction_type, quantity_change, previous_stock, new_stock, notes, user_id
        ) VALUES (?, 'PURCHASE', ?, ?, ?, ?, ?)
      `);

      for (const item of items) {
        if (item.product_id) {
          const prod = db.prepare('SELECT stock FROM products WHERE id = ?').get(item.product_id);
          if (prod) {
            addStock.run(item.quantity, item.unit_cost, item.product_id);
            logTxn.run(item.product_id, item.quantity, prod.stock, prod.stock + item.quantity, `Confirmed receipt #${purchase.purchase_number}`, currentUser.id);
          }
        }
      }

      db.prepare(`
        UPDATE purchases SET
          status = 'RECEIVED',
          goods_received_date = date('now')
        WHERE id = ?
      `).run(id);

      // Sync confirmed purchase and updated products to MongoDB
      try {
        syncTableRecordToMongo(db, 'purchases', id);
        items.forEach(item => {
          if (item.product_id) {
            try { syncTableRecordToMongo(db, 'products', item.product_id); } catch(e) {}
          }
        });
        if (purchase.supplier_id) {
          try { syncTableRecordToMongo(db, 'suppliers', purchase.supplier_id); } catch(e) {}
        }
      } catch(e) {}

      logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'RECEIVE_PURCHASE', 'PURCHASE', id, 'SUCCESS');
      return sendJson(res, 200, { message: 'Goods receipt confirmed. Stock successfully added to inventory.' });

    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // Record Payment against Supplier Purchase
  if (pathname.startsWith('/api/owner/purchases/') && pathname.endsWith('/payments') && req.method === 'POST') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });

    const id = parseInt(pathname.split('/')[4], 10);
    try {
      const body = await parseJsonBody(req);
      const { amount, payment_method, reference_no, notes } = body;

      const purchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(id);
      if (!purchase) return sendJson(res, 404, { error: 'Purchase not found' });

      const payAmount = parseInt(amount, 10);
      if (!payAmount || payAmount <= 0) {
        return sendJson(res, 400, { error: 'Payment amount must be greater than 0' });
      }

      const newPaid = purchase.amount_paid + payAmount;
      const newOutstanding = Math.max(0, purchase.grand_total - newPaid);
      const newPayStatus = newOutstanding === 0 ? 'PAID' : 'PARTIAL';

      db.prepare(`
        UPDATE purchases SET
          amount_paid = ?,
          outstanding_balance = ?,
          payment_status = ?
        WHERE id = ?
      `).run(newPaid, newOutstanding, newPayStatus, id);

      const payNum = `SPAY-${Date.now().toString().slice(-6)}`;
      db.prepare(`
        INSERT INTO supplier_payments (
          payment_number, supplier_id, purchase_id, payment_date, amount, payment_method, reference_no, notes, recorded_by
        ) VALUES (?, ?, ?, date('now'), ?, ?, ?, ?, ?)
      `).run(payNum, purchase.supplier_id, id, payAmount, payment_method || 'BANK_TRANSFER', reference_no || '', notes || '', currentUser.id);

      logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'RECORD_SUPPLIER_PAYMENT', 'PURCHASE', id, 'SUCCESS', {
        amount: payAmount,
        newOutstanding
      });

      try {
        syncTableRecordToMongo(db, 'purchases', id);
        if (purchase.supplier_id) {
          syncTableRecordToMongo(db, 'suppliers', purchase.supplier_id);
        }
      } catch(e) {}

      return sendJson(res, 201, {
        message: 'Supplier payment recorded successfully',
        amountPaid: payAmount,
        outstandingBalance: newOutstanding
      });

    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // Delete Purchase Record
  if (pathname.startsWith('/api/owner/purchases/') && req.method === 'DELETE') {
    if (!currentUser || !['OWNER', 'ADMIN'].includes(currentUser.role)) {
      return sendJson(res, 403, { error: 'Unauthorized: Admin or Owner role required' });
    }
    const id = parseInt(pathname.split('/')[4], 10);
    try {
      const purchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(id);
      if (!purchase) {
        return sendJson(res, 404, { error: 'Purchase record not found' });
      }
      db.prepare('DELETE FROM purchase_items WHERE purchase_id = ?').run(id);
      db.prepare('DELETE FROM supplier_payments WHERE purchase_id = ?').run(id);
      db.prepare('DELETE FROM purchases WHERE id = ?').run(id);

      deleteFromMongo('purchases', { id });
      deleteFromMongo('purchase_items', { purchase_id: id });
      deleteFromMongo('supplier_payments', { purchase_id: id });

      logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'DELETE_PURCHASE', 'PURCHASE', id, 'SUCCESS');
      return sendJson(res, 200, { message: `Purchase #${purchase.purchase_number} deleted successfully` });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // --- 6. DISTRIBUTORS & SUPPLIERS ---
  if (pathname === '/api/owner/suppliers' && req.method === 'GET') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });

    const suppliers = db.prepare(`
      SELECT s.*,
        COALESCE(SUM(p.grand_total), 0) as total_purchases,
        COALESCE(SUM(p.amount_paid), 0) as total_paid,
        COALESCE(SUM(p.outstanding_balance), 0) as outstanding_balance,
        COUNT(p.id) as purchases_count
      FROM suppliers s
      LEFT JOIN purchases p ON s.id = p.supplier_id
      GROUP BY s.id
      ORDER BY s.id ASC
    `).all();

    return sendJson(res, 200, { suppliers });
  }

  // Create Supplier
  if (pathname === '/api/owner/suppliers' && req.method === 'POST') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });

    try {
      const body = await parseJsonBody(req);
      const { name, contact_person, email, phone, address, gstin } = body;

      if (!name) return sendJson(res, 400, { error: 'Supplier company name is required' });

      const insert = db.prepare(`
        INSERT INTO suppliers (name, contact_person, email, phone, address, gstin, status)
        VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')
      `);
      const resSupp = insert.run(name.trim(), contact_person || '', email || '', phone || '', address || '', gstin || '');

      logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'CREATE_SUPPLIER', 'SUPPLIER', resSupp.lastInsertRowid, 'SUCCESS');
      syncTableRecordToMongo(db, 'suppliers', resSupp.lastInsertRowid);
      return sendJson(res, 201, { message: 'Supplier added successfully', id: resSupp.lastInsertRowid });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // Supplier Detail, Statement & Purchase History
  if (pathname.startsWith('/api/owner/suppliers/') && req.method === 'GET') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });

    const parts = pathname.split('/');
    const suppId = parseInt(parts[4], 10);
    const supplier = db.prepare(`
      SELECT s.*,
        COALESCE(SUM(p.grand_total), 0) as total_purchases,
        COALESCE(SUM(p.amount_paid), 0) as total_paid,
        COALESCE(SUM(p.outstanding_balance), 0) as outstanding_balance,
        COUNT(p.id) as purchases_count
      FROM suppliers s
      LEFT JOIN purchases p ON s.id = p.supplier_id
      WHERE s.id = ?
      GROUP BY s.id
    `).get(suppId);

    if (!supplier) return sendJson(res, 404, { error: 'Supplier not found' });

    const purchases = db.prepare('SELECT * FROM purchases WHERE supplier_id = ? ORDER BY id DESC').all(suppId);
    const payments = db.prepare('SELECT * FROM supplier_payments WHERE supplier_id = ? ORDER BY id DESC').all(suppId);

    return sendJson(res, 200, { supplier, purchases, payments });
  }

  // Direct Supplier Payment Recording
  if (pathname.startsWith('/api/owner/suppliers/') && pathname.endsWith('/payments') && req.method === 'POST') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });

    const suppId = parseInt(pathname.split('/')[4], 10);
    try {
      const body = await parseJsonBody(req);
      const { amount, payment_method, reference_no, notes, purchase_id } = body;
      const supp = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(suppId);
      if (!supp) return sendJson(res, 404, { error: 'Supplier not found' });

      const payAmount = parseInt(amount, 10);
      if (!payAmount || payAmount <= 0) {
        return sendJson(res, 400, { error: 'Payment amount must be greater than 0' });
      }

      // If purchase_id specified or find oldest purchase with outstanding balance
      let targetPur = null;
      if (purchase_id) {
        targetPur = db.prepare('SELECT * FROM purchases WHERE id = ? AND supplier_id = ?').get(purchase_id, suppId);
      } else {
        targetPur = db.prepare('SELECT * FROM purchases WHERE supplier_id = ? AND outstanding_balance > 0 ORDER BY id ASC LIMIT 1').get(suppId);
      }

      let appliedPurId = null;
      if (targetPur) {
        appliedPurId = targetPur.id;
        const newPaid = targetPur.amount_paid + payAmount;
        const newOutstanding = Math.max(0, targetPur.grand_total - newPaid);
        const newPayStatus = newOutstanding === 0 ? 'PAID' : 'PARTIAL';
        db.prepare('UPDATE purchases SET amount_paid = ?, outstanding_balance = ?, payment_status = ? WHERE id = ?')
          .run(newPaid, newOutstanding, newPayStatus, targetPur.id);
      }

      const payNum = `SPAY-${Date.now().toString().slice(-6)}`;
      db.prepare(`
        INSERT INTO supplier_payments (
          payment_number, supplier_id, purchase_id, payment_date, amount, payment_method, reference_no, notes, recorded_by
        ) VALUES (?, ?, ?, date('now'), ?, ?, ?, ?, ?)
      `).run(payNum, suppId, appliedPurId, payAmount, payment_method || 'BANK_TRANSFER', reference_no || '', notes || '', currentUser.id);

      logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'RECORD_SUPPLIER_PAYMENT', 'SUPPLIER', suppId, 'SUCCESS', {
        amount: payAmount,
        appliedPurchaseId: appliedPurId
      });

      return sendJson(res, 201, {
        success: true,
        message: 'Supplier payment recorded successfully',
        paymentNumber: payNum,
        amount: payAmount,
        appliedPurchaseId: appliedPurId
      });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // Delete Supplier
  if (pathname.startsWith('/api/owner/suppliers/') && req.method === 'DELETE') {
    if (!currentUser || !['OWNER', 'ADMIN'].includes(currentUser.role)) {
      return sendJson(res, 403, { error: 'Unauthorized: Admin or Owner role required' });
    }
    const id = parseInt(pathname.split('/')[4], 10);
    try {
      const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id);
      if (!supplier) {
        return sendJson(res, 404, { error: 'Supplier not found' });
      }
      db.prepare('DELETE FROM supplier_payments WHERE supplier_id = ?').run(id);
      db.prepare('DELETE FROM suppliers WHERE id = ?').run(id);

      deleteFromMongo('suppliers', { id });
      deleteFromMongo('supplier_payments', { supplier_id: id });

      logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'DELETE_SUPPLIER', 'SUPPLIER', id, 'SUCCESS');
      return sendJson(res, 200, { message: `Supplier ${supplier.name} deleted successfully` });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // --- 7. ONLINE ORDER MANAGEMENT ---
  if (pathname === '/api/owner/orders' && req.method === 'GET') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });

    const status = parsedUrl.searchParams.get('status');
    const orderType = parsedUrl.searchParams.get('type');
    const search = parsedUrl.searchParams.get('search');
    const limit = parseInt(parsedUrl.searchParams.get('limit') || '100', 10);

    let query = `
      SELECT o.*, i.invoice_number
      FROM orders o
      LEFT JOIN invoices i ON o.id = i.order_id
      WHERE 1=1
    `;
    const params = [];

    if (orderType && orderType !== 'all') {
      query += ` AND o.order_type = ?`;
      params.push(orderType.toUpperCase());
    }

    if (status && status !== 'all') {
      query += ` AND o.status = ?`;
      params.push(status.toUpperCase());
    }

    if (search) {
      query += ` AND (o.order_number LIKE ? OR o.customer_name LIKE ? OR o.customer_phone LIKE ? OR o.customer_email LIKE ?)`;
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    query += ` ORDER BY o.id DESC LIMIT ?`;
    params.push(limit);

    const orders = db.prepare(query).all(...params);
    const result = orders.map(o => {
      const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id);
      return {
        ...o,
        items,
        shipping_address: typeof o.shipping_address_json === 'string' ? JSON.parse(o.shipping_address_json || '{}') : o.shipping_address_json
      };
    });

    return sendJson(res, 200, { orders: result });
  }

  // Update Online Order Status & Stock Lifecycle Safeguard
  if (pathname.startsWith('/api/owner/orders/') && pathname.endsWith('/status') && req.method === 'PUT') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });

    const id = parseInt(pathname.split('/')[4], 10);
    try {
      const body = await parseJsonBody(req);
      const { status, payment_status, notes } = body;

      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
      if (!order) return sendJson(res, 404, { error: 'Order not found' });

      // If status changed to CANCELLED and was not previously cancelled, restore inventory
      if (status === 'CANCELLED' && order.status !== 'CANCELLED') {
        const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id);
        const restoreStock = db.prepare('UPDATE products SET stock = stock + ?, updated_at = datetime("now") WHERE id = ?');
        const logTxn = db.prepare(`
          INSERT INTO inventory_transactions (
            product_id, transaction_type, quantity_change, previous_stock, new_stock, notes, user_id
          ) VALUES (?, 'CANCELLATION', ?, ?, ?, ?, ?)
        `);

        for (const item of items) {
          if (item.product_id) {
            const prod = db.prepare('SELECT stock FROM products WHERE id = ?').get(item.product_id);
            if (prod) {
              restoreStock.run(item.quantity, item.product_id);
              logTxn.run(item.product_id, item.quantity, prod.stock, prod.stock + item.quantity, `Stock restored for cancelled order #${order.order_number}`, currentUser.id);
            }
          }
        }
      }

      db.prepare(`
        UPDATE orders SET
          status = COALESCE(?, status),
          payment_status = COALESCE(?, payment_status),
          notes = COALESCE(?, notes),
          updated_at = datetime('now')
        WHERE id = ?
      `).run(status, payment_status, notes, id);

      logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'UPDATE_ORDER_STATUS', 'ORDER', id, 'SUCCESS', {
        previousStatus: order.status,
        newStatus: status
      });

      syncTableRecordToMongo(db, 'orders', id);
      return sendJson(res, 200, { message: 'Order status updated successfully' });

    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // Update Courier & Shipping Details
  if (pathname.startsWith('/api/owner/orders/') && pathname.endsWith('/shipping') && req.method === 'PUT') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });

    const id = parseInt(pathname.split('/')[4], 10);
    try {
      const body = await parseJsonBody(req);
      const { courier_name, tracking_number, dispatch_date, status } = body;

      db.prepare(`
        UPDATE orders SET
          courier_name = ?,
          tracking_number = ?,
          dispatch_date = COALESCE(?, date('now')),
          status = COALESCE(?, 'SHIPPED'),
          updated_at = datetime('now')
        WHERE id = ?
      `).run(courier_name || 'BlueDart Express', tracking_number || '', dispatch_date || null, status || 'SHIPPED', id);

      logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'UPDATE_SHIPPING', 'ORDER', id, 'SUCCESS', {
        courier_name,
        tracking_number
      });

      syncTableRecordToMongo(db, 'orders', id);
      return sendJson(res, 200, { message: 'Shipping details recorded' });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // Delete Order / POS Bill
  if (pathname.startsWith('/api/owner/orders/') && req.method === 'DELETE') {
    if (!currentUser || !['OWNER', 'ADMIN', 'STAFF'].includes(currentUser.role)) {
      return sendJson(res, 403, { error: 'Unauthorized' });
    }
    const id = parseInt(pathname.split('/')[4], 10);
    try {
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
      if (!order) {
        return sendJson(res, 404, { error: 'Order not found' });
      }
      db.prepare('DELETE FROM order_items WHERE order_id = ?').run(id);
      db.prepare('DELETE FROM invoices WHERE order_id = ? OR order_number = ?').run(id, order.order_number);
      db.prepare('DELETE FROM orders WHERE id = ?').run(id);

      deleteFromMongo('orders', { id });
      deleteFromMongo('order_items', { order_id: id });
      deleteFromMongo('invoices', { $or: [{ id }, { order_id: id }, { order_number: order.order_number }] });

      logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'DELETE_ORDER', 'ORDER', id, 'SUCCESS');
      return sendJson(res, 200, { message: `Order #${order.order_number} deleted successfully` });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // --- 8. GST INVOICES & BILLING ---
  if (pathname === '/api/owner/invoices' && req.method === 'GET') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });

    const search = parsedUrl.searchParams.get('search');
    const type = parsedUrl.searchParams.get('type');
    const limit = parseInt(parsedUrl.searchParams.get('limit') || '100', 10);

    let query = `
      SELECT i.*, o.order_number, o.payment_method as order_payment_method
      FROM invoices i
      JOIN orders o ON i.order_id = o.id
      WHERE 1=1
    `;
    const params = [];

    if (type && type !== 'all') {
      query += ` AND i.invoice_type = ?`;
      params.push(type.toUpperCase());
    }

    if (search) {
      query += ` AND (i.invoice_number LIKE ? OR i.customer_name LIKE ? OR i.customer_phone LIKE ? OR i.customer_gstin LIKE ?)`;
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    query += ` ORDER BY i.id DESC LIMIT ?`;
    params.push(limit);

    const invoices = db.prepare(query).all(...params);
    return sendJson(res, 200, { invoices });
  }

  // Detailed Invoice View
  if (pathname.startsWith('/api/owner/invoices/') && !pathname.endsWith('/credit-notes') && req.method === 'GET') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });

    const id = pathname.split('/')[4];
    const invoice = db.prepare(`
      SELECT i.*, o.order_number, o.created_at as order_created_at, o.payment_method, o.payment_ref
      FROM invoices i
      JOIN orders o ON i.order_id = o.id
      WHERE i.id = ? OR i.invoice_number = ?
    `).get(id, id);

    if (!invoice) return sendJson(res, 404, { error: 'Invoice not found' });

    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(invoice.order_id);
    const settings = getStoreSettings();

    return sendJson(res, 200, {
      invoice: {
        ...invoice,
        items,
        store: {
          name: settings.STORE_NAME || 'MOTO ADDICTOR PITSHOP',
          legalName: settings.STORE_LEGAL_NAME || 'MOTO ADDICTOR PITSHOP Retail Pvt Ltd',
          address: settings.STORE_ADDRESS || '124 Racing Track Boulevard, Motor City, Chennai, TN 600001',
          phone: settings.STORE_PHONE || '+91 98765 43210',
          email: settings.STORE_EMAIL || 'owner@motopitshop.com',
          gstin: settings.STORE_GSTIN || '33AABCM1234F1Z9',
          state: settings.STORE_STATE || 'Tamil Nadu',
          stateCode: settings.STORE_STATE_CODE || '33'
        }
      }
    });
  }

  // Delete Invoice
  if (pathname.startsWith('/api/owner/invoices/') && req.method === 'DELETE') {
    if (!currentUser || !['OWNER', 'ADMIN'].includes(currentUser.role)) {
      return sendJson(res, 403, { error: 'Unauthorized: Admin or Owner role required' });
    }
    const rawId = pathname.split('/')[4];
    const numId = parseInt(rawId, 10);
    try {
      const inv = !isNaN(numId)
        ? db.prepare('SELECT * FROM invoices WHERE id = ? OR invoice_number = ?').get(numId, rawId)
        : db.prepare('SELECT * FROM invoices WHERE invoice_number = ?').get(rawId);

      if (!inv) {
        return sendJson(res, 404, { error: 'Invoice not found' });
      }

      db.prepare('DELETE FROM invoices WHERE id = ?').run(inv.id);
      deleteFromMongo('invoices', { id: inv.id });
      deleteFromMongo('invoices', { invoice_number: inv.invoice_number });

      logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'DELETE_INVOICE', 'INVOICE', inv.id, 'SUCCESS');
      return sendJson(res, 200, { message: `Invoice ${inv.invoice_number} deleted successfully` });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // List Credit Notes
  if (pathname === '/api/owner/credit-notes' && req.method === 'GET') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });

    const creditNotes = db.prepare(`
      SELECT cn.*, i.invoice_number as original_invoice_number
      FROM credit_notes cn
      LEFT JOIN invoices i ON cn.invoice_id = i.id
      ORDER BY cn.id DESC
    `).all();

    return sendJson(res, 200, { creditNotes });
  }

  // Delete Credit Note
  if (pathname.startsWith('/api/owner/credit-notes/') && req.method === 'DELETE') {
    if (!currentUser || !['OWNER', 'ADMIN'].includes(currentUser.role)) {
      return sendJson(res, 403, { error: 'Unauthorized: Admin or Owner role required' });
    }
    const id = parseInt(pathname.split('/')[4], 10);
    try {
      const cn = db.prepare('SELECT * FROM credit_notes WHERE id = ?').get(id);
      if (!cn) {
        return sendJson(res, 404, { error: 'Credit note not found' });
      }
      db.prepare('DELETE FROM credit_note_items WHERE credit_note_id = ?').run(id);
      db.prepare('DELETE FROM credit_notes WHERE id = ?').run(id);

      deleteFromMongo('credit_notes', { id });
      deleteFromMongo('credit_note_items', { credit_note_id: id });

      logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'DELETE_CREDIT_NOTE', 'CREDIT_NOTE', id, 'SUCCESS');
      return sendJson(res, 200, { message: `Credit note ${cn.credit_note_number} deleted successfully` });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // --- 9. CUSTOMER MANAGEMENT ---
  if (pathname === '/api/owner/customers' && req.method === 'GET') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });

    const search = parsedUrl.searchParams.get('search');
    const type = parsedUrl.searchParams.get('type');

    let query = `SELECT * FROM customers WHERE 1=1`;
    const params = [];

    if (type && type !== 'all') {
      query += ` AND customer_type = ?`;
      params.push(type.toUpperCase());
    }

    if (search) {
      query += ` AND (name LIKE ? OR phone LIKE ? OR email LIKE ? OR gstin LIKE ? OR customer_code LIKE ?)`;
      const term = `%${search}%`;
      params.push(term, term, term, term, term);
    }

    query += ` ORDER BY id DESC`;

    const customers = db.prepare(query).all(...params);
    return sendJson(res, 200, { customers });
  }

  // Create Customer
  if (pathname === '/api/owner/customers' && req.method === 'POST') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });

    try {
      const body = await parseJsonBody(req);
      const { name, phone, email, billing_address, shipping_address, gstin, customer_type, notes } = body;

      if (!name) return sendJson(res, 400, { error: 'Customer name is required' });

      // Check phone duplication
      if (phone) {
        const existing = db.prepare('SELECT id FROM customers WHERE phone = ?').get(phone.trim());
        if (existing) {
          return sendJson(res, 400, { error: `Customer with phone number ${phone} already exists` });
        }
      }

      const code = `MPS-CUST-${Date.now().toString().slice(-4)}`;
      const insert = db.prepare(`
        INSERT INTO customers (customer_code, name, phone, email, billing_address, shipping_address, gstin, customer_type, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = insert.run(
        code, name.trim(), phone || '', email || '',
        billing_address || '', shipping_address || '', gstin || '',
        customer_type || 'RETAIL', notes || ''
      );

      logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'CREATE_CUSTOMER', 'CUSTOMER', result.lastInsertRowid, 'SUCCESS');
      syncTableRecordToMongo(db, 'customers', result.lastInsertRowid);
      return sendJson(res, 201, { message: 'Customer created successfully', id: result.lastInsertRowid, customer_code: code });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // Delete Customer
  if (pathname.startsWith('/api/owner/customers/') && req.method === 'DELETE') {
    if (!currentUser || !['OWNER', 'ADMIN'].includes(currentUser.role)) {
      return sendJson(res, 403, { error: 'Unauthorized: Admin or Owner role required' });
    }
    const id = parseInt(pathname.split('/')[4], 10);
    try {
      const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
      if (!customer) {
        return sendJson(res, 404, { error: 'Customer not found' });
      }
      db.prepare('DELETE FROM customers WHERE id = ?').run(id);
      deleteFromMongo('customers', { id });

      logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'DELETE_CUSTOMER', 'CUSTOMER', id, 'SUCCESS');
      return sendJson(res, 200, { message: `Customer ${customer.name} deleted successfully` });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // --- 10. EXPENSES & PAYMENTS ---
  if (pathname === '/api/owner/expenses' && req.method === 'GET') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });

    const category = parsedUrl.searchParams.get('category');
    const range = parsedUrl.searchParams.get('range');
    const start = parsedUrl.searchParams.get('startDate');
    const end = parsedUrl.searchParams.get('endDate');

    const { startDate, endDate } = parseDateRange(range, start, end);

    let query = `
      SELECT e.*, u.full_name as recorded_by_name
      FROM expenses e
      LEFT JOIN users u ON e.recorded_by = u.id
      WHERE date(e.expense_date) >= ? AND date(e.expense_date) <= ?
    `;
    const params = [startDate, endDate];

    if (category && category !== 'all') {
      query += ` AND e.category = ?`;
      params.push(category);
    }

    query += ` ORDER BY e.id DESC`;

    const expenses = db.prepare(query).all(...params);
    const categoryTotals = db.prepare(`
      SELECT category, SUM(amount) as total, COUNT(*) as count
      FROM expenses
      WHERE date(expense_date) >= ? AND date(expense_date) <= ?
      GROUP BY category
      ORDER BY total DESC
    `).all(startDate, endDate);

    const totalAmount = expenses.reduce((acc, e) => acc + e.amount, 0);

    return sendJson(res, 200, { expenses, categoryTotals, totalAmount, startDate, endDate });
  }

  // Add Expense
  if (pathname === '/api/owner/expenses' && req.method === 'POST') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });

    try {
      const body = await parseJsonBody(req);
      const { category, description, amount, payment_method, vendor, reference_no, expense_date } = body;

      if (!category || !description || !amount) {
        return sendJson(res, 400, { error: 'Category, description, and amount are required' });
      }

      const expNum = `EXP-${Date.now().toString().slice(-6)}`;
      const insert = db.prepare(`
        INSERT INTO expenses (
          expense_number, expense_date, category, description, amount,
          payment_method, vendor, reference_no, recorded_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = insert.run(
        expNum,
        expense_date || new Date().toISOString().slice(0, 10),
        category,
        description.trim(),
        parseInt(amount, 10),
        payment_method || 'CASH',
        vendor || '',
        reference_no || '',
        currentUser.id
      );

      logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'CREATE_EXPENSE', 'EXPENSE', result.lastInsertRowid, 'SUCCESS', {
        expNum,
        category,
        amount
      });

      syncTableRecordToMongo(db, 'expenses', result.lastInsertRowid);
      return sendJson(res, 201, { message: 'Expense recorded successfully', id: result.lastInsertRowid, expense_number: expNum });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // Delete Expense
  if (pathname.startsWith('/api/owner/expenses/') && req.method === 'DELETE') {
    if (!currentUser || !['OWNER', 'ADMIN'].includes(currentUser.role)) {
      return sendJson(res, 403, { error: 'Unauthorized: Admin/Owner role required' });
    }

    const id = parseInt(pathname.split('/')[4], 10);
    try {
      db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
      deleteFromMongo('expenses', { id });
      logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'DELETE_EXPENSE', 'EXPENSE', id, 'SUCCESS');
      return sendJson(res, 200, { message: 'Expense deleted' });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // --- 11. MONTHLY REPORTS & BUSINESS ANALYTICS ---
  if (pathname === '/api/owner/reports/analytics' && req.method === 'GET') {
    if (!canAccessReports) return sendJson(res, 403, { error: 'Unauthorized: Owner or Manager access required for financial analytics reports' });

    try {
      const range = parsedUrl.searchParams.get('range') || 'month';
      const start = parsedUrl.searchParams.get('startDate');
      const end = parsedUrl.searchParams.get('endDate');
      const { startDate, endDate } = parseDateRange(range, start, end);

      // Gross Sales & Orders
      const salesOverview = db.prepare(`
        SELECT 
          COALESCE(SUM(grand_total), 0) as gross_sales,
          COALESCE(SUM(subtotal), 0) as taxable_sales,
          COALESCE(SUM(discount_total), 0) as total_discounts,
          COALESCE(SUM(tax_total), 0) as total_tax,
          COALESCE(SUM(cgst_total), 0) as total_cgst,
          COALESCE(SUM(sgst_total), 0) as total_sgst,
          COALESCE(SUM(igst_total), 0) as total_igst,
          COUNT(*) as total_orders
        FROM orders
        WHERE date(created_at) >= ? AND date(created_at) <= ? AND status != 'CANCELLED'
      `).get(startDate, endDate);

      // POS vs Online breakdown
      const posVsOnline = db.prepare(`
        SELECT 
          order_type,
          COALESCE(SUM(grand_total), 0) as revenue,
          COUNT(*) as count
        FROM orders
        WHERE date(created_at) >= ? AND date(created_at) <= ? AND status != 'CANCELLED'
        GROUP BY order_type
      `).all(startDate, endDate);

      // Sales Returns & Refunds
      const returnsSummary = db.prepare(`
        SELECT 
          COALESCE(SUM(total_amount), 0) as total_returns,
          COALESCE(SUM(tax_amount), 0) as return_taxes,
          COUNT(*) as return_count
        FROM credit_notes
        WHERE date(return_date) >= ? AND date(return_date) <= ?
      `).get(startDate, endDate);

      // Cost of Goods Sold (COGS) for fulfilled sales in this period
      const cogsRow = db.prepare(`
        SELECT COALESCE(SUM(oi.quantity * COALESCE(p.purchase_price, 0)), 0) as cogs
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        LEFT JOIN products p ON oi.product_id = p.id
        WHERE date(o.created_at) >= ? AND date(o.created_at) <= ? AND o.status != 'CANCELLED'
      `).get(startDate, endDate);

      // Operating Expenses in this period
      const expensesRow = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total_expenses
        FROM expenses
        WHERE date(expense_date) >= ? AND date(expense_date) <= ?
      `).get(startDate, endDate);

      // Purchase & Input Tax Credit (ITC)
      const purchasesRow = db.prepare(`
        SELECT 
          COALESCE(SUM(grand_total), 0) as total_purchases,
          COALESCE(SUM(total_cost), 0) as taxable_purchases,
          COALESCE(SUM(gst_amount), 0) as input_tax_credit,
          COALESCE(SUM(outstanding_balance), 0) as outstanding_balances,
          COUNT(*) as count
        FROM purchases
        WHERE date(purchase_date) >= ? AND date(purchase_date) <= ?
      `).get(startDate, endDate);

      // Calculate Gross Profit & Net Profit
      const netSales = salesOverview.gross_sales - returnsSummary.total_returns;
      const cogs = cogsRow.cogs;
      const grossProfit = Math.max(0, netSales - cogs);
      const totalExpenses = expensesRow.total_expenses;
      const netOperatingProfit = grossProfit - totalExpenses;

      // Tax Reconciliation: Output Tax - Input Tax
      const outputGst = salesOverview.total_tax - returnsSummary.return_taxes;
      const inputGst = purchasesRow.input_tax_credit;
      const netGstPayable = Math.max(0, outputGst - inputGst);

      // Top Selling Products in period
      const topProducts = db.prepare(`
        SELECT oi.product_name, oi.product_sku, SUM(oi.quantity) as qty_sold, SUM(oi.total) as total_revenue
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE date(o.created_at) >= ? AND date(o.created_at) <= ? AND o.status != 'CANCELLED'
        GROUP BY oi.product_name, oi.product_sku
        ORDER BY qty_sold DESC LIMIT 10
      `).all(startDate, endDate);

      // Category Wise Sales
      const categorySales = db.prepare(`
        SELECT c.name as category_name, COALESCE(SUM(oi.total), 0) as revenue, SUM(oi.quantity) as units_sold
        FROM categories c
        LEFT JOIN products p ON p.category_id = c.id
        LEFT JOIN order_items oi ON oi.product_id = p.id
        LEFT JOIN orders o ON oi.order_id = o.id AND date(o.created_at) >= ? AND date(o.created_at) <= ? AND o.status != 'CANCELLED'
        GROUP BY c.id, c.name
        ORDER BY revenue DESC
      `).all(startDate, endDate);

      // Brand Wise Sales
      const brandSales = db.prepare(`
        SELECT b.name as brand_name, COALESCE(SUM(oi.total), 0) as revenue, SUM(oi.quantity) as units_sold
        FROM brands b
        LEFT JOIN products p ON p.brand_id = b.id
        LEFT JOIN order_items oi ON oi.product_id = p.id
        LEFT JOIN orders o ON oi.order_id = o.id AND date(o.created_at) >= ? AND date(o.created_at) <= ? AND o.status != 'CANCELLED'
        GROUP BY b.id, b.name
        ORDER BY revenue DESC
      `).all(startDate, endDate);

      // Payment Methods Breakdown
      const paymentMethods = db.prepare(`
        SELECT payment_method, COALESCE(SUM(grand_total), 0) as total, COUNT(*) as count
        FROM orders
        WHERE date(created_at) >= ? AND date(created_at) <= ? AND status != 'CANCELLED'
        GROUP BY payment_method
      `).all(startDate, endDate);

      const financialsObj = {
        grossSales: salesOverview.gross_sales,
        totalDiscounts: salesOverview.total_discounts,
        returns: returnsSummary.total_returns,
        netSales,
        cogs,
        grossProfit,
        grossMarginPct: netSales > 0 ? Math.round((grossProfit / netSales) * 100) : 0,
        operatingExpenses: totalExpenses,
        netOperatingProfit,
        netMarginPct: netSales > 0 ? Math.round((netOperatingProfit / netSales) * 100) : 0
      };

      return sendJson(res, 200, {
        period: { range, startDate, endDate },
        financials: financialsObj,
        pnl: {
          gross_sales: salesOverview.gross_sales,
          gross_profit: grossProfit,
          net_sales: netSales,
          cogs,
          operating_expenses: totalExpenses,
          estimated_net_profit: netOperatingProfit
        },
        taxSummary: {
          taxableSales: salesOverview.taxable_sales,
          cgstCollected: salesOverview.total_cgst,
          sgstCollected: salesOverview.total_sgst,
          igstCollected: salesOverview.total_igst,
          totalOutputGst: outputGst,
          inputTaxCredit: inputGst,
          netGstPayable
        },
        purchasesSummary: purchasesRow,
        posVsOnline,
        topProducts,
        categorySales,
        brandSales,
        paymentMethods
      });

    } catch (err) {
      console.error('Reports Analytics Error:', err);
      return sendJson(res, 500, { error: err.message });
    }
  }

  // --- 12. SHOP SETTINGS, CATEGORIES, BRANDS & USERS ---
  // List staff users
  if (pathname === '/api/owner/users' && req.method === 'GET') {
    if (!currentUser || !['OWNER', 'ADMIN'].includes(currentUser.role)) {
      return sendJson(res, 403, { error: 'Unauthorized: Admin or Owner role required' });
    }

    const users = db.prepare(`
      SELECT id, email, full_name, phone, role, staff_role, status, permissions_json, last_login_at, created_at
      FROM users
      ORDER BY id ASC
    `).all();

    return sendJson(res, 200, { users });
  }

  // Create staff user
  if (pathname === '/api/owner/users' && req.method === 'POST') {
    if (!currentUser || currentUser.role !== 'OWNER') {
      return sendJson(res, 403, { error: 'Unauthorized: Only Owner can create staff accounts' });
    }

    try {
      const body = await parseJsonBody(req);
      const { email, password, full_name, phone, staff_role, permissions } = body;

      if (!email || !password || !full_name) {
        return sendJson(res, 400, { error: 'Email, password, and full name are required' });
      }

      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
      if (existing) {
        return sendJson(res, 400, { error: 'An account with this email already exists' });
      }

      const roleMap = {
        OWNER: 'OWNER',
        MANAGER: 'ADMIN',
        CASHIER: 'STAFF',
        INVENTORY: 'STAFF',
        STAFF: 'STAFF'
      };

      const sysRole = roleMap[staff_role] || 'STAFF';
      const passHash = hashPassword(password);

      const insert = db.prepare(`
        INSERT INTO users (email, password_hash, full_name, phone, role, staff_role, status, permissions_json)
        VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
      `);

      const result = insert.run(
        email.toLowerCase().trim(),
        passHash,
        full_name.trim(),
        phone || '',
        sysRole,
        staff_role || 'STAFF',
        JSON.stringify(permissions || {})
      );

      logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'CREATE_USER', 'USER', result.lastInsertRowid, 'SUCCESS', {
        email,
        staff_role
      });

      syncTableRecordToMongo(db, 'users', result.lastInsertRowid);
      return sendJson(res, 201, { message: 'User created successfully', id: result.lastInsertRowid });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // Delete Staff User
  if (pathname.startsWith('/api/owner/users/') && req.method === 'DELETE') {
    if (!currentUser || currentUser.role !== 'OWNER') {
      return sendJson(res, 403, { error: 'Unauthorized: Only Primary Store Owner can delete staff accounts' });
    }
    const id = parseInt(pathname.split('/')[4], 10);
    try {
      const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
      if (!targetUser) {
        return sendJson(res, 404, { error: 'User not found' });
      }
      if (targetUser.id === 1 || targetUser.role === 'OWNER' || targetUser.email.toLowerCase() === 'owner@motopitshop.com') {
        return sendJson(res, 400, { error: 'Cannot delete the Primary Store Owner account' });
      }
      db.prepare('DELETE FROM users WHERE id = ?').run(id);
      deleteFromMongo('users', { id });

      logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'DELETE_USER', 'USER', id, 'SUCCESS');
      return sendJson(res, 200, { message: `Staff account ${targetUser.full_name} deleted successfully` });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // Save Shop & GST Settings
  if (pathname === '/api/owner/settings' && req.method === 'POST') {
    if (!currentUser || !['OWNER', 'ADMIN'].includes(currentUser.role)) {
      return sendJson(res, 403, { error: 'Unauthorized' });
    }

    try {
      const body = await parseJsonBody(req);
      const insertOrUpdate = db.prepare('INSERT OR REPLACE INTO store_settings (key, value) VALUES (?, ?)');
      Object.keys(body).forEach(key => {
        insertOrUpdate.run(key, String(body[key]));
        syncSettingToMongo(key, String(body[key]));
      });

      logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'UPDATE_SETTINGS', 'STORE', null, 'SUCCESS');
      return sendJson(res, 200, { message: 'Shop and GST settings saved successfully' });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // Categories CRUD
  if (pathname === '/api/owner/categories' && req.method === 'POST') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    try {
      const body = await parseJsonBody(req);
      const { name, icon, description } = body;
      if (!name) return sendJson(res, 400, { error: 'Category name is required' });

      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
      const maxOrder = db.prepare('SELECT MAX(display_order) as m FROM categories').get().m || 0;

      const insert = db.prepare('INSERT INTO categories (slug, name, icon, description, display_order) VALUES (?, ?, ?, ?, ?)');
      const resCat = insert.run(slug, name.trim(), icon || '📦', description || '', maxOrder + 1);

      return sendJson(res, 201, { message: 'Category added', id: resCat.lastInsertRowid });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // Brands CRUD
  if (pathname === '/api/owner/brands' && req.method === 'POST') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    try {
      const body = await parseJsonBody(req);
      const { name, logo, description } = body;
      if (!name) return sendJson(res, 400, { error: 'Brand name is required' });

      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
      const insert = db.prepare('INSERT INTO brands (slug, name, logo, description) VALUES (?, ?, ?, ?)');
      const resBrand = insert.run(slug, name.trim(), logo || '', description || '');

      return sendJson(res, 201, { message: 'Brand added', id: resBrand.lastInsertRowid });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // Delete Category
  if (pathname.startsWith('/api/owner/categories/') && req.method === 'DELETE') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    const id = parseInt(pathname.split('/')[4], 10);
    try {
      db.prepare('DELETE FROM categories WHERE id = ?').run(id);
      deleteFromMongo('categories', { id });
      return sendJson(res, 200, { message: 'Category deleted successfully' });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // Delete Brand
  if (pathname.startsWith('/api/owner/brands/') && req.method === 'DELETE') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    const id = parseInt(pathname.split('/')[4], 10);
    try {
      db.prepare('DELETE FROM brands WHERE id = ?').run(id);
      deleteFromMongo('brands', { id });
      return sendJson(res, 200, { message: 'Brand deleted successfully' });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // Not handled by owner API router
  return false;
}

module.exports = {
  handleOwnerApi
};
