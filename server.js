// server.js - Moto Pitshop Full-Stack Production HTTP & API Server
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { db, initDatabase, hashPassword } = require('./database.js');
const { handleOwnerApi } = require('./owner-api.js');
const { connectMongo, syncTableRecordToMongo, deleteFromMongo, getMongoStatus } = require('./mongodb.js');
const { migrateAllToMongo } = require('./migrate-to-mongo.js');

// Initialize database on server startup
initDatabase();

// Connect to MongoDB Atlas cluster asynchronously and synchronize data
connectMongo().then(async (mDb) => {
  if (mDb) {
    console.log('[SERVER] MongoDB Atlas connected. Syncing owner portal records...');
    await migrateAllToMongo();
  }
}).catch(err => {
  console.warn('[SERVER] MongoDB connection deferred:', err.message);
});

const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'motopitshop_prod_secret_key_2026';

// Persistent & Memory Session Store
const sessions = new Map();

function generateSessionToken(user) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const expiresAt = now + (30 * 24 * 60 * 60 * 1000); // 30 days
  const userPayload = {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    status: user.status,
    staff_role: user.staff_role || user.role,
    permissions: typeof user.permissions_json === 'string' ? JSON.parse(user.permissions_json || '{}') : (user.permissions_json || {})
  };

  sessions.set(token, { user: userPayload, created: now, expiresAt });

  try {
    db.prepare('INSERT OR REPLACE INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(token, user.id, now, expiresAt);
  } catch (err) {
    console.error('Error saving session DB:', err);
  }

  return token;
}

function getSessionUser(req) {
  const authHeader = req.headers['authorization'];
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.headers.cookie) {
    const cookies = req.headers.cookie.split(';').reduce((acc, cookie) => {
      const [k, v] = cookie.trim().split('=');
      acc[k] = v;
      return acc;
    }, {});
    token = cookies['motopitshop_session'];
  }

  if (!token) return null;

  // Check memory cache first
  if (sessions.has(token)) {
    const sess = sessions.get(token);
    if (sess.expiresAt > Date.now()) return sess.user;
    sessions.delete(token);
  }

  // Check DB store
  try {
    const now = Date.now();
    const row = db.prepare('SELECT s.token, u.* FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ? AND s.expires_at > ?').get(token, now);
    if (row && row.status === 'ACTIVE') {
      const userPayload = {
        id: row.id,
        email: row.email,
        full_name: row.full_name,
        role: row.role,
        status: row.status,
        staff_role: row.staff_role || row.role,
        permissions: typeof row.permissions_json === 'string' ? JSON.parse(row.permissions_json || '{}') : (row.permissions_json || {})
      };
      sessions.set(token, { user: userPayload, created: now, expiresAt: now + (30 * 24 * 60 * 60 * 1000) });
      return userPayload;
    }
  } catch (err) {
    console.error('Error retrieving session DB:', err);
  }

  return null;
}

function logAudit(userId, userName, userRole, action, entity, entityId, result = 'SUCCESS', details = {}) {
  try {
    const stmt = db.prepare(`
      INSERT INTO audit_logs (user_id, user_name, user_role, action, entity, entity_id, result, details_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(userId || null, userName || 'Guest', userRole || 'GUEST', action, entity, String(entityId || ''), result, JSON.stringify(details));
  } catch (err) {
    console.error('Audit Log Error:', err);
  }
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
  });
}

function sendJson(res, statusCode, data, headers = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    ...headers
  });
  res.end(JSON.stringify(data));
}

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  const currentUser = getSessionUser(req);

  // ==========================================
  // API ENDPOINTS
  // ==========================================

  // Owner Portal & ERP Router
  if (pathname.startsWith('/api/owner/') || pathname.startsWith('/api/pos/')) {
    const handled = await handleOwnerApi(req, res, pathname, parsedUrl, currentUser, parseJsonBody, sendJson, logAudit);
    if (handled !== false) return;
  }

  // --- 1. AUTHENTICATION ---
  if (pathname === '/api/auth/register' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const { email, password, full_name, phone } = body;

      if (!email || !password || !full_name) {
        return sendJson(res, 400, { error: 'Email, password, and full name are required' });
      }

      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
      if (existing) {
        return sendJson(res, 400, { error: 'An account with this email already exists' });
      }

      const passHash = hashPassword(password);
      const insert = db.prepare(`
        INSERT INTO users (email, password_hash, full_name, phone, role, status)
        VALUES (?, ?, ?, ?, 'CUSTOMER', 'ACTIVE')
      `);
      const result = insert.run(email.toLowerCase().trim(), passHash, full_name.trim(), phone || '');
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);

      const token = generateSessionToken(user);
      logAudit(user.id, user.full_name, user.role, 'CUSTOMER_REGISTER', 'USER', user.id, 'SUCCESS');

      return sendJson(res, 201, {
        message: 'Account registered successfully',
        token,
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          phone: user.phone,
          role: user.role,
          status: user.status
        }
      }, { 'Set-Cookie': `motopitshop_session=${token}; Path=/; HttpOnly; SameSite=Lax` });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const { email, password } = body;

      if (!email || !password) {
        return sendJson(res, 400, { error: 'Email and password are required' });
      }

      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
      if (!user) {
        logAudit(null, email, 'GUEST', 'LOGIN_FAILED', 'USER', null, 'FAILURE', { reason: 'User not found' });
        return sendJson(res, 401, { error: 'Invalid email or password' });
      }

      if (user.status !== 'ACTIVE') {
        logAudit(user.id, user.full_name, user.role, 'LOGIN_BLOCKED', 'USER', user.id, 'FAILURE', { status: user.status });
        return sendJson(res, 403, { error: `Account is currently ${user.status.toLowerCase()}. Please contact support.` });
      }

      const passHash = hashPassword(password);
      if (passHash !== user.password_hash) {
        logAudit(user.id, user.full_name, user.role, 'LOGIN_FAILED', 'USER', user.id, 'FAILURE', { reason: 'Invalid password' });
        return sendJson(res, 401, { error: 'Invalid email or password' });
      }

      // Update last login
      db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);

      const token = generateSessionToken(user);
      logAudit(user.id, user.full_name, user.role, 'LOGIN_SUCCESS', 'USER', user.id, 'SUCCESS');

      let redirectUrl = '/';
      if (['OWNER', 'ADMIN', 'STAFF'].includes(user.role)) {
        redirectUrl = '/owner';
      } else {
        redirectUrl = '/account';
      }

      return sendJson(res, 200, {
        message: 'Login successful',
        token,
        redirectUrl,
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          phone: user.phone,
          role: user.role,
          staff_role: user.staff_role || user.role,
          status: user.status,
          permissions: typeof user.permissions_json === 'string' ? JSON.parse(user.permissions_json || '{}') : (user.permissions_json || {})
        }
      }, { 'Set-Cookie': `motopitshop_session=${token}; Path=/; HttpOnly; SameSite=Lax` });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    if (currentUser) {
      logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'LOGOUT', 'USER', currentUser.id, 'SUCCESS');
    }
    const authHeader = req.headers['authorization'];
    let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
    if (!token && req.headers.cookie) {
      const cookies = req.headers.cookie.split(';').reduce((acc, cookie) => {
        const [k, v] = cookie.trim().split('=');
        acc[k] = v;
        return acc;
      }, {});
      token = cookies['motopitshop_session'];
    }
    if (token) {
      sessions.delete(token);
      try { db.prepare('DELETE FROM sessions WHERE token = ?').run(token); } catch(e){}
    }
    return sendJson(res, 200, { message: 'Logged out successfully' }, {
      'Set-Cookie': 'motopitshop_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
    });
  }

  if (pathname === '/api/auth/me' && req.method === 'GET') {
    if (!currentUser) {
      return sendJson(res, 200, { authenticated: false, user: null });
    }
    const freshUser = db.prepare('SELECT id, email, full_name, phone, role, staff_role, status, permissions_json, shipping_address, last_login_at, created_at FROM users WHERE id = ?').get(currentUser.id);
    if (!freshUser) {
      return sendJson(res, 200, { authenticated: false, user: null });
    }
    return sendJson(res, 200, {
      authenticated: true,
      user: {
        ...freshUser,
        staff_role: freshUser.staff_role || freshUser.role,
        permissions: typeof freshUser.permissions_json === 'string' ? JSON.parse(freshUser.permissions_json || '{}') : (freshUser.permissions_json || {})
      }
    });
  }

  // --- USER PROFILE & ACCOUNT MANAGEMENT ---
  if (pathname === '/api/user/profile' && req.method === 'PUT') {
    if (!currentUser) {
      return sendJson(res, 401, { error: 'Authentication required' });
    }
    try {
      const body = await parseJsonBody(req);
      const fullName = (body.full_name || '').trim();
      const phone = (body.phone || '').trim();
      if (!fullName) {
        return sendJson(res, 400, { error: 'Full name is required' });
      }
      db.prepare(`
        UPDATE users SET full_name = ?, phone = ?, updated_at = datetime('now') WHERE id = ?
      `).run(fullName, phone, currentUser.id);

      currentUser.full_name = fullName;
      currentUser.phone = phone;

      logAudit(currentUser.id, fullName, currentUser.role, 'UPDATE_PROFILE', 'USER', currentUser.id, 'SUCCESS');
      return sendJson(res, 200, { message: 'Profile updated successfully', user: { ...currentUser, full_name: fullName, phone } });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (pathname === '/api/user/password' && req.method === 'PUT') {
    if (!currentUser) {
      return sendJson(res, 401, { error: 'Authentication required' });
    }
    try {
      const body = await parseJsonBody(req);
      const { currentPassword, newPassword } = body;
      if (!currentPassword || !newPassword) {
        return sendJson(res, 400, { error: 'Current password and new password are required' });
      }
      if (newPassword.length < 6) {
        return sendJson(res, 400, { error: 'New password must be at least 6 characters' });
      }
      const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(currentUser.id);
      if (!user || user.password_hash !== hashPassword(currentPassword)) {
        return sendJson(res, 400, { error: 'Incorrect current password' });
      }
      const newHash = hashPassword(newPassword);
      db.prepare(`
        UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?
      `).run(newHash, currentUser.id);

      logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'CHANGE_PASSWORD', 'USER', currentUser.id, 'SUCCESS');
      return sendJson(res, 200, { message: 'Password updated successfully' });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (pathname === '/api/user/address' && req.method === 'PUT') {
    if (!currentUser) {
      return sendJson(res, 401, { error: 'Authentication required' });
    }
    try {
      const body = await parseJsonBody(req);
      const address = (body.address || '').trim();
      db.prepare(`
        UPDATE users SET shipping_address = ?, updated_at = datetime('now') WHERE id = ?
      `).run(address, currentUser.id);

      logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'UPDATE_ADDRESS', 'USER', currentUser.id, 'SUCCESS');
      return sendJson(res, 200, { message: 'Shipping address saved successfully', address });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // --- 2. PRODUCTS & CATEGORIES ---
  if (pathname === '/api/products' && req.method === 'GET') {
    const cat = parsedUrl.searchParams.get('category');
    const brand = parsedUrl.searchParams.get('brand');
    const search = parsedUrl.searchParams.get('search');
    const bikeBrand = parsedUrl.searchParams.get('bikeBrand');
    const bikeModel = parsedUrl.searchParams.get('bikeModel');
    const bikeYear = parsedUrl.searchParams.get('bikeYear');

    let query = `
      SELECT p.*, c.name as category_name, c.slug as category_slug, b.name as brand_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN brands b ON p.brand_id = b.id
      WHERE p.status = 'ACTIVE'
    `;
    const params = [];

    if (cat && cat !== 'all') {
      query += ` AND (c.slug = ? OR c.name LIKE ?)`;
      params.push(cat, `%${cat}%`);
    }
    if (brand && brand !== 'all') {
      query += ` AND (b.slug = ? OR b.name LIKE ?)`;
      params.push(brand, `%${brand}%`);
    }
    if (search) {
      query += ` AND (p.name LIKE ? OR p.sku LIKE ? OR p.product_code LIKE ? OR p.description LIKE ? OR b.name LIKE ? OR p.hsn LIKE ?)`;
      const term = `%${search}%`;
      params.push(term, term, term, term, term, term);
    }

    if (bikeBrand && bikeModel) {
      query += `
        AND p.id IN (
          SELECT bc.product_id 
          FROM bike_compatibility bc 
          JOIN bikes bk ON bc.bike_id = bk.id
          WHERE bk.brand = ? AND bk.model = ?
      `;
      params.push(bikeBrand, bikeModel);
      if (bikeYear) {
        query += ` AND bk.year = ?`;
        params.push(parseInt(bikeYear, 10));
      }
      query += `)`;
    }

    query += ` ORDER BY p.id DESC`;

    const products = db.prepare(query).all(...params);
    return sendJson(res, 200, { products });
  }

  if (pathname.startsWith('/api/products/') && req.method === 'GET') {
    const id = pathname.split('/')[3];
    const product = db.prepare(`
      SELECT p.*, c.name as category_name, b.name as brand_name, s.name as supplier_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN brands b ON p.brand_id = b.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.id = ? OR p.slug = ?
    `).get(id, id);

    if (!product) return sendJson(res, 404, { error: 'Product not found' });

    const compatibleBikes = db.prepare(`
      SELECT bk.* FROM bikes bk
      JOIN bike_compatibility bc ON bk.id = bc.bike_id
      WHERE bc.product_id = ?
    `).all(product.id);

    const reviews = db.prepare(`SELECT * FROM reviews WHERE product_id = ? AND is_approved = 1 ORDER BY id DESC`).all(product.id);

    return sendJson(res, 200, { product, compatibleBikes, reviews });
  }

  if (pathname === '/api/products' && req.method === 'POST') {
    if (!currentUser || !['OWNER', 'ADMIN', 'STAFF'].includes(currentUser.role)) {
      return sendJson(res, 403, { error: 'Unauthorized: Admin or Staff permission required' });
    }
    try {
      const body = await parseJsonBody(req);
      const { sku, name, brand_id, category_id, description, price, old_price, gst_rate, hsn, stock, primary_image, images_json, compatible_bike_ids } = body;

      if (!name || !price || !primary_image) {
        return sendJson(res, 400, { error: 'Name, price, and primary image are required' });
      }

      const generatedSku = sku || `MPS-PROD-${Date.now().toString().slice(-6)}`;
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') + '-' + Date.now().toString().slice(-4);
      let discount = 0;
      if (old_price && old_price > price) {
        discount = Math.round(((old_price - price) / old_price) * 100);
      }

      const insert = db.prepare(`
        INSERT INTO products (
          sku, product_code, name, slug, brand_id, category_id, description,
          price, old_price, discount, gst_rate, hsn, stock, min_stock, primary_image, images_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 5, ?, ?)
      `);
      const result = insert.run(
        generatedSku, generatedSku, name.trim(), slug, brand_id || 1, category_id || 1,
        description || '', price, old_price || null, discount, gst_rate || 18.0, hsn || '8714',
        stock || 10, primary_image.trim(), JSON.stringify(images_json || [primary_image])
      );

      const productId = result.lastInsertRowid;

      if (Array.isArray(compatible_bike_ids)) {
        const compStmt = db.prepare('INSERT OR IGNORE INTO bike_compatibility (product_id, bike_id) VALUES (?, ?)');
        compatible_bike_ids.forEach(bikeId => compStmt.run(productId, bikeId));
      }

      logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'CREATE_PRODUCT', 'PRODUCT', productId, 'SUCCESS', { name, sku: generatedSku, price });
      return sendJson(res, 201, { message: 'Product created successfully', id: productId });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (pathname.startsWith('/api/products/') && req.method === 'DELETE') {
    if (!currentUser || !['OWNER', 'ADMIN'].includes(currentUser.role)) {
      return sendJson(res, 403, { error: 'Unauthorized: Admin or Owner role required' });
    }
    const id = parseInt(pathname.split('/')[3], 10);
    try {
      db.prepare('DELETE FROM products WHERE id = ?').run(id);
      logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'DELETE_PRODUCT', 'PRODUCT', id, 'SUCCESS');
      return sendJson(res, 200, { message: 'Product deleted successfully' });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (pathname === '/api/categories' && req.method === 'GET') {
    const categories = db.prepare('SELECT * FROM categories ORDER BY display_order ASC').all();
    return sendJson(res, 200, { categories });
  }

  if (pathname === '/api/brands' && req.method === 'GET') {
    const brands = db.prepare('SELECT * FROM brands ORDER BY name ASC').all();
    return sendJson(res, 200, { brands });
  }

  if (pathname === '/api/bikes' && req.method === 'GET') {
    const bikes = db.prepare('SELECT * FROM bikes ORDER BY brand ASC, model ASC, year DESC').all();
    return sendJson(res, 200, { bikes });
  }

  // --- 3. PAYMENTS & ORDERS ---
  if (pathname === '/api/payments/create' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const { amount, method } = body;
      const providerOrderId = `pay_ord_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const transactionRef = `txn_${Date.now()}`;

      return sendJson(res, 200, {
        success: true,
        provider: 'MOTO_PITSHOP_PAYMENT_GATEWAY',
        providerOrderId,
        transactionRef,
        amount,
        currency: 'INR',
        method: method || 'UPI'
      });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (pathname === '/api/orders' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const { customer, items, payment } = body;

      if (!customer || !items || !items.length) {
        return sendJson(res, 400, { error: 'Customer information and cart items are required' });
      }

      let subtotal = 0;
      let taxTotal = 0;
      let cgstTotal = 0;
      let sgstTotal = 0;
      let igstTotal = 0;

      const preparedItems = items.map(item => {
        const prod = db.prepare('SELECT * FROM products WHERE id = ?').get(item.id || item.product_id);
        const itemPrice = prod ? prod.price : (item.price || 0);
        const itemQty = item.quantity || item.qty || 1;
        const itemSubtotal = itemPrice * itemQty;
        const gstRate = prod ? prod.gst_rate : 18.0;
        const taxVal = Math.round(itemSubtotal * (gstRate / (100 + gstRate)));

        subtotal += itemSubtotal - taxVal;
        taxTotal += taxVal;
        cgstTotal += Math.round(taxVal / 2);
        sgstTotal += Math.round(taxVal / 2);

        return {
          product_id: prod ? prod.id : null,
          product_name: prod ? prod.name : item.name,
          product_sku: prod ? prod.sku : 'MPS-GEN',
          price: itemPrice,
          quantity: itemQty,
          hsn: prod ? prod.hsn : '8714',
          gst_rate: gstRate,
          tax_amount: taxVal,
          total: itemSubtotal
        };
      });

      const grandTotal = subtotal + taxTotal;
      const orderNumber = `MPS-ORD-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;

      const insertOrder = db.prepare(`
        INSERT INTO orders (
          order_number, user_id, customer_name, customer_email, customer_phone,
          shipping_address_json, status, payment_status, payment_method, payment_ref, payment_screenshot,
          subtotal, tax_total, cgst_total, sgst_total, igst_total, grand_total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const userId = currentUser ? currentUser.id : null;
      const payStatus = (payment && payment.status) ? payment.status : (customer.payment === 'COD' ? 'PENDING' : 'SUCCESS');
      const payRef = (payment && payment.transactionRef) ? payment.transactionRef : `REF-${Date.now()}`;

      // Store screenshot - limit to 500KB to prevent DB bloat
      const screenshot = customer.screenshot || '';
      const screenshotStored = screenshot.length > 524288 ? screenshot.substring(0, 524288) : screenshot;

      const orderRes = insertOrder.run(
        orderNumber, userId,
        (customer.name || '').trim(),
        (customer.email || '').trim(),
        (customer.phone || '').trim(),
        JSON.stringify(customer.address || {}),
        payStatus === 'SUCCESS' ? 'CONFIRMED' : 'PLACED',
        payStatus,
        customer.payment || 'UPI',
        payRef,
        screenshotStored,
        subtotal, taxTotal, cgstTotal, sgstTotal, igstTotal, grandTotal
      );

      const orderId = orderRes.lastInsertRowid;

      const insertItem = db.prepare(`
        INSERT INTO order_items (order_id, product_id, product_name, product_sku, price, quantity, hsn, gst_rate, tax_amount, total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const updateStock = db.prepare(`
        UPDATE products SET stock = MAX(0, stock - ?), updated_at = datetime('now') WHERE id = ?
      `);
      const logTxn = db.prepare(`
        INSERT INTO inventory_transactions (product_id, transaction_type, quantity_change, previous_stock, new_stock, notes, user_id)
        VALUES (?, 'SALE', ?, ?, ?, ?, ?)
      `);

      preparedItems.forEach(item => {
        insertItem.run(orderId, item.product_id, item.product_name, item.product_sku, item.price, item.quantity, item.hsn, item.gst_rate, item.tax_amount, item.total);
        if (item.product_id) {
          const prod = db.prepare('SELECT stock FROM products WHERE id = ?').get(item.product_id);
          if (prod) {
            const prevStock = prod.stock;
            const newStock = Math.max(0, prevStock - item.quantity);
            updateStock.run(item.quantity, item.product_id);
            logTxn.run(item.product_id, -item.quantity, prevStock, newStock, `Order #${orderNumber}`, userId);
          }
        }
      });

      const invoiceNum = `INV-${Date.now().toString().slice(-6)}`;
      db.prepare(`
        INSERT INTO invoices (invoice_number, order_id, order_number, user_id, customer_name, taxable_value, cgst, sgst, igst, total_tax, grand_total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `).run(invoiceNum, orderId, orderNumber, userId, customer.name, subtotal, cgstTotal, sgstTotal, taxTotal, grandTotal);

      logAudit(userId, customer.name, currentUser ? currentUser.role : 'CUSTOMER', 'CREATE_ORDER', 'ORDER', orderId, 'SUCCESS', { orderNumber, grandTotal });

      // Synchronize Order and Invoice to MongoDB
      syncTableRecordToMongo(db, 'orders', orderId);
      const invRow = db.prepare('SELECT id FROM invoices WHERE order_id = ?').get(orderId);
      if (invRow) syncTableRecordToMongo(db, 'invoices', invRow.id);

      return sendJson(res, 201, {
        message: 'Order placed successfully',
        orderId,
        orderNumber,
        invoiceNumber: invoiceNum,
        grandTotal
      });
    } catch (err) {
      console.error('Order creation error:', err.message, err.stack);
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (pathname === '/api/orders' && req.method === 'GET') {
    if (!currentUser) return sendJson(res, 401, { error: 'Unauthorized' });

    let orders;
    if (['OWNER', 'ADMIN', 'STAFF'].includes(currentUser.role)) {
      orders = db.prepare('SELECT * FROM orders ORDER BY id DESC').all();
    } else {
      orders = db.prepare('SELECT * FROM orders WHERE user_id = ? OR customer_email = ? ORDER BY id DESC').all(currentUser.id, currentUser.email);
    }

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

  if (pathname.startsWith('/api/orders/') && req.method === 'PUT') {
    if (!currentUser || !['OWNER', 'ADMIN', 'STAFF'].includes(currentUser.role)) {
      return sendJson(res, 403, { error: 'Unauthorized' });
    }
    const id = parseInt(pathname.split('/')[3], 10);
    try {
      const body = await parseJsonBody(req);
      const { status, payment_status } = body;

      db.prepare(`
        UPDATE orders SET
          status = COALESCE(?, status),
          payment_status = COALESCE(?, payment_status),
          updated_at = datetime('now')
        WHERE id = ?
      `).run(status, payment_status, id);

      logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'UPDATE_ORDER_STATUS', 'ORDER', id, 'SUCCESS', { status, payment_status });
      return sendJson(res, 200, { message: 'Order status updated successfully' });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (pathname.startsWith('/api/products/') && req.method === 'PUT') {
    if (!currentUser || !['OWNER', 'ADMIN', 'STAFF'].includes(currentUser.role)) {
      return sendJson(res, 403, { error: 'Unauthorized: Admin/Owner role required' });
    }
    const id = parseInt(pathname.split('/')[3], 10);
    try {
      const body = await parseJsonBody(req);
      const { name, brand_id, category_id, description, price, old_price, stock, primary_image } = body;
      
      let discount = 0;
      if (old_price && old_price > price) {
        discount = Math.round(((old_price - price) / old_price) * 100);
      }

      db.prepare(`
        UPDATE products SET
          name = COALESCE(?, name),
          brand_id = COALESCE(?, brand_id),
          category_id = COALESCE(?, category_id),
          description = COALESCE(?, description),
          price = COALESCE(?, price),
          old_price = ?,
          discount = ?,
          stock = COALESCE(?, stock),
          primary_image = COALESCE(?, primary_image),
          updated_at = datetime('now')
        WHERE id = ?
      `).run(name, brand_id || null, category_id || null, description || null, price, old_price || null, discount, stock, primary_image || null, id);

      logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'UPDATE_PRODUCT', 'PRODUCT', id, 'SUCCESS', { name, price });
      return sendJson(res, 200, { message: 'Product updated successfully' });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (pathname.startsWith('/api/orders/') && req.method === 'DELETE') {
    if (!currentUser || !['OWNER', 'ADMIN', 'STAFF'].includes(currentUser.role)) {
      return sendJson(res, 403, { error: 'Unauthorized: Admin/Owner role required' });
    }
    const rawId = pathname.split('/')[3];
    const numId = parseInt(rawId, 10);
    try {
      const order = !isNaN(numId)
        ? db.prepare('SELECT * FROM orders WHERE id = ? OR order_number = ?').get(numId, rawId)
        : db.prepare('SELECT * FROM orders WHERE order_number = ?').get(rawId);
      if (!order) {
        return sendJson(res, 404, { error: 'Order not found' });
      }
      const orderId = order.id;
      try {
        db.prepare('DELETE FROM credit_note_items WHERE credit_note_id IN (SELECT id FROM credit_notes WHERE order_id = ?)').run(orderId);
        db.prepare('DELETE FROM credit_notes WHERE order_id = ?').run(orderId);
      } catch (e) {}
      try {
        db.prepare('DELETE FROM payments WHERE order_id = ?').run(orderId);
      } catch (e) {}
      db.prepare('DELETE FROM order_items WHERE order_id = ?').run(orderId);
      db.prepare('DELETE FROM invoices WHERE order_id = ?').run(orderId);
      db.prepare('DELETE FROM orders WHERE id = ?').run(orderId);

      deleteFromMongo('orders', { id: orderId });
      deleteFromMongo('order_items', { order_id: orderId });
      deleteFromMongo('invoices', { $or: [{ id: orderId }, { order_id: orderId }, { order_number: order.order_number }] });
      deleteFromMongo('payments', { order_id: orderId });
      deleteFromMongo('credit_notes', { order_id: orderId });

      logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'DELETE_ORDER', 'ORDER', orderId, 'SUCCESS');
      return sendJson(res, 200, { message: `Order #${order.order_number} deleted successfully` });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (pathname === '/api/inventory/adjust' && req.method === 'POST') {
    if (!currentUser || !['OWNER', 'ADMIN', 'STAFF'].includes(currentUser.role)) {
      return sendJson(res, 403, { error: 'Unauthorized' });
    }
    try {
      const body = await parseJsonBody(req);
      const { product_id, change, reason } = body;

      const prod = db.prepare('SELECT stock FROM products WHERE id = ?').get(product_id);
      if (!prod) return sendJson(res, 404, { error: 'Product not found' });

      const prevStock = prod.stock;
      const newStock = Math.max(0, prevStock + parseInt(change, 10));

      db.prepare(`UPDATE products SET stock = ?, updated_at = datetime('now') WHERE id = ?`).run(newStock, product_id);
      db.prepare(`
        INSERT INTO inventory_transactions (product_id, transaction_type, quantity_change, previous_stock, new_stock, notes, user_id)
        VALUES (?, 'ADJUSTMENT', ?, ?, ?, ?, ?)
      `).run(product_id, change, prevStock, newStock, reason || 'Owner manual adjustment', currentUser.id);

      logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'ADJUST_STOCK', 'INVENTORY', product_id, 'SUCCESS', { change, newStock });
      return sendJson(res, 200, { message: 'Stock updated successfully', newStock });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (pathname === '/api/admin/settings' && req.method === 'GET') {
    const rows = db.prepare('SELECT key, value FROM store_settings').all();
    const settings = {};
    rows.forEach(r => settings[r.key] = r.value);
    return sendJson(res, 200, { settings });
  }

  if (pathname === '/api/admin/settings' && req.method === 'POST') {
    if (!currentUser || !['OWNER', 'ADMIN'].includes(currentUser.role)) {
      return sendJson(res, 403, { error: 'Unauthorized' });
    }
    try {
      const body = await parseJsonBody(req);
      const insertOrUpdate = db.prepare('INSERT OR REPLACE INTO store_settings (key, value) VALUES (?, ?)');
      Object.keys(body).forEach(key => {
        insertOrUpdate.run(key, String(body[key]));
      });
      logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'UPDATE_SETTINGS', 'STORE', null, 'SUCCESS');
      return sendJson(res, 200, { message: 'Settings saved successfully' });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // --- 4. SUPPORT TICKETS ---
  if (pathname === '/api/support/tickets' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const { customer_name, customer_email, order_number, issue_type, subject, message } = body;

      const ticketNum = `TKT-${Date.now().toString().slice(-6)}`;
      const userId = currentUser ? currentUser.id : null;

      db.prepare(`
        INSERT INTO support_tickets (ticket_number, user_id, customer_name, customer_email, order_number, issue_type, subject, message)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(ticketNum, userId, customer_name, customer_email, order_number || '', issue_type || 'General', subject || 'Support Request', message || '');

      return sendJson(res, 201, { message: 'Support ticket submitted successfully', ticketNumber: ticketNum });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // Admin/owner portal removed

  if (pathname === '/api/orders/track' && req.method === 'GET') {
    const orderNum = parsedUrl.searchParams.get('order_number');
    if (!orderNum) return sendJson(res, 400, { error: 'Order number is required' });

    const order = db.prepare('SELECT * FROM orders WHERE order_number = ? OR id = ?').get(orderNum, orderNum);
    if (!order) return sendJson(res, 404, { error: 'Order not found' });

    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    return sendJson(res, 200, {
      order: {
        ...order,
        items,
        shipping_address: typeof order.shipping_address_json === 'string' ? JSON.parse(order.shipping_address_json || '{}') : order.shipping_address_json
      }
    });
  }

  // ==========================================
  // STATIC FILE & ROUTING WITH PERMISSION GUARDS
  // ==========================================
  if (req.method === 'GET') {
    let targetFile = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');

    // Route Protection & Clean URL Aliases
    if (pathname === '/account' || pathname === '/account/' || pathname.startsWith('/account/')) {
      if (!currentUser) {
        res.writeHead(302, { Location: '/login?redirect=/account&msg=unauthorized' });
        return res.end();
      }
      targetFile = 'account.html';
    } else if (pathname === '/owner' || pathname === '/owner/' || pathname.startsWith('/owner/') || pathname === '/admin' || pathname === '/admin/' || pathname === '/pos' || pathname === '/portal') {
      if (!currentUser) {
        res.writeHead(302, { Location: '/login?redirect=/owner&msg=login_required' });
        return res.end();
      }
      if (!['OWNER', 'ADMIN', 'STAFF'].includes(currentUser.role)) {
        res.writeHead(302, { Location: '/login?redirect=/owner&msg=staff_required' });
        return res.end();
      }
      targetFile = 'owner.html';
    } else if (pathname === '/login' || pathname === '/login/') {
      targetFile = 'login.html';
    } else if (pathname === '/register' || pathname === '/register/') {
      targetFile = 'login.html';
    } else if (pathname === '/track-order' || pathname === '/track-order/') {
      targetFile = 'track-order.html';
    } else if (pathname === '/products' || pathname === '/products/' || pathname === '/shop' || pathname === '/categories' || pathname === '/bike-parts' || pathname === '/accessories' || pathname === '/offers') {
      targetFile = 'products.html';
    }

    let filePath = path.join(__dirname, targetFile);
    console.log(`[STATIC] ${req.url} → ${filePath}`);

    fs.stat(filePath, (err, stats) => {
      if (!err && stats.isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        const headers = { 'Content-Type': contentType };
        
        // Prevent back-button caching for HTML pages after logout
        if (ext === '.html') {
          headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0';
          headers['Pragma'] = 'no-cache';
        }
        res.writeHead(200, headers);
        fs.createReadStream(filePath).pipe(res);
      } else {
        // Only fall back to index.html for clean page routes (no extension)
        // Never serve index.html for missing .js/.css/.png/etc assets
        const ext = path.extname(pathname).toLowerCase();
        if (ext && ext !== '.html') {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          return res.end(`404 Not Found: ${pathname}`);
        }
        const spaIndex = path.join(__dirname, 'index.html');
        fs.readFile(spaIndex, (err2, content) => {
          if (err2) {
            res.writeHead(500);
            return res.end('Error loading Moto Pitshop index file.');
          }
          res.writeHead(200, {
            'Content-Type': 'text/html',
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
          });
          res.end(content);
        });
      }
    });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(` MOTO PITSHOP SERVER RUNNING AT: http://localhost:${PORT}`);
  console.log(` Domain Route Support: https://motopitshop.com/`);
  console.log(`====================================================`);
});
