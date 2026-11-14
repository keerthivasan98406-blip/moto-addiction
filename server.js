// server.js - Moto Pitshop Full-Stack Production HTTP & API Server (MongoDB Only)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { initDatabase, hashPassword, getNextId, getDb } = require('./database.js');
const { handleOwnerApi } = require('./owner-api.js');
const { connectMongo, getMongoStatus } = require('./mongodb.js');

const PORT = process.env.PORT || 3000;

const server = http.createServer(handleRequest);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(` MOTO PITSHOP SERVER RUNNING AT: http://localhost:${PORT}`);
  console.log(` Health Check:                   http://localhost:${PORT}/health`);
  console.log(`====================================================`);
  connectMongo().then(async (mDb) => {
    if (mDb) {
      console.log('[SERVER] MongoDB Atlas connected.');
      try { await initDatabase(); console.log('[SERVER] MongoDB seed data initialized.'); }
      catch (err) { console.warn('[SERVER] Seed init warning:', err.message); }
    }
  }).catch(err => { console.warn('[SERVER] MongoDB connection deferred:', err.message); });
});

const sessions = new Map();

async function generateSessionToken(user) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const expiresAt = now + (30 * 24 * 60 * 60 * 1000);
  const userPayload = { id: user.id, email: user.email, full_name: user.full_name, role: user.role, status: user.status, staff_role: user.staff_role || user.role, permissions: typeof user.permissions_json === 'string' ? JSON.parse(user.permissions_json || '{}') : (user.permissions_json || {}) };
  sessions.set(token, { user: userPayload, created: now, expiresAt });
  try { const db = getDb(); if (db) { await db.collection('sessions').updateOne({ token }, { $set: { token, user_id: user.id, created_at: now, expires_at: expiresAt } }, { upsert: true }); } }
  catch (err) { console.error('Error saving session:', err); }
  return token;
}

async function getSessionUser(req) {
  const authHeader = req.headers['authorization'];
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) token = authHeader.substring(7);
  else if (req.headers.cookie) { const cookies = req.headers.cookie.split(';').reduce((acc, cookie) => { const [k, v] = cookie.trim().split('='); acc[k] = v; return acc; }, {}); token = cookies['motopitshop_session']; }
  if (!token) return null;
  if (sessions.has(token)) { const sess = sessions.get(token); if (sess.expiresAt > Date.now()) return sess.user; sessions.delete(token); }
  try {
    const db = getDb(); if (db) {
      const now = Date.now();
      const sessDoc = await db.collection('sessions').findOne({ token, expires_at: { $gt: now } });
      if (sessDoc) { const user = await db.collection('users').findOne({ id: sessDoc.user_id }); if (user && user.status === 'ACTIVE') { const userPayload = { id: user.id, email: user.email, full_name: user.full_name, role: user.role, status: user.status, staff_role: user.staff_role || user.role, permissions: typeof user.permissions_json === 'string' ? JSON.parse(user.permissions_json || '{}') : (user.permissions_json || {}) }; sessions.set(token, { user: userPayload, created: now, expiresAt: now + (30 * 24 * 60 * 60 * 1000) }); return userPayload; } }
    }
  } catch (err) { console.error('Error retrieving session:', err); }
  return null;
}

async function logAudit(userId, userName, userRole, action, entity, entityId, result = 'SUCCESS', details = {}) {
  try { const db = getDb(); if (!db) return; await db.collection('audit_logs').insertOne({ user_id: userId || null, user_name: userName || 'Guest', user_role: userRole || 'GUEST', action, entity, entity_id: String(entityId || ''), ip_address: '127.0.0.1', result, details_json: JSON.stringify(details), created_at: new Date().toISOString() }); }
  catch (err) { console.error('Audit Log Error:', err); }
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('error', (err) => reject(err));
    req.on('end', () => {
      if (!body) return resolve({});
      const normalized = body.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u201A]/g, ',').replace(/[\u2013\u2014]/g, '-').replace(/[\u2026]/g, '...');
      try { resolve(JSON.parse(normalized)); } catch (err) { reject(new SyntaxError(`Invalid JSON in request body: ${err.message}`)); }
    });
  });
}

function sendJson(res, statusCode, data, headers = {}) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', ...headers });
  res.end(JSON.stringify(data));
}

const MIME_TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

async function handleRequest(req, res) {
  if (req.url === '/health' || req.url === '/health/') { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); if (req.method === 'HEAD') return res.end(); return res.end(JSON.stringify({ status: 'OK', message: 'Moto Pitshop server is running', uptime: process.uptime() })); }
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }); return res.end(); }
  try { await mainHandler(req, res); }
  catch (err) { console.error('[SERVER] Unhandled request error:', err.message); if (!res.headersSent) { if (err instanceof SyntaxError && err.message.includes('JSON')) sendJson(res, 400, { error: 'Invalid request body. Please check your input and try again.' }); else sendJson(res, 500, { error: 'Internal server error: ' + err.message }); } }
}

async function mainHandler(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // Guard: ensure MongoDB is connected before handling any API request
  // Skip for static files (GET requests for .html/.css/.js etc.)
  if (pathname.startsWith('/api/')) {
    const db = getDb();
    if (!db) {
      return sendJson(res, 503, { error: 'Database is still connecting. Please wait a moment and try again.' });
    }
  }

  const currentUser = await getSessionUser(req);

  if (pathname.startsWith('/api/owner/') || pathname.startsWith('/api/pos/')) {
    const handled = await handleOwnerApi(req, res, pathname, parsedUrl, currentUser, parseJsonBody, sendJson, logAudit);
    if (handled !== false) return;
  }

  // AUTH
  if (pathname === '/api/auth/register' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req); const { email, password, full_name, phone } = body;
      if (!email || !password || !full_name) return sendJson(res, 400, { error: 'Email, password, and full name are required' });
      const db = getDb();
      const existing = await db.collection('users').findOne({ email: email.toLowerCase().trim() });
      if (existing) return sendJson(res, 400, { error: 'An account with this email already exists' });
      const userId = await getNextId('users'); const now = new Date().toISOString();
      await db.collection('users').insertOne({ id: userId, email: email.toLowerCase().trim(), password_hash: hashPassword(password), full_name: full_name.trim(), phone: phone || '', role: 'CUSTOMER', status: 'ACTIVE', permissions_json: '{}', staff_role: 'CUSTOMER', created_at: now, updated_at: now });
      const user = await db.collection('users').findOne({ id: userId });
      const token = await generateSessionToken(user);
      await logAudit(user.id, user.full_name, user.role, 'CUSTOMER_REGISTER', 'USER', user.id, 'SUCCESS');
      return sendJson(res, 201, { message: 'Account registered successfully', token, user: { id: user.id, email: user.email, full_name: user.full_name, phone: user.phone, role: user.role, status: user.status } }, { 'Set-Cookie': `motopitshop_session=${token}; Path=/; HttpOnly; SameSite=Lax` });
    } catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req); const { email, password } = body;
      if (!email || !password) return sendJson(res, 400, { error: 'Email and password are required' });
      const db = getDb();
      const user = await db.collection('users').findOne({ email: email.toLowerCase().trim() });
      if (!user) { await logAudit(null, email, 'GUEST', 'LOGIN_FAILED', 'USER', null, 'FAILURE', { reason: 'User not found' }); return sendJson(res, 401, { error: 'Invalid email or password' }); }
      if (user.status !== 'ACTIVE') { await logAudit(user.id, user.full_name, user.role, 'LOGIN_BLOCKED', 'USER', user.id, 'FAILURE', { status: user.status }); return sendJson(res, 403, { error: `Account is currently ${user.status.toLowerCase()}. Please contact support.` }); }
      if (hashPassword(password) !== user.password_hash) { await logAudit(user.id, user.full_name, user.role, 'LOGIN_FAILED', 'USER', user.id, 'FAILURE', { reason: 'Invalid password' }); return sendJson(res, 401, { error: 'Invalid email or password' }); }
      await db.collection('users').updateOne({ id: user.id }, { $set: { last_login_at: new Date().toISOString() } });
      const token = await generateSessionToken(user);
      await logAudit(user.id, user.full_name, user.role, 'LOGIN_SUCCESS', 'USER', user.id, 'SUCCESS');
      return sendJson(res, 200, { message: 'Login successful', token, redirectUrl: ['OWNER', 'ADMIN', 'STAFF'].includes(user.role) ? '/owner' : '/account', user: { id: user.id, email: user.email, full_name: user.full_name, phone: user.phone, role: user.role, staff_role: user.staff_role || user.role, status: user.status, permissions: typeof user.permissions_json === 'string' ? JSON.parse(user.permissions_json || '{}') : (user.permissions_json || {}) } }, { 'Set-Cookie': `motopitshop_session=${token}; Path=/; HttpOnly; SameSite=Lax` });
    } catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    if (currentUser) await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'LOGOUT', 'USER', currentUser.id, 'SUCCESS');
    const authHeader = req.headers['authorization']; let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
    if (!token && req.headers.cookie) { const cookies = req.headers.cookie.split(';').reduce((acc, cookie) => { const [k, v] = cookie.trim().split('='); acc[k] = v; return acc; }, {}); token = cookies['motopitshop_session']; }
    if (token) { sessions.delete(token); try { const db = getDb(); if (db) await db.collection('sessions').deleteOne({ token }); } catch(e){} }
    return sendJson(res, 200, { message: 'Logged out successfully' }, { 'Set-Cookie': 'motopitshop_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT' });
  }

  if (pathname === '/api/auth/me' && req.method === 'GET') {
    if (!currentUser) return sendJson(res, 200, { authenticated: false, user: null });
    const db = getDb();
    const freshUser = await db.collection('users').findOne({ id: currentUser.id }, { projection: { password_hash: 0 } });
    if (!freshUser) return sendJson(res, 200, { authenticated: false, user: null });
    return sendJson(res, 200, { authenticated: true, user: { ...freshUser, staff_role: freshUser.staff_role || freshUser.role, permissions: typeof freshUser.permissions_json === 'string' ? JSON.parse(freshUser.permissions_json || '{}') : (freshUser.permissions_json || {}) } });
  }

  // PROFILE
  if (pathname === '/api/user/profile' && req.method === 'PUT') {
    if (!currentUser) return sendJson(res, 401, { error: 'Authentication required' });
    try { const body = await parseJsonBody(req); const fullName = (body.full_name || '').trim(); const phone = (body.phone || '').trim(); if (!fullName) return sendJson(res, 400, { error: 'Full name is required' }); const db = getDb(); await db.collection('users').updateOne({ id: currentUser.id }, { $set: { full_name: fullName, phone, updated_at: new Date().toISOString() } }); currentUser.full_name = fullName; currentUser.phone = phone; await logAudit(currentUser.id, fullName, currentUser.role, 'UPDATE_PROFILE', 'USER', currentUser.id, 'SUCCESS'); return sendJson(res, 200, { message: 'Profile updated successfully', user: { ...currentUser, full_name: fullName, phone } }); }
    catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname === '/api/user/password' && req.method === 'PUT') {
    if (!currentUser) return sendJson(res, 401, { error: 'Authentication required' });
    try { const body = await parseJsonBody(req); const { currentPassword, newPassword } = body; if (!currentPassword || !newPassword) return sendJson(res, 400, { error: 'Current password and new password are required' }); if (newPassword.length < 6) return sendJson(res, 400, { error: 'New password must be at least 6 characters' }); const db = getDb(); const user = await db.collection('users').findOne({ id: currentUser.id }); if (!user || user.password_hash !== hashPassword(currentPassword)) return sendJson(res, 400, { error: 'Incorrect current password' }); await db.collection('users').updateOne({ id: currentUser.id }, { $set: { password_hash: hashPassword(newPassword), updated_at: new Date().toISOString() } }); await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'CHANGE_PASSWORD', 'USER', currentUser.id, 'SUCCESS'); return sendJson(res, 200, { message: 'Password updated successfully' }); }
    catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname === '/api/user/address' && req.method === 'PUT') {
    if (!currentUser) return sendJson(res, 401, { error: 'Authentication required' });
    try { const body = await parseJsonBody(req); const address = (body.address || '').trim(); const db = getDb(); await db.collection('users').updateOne({ id: currentUser.id }, { $set: { shipping_address: address, updated_at: new Date().toISOString() } }); await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'UPDATE_ADDRESS', 'USER', currentUser.id, 'SUCCESS'); return sendJson(res, 200, { message: 'Shipping address saved successfully', address }); }
    catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  // PRODUCTS
  if (pathname === '/api/products' && req.method === 'GET') {
    const cat = parsedUrl.searchParams.get('category'); const brand = parsedUrl.searchParams.get('brand'); const search = parsedUrl.searchParams.get('search');
    const db = getDb();
    if (db) { try { const filter = { status: 'ACTIVE', is_archived: { $ne: 1 } }; if (cat && cat !== 'all') filter.$or = [{ category_slug: cat }, { category_name: new RegExp(cat, 'i') }]; if (brand && brand !== 'all') filter.$or = [{ brand_slug: brand }, { brand_name: new RegExp(brand, 'i') }]; if (search) { const regex = new RegExp(search, 'i'); filter.$or = [{ name: regex }, { sku: regex }, { product_code: regex }, { description: regex }, { brand_name: regex }, { hsn: regex }]; }
      let products = await db.collection('products').find(filter).maxTimeMS(5000).sort({ _id: -1 }).toArray();
      products = products.map(p => ({ ...p, id: p.id || (p._id ? p._id.toString() : undefined), images_json: p.images_json || (p.images ? JSON.stringify(p.images) : '[]'), category_slug: p.category_slug || '', category_name: p.category_name || '', brand_name: p.brand_name || '' }));
      return sendJson(res, 200, { products }); } catch (e) { console.warn('[API/products] MongoDB read failed:', e.message); } }
    return sendJson(res, 200, { products: [] });
  }

  if (pathname.startsWith('/api/products/') && req.method === 'GET') {
    const id = pathname.split('/')[3]; const db = getDb();
    if (db) { try { let product = null; const numId = parseInt(id, 10); if (!isNaN(numId)) product = await db.collection('products').findOne({ id: numId }); if (!product) product = await db.collection('products').findOne({ $or: [{ slug: id }, { sku: id }] }); if (product) { product.id = product.id || (product._id ? product._id.toString() : undefined); product.images_json = product.images_json || (product.images ? JSON.stringify(product.images) : '[]'); return sendJson(res, 200, { product, compatibleBikes: [], reviews: [] }); } } catch (e) { console.warn('[API/products/:id] MongoDB read failed:', e.message); } }
    return sendJson(res, 404, { error: 'Product not found' });
  }

  if (pathname === '/api/products' && req.method === 'POST') {
    if (!currentUser || !['OWNER', 'ADMIN', 'STAFF'].includes(currentUser.role)) return sendJson(res, 403, { error: 'Unauthorized: Admin or Staff permission required' });
    try { const body = await parseJsonBody(req); const { sku, name, brand_id, category_id, description, price, old_price, gst_rate, hsn, stock, primary_image, images_json } = body; if (!name || !price || !primary_image) return sendJson(res, 400, { error: 'Name, price, and primary image are required' }); const db = getDb(); const genSku = sku || `MPS-PROD-${Date.now().toString().slice(-6)}`; const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') + '-' + Date.now().toString().slice(-4); let discount = 0; if (old_price && old_price > price) discount = Math.round(((old_price - price) / old_price) * 100); const productId = await getNextId('products'); const now = new Date().toISOString(); await db.collection('products').insertOne({ id: productId, sku: genSku, product_code: genSku, name: name.trim(), slug, brand_id: brand_id || 1, category_id: category_id || 1, description: description || '', price, old_price: old_price || null, discount, gst_rate: gst_rate || 18.0, hsn: hsn || '8714', stock: stock || 10, min_stock: 5, primary_image: primary_image.trim(), images_json: JSON.stringify(images_json || [primary_image]), is_archived: 0, status: 'ACTIVE', rating: 5.0, rating_count: 1, is_featured: 0, is_bestseller: 0, created_at: now, updated_at: now }); await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'CREATE_PRODUCT', 'PRODUCT', productId, 'SUCCESS', { name, sku: genSku, price }); return sendJson(res, 201, { message: 'Product created successfully', id: productId }); }
    catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname.startsWith('/api/products/') && req.method === 'DELETE') {
    if (!currentUser || !['OWNER', 'ADMIN'].includes(currentUser.role)) return sendJson(res, 403, { error: 'Unauthorized: Admin or Owner role required' });
    const id = parseInt(pathname.split('/')[3], 10);
    try { const db = getDb(); await db.collection('products').deleteOne({ id }); await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'DELETE_PRODUCT', 'PRODUCT', id, 'SUCCESS'); return sendJson(res, 200, { message: 'Product deleted successfully' }); }
    catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname === '/api/categories' && req.method === 'GET') { const db = getDb(); if (db) { try { const categories = await db.collection('categories').find({}).sort({ display_order: 1 }).toArray(); if (categories.length > 0) return sendJson(res, 200, { categories: categories.map(c => ({ ...c, id: c.id || c._id })) }); } catch (e) {} } return sendJson(res, 200, { categories: [] }); }
  if (pathname === '/api/brands' && req.method === 'GET') { const db = getDb(); if (db) { try { const brands = await db.collection('brands').find({}).sort({ name: 1 }).toArray(); if (brands.length > 0) return sendJson(res, 200, { brands: brands.map(b => ({ ...b, id: b.id || b._id })) }); } catch (e) {} } return sendJson(res, 200, { brands: [] }); }
  if (pathname === '/api/bikes' && req.method === 'GET') { const db = getDb(); if (db) { try { const bikes = await db.collection('bikes').find({}).sort({ brand: 1, model: 1 }).toArray(); if (bikes.length > 0) return sendJson(res, 200, { bikes: bikes.map(b => ({ ...b, id: b.id || b._id })) }); } catch (e) {} } return sendJson(res, 200, { bikes: [] }); }

  // ORDERS
  if (pathname === '/api/payments/create' && req.method === 'POST') { try { const body = await parseJsonBody(req); const { amount, method } = body; return sendJson(res, 200, { success: true, provider: 'MOTO_PITSHOP_PAYMENT_GATEWAY', providerOrderId: `pay_ord_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`, transactionRef: `txn_${Date.now()}`, amount, currency: 'INR', method: method || 'UPI' }); } catch (err) { return sendJson(res, 500, { error: err.message }); } }

  if (pathname === '/api/orders' && req.method === 'POST') {
    try { const body = await parseJsonBody(req); const { customer, items, payment } = body; if (!customer || !items || !items.length) return sendJson(res, 400, { error: 'Customer information and cart items are required' }); const db = getDb(); let subtotal = 0, taxTotal = 0, cgstTotal = 0, sgstTotal = 0; const preparedItems = [];
      for (const item of items) {
        const rawId = item.id || item.product_id;
        const numId = parseInt(rawId, 10);
        let prod = null;
        if (!isNaN(numId)) {
          prod = await db.collection('products').findOne({ id: numId });
        }
        if (!prod && rawId) {
          prod = await db.collection('products').findOne({
            $or: [{ id: rawId }, { id: String(rawId) }, { sku: rawId }, { barcode: rawId }]
          });
          if (!prod) {
            try {
              const { ObjectId } = require('mongodb');
              if (ObjectId.isValid(rawId)) {
                prod = await db.collection('products').findOne({ _id: new ObjectId(rawId) });
              }
            } catch (e) {}
          }
        }
        if (!prod && item.sku) prod = await db.collection('products').findOne({ sku: item.sku });
        if (!prod && item.name) prod = await db.collection('products').findOne({ name: item.name });
        const itemPrice = prod ? prod.price : (item.price || 0);
        const itemQty = item.quantity || item.qty || 1;
        const itemSubtotal = itemPrice * itemQty;
        const gstRate = prod ? prod.gst_rate : 18.0;
        const taxVal = Math.round(itemSubtotal * (gstRate / (100 + gstRate)));
        subtotal += itemSubtotal - taxVal;
        taxTotal += taxVal;
        cgstTotal += Math.round(taxVal / 2);
        sgstTotal += Math.round(taxVal / 2);
        preparedItems.push({ product_id: prod ? prod.id : null, mongo_id: prod ? prod._id : null, product_name: prod ? prod.name : item.name, product_sku: prod ? prod.sku : 'MPS-GEN', price: itemPrice, quantity: itemQty, hsn: prod ? prod.hsn : '8714', gst_rate: gstRate, tax_amount: taxVal, total: itemSubtotal });
      }
      const grandTotal = subtotal + taxTotal; const orderNumber = `MPS-ORD-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`; const userId = currentUser ? currentUser.id : null; const payStatus = (payment && payment.status) ? payment.status : (customer.payment === 'COD' ? 'PENDING' : 'SUCCESS'); const payRef = (payment && payment.transactionRef) ? payment.transactionRef : `REF-${Date.now()}`; const screenshot = customer.screenshot || ''; const screenshotStored = screenshot.length > 524288 ? screenshot.substring(0, 524288) : screenshot; const orderId = await getNextId('orders'); const now = new Date().toISOString();
      await db.collection('orders').insertOne({ id: orderId, order_number: orderNumber, user_id: userId, customer_name: (customer.name || '').trim(), customer_email: (customer.email || '').trim(), customer_phone: (customer.phone || '').trim(), shipping_address_json: JSON.stringify(customer.address || {}), status: payStatus === 'SUCCESS' ? 'CONFIRMED' : 'PLACED', payment_status: payStatus, payment_method: customer.payment || 'UPI', payment_ref: payRef, payment_screenshot: screenshotStored, subtotal, tax_total: taxTotal, cgst_total: cgstTotal, sgst_total: sgstTotal, igst_total: 0, grand_total: grandTotal, order_type: 'ONLINE', created_at: now, updated_at: now, items: preparedItems });
      for (const item of preparedItems) {
        const itemId = await getNextId('order_items');
        await db.collection('order_items').insertOne({ id: itemId, order_id: orderId, product_id: item.product_id, product_name: item.product_name, product_sku: item.product_sku, price: item.price, quantity: item.quantity, hsn: item.hsn, gst_rate: item.gst_rate, tax_amount: item.tax_amount, total: item.total, created_at: now });
        if (item.mongo_id) {
          await db.collection('products').updateOne({ _id: item.mongo_id }, { $inc: { stock: -item.quantity }, $set: { updated_at: now } });
        } else if (item.product_id) {
          await db.collection('products').updateOne({ id: item.product_id }, { $inc: { stock: -item.quantity }, $set: { updated_at: now } });
        }
        if (item.product_id || item.mongo_id) {
          const txnId = await getNextId('inventory_transactions');
          await db.collection('inventory_transactions').insertOne({ id: txnId, product_id: item.product_id, transaction_type: 'SALE', quantity_change: -item.quantity, notes: `Order #${orderNumber}`, user_id: userId, created_at: now });
        }
      }
      const invoiceNum = `INV-${Date.now().toString().slice(-6)}`; const invoiceId = await getNextId('invoices'); await db.collection('invoices').insertOne({ id: invoiceId, invoice_number: invoiceNum, order_id: orderId, order_number: orderNumber, user_id: userId, customer_name: customer.name, taxable_value: subtotal, cgst: cgstTotal, sgst: sgstTotal, igst: 0, total_tax: taxTotal, grand_total: grandTotal, invoice_type: 'ONLINE', payment_status: 'PAID', created_at: now });
      await logAudit(userId, customer.name, currentUser ? currentUser.role : 'CUSTOMER', 'CREATE_ORDER', 'ORDER', orderId, 'SUCCESS', { orderNumber, grandTotal });
      return sendJson(res, 201, { message: 'Order placed successfully', orderId, orderNumber, invoiceNumber: invoiceNum, grandTotal });
    } catch (err) { console.error('Order creation error:', err.message, err.stack); return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname === '/api/orders' && req.method === 'GET') {
    if (!currentUser) return sendJson(res, 401, { error: 'Unauthorized' });
    const db = getDb();
    let orders = ['OWNER', 'ADMIN', 'STAFF'].includes(currentUser.role) ? await db.collection('orders').find({}).sort({ id: -1 }).toArray() : await db.collection('orders').find({ $or: [{ user_id: currentUser.id }, { customer_email: currentUser.email }] }).sort({ id: -1 }).toArray();
    for (const o of orders) { if (!o.items || o.items.length === 0) o.items = await db.collection('order_items').find({ order_id: o.id }).toArray(); o.shipping_address = typeof o.shipping_address_json === 'string' ? JSON.parse(o.shipping_address_json || '{}') : (o.shipping_address_json || {}); }
    return sendJson(res, 200, { orders });
  }

  if (pathname.startsWith('/api/orders/') && req.method === 'PUT') {
    if (!currentUser || !['OWNER', 'ADMIN', 'STAFF'].includes(currentUser.role)) return sendJson(res, 403, { error: 'Unauthorized' });
    const id = parseInt(pathname.split('/')[3], 10);
    try { const body = await parseJsonBody(req); const { status, payment_status } = body; const db = getDb(); const updateFields = { updated_at: new Date().toISOString() }; if (status) updateFields.status = status; if (payment_status) updateFields.payment_status = payment_status; await db.collection('orders').updateOne({ id }, { $set: updateFields }); await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'UPDATE_ORDER_STATUS', 'ORDER', id, 'SUCCESS', { status, payment_status }); return sendJson(res, 200, { message: 'Order status updated successfully' }); }
    catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname.startsWith('/api/products/') && req.method === 'PUT') {
    if (!currentUser || !['OWNER', 'ADMIN', 'STAFF'].includes(currentUser.role)) return sendJson(res, 403, { error: 'Unauthorized: Admin/Owner role required' });
    const id = parseInt(pathname.split('/')[3], 10);
    try { const body = await parseJsonBody(req); const { name, brand_id, category_id, description, price, old_price, stock, primary_image } = body; const db = getDb(); let discount = 0; if (old_price && old_price > price) discount = Math.round(((old_price - price) / old_price) * 100); const updateFields = { updated_at: new Date().toISOString() }; if (name) updateFields.name = name; if (brand_id !== undefined) updateFields.brand_id = brand_id; if (category_id !== undefined) updateFields.category_id = category_id; if (description) updateFields.description = description; if (price) updateFields.price = price; updateFields.old_price = old_price || null; updateFields.discount = discount; if (stock !== undefined) updateFields.stock = stock; if (primary_image) updateFields.primary_image = primary_image; await db.collection('products').updateOne({ id }, { $set: updateFields }); await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'UPDATE_PRODUCT', 'PRODUCT', id, 'SUCCESS', { name, price }); return sendJson(res, 200, { message: 'Product updated successfully' }); }
    catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname.startsWith('/api/orders/') && req.method === 'DELETE') {
    if (!currentUser || !['OWNER', 'ADMIN', 'STAFF'].includes(currentUser.role)) return sendJson(res, 403, { error: 'Unauthorized: Admin/Owner role required' });
    const rawId = pathname.split('/')[3]; const numId = parseInt(rawId, 10);
    try { const db = getDb(); const order = !isNaN(numId) ? await db.collection('orders').findOne({ $or: [{ id: numId }, { order_number: rawId }] }) : await db.collection('orders').findOne({ order_number: rawId }); if (!order) return sendJson(res, 404, { error: 'Order not found' }); const orderId = order.id; await db.collection('order_items').deleteMany({ order_id: orderId }); await db.collection('invoices').deleteMany({ order_id: orderId }); await db.collection('orders').deleteOne({ id: orderId }); await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'DELETE_ORDER', 'ORDER', orderId, 'SUCCESS'); return sendJson(res, 200, { message: `Order #${order.order_number} deleted successfully` }); }
    catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname === '/api/inventory/adjust' && req.method === 'POST') {
    if (!currentUser || !['OWNER', 'ADMIN', 'STAFF'].includes(currentUser.role)) return sendJson(res, 403, { error: 'Unauthorized' });
    try { const body = await parseJsonBody(req); const { product_id, change, reason } = body; const db = getDb(); const prod = await db.collection('products').findOne({ id: product_id }); if (!prod) return sendJson(res, 404, { error: 'Product not found' }); const newStock = Math.max(0, (prod.stock || 0) + parseInt(change, 10)); await db.collection('products').updateOne({ id: product_id }, { $set: { stock: newStock, updated_at: new Date().toISOString() } }); const txnId = await getNextId('inventory_transactions'); await db.collection('inventory_transactions').insertOne({ id: txnId, product_id, transaction_type: 'ADJUSTMENT', quantity_change: parseInt(change, 10), previous_stock: prod.stock, new_stock: newStock, notes: reason || 'Owner manual adjustment', user_id: currentUser.id, created_at: new Date().toISOString() }); await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'ADJUST_STOCK', 'INVENTORY', product_id, 'SUCCESS', { change, newStock }); return sendJson(res, 200, { message: 'Stock updated successfully', newStock }); }
    catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname === '/api/admin/settings' && req.method === 'GET') { const db = getDb(); const rows = await db.collection('store_settings').find({}).toArray(); const settings = {}; rows.forEach(r => settings[r.key] = r.value); return sendJson(res, 200, { settings }); }
  if (pathname === '/api/admin/settings' && req.method === 'POST') { if (!currentUser || !['OWNER', 'ADMIN'].includes(currentUser.role)) return sendJson(res, 403, { error: 'Unauthorized' }); try { const body = await parseJsonBody(req); const db = getDb(); for (const key of Object.keys(body)) { await db.collection('store_settings').updateOne({ key }, { $set: { key, value: String(body[key]), updated_at: new Date().toISOString() } }, { upsert: true }); } await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'UPDATE_SETTINGS', 'STORE', null, 'SUCCESS'); return sendJson(res, 200, { message: 'Settings saved successfully' }); } catch (err) { return sendJson(res, 500, { error: err.message }); } }

  // SUPPORT
  if (pathname === '/api/support/tickets' && req.method === 'POST') { try { const body = await parseJsonBody(req); const { customer_name, customer_email, order_number, issue_type, subject, message } = body; const db = getDb(); const ticketNum = `TKT-${Date.now().toString().slice(-6)}`; const userId = currentUser ? currentUser.id : null; const ticketId = await getNextId('support_tickets'); await db.collection('support_tickets').insertOne({ id: ticketId, ticket_number: ticketNum, user_id: userId, customer_name, customer_email, order_number: order_number || '', issue_type: issue_type || 'General', subject: subject || 'Support Request', message: message || '', status: 'OPEN', created_at: new Date().toISOString() }); return sendJson(res, 201, { message: 'Support ticket submitted successfully', ticketNumber: ticketNum }); } catch (err) { return sendJson(res, 500, { error: err.message }); } }

  if (pathname === '/api/orders/track' && req.method === 'GET') {
    const orderNum = parsedUrl.searchParams.get('order_number'); if (!orderNum) return sendJson(res, 400, { error: 'Order number is required' });
    const db = getDb(); const numId = parseInt(orderNum, 10); const order = !isNaN(numId) ? await db.collection('orders').findOne({ $or: [{ order_number: orderNum }, { id: numId }] }) : await db.collection('orders').findOne({ order_number: orderNum });
    if (!order) return sendJson(res, 404, { error: 'Order not found' });
    let items = order.items || []; if (!items.length) items = await db.collection('order_items').find({ order_id: order.id }).toArray();
    return sendJson(res, 200, { order: { ...order, items, shipping_address: typeof order.shipping_address_json === 'string' ? JSON.parse(order.shipping_address_json || '{}') : (order.shipping_address_json || {}) } });
  }

  // STATIC FILES
  if (req.method === 'GET' || req.method === 'HEAD') {
    if (req.method === 'HEAD') { res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' }); return res.end(); }
    let targetFile = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
    if (pathname === '/account' || pathname === '/account/' || pathname.startsWith('/account/')) { if (!currentUser) { res.writeHead(302, { Location: '/login?redirect=/account&msg=unauthorized' }); return res.end(); } targetFile = 'account.html'; }
    else if (pathname === '/owner' || pathname === '/owner/' || pathname.startsWith('/owner/') || pathname === '/admin' || pathname === '/admin/' || pathname === '/pos' || pathname === '/portal') { if (!currentUser) { res.writeHead(302, { Location: '/login?redirect=/owner&msg=login_required' }); return res.end(); } if (!['OWNER', 'ADMIN', 'STAFF'].includes(currentUser.role)) { res.writeHead(302, { Location: '/login?redirect=/owner&msg=staff_required' }); return res.end(); } targetFile = 'owner.html'; }
    else if (pathname === '/login' || pathname === '/login/') targetFile = 'login.html';
    else if (pathname === '/register' || pathname === '/register/') targetFile = 'login.html';
    else if (pathname === '/track-order' || pathname === '/track-order/') targetFile = 'track-order.html';
    else if (pathname === '/products' || pathname === '/products/' || pathname === '/shop' || pathname === '/categories' || pathname === '/bike-parts' || pathname === '/accessories' || pathname === '/offers') targetFile = 'products.html';
    let filePath = path.join(__dirname, targetFile);
    console.log(`[STATIC] ${req.url} -> ${filePath}`);
    fs.stat(filePath, (err, stats) => {
      if (!err && stats.isFile()) { const ext = path.extname(filePath).toLowerCase(); const contentType = MIME_TYPES[ext] || 'application/octet-stream'; const headers = { 'Content-Type': contentType }; if (ext === '.html') { headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'; headers['Pragma'] = 'no-cache'; } res.writeHead(200, headers); fs.createReadStream(filePath).pipe(res); }
      else { const ext = path.extname(pathname).toLowerCase(); if (ext && ext !== '.html') { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end(`404 Not Found: ${pathname}`); } const spaIndex = path.join(__dirname, 'index.html'); fs.readFile(spaIndex, (err2, content) => { if (err2) { res.writeHead(500); return res.end('Error loading Moto Pitshop index file.'); } res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' }); res.end(content); }); }
    });
  }
}

process.on('unhandledRejection', (reason) => { console.error('[SERVER] Unhandled Promise Rejection:', reason); });
process.on('uncaughtException', (err) => { console.error('[SERVER] Uncaught Exception:', err.message); });
