// server.js - Moto Pitshop Production Server (MongoDB-only, no SQLite)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { connectMongo, getDb } = require('./mongodb.js');
const { hashPassword, initDatabase, getNextId } = require('./database.js');
const { handleOwnerApi } = require('./owner-api.js');

const PORT = process.env.PORT || 3000;

// ============================================================
// START HTTP SERVER IMMEDIATELY so Render detects the port
// MongoDB connect and seed happen AFTER server is live
// ============================================================
const server = http.createServer(handleRequest);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(` MOTO PITSHOP SERVER RUNNING AT: http://localhost:${PORT}`);
  console.log(` Health Check:                   http://localhost:${PORT}/health`);
  console.log(`====================================================`);

  connectMongo().then(async () => {
    console.log('[SERVER] MongoDB Atlas connected. Initializing seed data...');
    await initDatabase();
  }).catch(err => {
    console.warn('[SERVER] MongoDB connection failed:', err.message);
  });
});

// In-memory session cache
const sessions = new Map();

async function getStoreSettings() {
  const mdb = getDb();
  if (!mdb) return {};
  try {
    const rows = await mdb.collection('store_settings').find({}).toArray();
    const s = {};
    rows.forEach(r => s[r.key] = r.value);
    return s;
  } catch (e) { return {}; }
}

async function generateSessionToken(user) {
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

  const mdb = getDb();
  if (mdb) {
    try {
      await mdb.collection('sessions').insertOne({ token, user_id: user.id, created_at: now, expires_at: new Date(expiresAt) });
    } catch (e) { /* ignore duplicate */ }
  }

  return token;
}

async function getSessionUser(req) {
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

  // Memory cache check
  if (sessions.has(token)) {
    const sess = sessions.get(token);
    if (sess.expiresAt > Date.now()) return sess.user;
    sessions.delete(token);
  }

  // DB check
  const mdb = getDb();
  if (!mdb) return null;

  try {
    const sess = await mdb.collection('sessions').findOne({ token, expires_at: { $gt: new Date() } });
    if (!sess) return null;
    const user = await mdb.collection('users').findOne({ id: sess.user_id, status: 'ACTIVE' });
    if (!user) return null;

    const userPayload = {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      status: user.status,
      staff_role: user.staff_role || user.role,
      permissions: typeof user.permissions_json === 'string' ? JSON.parse(user.permissions_json || '{}') : (user.permissions_json || {})
    };
    sessions.set(token, { user: userPayload, created: Date.now(), expiresAt: sess.expires_at.getTime() });
    return userPayload;
  } catch (e) {
    return null;
  }
}

async function logAudit(userId, userName, userRole, action, entity, entityId, result = 'SUCCESS', details = {}) {
  const mdb = getDb();
  if (!mdb) return;
  try {
    const id = await getNextId('audit_logs');
    await mdb.collection('audit_logs').insertOne({
      id, user_id: userId || null, user_name: userName || 'Guest',
      user_role: userRole || 'GUEST', action, entity,
      entity_id: String(entityId || ''), result,
      details_json: JSON.stringify(details),
      created_at: new Date().toISOString()
    });
  } catch (e) { /* non-critical */ }
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('error', reject);
    req.on('end', () => {
      if (!body) return resolve({});
      const normalized = body
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u201A]/g, ',')
        .replace(/[\u2013\u2014]/g, '-')
        .replace(/[\u2026]/g, '...');
      try {
        resolve(JSON.parse(normalized));
      } catch (err) {
        reject(new SyntaxError(`Invalid JSON in request body: ${err.message}`));
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
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

async function handleRequest(req, res) {
  if (req.url === '/health' || req.url === '/health/') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    if (req.method === 'HEAD') return res.end();
    return res.end(JSON.stringify({ status: 'OK', message: 'Moto Pitshop server is running', uptime: process.uptime() }));
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  try {
    await mainHandler(req, res);
  } catch (err) {
    console.error('[SERVER] Unhandled request error:', err.message);
    if (!res.headersSent) {
      if (err instanceof SyntaxError && err.message.includes('JSON')) {
        sendJson(res, 400, { error: 'Invalid request body.' });
      } else {
        sendJson(res, 500, { error: 'Internal server error: ' + err.message });
      }
    }
  }
}

async function mainHandler(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  const currentUser = await getSessionUser(req);
  const mdb = getDb();

  // Owner / POS API router
  if (pathname.startsWith('/api/owner/') || pathname.startsWith('/api/pos/')) {
    const handled = await handleOwnerApi(req, res, pathname, parsedUrl, currentUser, parseJsonBody, sendJson, logAudit);
    if (handled !== false) return;
  }

  // ==========================================
  // AUTHENTICATION
  // ==========================================

  if (pathname === '/api/auth/register' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const { email, password, full_name, phone } = body;
      if (!email || !password || !full_name) return sendJson(res, 400, { error: 'Email, password, and full name are required' });
      if (!mdb) return sendJson(res, 503, { error: 'Database not available' });

      const existing = await mdb.collection('users').findOne({ email: email.toLowerCase().trim() });
      if (existing) return sendJson(res, 400, { error: 'An account with this email already exists' });

      const id = await getNextId('users');
      const passHash = hashPassword(password);
      const user = {
        id, email: email.toLowerCase().trim(), password_hash: passHash,
        full_name: full_name.trim(), phone: phone || '', role: 'CUSTOMER',
        status: 'ACTIVE', permissions_json: '{}', staff_role: 'CUSTOMER',
        created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      };
      await mdb.collection('users').insertOne(user);

      const token = await generateSessionToken(user);
      await logAudit(id, user.full_name, user.role, 'CUSTOMER_REGISTER', 'USER', id, 'SUCCESS');
      return sendJson(res, 201, {
        message: 'Account registered successfully', token,
        user: { id: user.id, email: user.email, full_name: user.full_name, phone: user.phone, role: user.role, status: user.status }
      }, { 'Set-Cookie': `motopitshop_session=${token}; Path=/; HttpOnly; SameSite=Lax` });
    } catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const { email, password } = body;
      if (!email || !password) return sendJson(res, 400, { error: 'Email and password are required' });
      if (!mdb) return sendJson(res, 503, { error: 'Database not available' });

      const user = await mdb.collection('users').findOne({ email: email.toLowerCase().trim() });
      if (!user) {
        await logAudit(null, email, 'GUEST', 'LOGIN_FAILED', 'USER', null, 'FAILURE', { reason: 'User not found' });
        return sendJson(res, 401, { error: 'Invalid email or password' });
      }
      if (user.status !== 'ACTIVE') return sendJson(res, 403, { error: `Account is ${user.status.toLowerCase()}. Contact support.` });
      if (hashPassword(password) !== user.password_hash) {
        await logAudit(user.id, user.full_name, user.role, 'LOGIN_FAILED', 'USER', user.id, 'FAILURE', { reason: 'Invalid password' });
        return sendJson(res, 401, { error: 'Invalid email or password' });
      }

      await mdb.collection('users').updateOne({ id: user.id }, { $set: { last_login_at: new Date().toISOString() } });
      const token = await generateSessionToken(user);
      await logAudit(user.id, user.full_name, user.role, 'LOGIN_SUCCESS', 'USER', user.id, 'SUCCESS');

      const redirectUrl = ['OWNER', 'ADMIN', 'STAFF'].includes(user.role) ? '/owner' : '/account';
      return sendJson(res, 200, {
        message: 'Login successful', token, redirectUrl,
        user: {
          id: user.id, email: user.email, full_name: user.full_name, phone: user.phone,
          role: user.role, staff_role: user.staff_role || user.role, status: user.status,
          permissions: typeof user.permissions_json === 'string' ? JSON.parse(user.permissions_json || '{}') : (user.permissions_json || {})
        }
      }, { 'Set-Cookie': `motopitshop_session=${token}; Path=/; HttpOnly; SameSite=Lax` });
    } catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    if (currentUser) await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'LOGOUT', 'USER', currentUser.id, 'SUCCESS');
    const authHeader = req.headers['authorization'];
    let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
    if (!token && req.headers.cookie) {
      const cookies = req.headers.cookie.split(';').reduce((acc, c) => { const [k, v] = c.trim().split('='); acc[k] = v; return acc; }, {});
      token = cookies['motopitshop_session'];
    }
    if (token) {
      sessions.delete(token);
      if (mdb) { try { await mdb.collection('sessions').deleteOne({ token }); } catch (e) {} }
    }
    return sendJson(res, 200, { message: 'Logged out successfully' }, {
      'Set-Cookie': 'motopitshop_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
    });
  }

  if (pathname === '/api/auth/me' && req.method === 'GET') {
    if (!currentUser) return sendJson(res, 200, { authenticated: false, user: null });
    if (!mdb) return sendJson(res, 200, { authenticated: true, user: currentUser });
    const freshUser = await mdb.collection('users').findOne({ id: currentUser.id });
    if (!freshUser) return sendJson(res, 200, { authenticated: false, user: null });
    return sendJson(res, 200, {
      authenticated: true,
      user: {
        ...freshUser, _id: undefined,
        staff_role: freshUser.staff_role || freshUser.role,
        permissions: typeof freshUser.permissions_json === 'string' ? JSON.parse(freshUser.permissions_json || '{}') : (freshUser.permissions_json || {})
      }
    });
  }

  // ==========================================
  // USER PROFILE
  // ==========================================

  if (pathname === '/api/user/profile' && req.method === 'PUT') {
    if (!currentUser) return sendJson(res, 401, { error: 'Authentication required' });
    try {
      const body = await parseJsonBody(req);
      const fullName = (body.full_name || '').trim();
      const phone = (body.phone || '').trim();
      if (!fullName) return sendJson(res, 400, { error: 'Full name is required' });
      if (mdb) await mdb.collection('users').updateOne({ id: currentUser.id }, { $set: { full_name: fullName, phone, updated_at: new Date().toISOString() } });
      await logAudit(currentUser.id, fullName, currentUser.role, 'UPDATE_PROFILE', 'USER', currentUser.id, 'SUCCESS');
      return sendJson(res, 200, { message: 'Profile updated successfully', user: { ...currentUser, full_name: fullName, phone } });
    } catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname === '/api/user/password' && req.method === 'PUT') {
    if (!currentUser) return sendJson(res, 401, { error: 'Authentication required' });
    try {
      const body = await parseJsonBody(req);
      const { currentPassword, newPassword } = body;
      if (!currentPassword || !newPassword) return sendJson(res, 400, { error: 'Current and new password are required' });
      if (newPassword.length < 6) return sendJson(res, 400, { error: 'New password must be at least 6 characters' });
      if (!mdb) return sendJson(res, 503, { error: 'Database not available' });
      const user = await mdb.collection('users').findOne({ id: currentUser.id });
      if (!user || user.password_hash !== hashPassword(currentPassword)) return sendJson(res, 400, { error: 'Incorrect current password' });
      await mdb.collection('users').updateOne({ id: currentUser.id }, { $set: { password_hash: hashPassword(newPassword), updated_at: new Date().toISOString() } });
      await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'CHANGE_PASSWORD', 'USER', currentUser.id, 'SUCCESS');
      return sendJson(res, 200, { message: 'Password updated successfully' });
    } catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname === '/api/user/address' && req.method === 'PUT') {
    if (!currentUser) return sendJson(res, 401, { error: 'Authentication required' });
    try {
      const body = await parseJsonBody(req);
      const address = (body.address || '').trim();
      if (mdb) await mdb.collection('users').updateOne({ id: currentUser.id }, { $set: { shipping_address: address, updated_at: new Date().toISOString() } });
      await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'UPDATE_ADDRESS', 'USER', currentUser.id, 'SUCCESS');
      return sendJson(res, 200, { message: 'Shipping address saved successfully', address });
    } catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  // ==========================================
  // PRODUCTS & CATEGORIES
  // ==========================================

  if (pathname === '/api/products' && req.method === 'GET') {
    if (!mdb) return sendJson(res, 503, { error: 'Database not available' });
    const cat = parsedUrl.searchParams.get('category');
    const brand = parsedUrl.searchParams.get('brand');
    const search = parsedUrl.searchParams.get('search');

    const filter = { status: 'ACTIVE', is_archived: { $ne: 1 } };
    if (cat && cat !== 'all') filter.$or = [{ category_slug: cat }, { category_name: new RegExp(cat, 'i') }];
    if (brand && brand !== 'all') filter.$or = [{ brand_slug: brand }, { brand_name: new RegExp(brand, 'i') }];
    if (search) {
      const regex = new RegExp(search, 'i');
      filter.$or = [{ name: regex }, { sku: regex }, { description: regex }, { brand_name: regex }];
    }

    try {
      let products = await mdb.collection('products').find(filter).maxTimeMS(8000).sort({ _id: -1 }).toArray();
      products = products.map(p => ({ ...p, _id: undefined, id: p.id || p._id?.toString(), images_json: p.images_json || '[]' }));
      return sendJson(res, 200, { products });
    } catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname.startsWith('/api/products/') && req.method === 'GET') {
    if (!mdb) return sendJson(res, 503, { error: 'Database not available' });
    const id = pathname.split('/')[3];
    const numId = parseInt(id, 10);
    try {
      let product = null;
      if (!isNaN(numId)) product = await mdb.collection('products').findOne({ id: numId });
      if (!product) product = await mdb.collection('products').findOne({ $or: [{ slug: id }, { sku: id }] });
      if (!product) return sendJson(res, 404, { error: 'Product not found' });
      product = { ...product, _id: undefined, id: product.id || product._id?.toString(), images_json: product.images_json || '[]' };
      const reviews = await mdb.collection('reviews').find({ product_id: product.id, is_approved: 1 }).sort({ _id: -1 }).toArray();
      return sendJson(res, 200, { product, compatibleBikes: [], reviews: reviews.map(r => ({ ...r, _id: undefined })) });
    } catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname === '/api/products' && req.method === 'POST') {
    if (!currentUser || !['OWNER', 'ADMIN', 'STAFF'].includes(currentUser.role)) return sendJson(res, 403, { error: 'Unauthorized' });
    if (!mdb) return sendJson(res, 503, { error: 'Database not available' });
    try {
      const body = await parseJsonBody(req);
      const { name, price, primary_image, sku, brand_id, category_id, description, old_price, gst_rate, hsn, stock, images_json } = body;
      if (!name || !price || !primary_image) return sendJson(res, 400, { error: 'Name, price, and primary image are required' });
      const id = await getNextId('products');
      const genSku = sku || `MPS-PROD-${Date.now().toString().slice(-6)}`;
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') + '-' + Date.now().toString().slice(-4);
      const safeOldPrice = old_price || null;
      const discount = safeOldPrice && safeOldPrice > price ? Math.round(((safeOldPrice - price) / safeOldPrice) * 100) : 0;
      await mdb.collection('products').insertOne({
        id, sku: genSku, barcode: `890${Date.now().toString().slice(-9)}`, product_code: genSku,
        name: name.trim(), slug, brand_id: brand_id || null, category_id: category_id || null,
        description: description || '', price: parseInt(price), old_price: safeOldPrice, discount,
        gst_rate: parseFloat(gst_rate) || 18.0, hsn: hsn || '8714', stock: parseInt(stock) || 0,
        min_stock: 5, primary_image: primary_image.trim(),
        images_json: JSON.stringify(images_json || [primary_image]),
        status: 'ACTIVE', is_archived: 0, rating: 5.0, rating_count: 1,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      });
      await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'CREATE_PRODUCT', 'PRODUCT', id, 'SUCCESS', { name, sku: genSku, price });
      return sendJson(res, 201, { message: 'Product created successfully', id });
    } catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname.startsWith('/api/products/') && req.method === 'PUT') {
    if (!currentUser || !['OWNER', 'ADMIN', 'STAFF'].includes(currentUser.role)) return sendJson(res, 403, { error: 'Unauthorized' });
    if (!mdb) return sendJson(res, 503, { error: 'Database not available' });
    const id = parseInt(pathname.split('/')[3], 10);
    try {
      const body = await parseJsonBody(req);
      const { name, brand_id, category_id, description, price, old_price, stock, primary_image } = body;
      const discount = old_price && old_price > price ? Math.round(((old_price - price) / old_price) * 100) : 0;
      const update = {};
      if (name) update.name = name;
      if (brand_id !== undefined) update.brand_id = brand_id;
      if (category_id !== undefined) update.category_id = category_id;
      if (description !== undefined) update.description = description;
      if (price !== undefined) update.price = parseInt(price);
      if (old_price !== undefined) update.old_price = old_price || null;
      update.discount = discount;
      if (stock !== undefined) update.stock = parseInt(stock);
      if (primary_image) update.primary_image = primary_image;
      update.updated_at = new Date().toISOString();
      await mdb.collection('products').updateOne({ id }, { $set: update });
      await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'UPDATE_PRODUCT', 'PRODUCT', id, 'SUCCESS');
      return sendJson(res, 200, { message: 'Product updated successfully' });
    } catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname.startsWith('/api/products/') && req.method === 'DELETE') {
    if (!currentUser || !['OWNER', 'ADMIN'].includes(currentUser.role)) return sendJson(res, 403, { error: 'Unauthorized' });
    if (!mdb) return sendJson(res, 503, { error: 'Database not available' });
    const id = parseInt(pathname.split('/')[3], 10);
    try {
      await mdb.collection('products').deleteOne({ id });
      await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'DELETE_PRODUCT', 'PRODUCT', id, 'SUCCESS');
      return sendJson(res, 200, { message: 'Product deleted successfully' });
    } catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname === '/api/categories' && req.method === 'GET') {
    if (!mdb) return sendJson(res, 503, { error: 'Database not available' });
    const cats = await mdb.collection('categories').find({}).sort({ display_order: 1 }).toArray();
    return sendJson(res, 200, { categories: cats.map(c => ({ ...c, _id: undefined })) });
  }

  if (pathname === '/api/brands' && req.method === 'GET') {
    if (!mdb) return sendJson(res, 503, { error: 'Database not available' });
    const brands = await mdb.collection('brands').find({}).sort({ name: 1 }).toArray();
    return sendJson(res, 200, { brands: brands.map(b => ({ ...b, _id: undefined })) });
  }

  if (pathname === '/api/bikes' && req.method === 'GET') {
    if (!mdb) return sendJson(res, 503, { error: 'Database not available' });
    const bikes = await mdb.collection('bikes').find({}).sort({ brand: 1, model: 1 }).toArray();
    return sendJson(res, 200, { bikes: bikes.map(b => ({ ...b, _id: undefined })) });
  }

  // ==========================================
  // ORDERS
  // ==========================================

  if (pathname === '/api/payments/create' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const { amount, method } = body;
      return sendJson(res, 200, {
        success: true, provider: 'MOTO_PITSHOP_PAYMENT_GATEWAY',
        providerOrderId: `pay_ord_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        transactionRef: `txn_${Date.now()}`, amount, currency: 'INR', method: method || 'UPI'
      });
    } catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname === '/api/orders' && req.method === 'POST') {
    if (!mdb) return sendJson(res, 503, { error: 'Database not available' });
    try {
      const body = await parseJsonBody(req);
      const { customer, items, payment } = body;
      if (!customer || !items || !items.length) return sendJson(res, 400, { error: 'Customer information and cart items are required' });

      let subtotal = 0, taxTotal = 0, cgstTotal = 0, sgstTotal = 0;
      const preparedItems = [];

      for (const item of items) {
        const prod = await mdb.collection('products').findOne({ id: parseInt(item.id || item.product_id) });
        const itemPrice = prod ? prod.price : (item.price || 0);
        const itemQty = item.quantity || item.qty || 1;
        const itemSubtotal = itemPrice * itemQty;
        const gstRate = prod ? (prod.gst_rate || 18.0) : 18.0;
        const taxVal = Math.round(itemSubtotal * (gstRate / (100 + gstRate)));
        subtotal += itemSubtotal - taxVal;
        taxTotal += taxVal;
        cgstTotal += Math.round(taxVal / 2);
        sgstTotal += Math.round(taxVal / 2);
        preparedItems.push({
          product_id: prod ? prod.id : null,
          product_name: prod ? prod.name : (item.name || 'Unknown'),
          product_sku: prod ? prod.sku : 'MPS-GEN',
          price: itemPrice, quantity: itemQty,
          hsn: prod ? (prod.hsn || '8714') : '8714',
          gst_rate: gstRate, tax_amount: taxVal, total: itemSubtotal
        });
      }

      const grandTotal = subtotal + taxTotal;
      const orderId = await getNextId('orders');
      const orderNumber = `MPS-ORD-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;
      const userId = currentUser ? currentUser.id : null;
      const payStatus = (payment && payment.status) ? payment.status : (customer.payment === 'COD' ? 'PENDING' : 'SUCCESS');
      const payRef = (payment && payment.transactionRef) ? payment.transactionRef : `REF-${Date.now()}`;
      const screenshot = customer.screenshot || '';
      const screenshotStored = screenshot.length > 524288 ? screenshot.substring(0, 524288) : screenshot;

      await mdb.collection('orders').insertOne({
        id: orderId, order_number: orderNumber, user_id: userId,
        customer_name: (customer.name || '').trim(), customer_email: (customer.email || '').trim(),
        customer_phone: (customer.phone || '').trim(),
        shipping_address_json: JSON.stringify(customer.address || {}),
        status: payStatus === 'SUCCESS' ? 'CONFIRMED' : 'PLACED',
        payment_status: payStatus, payment_method: customer.payment || 'UPI',
        payment_ref: payRef, payment_screenshot: screenshotStored,
        subtotal, tax_total: taxTotal, cgst_total: cgstTotal, sgst_total: sgstTotal,
        igst_total: 0, discount_total: 0, grand_total: grandTotal,
        order_type: 'ONLINE', items: preparedItems,
        notes: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      });

      // Deduct stock
      for (const item of preparedItems) {
        if (item.product_id) {
          await mdb.collection('products').updateOne({ id: item.product_id }, { $inc: { stock: -item.quantity }, $set: { updated_at: new Date().toISOString() } });
        }
      }

      const invoiceNum = `INV-${Date.now().toString().slice(-6)}`;
      const invoiceId = await getNextId('invoices');
      await mdb.collection('invoices').insertOne({
        id: invoiceId, invoice_number: invoiceNum, order_id: orderId, order_number: orderNumber,
        user_id: userId, customer_name: customer.name, invoice_type: 'ONLINE',
        taxable_value: subtotal, cgst: cgstTotal, sgst: sgstTotal, igst: 0,
        total_tax: taxTotal, grand_total: grandTotal, payment_status: 'PAID',
        created_at: new Date().toISOString()
      });

      await logAudit(userId, customer.name, currentUser ? currentUser.role : 'CUSTOMER', 'CREATE_ORDER', 'ORDER', orderId, 'SUCCESS', { orderNumber, grandTotal });
      return sendJson(res, 201, { message: 'Order placed successfully', orderId, orderNumber, invoiceNumber: invoiceNum, grandTotal });
    } catch (err) {
      console.error('Order creation error:', err.message);
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (pathname === '/api/orders' && req.method === 'GET') {
    if (!currentUser) return sendJson(res, 401, { error: 'Unauthorized' });
    if (!mdb) return sendJson(res, 503, { error: 'Database not available' });
    let filter = {};
    if (!['OWNER', 'ADMIN', 'STAFF'].includes(currentUser.role)) {
      filter = { $or: [{ user_id: currentUser.id }, { customer_email: currentUser.email }] };
    }
    const orders = await mdb.collection('orders').find(filter).sort({ _id: -1 }).toArray();
    return sendJson(res, 200, {
      orders: orders.map(o => ({
        ...o, _id: undefined,
        shipping_address: typeof o.shipping_address_json === 'string' ? JSON.parse(o.shipping_address_json || '{}') : o.shipping_address_json
      }))
    });
  }

  if (pathname.startsWith('/api/orders/') && req.method === 'PUT') {
    if (!currentUser || !['OWNER', 'ADMIN', 'STAFF'].includes(currentUser.role)) return sendJson(res, 403, { error: 'Unauthorized' });
    if (!mdb) return sendJson(res, 503, { error: 'Database not available' });
    const id = parseInt(pathname.split('/')[3], 10);
    try {
      const body = await parseJsonBody(req);
      const { status, payment_status } = body;
      const update = { updated_at: new Date().toISOString() };
      if (status) update.status = status;
      if (payment_status) update.payment_status = payment_status;
      await mdb.collection('orders').updateOne({ id }, { $set: update });
      await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'UPDATE_ORDER_STATUS', 'ORDER', id, 'SUCCESS', { status, payment_status });
      return sendJson(res, 200, { message: 'Order status updated successfully' });
    } catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname.startsWith('/api/orders/') && req.method === 'DELETE') {
    if (!currentUser || !['OWNER', 'ADMIN', 'STAFF'].includes(currentUser.role)) return sendJson(res, 403, { error: 'Unauthorized' });
    if (!mdb) return sendJson(res, 503, { error: 'Database not available' });
    const rawId = pathname.split('/')[3];
    const numId = parseInt(rawId, 10);
    try {
      const order = await mdb.collection('orders').findOne(!isNaN(numId) ? { $or: [{ id: numId }, { order_number: rawId }] } : { order_number: rawId });
      if (!order) return sendJson(res, 404, { error: 'Order not found' });
      await mdb.collection('orders').deleteOne({ id: order.id });
      await mdb.collection('invoices').deleteMany({ order_id: order.id });
      await mdb.collection('credit_notes').deleteMany({ order_id: order.id });
      await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'DELETE_ORDER', 'ORDER', order.id, 'SUCCESS');
      return sendJson(res, 200, { message: `Order #${order.order_number} deleted successfully` });
    } catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname === '/api/inventory/adjust' && req.method === 'POST') {
    if (!currentUser || !['OWNER', 'ADMIN', 'STAFF'].includes(currentUser.role)) return sendJson(res, 403, { error: 'Unauthorized' });
    if (!mdb) return sendJson(res, 503, { error: 'Database not available' });
    try {
      const body = await parseJsonBody(req);
      const { product_id, change, reason } = body;
      const prod = await mdb.collection('products').findOne({ id: parseInt(product_id) });
      if (!prod) return sendJson(res, 404, { error: 'Product not found' });
      const prevStock = prod.stock;
      const newStock = Math.max(0, prevStock + parseInt(change, 10));
      await mdb.collection('products').updateOne({ id: prod.id }, { $set: { stock: newStock, updated_at: new Date().toISOString() } });
      const txnId = await getNextId('inventory_transactions');
      await mdb.collection('inventory_transactions').insertOne({
        id: txnId, product_id: prod.id, transaction_type: 'ADJUSTMENT',
        quantity_change: parseInt(change), previous_stock: prevStock, new_stock: newStock,
        notes: reason || 'Owner manual adjustment', user_id: currentUser.id, created_at: new Date().toISOString()
      });
      await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'ADJUST_STOCK', 'INVENTORY', prod.id, 'SUCCESS', { change, newStock });
      return sendJson(res, 200, { message: 'Stock updated successfully', newStock });
    } catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname === '/api/admin/settings' && req.method === 'GET') {
    if (!mdb) return sendJson(res, 503, { error: 'Database not available' });
    const rows = await mdb.collection('store_settings').find({}).toArray();
    const settings = {};
    rows.forEach(r => settings[r.key] = r.value);
    return sendJson(res, 200, { settings });
  }

  if (pathname === '/api/admin/settings' && req.method === 'POST') {
    if (!currentUser || !['OWNER', 'ADMIN'].includes(currentUser.role)) return sendJson(res, 403, { error: 'Unauthorized' });
    if (!mdb) return sendJson(res, 503, { error: 'Database not available' });
    try {
      const body = await parseJsonBody(req);
      for (const [key, value] of Object.entries(body)) {
        await mdb.collection('store_settings').updateOne({ key }, { $set: { key, value: String(value) } }, { upsert: true });
      }
      await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'UPDATE_SETTINGS', 'STORE', null, 'SUCCESS');
      return sendJson(res, 200, { message: 'Settings saved successfully' });
    } catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname === '/api/support/tickets' && req.method === 'POST') {
    if (!mdb) return sendJson(res, 503, { error: 'Database not available' });
    try {
      const body = await parseJsonBody(req);
      const { customer_name, customer_email, order_number, issue_type, subject, message } = body;
      const ticketNum = `TKT-${Date.now().toString().slice(-6)}`;
      const id = await getNextId('support_tickets');
      await mdb.collection('support_tickets').insertOne({
        id, ticket_number: ticketNum, user_id: currentUser ? currentUser.id : null,
        customer_name, customer_email, order_number: order_number || '',
        issue_type: issue_type || 'General', subject: subject || 'Support Request',
        message: message || '', status: 'OPEN', created_at: new Date().toISOString()
      });
      return sendJson(res, 201, { message: 'Support ticket submitted successfully', ticketNumber: ticketNum });
    } catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname === '/api/orders/track' && req.method === 'GET') {
    if (!mdb) return sendJson(res, 503, { error: 'Database not available' });
    const orderNum = parsedUrl.searchParams.get('order_number');
    if (!orderNum) return sendJson(res, 400, { error: 'Order number is required' });
    const numId = parseInt(orderNum, 10);
    const order = await mdb.collection('orders').findOne(!isNaN(numId) ? { $or: [{ id: numId }, { order_number: orderNum }] } : { order_number: orderNum });
    if (!order) return sendJson(res, 404, { error: 'Order not found' });
    return sendJson(res, 200, {
      order: {
        ...order, _id: undefined,
        shipping_address: typeof order.shipping_address_json === 'string' ? JSON.parse(order.shipping_address_json || '{}') : order.shipping_address_json
      }
    });
  }

  // ==========================================
  // STATIC FILES
  // ==========================================
  if (req.method === 'GET' || req.method === 'HEAD') {
    if (req.method === 'HEAD') {
      res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
      return res.end();
    }

    let targetFile = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');

    if (pathname === '/account' || pathname === '/account/' || pathname.startsWith('/account/')) {
      if (!currentUser) { res.writeHead(302, { Location: '/login?redirect=/account&msg=unauthorized' }); return res.end(); }
      targetFile = 'account.html';
    } else if (pathname === '/owner' || pathname === '/owner/' || pathname.startsWith('/owner/') || pathname === '/admin' || pathname === '/admin/' || pathname === '/pos' || pathname === '/portal') {
      if (!currentUser) { res.writeHead(302, { Location: '/login?redirect=/owner&msg=login_required' }); return res.end(); }
      if (!['OWNER', 'ADMIN', 'STAFF'].includes(currentUser.role)) { res.writeHead(302, { Location: '/login?redirect=/owner&msg=staff_required' }); return res.end(); }
      targetFile = 'owner.html';
    } else if (pathname === '/login' || pathname === '/login/') { targetFile = 'login.html'; }
    else if (pathname === '/register' || pathname === '/register/') { targetFile = 'login.html'; }
    else if (pathname === '/track-order' || pathname === '/track-order/') { targetFile = 'track-order.html'; }
    else if (pathname === '/products' || pathname === '/products/' || pathname === '/shop') { targetFile = 'products.html'; }

    const filePath = path.join(__dirname, targetFile);
    fs.stat(filePath, (err, stats) => {
      if (!err && stats.isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        const headers = { 'Content-Type': contentType };
        if (ext === '.html') { headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'; headers['Pragma'] = 'no-cache'; }
        res.writeHead(200, headers);
        fs.createReadStream(filePath).pipe(res);
      } else {
        const ext = path.extname(pathname).toLowerCase();
        if (ext && ext !== '.html') { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end(`404 Not Found: ${pathname}`); }
        const spaIndex = path.join(__dirname, 'index.html');
        fs.readFile(spaIndex, (err2, content) => {
          if (err2) { res.writeHead(500); return res.end('Error loading index.'); }
          res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
          res.end(content);
        });
      }
    });
  }
}

process.on('unhandledRejection', reason => console.error('[SERVER] Unhandled Rejection:', reason));
process.on('uncaughtException', err => console.error('[SERVER] Uncaught Exception:', err.message));
