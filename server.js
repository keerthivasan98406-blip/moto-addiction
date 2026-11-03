// server.js - Moto Pitshop Full-Stack Production HTTP & API Server (MongoDB)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const {
  initDatabase, hashPassword,
  User, Category, Brand, Supplier, Product, Order, OrderItem,
  Invoice, InventoryTransaction, Purchase, PurchaseItem,
  Expense, CreditNote, Customer, Review, AuditLog,
  StoreSetting, Session, SupportTicket, Bike, BikeCompatibility
} = require('./database.js');

const { handleOwnerApi } = require('./owner-api.js');

const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'motopitshop_prod_secret_key_2026';

// In-memory session cache
const sessions = new Map();

async function generateSessionToken(user) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const expiresAt = now + (30 * 24 * 60 * 60 * 1000);
  const userPayload = {
    id: user._id.toString(),
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    staff_role: user.staff_role || user.role,
    status: user.status,
    permissions: typeof user.permissions_json === 'string' ? JSON.parse(user.permissions_json || '{}') : (user.permissions_json || {})
  };
  sessions.set(token, { user: userPayload, created: now, expiresAt });
  try {
    await Session.findOneAndUpdate(
      { token },
      { token, user_id: user._id, created_at: now, expires_at: expiresAt },
      { upsert: true }
    );
  } catch (err) { console.error('Session save error:', err.message); }
  return token;
}

async function getSessionUser(req) {
  const authHeader = req.headers['authorization'];
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.headers.cookie) {
    const cookies = req.headers.cookie.split(';').reduce((acc, c) => {
      const [k, v] = c.trim().split('='); acc[k] = v; return acc;
    }, {});
    token = cookies['motopitshop_session'];
  }
  if (!token) return null;
  if (sessions.has(token)) {
    const sess = sessions.get(token);
    if (sess.expiresAt > Date.now()) return sess.user;
    sessions.delete(token);
  }
  try {
    const now = Date.now();
    const sess = await Session.findOne({ token, expires_at: { $gt: now } });
    if (sess) {
      const user = await User.findById(sess.user_id);
      if (user && user.status === 'ACTIVE') {
        const payload = {
          id: user._id.toString(),
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          staff_role: user.staff_role || user.role,
          status: user.status,
          permissions: typeof user.permissions_json === 'string' ? JSON.parse(user.permissions_json || '{}') : {}
        };
        sessions.set(token, { user: payload, created: now, expiresAt: now + (30 * 24 * 60 * 60 * 1000) });
        return payload;
      }
    }
  } catch (err) { console.error('Session lookup error:', err.message); }
  return null;
}

function logAudit(userId, userName, userRole, action, entity, entityId, result = 'SUCCESS', details = {}) {
  AuditLog.create({
    user_id: userId || null,
    user_name: userName || 'Guest',
    user_role: userRole || 'GUEST',
    action, entity,
    entity_id: String(entityId || ''),
    result,
    details_json: JSON.stringify(details)
  }).catch(err => console.error('Audit log error:', err.message));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); } catch (err) { reject(err); }
    });
  });
}

function sendJson(res, statusCode, data, headers = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
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

// Start server after DB connects
initDatabase().then(() => {
  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      });
      return res.end();
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;
    const currentUser = await getSessionUser(req);

    // ==========================================
    // API ENDPOINTS
    // ==========================================

    // Owner Portal & ERP Router
    if (pathname.startsWith('/api/owner/') || pathname.startsWith('/api/pos/')) {
      const handled = await handleOwnerApi(req, res, pathname, parsedUrl, currentUser, parseJsonBody, sendJson, logAudit);
      if (handled !== false) return;
    }

    // --- AUTH ---
    if (pathname === '/api/auth/register' && req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const { email, password, full_name, phone } = body;
        if (!email || !password || !full_name) return sendJson(res, 400, { error: 'Email, password, and full name are required' });
        const existing = await User.findOne({ email: email.toLowerCase().trim() });
        if (existing) return sendJson(res, 400, { error: 'An account with this email already exists' });
        const user = await User.create({ email: email.toLowerCase().trim(), password_hash: hashPassword(password), full_name: full_name.trim(), phone: phone || '', role: 'CUSTOMER', status: 'ACTIVE', permissions_json: '{}' });
        const token = await generateSessionToken(user);
        logAudit(user._id, user.full_name, user.role, 'CUSTOMER_REGISTER', 'USER', user._id, 'SUCCESS');
        return sendJson(res, 201, { message: 'Account registered successfully', token, user: { id: user._id, email: user.email, full_name: user.full_name, phone: user.phone, role: user.role, status: user.status } }, { 'Set-Cookie': `motopitshop_session=${token}; Path=/; HttpOnly; SameSite=Lax` });
      } catch (err) { return sendJson(res, 500, { error: err.message }); }
    }

    if (pathname === '/api/auth/login' && req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const { email, password } = body;
        if (!email || !password) return sendJson(res, 400, { error: 'Email and password are required' });
        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) { logAudit(null, email, 'GUEST', 'LOGIN_FAILED', 'USER', null, 'FAILURE', { reason: 'User not found' }); return sendJson(res, 401, { error: 'Invalid email or password' }); }
        if (user.status !== 'ACTIVE') { logAudit(user._id, user.full_name, user.role, 'LOGIN_BLOCKED', 'USER', user._id, 'FAILURE', { status: user.status }); return sendJson(res, 403, { error: `Account is currently ${user.status.toLowerCase()}. Please contact support.` }); }
        if (hashPassword(password) !== user.password_hash) { logAudit(user._id, user.full_name, user.role, 'LOGIN_FAILED', 'USER', user._id, 'FAILURE', { reason: 'Invalid password' }); return sendJson(res, 401, { error: 'Invalid email or password' }); }
        user.last_login_at = new Date();
        await user.save();
        const token = await generateSessionToken(user);
        logAudit(user._id, user.full_name, user.role, 'LOGIN_SUCCESS', 'USER', user._id, 'SUCCESS');
        let redirectUrl = ['OWNER','ADMIN','STAFF'].includes(user.role) ? '/owner' : '/account';
        return sendJson(res, 200, { message: 'Login successful', token, redirectUrl, user: { id: user._id, email: user.email, full_name: user.full_name, phone: user.phone, role: user.role, staff_role: user.staff_role || user.role, status: user.status, permissions: typeof user.permissions_json === 'string' ? JSON.parse(user.permissions_json || '{}') : {} } }, { 'Set-Cookie': `motopitshop_session=${token}; Path=/; HttpOnly; SameSite=Lax` });
      } catch (err) { return sendJson(res, 500, { error: err.message }); }
    }

    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      if (currentUser) logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'LOGOUT', 'USER', currentUser.id, 'SUCCESS');
      const authHeader = req.headers['authorization'];
      let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
      if (!token && req.headers.cookie) {
        const cookies = req.headers.cookie.split(';').reduce((acc, c) => { const [k,v] = c.trim().split('='); acc[k]=v; return acc; }, {});
        token = cookies['motopitshop_session'];
      }
      if (token) { sessions.delete(token); Session.deleteOne({ token }).catch(() => {}); }
      return sendJson(res, 200, { message: 'Logged out successfully' }, { 'Set-Cookie': 'motopitshop_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT' });
    }

    if (pathname === '/api/auth/me' && req.method === 'GET') {
      if (!currentUser) return sendJson(res, 200, { authenticated: false, user: null });
      const freshUser = await User.findById(currentUser.id).select('-password_hash');
      if (!freshUser) return sendJson(res, 200, { authenticated: false, user: null });
      return sendJson(res, 200, { authenticated: true, user: { ...freshUser.toObject(), id: freshUser._id, staff_role: freshUser.staff_role || freshUser.role, permissions: typeof freshUser.permissions_json === 'string' ? JSON.parse(freshUser.permissions_json || '{}') : {} } });
    }

    // --- PRODUCTS ---
    if (pathname === '/api/products' && req.method === 'GET') {
      try {
        const { category, brand, search, bikeBrand, bikeModel } = Object.fromEntries(parsedUrl.searchParams);
        const query = { status: 'ACTIVE', is_archived: false };
        if (search) query.$or = [{ name: new RegExp(search, 'i') }, { sku: new RegExp(search, 'i') }, { product_code: new RegExp(search, 'i') }];
        const products = await Product.find(query).populate('category_id', 'name slug').populate('brand_id', 'name slug').sort({ _id: -1 }).lean();
        return sendJson(res, 200, { products: products.map(p => ({ ...p, category_name: p.category_id?.name, brand_name: p.brand_id?.name })) });
      } catch (err) { return sendJson(res, 500, { error: err.message }); }
    }

    if (pathname.match(/^\/api\/products\/[^\/]+$/) && req.method === 'GET') {
      try {
        const id = pathname.split('/')[3];
        const product = await Product.findOne({ $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { slug: id }] })
          .populate('category_id', 'name').populate('brand_id', 'name').populate('supplier_id', 'name').lean();
        if (!product) return sendJson(res, 404, { error: 'Product not found' });
        const reviews = await Review.find({ product_id: product._id, is_approved: true }).sort({ _id: -1 }).lean();
        return sendJson(res, 200, { product: { ...product, category_name: product.category_id?.name, brand_name: product.brand_id?.name }, reviews });
      } catch (err) { return sendJson(res, 500, { error: err.message }); }
    }

    // --- CATEGORIES ---
    if (pathname === '/api/categories' && req.method === 'GET') {
      const categories = await Category.find().sort({ display_order: 1 }).lean();
      return sendJson(res, 200, { categories });
    }

    // --- BRANDS ---
    if (pathname === '/api/brands' && req.method === 'GET') {
      const brands = await Brand.find().sort({ name: 1 }).lean();
      return sendJson(res, 200, { brands });
    }

    // --- BIKES ---
    if (pathname === '/api/bikes' && req.method === 'GET') {
      const bikes = await Bike.find().sort({ brand: 1, model: 1 }).lean();
      return sendJson(res, 200, { bikes });
    }

    // --- SUPPLIERS (public) ---
    if (pathname === '/api/suppliers' && req.method === 'GET') {
      const suppliers = await Supplier.find().sort({ _id: -1 }).lean();
      return sendJson(res, 200, { suppliers });
    }

    // --- ORDERS ---
    if (pathname === '/api/orders' && req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const { customer, items, payment } = body;
        if (!customer || !items || !items.length) return sendJson(res, 400, { error: 'Customer information and cart items are required' });
        let subtotal = 0, taxTotal = 0, cgstTotal = 0, sgstTotal = 0;
        const preparedItems = [];
        for (const item of items) {
          const prod = await Product.findById(item.id || item.product_id);
          const itemPrice = prod ? prod.price : (item.price || 0);
          const itemQty = item.quantity || 1;
          const itemSubtotal = itemPrice * itemQty;
          const gstRate = prod ? prod.gst_rate : 18.0;
          const taxVal = Math.round(itemSubtotal * (gstRate / (100 + gstRate)));
          subtotal += itemSubtotal - taxVal;
          taxTotal += taxVal;
          cgstTotal += Math.round(taxVal / 2);
          sgstTotal += Math.round(taxVal / 2);
          preparedItems.push({ product_id: prod?._id, product_name: prod?.name || item.name, product_sku: prod?.sku || 'MPS-GEN', price: itemPrice, quantity: itemQty, hsn: prod?.hsn || '8714', gst_rate: gstRate, tax_amount: taxVal, total: itemSubtotal });
        }
        const grandTotal = subtotal + taxTotal;
        const orderNumber = `MPS-ORD-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;
        const userId = currentUser ? currentUser.id : null;
        const payStatus = (payment && payment.status) ? payment.status : (customer.payment === 'COD' ? 'PENDING' : 'SUCCESS');
        const payRef = (payment && payment.transactionRef) ? payment.transactionRef : `REF-${Date.now()}`;
        const order = await Order.create({ order_number: orderNumber, user_id: userId, customer_name: customer.name, customer_email: customer.email, customer_phone: customer.phone, shipping_address_json: JSON.stringify(customer.address || {}), status: payStatus === 'SUCCESS' ? 'CONFIRMED' : 'PLACED', payment_status: payStatus, payment_method: customer.payment || 'UPI', payment_ref: payRef, subtotal, tax_total: taxTotal, cgst_total: cgstTotal, sgst_total: sgstTotal, grand_total: grandTotal });
        for (const item of preparedItems) {
          await OrderItem.create({ order_id: order._id, ...item });
          if (item.product_id) {
            const prod = await Product.findById(item.product_id);
            if (prod) {
              const prevStock = prod.stock;
              prod.stock = Math.max(0, prevStock - item.quantity);
              await prod.save();
              await InventoryTransaction.create({ product_id: prod._id, transaction_type: 'SALE', quantity_change: -item.quantity, previous_stock: prevStock, new_stock: prod.stock, notes: `Order #${orderNumber}`, user_id: userId });
            }
          }
        }
        const invoiceNum = `INV-${Date.now().toString().slice(-6)}`;
        await Invoice.create({ invoice_number: invoiceNum, order_id: order._id, user_id: userId, customer_name: customer.name, taxable_value: subtotal, cgst: cgstTotal, sgst: sgstTotal, total_tax: taxTotal, grand_total: grandTotal });
        logAudit(userId, customer.name, currentUser?.role || 'CUSTOMER', 'CREATE_ORDER', 'ORDER', order._id, 'SUCCESS', { orderNumber, grandTotal });
        return sendJson(res, 201, { message: 'Order placed successfully', orderId: order._id, orderNumber, invoiceNumber: invoiceNum, grandTotal });
      } catch (err) { return sendJson(res, 500, { error: err.message }); }
    }

    if (pathname === '/api/orders' && req.method === 'GET') {
      if (!currentUser) return sendJson(res, 401, { error: 'Unauthorized' });
      try {
        let filter = {};
        if (!['OWNER','ADMIN','STAFF'].includes(currentUser.role)) filter = { $or: [{ user_id: currentUser.id }, { customer_email: currentUser.email }] };
        const orders = await Order.find(filter).sort({ _id: -1 }).lean();
        const result = await Promise.all(orders.map(async o => {
          const items = await OrderItem.find({ order_id: o._id }).lean();
          return { ...o, id: o._id, items, shipping_address: typeof o.shipping_address_json === 'string' ? JSON.parse(o.shipping_address_json || '{}') : {} };
        }));
        return sendJson(res, 200, { orders: result });
      } catch (err) { return sendJson(res, 500, { error: err.message }); }
    }

    if (pathname.match(/^\/api\/orders\/[^\/]+$/) && req.method === 'PUT') {
      if (!currentUser || !['OWNER','ADMIN','STAFF'].includes(currentUser.role)) return sendJson(res, 403, { error: 'Unauthorized' });
      try {
        const id = pathname.split('/')[3];
        const body = await parseJsonBody(req);
        const { status, payment_status } = body;
        const update = {};
        if (status) update.status = status;
        if (payment_status) update.payment_status = payment_status;
        await Order.findByIdAndUpdate(id, update);
        logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'UPDATE_ORDER_STATUS', 'ORDER', id, 'SUCCESS', { status, payment_status });
        return sendJson(res, 200, { message: 'Order status updated successfully' });
      } catch (err) { return sendJson(res, 500, { error: err.message }); }
    }

    // --- SETTINGS ---
    if (pathname === '/api/admin/settings' && req.method === 'GET') {
      const rows = await StoreSetting.find().lean();
      const settings = {};
      rows.forEach(r => settings[r.key] = r.value);
      return sendJson(res, 200, { settings });
    }

    if (pathname === '/api/admin/settings' && req.method === 'POST') {
      if (!currentUser || !['OWNER','ADMIN'].includes(currentUser.role)) return sendJson(res, 403, { error: 'Unauthorized' });
      try {
        const body = await parseJsonBody(req);
        for (const key of Object.keys(body)) {
          await StoreSetting.findOneAndUpdate({ key }, { key, value: String(body[key]) }, { upsert: true });
        }
        logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'UPDATE_SETTINGS', 'STORE', null, 'SUCCESS');
        return sendJson(res, 200, { message: 'Settings saved successfully' });
      } catch (err) { return sendJson(res, 500, { error: err.message }); }
    }

    // --- SUPPORT TICKETS ---
    if (pathname === '/api/support/tickets' && req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const { customer_name, customer_email, order_number, issue_type, subject, message } = body;
        const ticketNum = `TKT-${Date.now().toString().slice(-6)}`;
        await SupportTicket.create({ ticket_number: ticketNum, user_id: currentUser?.id, customer_name, customer_email, order_number: order_number || '', issue_type: issue_type || 'General', subject: subject || 'Support Request', message: message || '' });
        return sendJson(res, 201, { message: 'Support ticket submitted successfully', ticketNumber: ticketNum });
      } catch (err) { return sendJson(res, 500, { error: err.message }); }
    }

    // --- ORDER TRACKING ---
    if (pathname === '/api/orders/track' && req.method === 'GET') {
      const orderNum = parsedUrl.searchParams.get('order_number');
      if (!orderNum) return sendJson(res, 400, { error: 'Order number is required' });
      try {
        const order = await Order.findOne({ order_number: orderNum }).lean();
        if (!order) return sendJson(res, 404, { error: 'Order not found' });
        const items = await OrderItem.find({ order_id: order._id }).lean();
        return sendJson(res, 200, { order: { ...order, id: order._id, items, shipping_address: typeof order.shipping_address_json === 'string' ? JSON.parse(order.shipping_address_json || '{}') : {} } });
      } catch (err) { return sendJson(res, 500, { error: err.message }); }
    }

    // ==========================================
    // STATIC FILE SERVING
    // ==========================================
    if (req.method === 'GET') {
      let targetFile = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');

      if (pathname === '/account' || pathname === '/account/') {
        if (!currentUser) { res.writeHead(302, { Location: '/login?redirect=/account&msg=unauthorized' }); return res.end(); }
        targetFile = 'account.html';
      } else if (pathname === '/owner' || pathname === '/owner/' || pathname.startsWith('/owner/')) {
        if (!currentUser || !['OWNER','ADMIN','STAFF'].includes(currentUser.role)) { res.writeHead(302, { Location: '/login?redirect=/owner&msg=login_required' }); return res.end(); }
        targetFile = 'owner.html';
      } else if (pathname === '/login' || pathname === '/login/') {
        targetFile = 'login.html';
      } else if (pathname === '/track-order' || pathname === '/track-order/') {
        targetFile = 'track-order.html';
      } else if (pathname === '/products' || pathname === '/products/' || pathname === '/shop') {
        targetFile = 'products.html';
      }

      const filePath = path.join(__dirname, targetFile);
      fs.stat(filePath, (err, stats) => {
        if (!err && stats.isFile()) {
          const ext = path.extname(filePath).toLowerCase();
          const contentType = MIME_TYPES[ext] || 'application/octet-stream';
          const headers = { 'Content-Type': contentType };
          if (ext === '.html') { headers['Cache-Control'] = 'no-store, no-cache'; headers['Pragma'] = 'no-cache'; }
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
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(` MOTO PITSHOP SERVER RUNNING AT: http://localhost:${PORT}`);
    console.log(`====================================================`);
  });
}).catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
