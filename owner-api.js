// owner-api.js - Complete Business Logic and API Endpoints for Moto Pitshop Owner Portal (MongoDB Only)
const crypto = require('crypto');
const { hashPassword, getNextId, getDb } = require('./database.js');
const { deleteFromMongo } = require('./mongodb.js');

async function getStoreSettings() {
  try { const db = getDb(); if (!db) return {}; const rows = await db.collection('store_settings').find({}).toArray(); const settings = {}; rows.forEach(r => settings[r.key] = r.value); return settings; }
  catch (err) { return {}; }
}

function parseDateRange(range, start, end) {
  const now = new Date(); let startDate = '', endDate = '';
  if (range === 'today') { startDate = now.toISOString().slice(0, 10); endDate = startDate; }
  else if (range === 'yesterday') { const y = new Date(now); y.setDate(y.getDate() - 1); startDate = y.toISOString().slice(0, 10); endDate = startDate; }
  else if (range === 'week') { const w = new Date(now); w.setDate(w.getDate() - 7); startDate = w.toISOString().slice(0, 10); endDate = now.toISOString().slice(0, 10); }
  else if (range === 'month' || !range) { startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10); endDate = now.toISOString().slice(0, 10); }
  else if (range === 'last_month') { startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10); endDate = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10); }
  else if (range === 'year') { startDate = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10); endDate = now.toISOString().slice(0, 10); }
  else if (range === 'custom' && start && end) { startDate = start; endDate = end; }
  else { startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10); endDate = now.toISOString().slice(0, 10); }
  return { startDate, endDate };
}

async function handleOwnerApi(req, res, pathname, parsedUrl, currentUser, parseJsonBody, sendJson, logAudit) {
  const isOwnerStaff = currentUser && (currentUser.role === 'OWNER' || currentUser.role === 'ADMIN' || currentUser.role === 'STAFF');
  const canAccessPos = isOwnerStaff;
  const canAccessReports = currentUser && (currentUser.role === 'OWNER' || currentUser.role === 'ADMIN');
  const db = getDb();
  if (!db) return sendJson(res, 503, { error: 'Database not connected. Please try again in a moment.' });

  if (pathname === '/api/owner/mongodb/status' && req.method === 'GET') {
    let counts = {}; try { counts = { products: await db.collection('products').countDocuments(), orders: await db.collection('orders').countDocuments(), purchases: await db.collection('purchases').countDocuments(), invoices: await db.collection('invoices').countDocuments(), customers: await db.collection('customers').countDocuments(), suppliers: await db.collection('suppliers').countDocuments(), expenses: await db.collection('expenses').countDocuments() }; } catch (e) {}
    return sendJson(res, 200, { connected: true, dbName: db.databaseName, counts });
  }
  if (pathname === '/api/owner/mongodb/sync' && req.method === 'POST') { if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' }); return sendJson(res, 200, { message: 'MongoDB is the only database. No sync needed.', counts: {} }); }
  if (pathname === '/api/owner/mongodb/reconnect' && req.method === 'POST') { if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' }); return sendJson(res, 200, { connected: true, dbName: db.databaseName }); }

  // DASHBOARD
  if (pathname === '/api/owner/dashboard' && req.method === 'GET') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized: Staff/Owner access required' });
    try {
      const todayStr = new Date().toISOString().slice(0, 10); const monthStartStr = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
      const todayStart = new Date(todayStr + 'T00:00:00.000Z'); const todayEnd = new Date(todayStr + 'T23:59:59.999Z'); const monthStart = new Date(monthStartStr + 'T00:00:00.000Z');
      const todayOrders = await db.collection('orders').find({ created_at: { $gte: todayStart.toISOString(), $lte: todayEnd.toISOString() }, status: { $ne: 'CANCELLED' } }).toArray();
      const monthOrders = await db.collection('orders').find({ created_at: { $gte: monthStart.toISOString() }, status: { $ne: 'CANCELLED' } }).toArray();
      const dailyTrend = [];
      for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const dStr = d.toISOString().slice(0, 10); const dStart = new Date(dStr + 'T00:00:00.000Z'); const dEnd = new Date(dStr + 'T23:59:59.999Z'); const dayOrders = await db.collection('orders').find({ created_at: { $gte: dStart.toISOString(), $lte: dEnd.toISOString() }, status: { $ne: 'CANCELLED' } }).toArray(); dailyTrend.push({ date: dStr, label: d.toLocaleDateString('en-IN', { weekday: 'short' }), total: dayOrders.reduce((s, o) => s + (o.grand_total || 0), 0), count: dayOrders.length }); }
      const recentOnlineOrders = await db.collection('orders').find({ $or: [{ order_type: 'ONLINE' }, { order_type: null }, { order_type: { $exists: false } }] }).sort({ id: -1 }).limit(5).toArray();
      const recentPosBills = await db.collection('orders').find({ order_type: 'POS' }).sort({ id: -1 }).limit(5).toArray();
      const lowStockProducts = await db.collection('products').find({ $expr: { $lte: ['$stock', '$min_stock'] }, is_archived: { $ne: 1 } }).sort({ stock: 1 }).limit(8).toArray();
      const recentInvoices = await db.collection('invoices').find({}).sort({ id: -1 }).limit(5).toArray();
      const pendingPurchases = await db.collection('purchases').find({ outstanding_balance: { $gt: 0 } }).sort({ id: -1 }).limit(5).toArray();
      return sendJson(res, 200, {
        summary: { todaySales: todayOrders.reduce((s, o) => s + (o.grand_total || 0), 0), todayOrdersCount: todayOrders.length, monthlySales: monthOrders.reduce((s, o) => s + (o.grand_total || 0), 0), monthlyOrdersCount: monthOrders.length, prevMonthSales: 0, totalOrders: await db.collection('orders').countDocuments(), pendingOrders: await db.collection('orders').countDocuments({ status: { $in: ['PLACED', 'CONFIRMED', 'PROCESSING', 'PACKED'] } }), totalProducts: await db.collection('products').countDocuments({ is_archived: { $ne: 1 } }), lowStockCount: await db.collection('products').countDocuments({ $expr: { $lte: ['$stock', '$min_stock'] }, is_archived: { $ne: 1 } }), todayPurchases: 0, outstandingSupplierPayments: 0, monthlyExpenses: 0, estimatedGrossProfit: monthOrders.reduce((s, o) => s + (o.grand_total || 0), 0) },
        dailyTrend, recentOnlineOrders, recentPosBills, lowStockProducts, topProducts: [], categorySales: [], pendingPurchases, recentInvoices
      });
    } catch (err) { console.error('Owner Dashboard API Error:', err); return sendJson(res, 500, { error: err.message }); }
  }

  // POS COMPLETE SALE
  if (pathname === '/api/pos/complete-sale' && req.method === 'POST') {
    if (!canAccessPos) return sendJson(res, 403, { error: 'Unauthorized: Cashier or Manager access required for POS sales' });
    try {
      const body = await parseJsonBody(req); const { customer, items, payment, notes, place_of_supply, is_interstate } = body;
      if (!items || !Array.isArray(items) || items.length === 0) return sendJson(res, 400, { error: 'Cart must contain at least one product' });
      const validatedItems = []; let calculatedSubtotal = 0, calculatedTaxTotal = 0, calculatedCgst = 0, calculatedSgst = 0, calculatedIgst = 0, calculatedDiscountTotal = 0;
      const settings = await getStoreSettings(); const taxInclusive = settings.TAX_INCLUSIVE !== 'false';
      for (const item of items) {
        const rawId = item.product_id || item.id;
        const numId = parseInt(rawId, 10);
        const qty = Math.max(1, parseInt(item.quantity || 1, 10));
        let prod = null;
        if (!isNaN(numId)) {
          prod = await db.collection('products').findOne({ id: numId });
        }
        if (!prod && rawId) {
          prod = await db.collection('products').findOne({
            $or: [
              { id: rawId },
              { id: String(rawId) },
              { sku: rawId },
              { barcode: rawId }
            ]
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
        if (!prod && item.sku) {
          prod = await db.collection('products').findOne({ sku: item.sku });
        }
        if (!prod && item.name) {
          prod = await db.collection('products').findOne({ name: item.name });
        }
        if (!prod) return sendJson(res, 404, { error: `Product ID #${rawId || 'unknown'} not found in catalog` });
        if ((prod.stock || 0) < qty) return sendJson(res, 400, { error: `Insufficient stock for "${prod.name}". Available: ${prod.stock}, Requested: ${qty}` });
        const unitPrice = parseFloat(item.price || prod.price); const discountPct = parseFloat(item.discount_pct || 0);
        const lineGross = unitPrice * qty; const lineDiscount = Math.round(lineGross * (discountPct / 100)); const lineDiscounted = lineGross - lineDiscount;
        const gstRate = parseFloat(item.gst_rate || prod.gst_rate || 18.0);
        let lineTaxable = lineDiscounted, lineTax = 0;
        if (taxInclusive) { lineTaxable = Math.round(lineDiscounted / (1 + (gstRate / 100))); lineTax = lineDiscounted - lineTaxable; }
        else { lineTax = Math.round(lineDiscounted * (gstRate / 100)); }
        let lineCgst = 0, lineSgst = 0, lineIgst = 0;
        if (is_interstate) { lineIgst = lineTax; } else { lineCgst = Math.round(lineTax / 2); lineSgst = lineTax - lineCgst; }
        calculatedSubtotal += lineTaxable; calculatedTaxTotal += lineTax; calculatedCgst += lineCgst; calculatedSgst += lineSgst; calculatedIgst += lineIgst; calculatedDiscountTotal += lineDiscount;
        validatedItems.push({ product_id: prod.id !== undefined ? prod.id : (prod._id ? prod._id.toString() : numId), mongo_id: prod._id, sku: prod.sku, barcode: prod.barcode, name: prod.name, price: unitPrice, quantity: qty, discount_pct: discountPct, discount_val: lineDiscount, taxable: lineTaxable, gst_rate: gstRate, hsn: prod.hsn || '8714', tax_amount: lineTax, cgst: lineCgst, sgst: lineSgst, igst: lineIgst, total: taxInclusive ? lineDiscounted : (lineTaxable + lineTax), current_stock: prod.stock });
      }
      const orderDiscount = parseFloat(body.discount || body.discount_amount || 0); if (!isNaN(orderDiscount) && orderDiscount > 0) calculatedDiscountTotal += orderDiscount;
      const grandTotal = Math.max(0, (calculatedSubtotal + calculatedTaxTotal) - (!isNaN(orderDiscount) && orderDiscount > 0 ? orderDiscount : 0));
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
      const orderId = await getNextId('orders'); const now = new Date().toISOString();
      await db.collection('orders').insertOne({ id: orderId, order_number: orderNumber, user_id: currentUser ? currentUser.id : 1, customer_name: custName, customer_email: custEmail, customer_phone: custPhone, shipping_address_json: JSON.stringify({ address: custAddress, gstin: custGstin }), status: 'DELIVERED', payment_status: 'SUCCESS', payment_method: payMethod, payment_ref: payRef, subtotal: calculatedSubtotal, tax_total: calculatedTaxTotal, cgst_total: calculatedCgst, sgst_total: calculatedSgst, igst_total: calculatedIgst, discount_total: calculatedDiscountTotal, grand_total: grandTotal, order_type: 'POS', pos_cashier_id: currentUser ? currentUser.id : null, notes: notes || 'Counter Sale Completed', created_at: now, updated_at: now, items: validatedItems });
      for (const vi of validatedItems) {
        const itemId = await getNextId('order_items');
        await db.collection('order_items').insertOne({ id: itemId, order_id: orderId, product_id: vi.product_id, product_name: vi.name, product_sku: vi.sku, price: vi.price, quantity: vi.quantity, hsn: vi.hsn, gst_rate: vi.gst_rate, tax_amount: vi.tax_amount, total: vi.total, created_at: now });
        if (vi.mongo_id) {
          await db.collection('products').updateOne({ _id: vi.mongo_id }, { $inc: { stock: -vi.quantity }, $set: { updated_at: now } });
        } else {
          await db.collection('products').updateOne({ id: vi.product_id }, { $inc: { stock: -vi.quantity }, $set: { updated_at: now } });
        }
        const txnId = await getNextId('inventory_transactions');
        await db.collection('inventory_transactions').insertOne({ id: txnId, product_id: vi.product_id, transaction_type: 'SALE', quantity_change: -vi.quantity, previous_stock: vi.current_stock, new_stock: vi.current_stock - vi.quantity, notes: `POS Bill #${billNumber}`, user_id: currentUser ? currentUser.id : 1, created_at: now });
      }
      const invoiceId = await getNextId('invoices');
      await db.collection('invoices').insertOne({ id: invoiceId, invoice_number: billNumber, order_id: orderId, order_number: billNumber, user_id: currentUser ? currentUser.id : 1, customer_name: custName, customer_phone: custPhone, customer_gstin: custGstin, store_name: settings.STORE_NAME || 'MOTO PITSHOP', store_address: settings.STORE_ADDRESS || '124 Racing Track Boulevard, Motor City, Chennai, TN 600001', store_gstin: settings.STORE_GSTIN || '33AABCM1234F1Z9', taxable_value: calculatedSubtotal, cgst: calculatedCgst, sgst: calculatedSgst, igst: calculatedIgst, total_tax: calculatedTaxTotal, grand_total: grandTotal, invoice_type: 'POS', place_of_supply: place_of_supply || 'Tamil Nadu (33)', state_code: settings.STORE_STATE_CODE || '33', payment_method: payMethod, payment_status: 'PAID', notes: notes || 'Paid at counter', created_at: now });
      if (custPhone) {
        const existingCust = await db.collection('customers').findOne({ phone: custPhone });
        if (existingCust) { await db.collection('customers').updateOne({ id: existingCust.id }, { $inc: { total_spend: grandTotal, total_orders: 1 }, $set: { updated_at: now } }); }
        else { const custCode = `MPS-CUST-${Date.now().toString().slice(-4)}`; const custId = await getNextId('customers'); await db.collection('customers').insertOne({ id: custId, customer_code: custCode, name: custName, phone: custPhone, email: custEmail, billing_address: custAddress, gstin: custGstin, customer_type: 'RETAIL', total_spend: grandTotal, total_orders: 1, created_at: now, updated_at: now }); }
      }
      await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'POS_SALE', 'ORDER', orderId, 'SUCCESS', { billNumber, grandTotal, itemsCount: validatedItems.length, paymentMethod: payMethod });
      return sendJson(res, 201, { success: true, message: 'POS bill created successfully', billNumber, orderId, order_id: orderId, invoiceId, invoice_id: invoiceId, orderNumber, grandTotal, subtotal: calculatedSubtotal, discount: orderDiscount || 0, discountTotal: calculatedDiscountTotal, discount_total: calculatedDiscountTotal, taxTotal: calculatedTaxTotal, cgst: calculatedCgst, sgst: calculatedSgst, igst: calculatedIgst, items: validatedItems, customer: { name: custName, phone: custPhone, gstin: custGstin, address: custAddress }, payment: { method: payMethod, reference_no: payRef }, store: { name: settings.STORE_NAME || 'MOTO PITSHOP', legalName: settings.STORE_LEGAL_NAME || 'Moto Pitshop Retail Pvt Ltd', address: settings.STORE_ADDRESS || '124 Racing Track Boulevard, Motor City, Chennai, TN 600001', phone: settings.STORE_PHONE || '+91 98765 43210', gstin: settings.STORE_GSTIN || '33AABCM1234F1Z9', state: settings.STORE_STATE || 'Tamil Nadu', stateCode: settings.STORE_STATE_CODE || '33' }, timestamp: new Date().toISOString() });
    } catch (err) { console.error('POS Sale Error:', err); return sendJson(res, 500, { error: err.message }); }
  }

  // POS BILLS
  if (pathname === '/api/pos/bills' && req.method === 'GET') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    const search = parsedUrl.searchParams.get('search'); const limit = parseInt(parsedUrl.searchParams.get('limit') || '50', 10);
    let filter = { order_type: 'POS' }; if (search) filter.$or = [{ customer_name: new RegExp(search, 'i') }, { customer_phone: new RegExp(search, 'i') }, { order_number: new RegExp(search, 'i') }];
    const bills = await db.collection('orders').find(filter).sort({ id: -1 }).limit(limit).toArray();
    return sendJson(res, 200, { bills });
  }

  if (pathname.startsWith('/api/pos/bills/') && req.method === 'GET') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    const idOrNum = pathname.split('/')[4]; const numId = parseInt(idOrNum, 10);
    const order = await db.collection('orders').findOne({ $or: [{ id: numId }, { order_number: idOrNum }] });
    if (!order) return sendJson(res, 404, { error: 'Bill record not found' });
    let items = order.items || []; if (!items.length) items = await db.collection('order_items').find({ order_id: order.id }).toArray();
    const settings = await getStoreSettings(); const invoice = await db.collection('invoices').findOne({ order_id: order.id });
    return sendJson(res, 200, { bill: { ...order, invoice_number: invoice ? invoice.invoice_number : '', store_name: invoice ? invoice.store_name : settings.STORE_NAME, store_address: invoice ? invoice.store_address : settings.STORE_ADDRESS, store_gstin: invoice ? invoice.store_gstin : settings.STORE_GSTIN, place_of_supply: invoice ? invoice.place_of_supply : 'Tamil Nadu (33)', state_code: invoice ? invoice.state_code : '33', items, store: { name: settings.STORE_NAME || 'MOTO PITSHOP', legalName: settings.STORE_LEGAL_NAME || 'Moto Pitshop Retail Pvt Ltd', address: settings.STORE_ADDRESS || '124 Racing Track Boulevard, Motor City, Chennai, TN 600001', phone: settings.STORE_PHONE || '+91 98765 43210', gstin: settings.STORE_GSTIN || '33AABCM1234F1Z9', state: settings.STORE_STATE || 'Tamil Nadu', stateCode: settings.STORE_STATE_CODE || '33' } } });
  }

  // POS RETURNS
  if (pathname === '/api/pos/returns' && req.method === 'POST') {
    if (!canAccessPos) return sendJson(res, 403, { error: 'Unauthorized: Cashier or Manager access required for returns' });
    try {
      const body = await parseJsonBody(req); const { invoice_number, items, reason, refund_method } = body;
      if (!invoice_number || !items || !items.length) return sendJson(res, 400, { error: 'Invoice number and return items are required' });
      const invoice = await db.collection('invoices').findOne({ invoice_number }); if (!invoice) return sendJson(res, 404, { error: 'Original invoice not found' });
      let returnSubtotal = 0, returnTaxTotal = 0; const now = new Date().toISOString();
      items.forEach(i => { const itemTotal = (i.price || 0) * (i.quantity || 1); const itemTax = Math.round(itemTotal * 0.18 / 1.18); returnSubtotal += (itemTotal - itemTax); returnTaxTotal += itemTax; });
      const totalRefund = returnSubtotal + returnTaxTotal; const cnNumber = `CN-${Date.now().toString().slice(-6)}`; const cnId = await getNextId('credit_notes');
      await db.collection('credit_notes').insertOne({ id: cnId, credit_note_number: cnNumber, order_id: invoice.order_id, invoice_id: invoice.id, customer_name: invoice.customer_name, customer_phone: invoice.customer_phone || '', subtotal: returnSubtotal, tax_amount: returnTaxTotal, total_amount: totalRefund, reason: reason || 'Counter return', stock_restored: 1, refund_status: 'COMPLETED', refund_method: refund_method || 'CASH', created_at: now });
      for (const item of items) {
        const cnItemId = await getNextId('credit_note_items'); const itemTotal = (item.price || 0) * (item.quantity || 1); const itemTax = Math.round(itemTotal * 0.18 / 1.18);
        await db.collection('credit_note_items').insertOne({ id: cnItemId, credit_note_id: cnId, product_id: item.product_id, product_name: item.product_name, quantity: item.quantity, price: item.price, tax_amount: itemTax, total: itemTotal, condition: item.condition || 'GOOD', created_at: now });
        if (item.product_id) { const prod = await db.collection('products').findOne({ id: item.product_id }); if (prod) { const isGood = (item.condition || 'GOOD') === 'GOOD'; if (isGood) await db.collection('products').updateOne({ id: item.product_id }, { $inc: { stock: item.quantity }, $set: { updated_at: now } }); const txnId = await getNextId('inventory_transactions'); await db.collection('inventory_transactions').insertOne({ id: txnId, product_id: item.product_id, transaction_type: isGood ? 'RETURN' : 'DAMAGE', quantity_change: isGood ? item.quantity : 0, previous_stock: prod.stock, new_stock: isGood ? prod.stock + item.quantity : prod.stock, notes: `Credit Note #${cnNumber} return`, user_id: currentUser.id, created_at: now }); } }
      }
      await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'SALES_RETURN', 'INVOICE', invoice.id, 'SUCCESS', { creditNoteNumber: cnNumber, totalRefund, itemsCount: items.length });
      return sendJson(res, 201, { success: true, message: 'Credit note created and stock updated', creditNoteNumber: cnNumber, credit_note_id: cnId, creditNoteId: cnId, totalRefund });
    } catch (err) { console.error('POS Return Error:', err); return sendJson(res, 500, { error: err.message }); }
  }

  // UPLOAD
  if (pathname === '/api/owner/upload' && req.method === 'POST') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    try { const body = await parseJsonBody(req); const { image, filename } = body; if (!image) return sendJson(res, 400, { error: 'No image data provided' }); if (image.startsWith('data:image/')) return sendJson(res, 200, { success: true, url: image, filename: filename || 'image', storage: 'inline' }); let ext = 'png'; if (filename) { const parts = filename.split('.'); if (parts.length > 1) ext = parts[parts.length - 1].toLowerCase(); if (ext === 'jpg') ext = 'jpeg'; } return sendJson(res, 200, { success: true, url: `data:image/${ext};base64,${image}`, filename: filename || 'image', storage: 'inline' }); }
    catch (err) { return sendJson(res, 500, { error: 'Failed to process image: ' + err.message }); }
  }

  // PRODUCTS
  if (pathname === '/api/owner/products' && req.method === 'GET') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    const search = parsedUrl.searchParams.get('search'); const category = parsedUrl.searchParams.get('category'); const stockStatus = parsedUrl.searchParams.get('stockStatus'); const showArchived = parsedUrl.searchParams.get('archived') === 'true';
    try { const filter = {}; if (!showArchived) filter.is_archived = { $ne: 1 }; if (search) { const regex = new RegExp(search, 'i'); filter.$or = [{ name: regex }, { sku: regex }, { barcode: regex }, { product_code: regex }, { hsn: regex }]; } if (category && category !== 'all') { const catNum = parseInt(category, 10); filter.$or = [{ category_slug: category }, { category_id: isNaN(catNum) ? category : catNum }]; } if (stockStatus === 'low') filter.stock = { $lte: 5, $gt: 0 }; else if (stockStatus === 'out') filter.stock = { $lte: 0 }; else if (stockStatus === 'in') filter.stock = { $gt: 5 };
      let products = await db.collection('products').find(filter).sort({ _id: -1 }).toArray();
      products = products.map(p => ({ ...p, id: p.id || (p._id ? p._id.toString() : undefined), images_json: p.images_json || (p.images ? JSON.stringify(p.images) : '[]'), category_name: p.category_name || '', brand_name: p.brand_name || '', supplier_name: p.supplier_name || '' }));
      return sendJson(res, 200, { products });
    } catch (e) { console.warn('[owner/products GET] MongoDB failed:', e.message); return sendJson(res, 200, { products: [] }); }
  }

  if (pathname.startsWith('/api/owner/products/scan/') && req.method === 'GET') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    const code = decodeURIComponent(pathname.split('/')[5] || '').trim(); if (!code) return sendJson(res, 400, { error: 'Scan code is required' });
    const numCode = parseInt(code, 10);
    const filter = { is_archived: { $ne: 1 }, $or: [{ barcode: code }, { sku: code }, { product_code: code }] };
    if (!isNaN(numCode)) filter.$or.push({ id: numCode });
    const product = await db.collection('products').findOne(filter);
    if (!product) return sendJson(res, 404, { error: `No active product found for barcode / SKU / ID: ${code}` });
    return sendJson(res, 200, { product, ...product });
  }

  if (pathname === '/api/owner/products' && req.method === 'POST') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    try { const body = await parseJsonBody(req); const { name, sku, barcode, brand_id, category_id, supplier_id, description, price, old_price, purchase_price, gst_rate, hsn, stock, min_stock, primary_image, images_json, variants_json, warranty, weight } = body;
      if (!name || !price) return sendJson(res, 400, { error: 'Product name and selling price are required' });
      const genSku = (sku || `MPS-${Date.now().toString().slice(-6)}`).trim(); const existingSku = await db.collection('products').findOne({ sku: genSku }); if (existingSku) return sendJson(res, 400, { error: `A product with SKU "${genSku}" already exists` });
      let genBarcode = barcode ? barcode.trim() : `890${Date.now().toString().slice(-9)}`; if (barcode) { const existingBarcode = await db.collection('products').findOne({ barcode: genBarcode }); if (existingBarcode) return sendJson(res, 400, { error: `A product with Barcode "${genBarcode}" already exists` }); }
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') + '-' + Date.now().toString().slice(-4);
      const safeBrandId = brand_id && !isNaN(parseInt(brand_id, 10)) ? parseInt(brand_id, 10) : null; const safeCatId = category_id && !isNaN(parseInt(category_id, 10)) ? parseInt(category_id, 10) : null; const safeSuppId = supplier_id && !isNaN(parseInt(supplier_id, 10)) ? parseInt(supplier_id, 10) : null;
      const safePrice = parseInt(price, 10) || 0; const safeOldPrice = old_price && !isNaN(parseInt(old_price, 10)) ? parseInt(old_price, 10) : null; const safeGstRate = parseFloat(gst_rate) || 18.0; const safeMinStock = parseInt(min_stock, 10) || 5;
      const purPrice = purchase_price && !isNaN(parseInt(purchase_price, 10)) ? parseInt(purchase_price, 10) : Math.round(safePrice * 0.70); const initialStock = stock && !isNaN(parseInt(stock, 10)) ? parseInt(stock, 10) : 0;
      const img = primary_image ? primary_image.trim() : 'hero1.png'; const safeDiscount = safeOldPrice && safeOldPrice > safePrice ? Math.round(((safeOldPrice - safePrice) / safeOldPrice) * 100) : 0;
      const productId = await getNextId('products'); const now = new Date().toISOString();
      let categoryName = '', brandName = '', categorySlug = '';
      if (safeCatId) { const catRow = await db.collection('categories').findOne({ id: safeCatId }); if (catRow) { categoryName = catRow.name; categorySlug = catRow.slug; } }
      if (safeBrandId) { const brandRow = await db.collection('brands').findOne({ id: safeBrandId }); if (brandRow) brandName = brandRow.name; }
      await db.collection('products').insertOne({ id: productId, sku: genSku, barcode: genBarcode, product_code: genSku, name: name.trim(), slug, brand_id: safeBrandId, brand_name: brandName, category_id: safeCatId, category_name: categoryName, category_slug: categorySlug, supplier_id: safeSuppId, description: description || '', price: safePrice, old_price: safeOldPrice, purchase_price: purPrice, discount: safeDiscount, gst_rate: safeGstRate, hsn: hsn || '8714', stock: initialStock, min_stock: safeMinStock, primary_image: img, images_json: typeof images_json === 'string' ? images_json : JSON.stringify(images_json || [img]), images: images_json || [img], variants_json: JSON.stringify(variants_json || []), variants: variants_json || [], warranty: warranty || '1 Year Manufacturer', weight: weight || '1.0 kg', is_archived: 0, status: 'ACTIVE', rating: 5.0, rating_count: 1, is_featured: 0, is_bestseller: 0, created_at: now, updated_at: now });
      if (initialStock > 0) { const txnId = await getNextId('inventory_transactions'); await db.collection('inventory_transactions').insertOne({ id: txnId, product_id: productId, transaction_type: 'PURCHASE', quantity_change: initialStock, previous_stock: 0, new_stock: initialStock, notes: 'Initial opening stock entry', user_id: currentUser.id, created_at: now }); }
      await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'CREATE_PRODUCT', 'PRODUCT', productId, 'SUCCESS', { name, sku: genSku, barcode: genBarcode, price });
      return sendJson(res, 201, { message: 'Product created successfully', id: productId, product_id: productId, sku: genSku, barcode: genBarcode });
    } catch (err) { console.error('Owner Add Product Error:', err); return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname.startsWith('/api/owner/products/') && req.method === 'PUT' && !pathname.endsWith('/archive')) {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    const id = parseInt(pathname.split('/')[4], 10);
    try { const body = await parseJsonBody(req); const { name, barcode, brand_id, category_id, supplier_id, description, price, old_price, purchase_price, gst_rate, hsn, stock, min_stock, primary_image, images_json, variants_json, warranty, weight } = body;
      const existing = await db.collection('products').findOne({ id }); if (!existing) return sendJson(res, 404, { error: 'Product not found' });
      const updateFields = { updated_at: new Date().toISOString() };
      if (name) updateFields.name = name; if (barcode) updateFields.barcode = barcode;
      if (brand_id !== undefined) updateFields.brand_id = brand_id && !isNaN(parseInt(brand_id, 10)) ? parseInt(brand_id, 10) : null;
      if (category_id !== undefined) updateFields.category_id = category_id && !isNaN(parseInt(category_id, 10)) ? parseInt(category_id, 10) : null;
      if (supplier_id !== undefined) updateFields.supplier_id = supplier_id && !isNaN(parseInt(supplier_id, 10)) ? parseInt(supplier_id, 10) : null;
      if (description !== undefined) updateFields.description = description; if (price) updateFields.price = parseInt(price, 10);
      updateFields.old_price = old_price && !isNaN(parseInt(old_price, 10)) ? parseInt(old_price, 10) : null;
      if (purchase_price) updateFields.purchase_price = parseInt(purchase_price, 10); if (gst_rate) updateFields.gst_rate = parseFloat(gst_rate);
      if (hsn) updateFields.hsn = hsn; if (stock !== undefined) updateFields.stock = parseInt(stock, 10); if (min_stock) updateFields.min_stock = parseInt(min_stock, 10);
      if (primary_image) updateFields.primary_image = primary_image;
      if (images_json) updateFields.images_json = typeof images_json === 'string' ? images_json : JSON.stringify(images_json);
      if (variants_json) updateFields.variants_json = typeof variants_json === 'string' ? variants_json : JSON.stringify(variants_json);
      if (warranty) updateFields.warranty = warranty; if (weight) updateFields.weight = weight;
      const safeOld = old_price && !isNaN(parseInt(old_price, 10)) ? parseInt(old_price, 10) : existing.old_price; const safePrice = price ? parseInt(price, 10) : existing.price;
      if (safeOld && safeOld > safePrice) updateFields.discount = Math.round(((safeOld - safePrice) / safeOld) * 100);
      if (barcode && barcode !== existing.barcode) { const conflict = await db.collection('products').findOne({ barcode, id: { $ne: id } }); if (conflict) return sendJson(res, 400, { error: `Barcode ${barcode} already in use by another product` }); }
      await db.collection('products').updateOne({ id }, { $set: updateFields });
      if (stock !== undefined) { const safeStock = parseInt(stock, 10); if (safeStock !== existing.stock) { const diff = safeStock - existing.stock; const txnId = await getNextId('inventory_transactions'); await db.collection('inventory_transactions').insertOne({ id: txnId, product_id: id, transaction_type: 'ADJUSTMENT', quantity_change: diff, previous_stock: existing.stock, new_stock: safeStock, notes: 'Stock updated via Product Edit', user_id: currentUser.id, created_at: new Date().toISOString() }); } }
      await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'UPDATE_PRODUCT', 'PRODUCT', id, 'SUCCESS');
      return sendJson(res, 200, { message: 'Product updated successfully' });
    } catch (err) { console.error('Owner Update Product Error:', err); return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname.startsWith('/api/owner/products/') && pathname.endsWith('/archive') && req.method === 'PUT') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    const id = parseInt(pathname.split('/')[4], 10);
    try { const body = await parseJsonBody(req); const archiveState = body.is_archived ? 1 : 0; await db.collection('products').updateOne({ id }, { $set: { is_archived: archiveState, updated_at: new Date().toISOString() } }); await logAudit(currentUser.id, currentUser.full_name, currentUser.role, archiveState ? 'ARCHIVE_PRODUCT' : 'UNARCHIVE_PRODUCT', 'PRODUCT', id, 'SUCCESS'); return sendJson(res, 200, { message: archiveState ? 'Product archived successfully' : 'Product restored from archive' }); }
    catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname.startsWith('/api/owner/products/') && req.method === 'DELETE') {
    if (!currentUser || !['OWNER', 'ADMIN'].includes(currentUser.role)) return sendJson(res, 403, { error: 'Unauthorized: Admin or Owner role required' });
    const id = parseInt(pathname.split('/')[4], 10);
    try { await db.collection('products').deleteOne({ id }); await db.collection('order_items').deleteMany({ product_id: id }); await db.collection('purchase_items').deleteMany({ product_id: id }); await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'DELETE_PRODUCT', 'PRODUCT', id, 'SUCCESS'); return sendJson(res, 200, { message: 'Product permanently deleted' }); }
    catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  // INVENTORY
  if (pathname === '/api/owner/inventory/ledger' && req.method === 'GET') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    const search = parsedUrl.searchParams.get('search'); const type = parsedUrl.searchParams.get('type'); const limit = parseInt(parsedUrl.searchParams.get('limit') || '100', 10);
    let filter = {}; if (type && type !== 'all') filter.transaction_type = type.toUpperCase(); if (search) filter.$or = [{ notes: new RegExp(search, 'i') }];
    const ledger = await db.collection('inventory_transactions').find(filter).sort({ id: -1 }).limit(limit).toArray();
    const enrichedLedger = [];
    for (const entry of ledger) { if (entry.product_id) { const prod = await db.collection('products').findOne({ id: entry.product_id }); enrichedLedger.push({ ...entry, product_name: prod ? prod.name : 'Unknown', product_sku: prod ? prod.sku : '', product_barcode: prod ? prod.barcode : '' }); } else enrichedLedger.push(entry); }
    return sendJson(res, 200, { ledger: enrichedLedger });
  }

  if (pathname === '/api/owner/inventory/valuation' && req.method === 'GET') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    const products = await db.collection('products').find({ is_archived: { $ne: 1 } }).toArray();
    return sendJson(res, 200, { valuation: { total_skus: products.length, total_units: products.reduce((s, p) => s + (p.stock || 0), 0), total_purchase_valuation: products.reduce((s, p) => s + ((p.stock || 0) * (p.purchase_price || 0)), 0), total_retail_valuation: products.reduce((s, p) => s + ((p.stock || 0) * (p.price || 0)), 0), estimated_potential_margin: products.reduce((s, p) => s + ((p.stock || 0) * ((p.price || 0) - (p.purchase_price || 0))), 0) }, lowStockList: products.filter(p => (p.stock || 0) <= (p.min_stock || 5)).sort((a, b) => (a.stock || 0) - (b.stock || 0)) });
  }

  if ((pathname.startsWith('/api/owner/inventory/ledger/') || pathname.startsWith('/api/owner/inventory-ledger/')) && req.method === 'DELETE') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    const parts = pathname.split('/'); const id = parseInt(parts[parts.length - 1], 10); if (!id) return sendJson(res, 400, { error: 'Invalid transaction ID' });
    try { const existing = await db.collection('inventory_transactions').findOne({ id }); if (!existing) return sendJson(res, 404, { error: 'Inventory record not found' }); await db.collection('inventory_transactions').deleteOne({ id }); await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'DELETE_INVENTORY_TXN', 'INVENTORY', id, 'SUCCESS', existing); return sendJson(res, 200, { success: true, message: `Inventory ledger entry #${id} deleted successfully.` }); }
    catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  // PURCHASES
  if (pathname === '/api/owner/purchases' && req.method === 'GET') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    const purchases = await db.collection('purchases').find({}).sort({ id: -1 }).toArray();
    const enrichedPurchases = [];
    for (const p of purchases) { const supp = await db.collection('suppliers').findOne({ id: p.supplier_id }); const itemCount = await db.collection('purchase_items').countDocuments({ purchase_id: p.id }); enrichedPurchases.push({ ...p, supplier_name: supp ? supp.name : '', supplier_gstin: supp ? supp.gstin : '', supplier_phone: supp ? supp.phone : '', items_count: itemCount }); }
    return sendJson(res, 200, { purchases: enrichedPurchases });
  }

  if (pathname === '/api/owner/purchases' && req.method === 'POST') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    try { const body = await parseJsonBody(req); const { supplier_id, supplier_invoice_no, purchase_date, goods_received_date, items, amount_paid, payment_method, notes, is_received } = body;
      if (!supplier_id || !items || !Array.isArray(items) || items.length === 0) return sendJson(res, 400, { error: 'Supplier and purchase items are required' });
      const supp = await db.collection('suppliers').findOne({ id: parseInt(supplier_id, 10) }); if (!supp) return sendJson(res, 404, { error: 'Supplier not found' });
      let totalCost = 0, totalGst = 0; items.forEach(i => { const unitCost = parseFloat(i.unit_cost || i.purchase_price || 0); const qty = parseInt(i.quantity, 10) || 1; const lineTotal = unitCost * qty; const gstRate = parseFloat(i.gst_rate || 18.0); totalCost += lineTotal; totalGst += Math.round(lineTotal * (gstRate / 100)); });
      const grandTotal = totalCost + totalGst; const paid = Math.min(grandTotal, parseInt(amount_paid || 0, 10)); const outstanding = grandTotal - paid; const status = is_received ? 'RECEIVED' : 'DRAFT';
      const purchaseNumber = `PUR-${Date.now().toString().slice(-6)}`; const now = new Date().toISOString(); const purchaseId = await getNextId('purchases');
      await db.collection('purchases').insertOne({ id: purchaseId, purchase_number: purchaseNumber, supplier_id: parseInt(supplier_id, 10), supplier_invoice_no: supplier_invoice_no || `INV-${Date.now().toString().slice(-4)}`, purchase_date: purchase_date || now.slice(0, 10), goods_received_date: is_received ? (goods_received_date || now.slice(0, 10)) : null, total_cost: totalCost, gst_amount: totalGst, grand_total: grandTotal, amount_paid: paid, outstanding_balance: outstanding, payment_status: paid >= grandTotal ? 'PAID' : (paid > 0 ? 'PARTIAL' : 'UNPAID'), status, payment_method: payment_method || 'BANK_TRANSFER', notes: notes || '', created_at: now, items });
      for (const item of items) { const qty = parseInt(item.quantity, 10) || 1; const unitCost = parseFloat(item.unit_cost || item.purchase_price || 0); const lineTotal = qty * unitCost; const lineTax = Math.round(lineTotal * (parseFloat(item.gst_rate || 18.0) / 100)); const piId = await getNextId('purchase_items'); await db.collection('purchase_items').insertOne({ id: piId, purchase_id: purchaseId, product_id: item.product_id, quantity: qty, unit_cost: unitCost, total: lineTotal, variant: item.variant || '', gst_rate: parseFloat(item.gst_rate || 18.0), tax_amount: lineTax, created_at: now }); if (is_received && item.product_id) { const prod = await db.collection('products').findOne({ id: item.product_id }); if (prod) { await db.collection('products').updateOne({ id: item.product_id }, { $inc: { stock: qty }, $set: { purchase_price: unitCost, updated_at: now } }); const txnId = await getNextId('inventory_transactions'); await db.collection('inventory_transactions').insertOne({ id: txnId, product_id: item.product_id, transaction_type: 'PURCHASE', quantity_change: qty, previous_stock: prod.stock, new_stock: prod.stock + qty, notes: `Goods received purchase #${purchaseNumber}`, user_id: currentUser ? currentUser.id : 1, created_at: now }); } } }
      if (paid > 0) { const payNum = `SPAY-${Date.now().toString().slice(-6)}`; const spId = await getNextId('supplier_payments'); await db.collection('supplier_payments').insertOne({ id: spId, payment_number: payNum, supplier_id: parseInt(supplier_id, 10), purchase_id: purchaseId, payment_date: now.slice(0, 10), amount: paid, payment_method: payment_method || 'BANK_TRANSFER', notes: 'Payment during purchase entry', recorded_by: currentUser.id, created_at: now }); }
      await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'CREATE_PURCHASE', 'PURCHASE', purchaseId, 'SUCCESS', { purchaseNumber, grandTotal, status });
      return sendJson(res, 201, { success: true, message: is_received ? 'Purchase recorded and stock added' : 'Draft purchase entry saved', purchaseId, purchase_id: purchaseId, purchaseNumber, grandTotal, outstanding });
    } catch (err) { console.error('Purchase Entry Error:', err); return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname.startsWith('/api/owner/purchases/') && pathname.endsWith('/receive') && req.method === 'PUT') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    const id = parseInt(pathname.split('/')[4], 10);
    try { const purchase = await db.collection('purchases').findOne({ id }); if (!purchase) return sendJson(res, 404, { error: 'Purchase record not found' }); if (purchase.status === 'RECEIVED') return sendJson(res, 400, { error: 'Goods have already been confirmed and received for this purchase' });
      let items = purchase.items || []; if (!items.length) items = await db.collection('purchase_items').find({ purchase_id: id }).toArray();
      const now = new Date().toISOString();
      for (const item of items) { if (item.product_id) { const prod = await db.collection('products').findOne({ id: item.product_id }); if (prod) { await db.collection('products').updateOne({ id: item.product_id }, { $inc: { stock: item.quantity }, $set: { purchase_price: item.unit_cost, updated_at: now } }); const txnId = await getNextId('inventory_transactions'); await db.collection('inventory_transactions').insertOne({ id: txnId, product_id: item.product_id, transaction_type: 'PURCHASE', quantity_change: item.quantity, previous_stock: prod.stock, new_stock: prod.stock + item.quantity, notes: `Confirmed receipt #${purchase.purchase_number}`, user_id: currentUser.id, created_at: now }); } } }
      await db.collection('purchases').updateOne({ id }, { $set: { status: 'RECEIVED', goods_received_date: now.slice(0, 10) } });
      await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'RECEIVE_PURCHASE', 'PURCHASE', id, 'SUCCESS');
      return sendJson(res, 200, { message: 'Goods receipt confirmed. Stock successfully added to inventory.' });
    } catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname.startsWith('/api/owner/purchases/') && pathname.endsWith('/payments') && req.method === 'POST') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    const id = parseInt(pathname.split('/')[4], 10);
    try { const body = await parseJsonBody(req); const { amount, payment_method, reference_no, notes } = body; const purchase = await db.collection('purchases').findOne({ id }); if (!purchase) return sendJson(res, 404, { error: 'Purchase not found' }); const payAmount = parseInt(amount, 10); if (!payAmount || payAmount <= 0) return sendJson(res, 400, { error: 'Payment amount must be greater than 0' });
      const newPaid = (purchase.amount_paid || 0) + payAmount; const newOutstanding = Math.max(0, (purchase.grand_total || 0) - newPaid); const newPayStatus = newOutstanding === 0 ? 'PAID' : 'PARTIAL';
      await db.collection('purchases').updateOne({ id }, { $set: { amount_paid: newPaid, outstanding_balance: newOutstanding, payment_status: newPayStatus } });
      const payNum = `SPAY-${Date.now().toString().slice(-6)}`; const spId = await getNextId('supplier_payments'); const now = new Date().toISOString();
      await db.collection('supplier_payments').insertOne({ id: spId, payment_number: payNum, supplier_id: purchase.supplier_id, purchase_id: id, payment_date: now.slice(0, 10), amount: payAmount, payment_method: payment_method || 'BANK_TRANSFER', reference_no: reference_no || '', notes: notes || '', recorded_by: currentUser.id, created_at: now });
      await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'RECORD_SUPPLIER_PAYMENT', 'PURCHASE', id, 'SUCCESS', { amount: payAmount, newOutstanding });
      return sendJson(res, 201, { message: 'Supplier payment recorded successfully', amountPaid: payAmount, outstandingBalance: newOutstanding });
    } catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname.startsWith('/api/owner/purchases/') && req.method === 'DELETE') {
    if (!currentUser || !['OWNER', 'ADMIN'].includes(currentUser.role)) return sendJson(res, 403, { error: 'Unauthorized: Admin or Owner role required' });
    const id = parseInt(pathname.split('/')[4], 10);
    try { const purchase = await db.collection('purchases').findOne({ id }); if (!purchase) return sendJson(res, 404, { error: 'Purchase record not found' }); await db.collection('purchase_items').deleteMany({ purchase_id: id }); await db.collection('supplier_payments').deleteMany({ purchase_id: id }); await db.collection('purchases').deleteOne({ id }); await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'DELETE_PURCHASE', 'PURCHASE', id, 'SUCCESS'); return sendJson(res, 200, { message: `Purchase #${purchase.purchase_number} deleted successfully` }); }
    catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  // SUPPLIERS
  if (pathname === '/api/owner/suppliers' && req.method === 'GET') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    const suppliers = await db.collection('suppliers').find({}).sort({ id: 1 }).toArray();
    const enrichedSuppliers = [];
    for (const s of suppliers) { const purchases = await db.collection('purchases').find({ supplier_id: s.id }).toArray(); enrichedSuppliers.push({ ...s, total_purchases: purchases.reduce((sum, p) => sum + (p.grand_total || 0), 0), total_paid: purchases.reduce((sum, p) => sum + (p.amount_paid || 0), 0), outstanding_balance: purchases.reduce((sum, p) => sum + (p.outstanding_balance || 0), 0), purchases_count: purchases.length }); }
    return sendJson(res, 200, { suppliers: enrichedSuppliers });
  }

  if (pathname === '/api/owner/suppliers' && req.method === 'POST') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    try { const body = await parseJsonBody(req); const { name, contact_person, email, phone, address, gstin } = body; if (!name) return sendJson(res, 400, { error: 'Supplier company name is required' }); const suppId = await getNextId('suppliers'); const now = new Date().toISOString(); await db.collection('suppliers').insertOne({ id: suppId, name: name.trim(), contact_person: contact_person || '', email: email || '', phone: phone || '', address: address || '', gstin: gstin || '', status: 'ACTIVE', created_at: now }); await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'CREATE_SUPPLIER', 'SUPPLIER', suppId, 'SUCCESS'); return sendJson(res, 201, { message: 'Supplier added successfully', id: suppId }); }
    catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname.startsWith('/api/owner/suppliers/') && req.method === 'GET' && !pathname.endsWith('/payments')) {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    const suppId = parseInt(pathname.split('/')[4], 10); const supplier = await db.collection('suppliers').findOne({ id: suppId }); if (!supplier) return sendJson(res, 404, { error: 'Supplier not found' });
    const purchases = await db.collection('purchases').find({ supplier_id: suppId }).sort({ id: -1 }).toArray(); const payments = await db.collection('supplier_payments').find({ supplier_id: suppId }).sort({ id: -1 }).toArray();
    return sendJson(res, 200, { supplier: { ...supplier, total_purchases: purchases.reduce((sum, p) => sum + (p.grand_total || 0), 0), total_paid: purchases.reduce((sum, p) => sum + (p.amount_paid || 0), 0), outstanding_balance: purchases.reduce((sum, p) => sum + (p.outstanding_balance || 0), 0), purchases_count: purchases.length }, purchases, payments });
  }

  if (pathname.startsWith('/api/owner/suppliers/') && pathname.endsWith('/payments') && req.method === 'POST') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    const suppId = parseInt(pathname.split('/')[4], 10);
    try { const body = await parseJsonBody(req); const { amount, payment_method, reference_no, notes, purchase_id } = body; const supp = await db.collection('suppliers').findOne({ id: suppId }); if (!supp) return sendJson(res, 404, { error: 'Supplier not found' }); const payAmount = parseInt(amount, 10); if (!payAmount || payAmount <= 0) return sendJson(res, 400, { error: 'Payment amount must be greater than 0' });
      let targetPur = null; if (purchase_id) targetPur = await db.collection('purchases').findOne({ id: parseInt(purchase_id, 10), supplier_id: suppId }); else targetPur = await db.collection('purchases').findOne({ supplier_id: suppId, outstanding_balance: { $gt: 0 } });
      let appliedPurId = null; if (targetPur) { appliedPurId = targetPur.id; const newPaid = (targetPur.amount_paid || 0) + payAmount; const newOutstanding = Math.max(0, (targetPur.grand_total || 0) - newPaid); await db.collection('purchases').updateOne({ id: targetPur.id }, { $set: { amount_paid: newPaid, outstanding_balance: newOutstanding, payment_status: newOutstanding === 0 ? 'PAID' : 'PARTIAL' } }); }
      const payNum = `SPAY-${Date.now().toString().slice(-6)}`; const spId = await getNextId('supplier_payments'); const now = new Date().toISOString();
      await db.collection('supplier_payments').insertOne({ id: spId, payment_number: payNum, supplier_id: suppId, purchase_id: appliedPurId, payment_date: now.slice(0, 10), amount: payAmount, payment_method: payment_method || 'BANK_TRANSFER', reference_no: reference_no || '', notes: notes || '', recorded_by: currentUser.id, created_at: now });
      await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'RECORD_SUPPLIER_PAYMENT', 'SUPPLIER', suppId, 'SUCCESS', { amount: payAmount, appliedPurchaseId: appliedPurId });
      return sendJson(res, 201, { success: true, message: 'Supplier payment recorded successfully', paymentNumber: payNum, amount: payAmount, appliedPurchaseId: appliedPurId });
    } catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname.startsWith('/api/owner/suppliers/') && req.method === 'DELETE') {
    if (!currentUser || !['OWNER', 'ADMIN'].includes(currentUser.role)) return sendJson(res, 403, { error: 'Unauthorized: Admin or Owner role required' });
    const id = parseInt(pathname.split('/')[4], 10);
    try { const supplier = await db.collection('suppliers').findOne({ id }); if (!supplier) return sendJson(res, 404, { error: 'Supplier not found' }); await db.collection('supplier_payments').deleteMany({ supplier_id: id }); await db.collection('suppliers').deleteOne({ id }); await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'DELETE_SUPPLIER', 'SUPPLIER', id, 'SUCCESS'); return sendJson(res, 200, { message: `Supplier ${supplier.name} deleted successfully` }); }
    catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  // ORDERS
  if (pathname === '/api/owner/orders' && req.method === 'GET') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    const status = parsedUrl.searchParams.get('status'); const orderType = parsedUrl.searchParams.get('type'); const search = parsedUrl.searchParams.get('search'); const limit = parseInt(parsedUrl.searchParams.get('limit') || '100', 10);
    let filter = {}; if (orderType && orderType !== 'all') filter.order_type = orderType.toUpperCase(); if (status && status !== 'all') filter.status = status.toUpperCase();
    if (search) { const regex = new RegExp(search, 'i'); filter.$or = [{ order_number: regex }, { customer_name: regex }, { customer_phone: regex }, { customer_email: regex }]; }
    const orders = await db.collection('orders').find(filter).sort({ id: -1 }).limit(limit).toArray();
    const result = [];
    for (const o of orders) { let items = o.items || []; if (!items.length) items = await db.collection('order_items').find({ order_id: o.id }).toArray(); result.push({ ...o, items, shipping_address: typeof o.shipping_address_json === 'string' ? JSON.parse(o.shipping_address_json || '{}') : (o.shipping_address_json || {}) }); }
    return sendJson(res, 200, { orders: result });
  }

  if (pathname.startsWith('/api/owner/orders/') && pathname.endsWith('/status') && req.method === 'PUT') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    const id = parseInt(pathname.split('/')[4], 10);
    try { const body = await parseJsonBody(req); const { status, payment_status, notes } = body; const order = await db.collection('orders').findOne({ id }); if (!order) return sendJson(res, 404, { error: 'Order not found' });
      if (status === 'CANCELLED' && order.status !== 'CANCELLED') { let items = order.items || []; if (!items.length) items = await db.collection('order_items').find({ order_id: id }).toArray(); const now = new Date().toISOString(); for (const item of items) { if (item.product_id) { const prod = await db.collection('products').findOne({ id: item.product_id }); if (prod) { await db.collection('products').updateOne({ id: item.product_id }, { $inc: { stock: item.quantity }, $set: { updated_at: now } }); const txnId = await getNextId('inventory_transactions'); await db.collection('inventory_transactions').insertOne({ id: txnId, product_id: item.product_id, transaction_type: 'CANCELLATION', quantity_change: item.quantity, previous_stock: prod.stock, new_stock: prod.stock + item.quantity, notes: `Stock restored for cancelled order #${order.order_number}`, user_id: currentUser.id, created_at: now }); } } } }
      const updateFields = { updated_at: new Date().toISOString() }; if (status) updateFields.status = status; if (payment_status) updateFields.payment_status = payment_status; if (notes) updateFields.notes = notes;
      await db.collection('orders').updateOne({ id }, { $set: updateFields });
      await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'UPDATE_ORDER_STATUS', 'ORDER', id, 'SUCCESS', { previousStatus: order.status, newStatus: status });
      return sendJson(res, 200, { message: 'Order status updated successfully' });
    } catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname.startsWith('/api/owner/orders/') && pathname.endsWith('/shipping') && req.method === 'PUT') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    const id = parseInt(pathname.split('/')[4], 10);
    try { const body = await parseJsonBody(req); const { courier_name, tracking_number, dispatch_date, status } = body; await db.collection('orders').updateOne({ id }, { $set: { courier_name: courier_name || 'BlueDart Express', tracking_number: tracking_number || '', dispatch_date: dispatch_date || new Date().toISOString().slice(0, 10), status: status || 'SHIPPED', updated_at: new Date().toISOString() } }); await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'UPDATE_SHIPPING', 'ORDER', id, 'SUCCESS', { courier_name, tracking_number }); return sendJson(res, 200, { message: 'Shipping details recorded' }); }
    catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname.startsWith('/api/owner/orders/') && req.method === 'DELETE') {
    if (!currentUser || !['OWNER', 'ADMIN', 'STAFF'].includes(currentUser.role)) return sendJson(res, 403, { error: 'Unauthorized' });
    const rawId = decodeURIComponent(pathname.split('/')[4] || ''); const numId = parseInt(rawId, 10);
    try { const order = !isNaN(numId) ? await db.collection('orders').findOne({ $or: [{ id: numId }, { order_number: rawId }] }) : await db.collection('orders').findOne({ order_number: rawId }); if (!order) return sendJson(res, 404, { error: 'Order not found' }); const orderId = order.id;
      await db.collection('credit_notes').deleteMany({ order_id: orderId }); await db.collection('order_items').deleteMany({ order_id: orderId }); await db.collection('invoices').deleteMany({ order_id: orderId }); await db.collection('orders').deleteOne({ id: orderId });
      await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'DELETE_ORDER', 'ORDER', orderId, 'SUCCESS'); return sendJson(res, 200, { message: `Order #${order.order_number} deleted successfully` }); }
    catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  // INVOICES
  if (pathname === '/api/owner/invoices' && req.method === 'GET') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    const search = parsedUrl.searchParams.get('search'); const type = parsedUrl.searchParams.get('type'); const limit = parseInt(parsedUrl.searchParams.get('limit') || '100', 10);
    let filter = {}; if (type && type !== 'all') filter.invoice_type = type.toUpperCase();
    if (search) { const regex = new RegExp(search, 'i'); filter.$or = [{ invoice_number: regex }, { customer_name: regex }, { customer_phone: regex }, { customer_gstin: regex }]; }
    const invoices = await db.collection('invoices').find(filter).sort({ id: -1 }).limit(limit).toArray();
    return sendJson(res, 200, { invoices });
  }

  if (pathname.startsWith('/api/owner/invoices/') && !pathname.endsWith('/credit-notes') && req.method === 'GET') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    const id = pathname.split('/')[4]; const numId = parseInt(id, 10);
    const invoice = !isNaN(numId) ? await db.collection('invoices').findOne({ $or: [{ id: numId }, { invoice_number: id }] }) : await db.collection('invoices').findOne({ invoice_number: id });
    if (!invoice) return sendJson(res, 404, { error: 'Invoice not found' });
    let items = []; if (invoice.order_id) { const order = await db.collection('orders').findOne({ id: invoice.order_id }); items = order ? (order.items || []) : []; if (!items.length) items = await db.collection('order_items').find({ order_id: invoice.order_id }).toArray(); }
    const settings = await getStoreSettings();
    return sendJson(res, 200, { invoice: { ...invoice, items, store: { name: settings.STORE_NAME || 'MOTO PITSHOP', legalName: settings.STORE_LEGAL_NAME || 'Moto Pitshop Retail Pvt Ltd', address: settings.STORE_ADDRESS || '124 Racing Track Boulevard, Motor City, Chennai, TN 600001', phone: settings.STORE_PHONE || '+91 98765 43210', email: settings.STORE_EMAIL || 'owner@motopitshop.com', gstin: settings.STORE_GSTIN || '33AABCM1234F1Z9', state: settings.STORE_STATE || 'Tamil Nadu', stateCode: settings.STORE_STATE_CODE || '33' } } });
  }

  if (pathname.startsWith('/api/owner/invoices/') && req.method === 'DELETE') {
    if (!currentUser || !['OWNER', 'ADMIN', 'STAFF'].includes(currentUser.role)) return sendJson(res, 403, { error: 'Unauthorized: Admin, Owner, or Staff role required' });
    const rawId = decodeURIComponent(pathname.split('/')[4] || ''); const numId = parseInt(rawId, 10);
    try { const inv = !isNaN(numId) ? await db.collection('invoices').findOne({ $or: [{ id: numId }, { invoice_number: rawId }] }) : await db.collection('invoices').findOne({ invoice_number: rawId }); if (!inv) return sendJson(res, 404, { error: 'Invoice not found' }); await db.collection('credit_notes').deleteMany({ invoice_id: inv.id }); await db.collection('invoices').deleteOne({ id: inv.id }); await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'DELETE_INVOICE', 'INVOICE', inv.id, 'SUCCESS'); return sendJson(res, 200, { message: `Invoice ${inv.invoice_number} deleted successfully` }); }
    catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname === '/api/owner/credit-notes' && req.method === 'GET') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    const creditNotes = await db.collection('credit_notes').find({}).sort({ id: -1 }).toArray();
    const enriched = [];
    for (const cn of creditNotes) { const inv = cn.invoice_id ? await db.collection('invoices').findOne({ id: cn.invoice_id }) : null; enriched.push({ ...cn, original_invoice_number: inv ? inv.invoice_number : '' }); }
    return sendJson(res, 200, { creditNotes: enriched });
  }

  if (pathname.startsWith('/api/owner/credit-notes/') && req.method === 'DELETE') {
    if (!currentUser || !['OWNER', 'ADMIN'].includes(currentUser.role)) return sendJson(res, 403, { error: 'Unauthorized: Admin or Owner role required' });
    const id = parseInt(pathname.split('/')[4], 10);
    try { const cn = await db.collection('credit_notes').findOne({ id }); if (!cn) return sendJson(res, 404, { error: 'Credit note not found' }); await db.collection('credit_note_items').deleteMany({ credit_note_id: id }); await db.collection('credit_notes').deleteOne({ id }); await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'DELETE_CREDIT_NOTE', 'CREDIT_NOTE', id, 'SUCCESS'); return sendJson(res, 200, { message: `Credit note ${cn.credit_note_number} deleted successfully` }); }
    catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  // CUSTOMERS
  if (pathname === '/api/owner/customers' && req.method === 'GET') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    const search = parsedUrl.searchParams.get('search'); const type = parsedUrl.searchParams.get('type');
    let filter = {}; if (type && type !== 'all') filter.customer_type = type.toUpperCase();
    if (search) { const regex = new RegExp(search, 'i'); filter.$or = [{ name: regex }, { phone: regex }, { email: regex }, { gstin: regex }, { customer_code: regex }]; }
    const customers = await db.collection('customers').find(filter).sort({ id: -1 }).toArray();
    return sendJson(res, 200, { customers });
  }

  if (pathname === '/api/owner/customers' && req.method === 'POST') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    try { const body = await parseJsonBody(req); const { name, phone, email, billing_address, shipping_address, gstin, customer_type, notes } = body; if (!name) return sendJson(res, 400, { error: 'Customer name is required' }); if (phone) { const existing = await db.collection('customers').findOne({ phone: phone.trim() }); if (existing) return sendJson(res, 400, { error: `Customer with phone number ${phone} already exists` }); }
      const code = `MPS-CUST-${Date.now().toString().slice(-4)}`; const custId = await getNextId('customers'); const now = new Date().toISOString();
      await db.collection('customers').insertOne({ id: custId, customer_code: code, name: name.trim(), phone: phone || '', email: email || '', billing_address: billing_address || '', shipping_address: shipping_address || '', gstin: gstin || '', customer_type: customer_type || 'RETAIL', notes: notes || '', total_spend: 0, total_orders: 0, created_at: now, updated_at: now });
      await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'CREATE_CUSTOMER', 'CUSTOMER', custId, 'SUCCESS'); return sendJson(res, 201, { message: 'Customer created successfully', id: custId, customer_code: code });
    } catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname.startsWith('/api/owner/customers/') && req.method === 'DELETE') {
    if (!currentUser || !['OWNER', 'ADMIN'].includes(currentUser.role)) return sendJson(res, 403, { error: 'Unauthorized: Admin or Owner role required' });
    const id = parseInt(pathname.split('/')[4], 10);
    try { const customer = await db.collection('customers').findOne({ id }); if (!customer) return sendJson(res, 404, { error: 'Customer not found' }); await db.collection('customers').deleteOne({ id }); await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'DELETE_CUSTOMER', 'CUSTOMER', id, 'SUCCESS'); return sendJson(res, 200, { message: `Customer ${customer.name} deleted successfully` }); }
    catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  // EXPENSES
  if (pathname === '/api/owner/expenses' && req.method === 'GET') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    const category = parsedUrl.searchParams.get('category'); const range = parsedUrl.searchParams.get('range'); const start = parsedUrl.searchParams.get('startDate'); const end = parsedUrl.searchParams.get('endDate');
    const { startDate, endDate } = parseDateRange(range, start, end);
    let filter = { expense_date: { $gte: startDate, $lte: endDate } }; if (category && category !== 'all') filter.category = category;
    const expenses = await db.collection('expenses').find(filter).sort({ id: -1 }).toArray();
    const catAgg = await db.collection('expenses').aggregate([{ $match: { expense_date: { $gte: startDate, $lte: endDate } } }, { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } }, { $sort: { total: -1 } }]).toArray();
    return sendJson(res, 200, { expenses, categoryTotals: catAgg.map(c => ({ category: c._id, total: c.total, count: c.count })), totalAmount: expenses.reduce((acc, e) => acc + (e.amount || 0), 0), startDate, endDate });
  }

  if (pathname === '/api/owner/expenses' && req.method === 'POST') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    try { const body = await parseJsonBody(req); const { category, description, amount, payment_method, vendor, reference_no, expense_date } = body; if (!category || !description || !amount) return sendJson(res, 400, { error: 'Category, description, and amount are required' });
      const expNum = `EXP-${Date.now().toString().slice(-6)}`; const expId = await getNextId('expenses'); const now = new Date().toISOString();
      await db.collection('expenses').insertOne({ id: expId, expense_number: expNum, expense_date: expense_date || now.slice(0, 10), category, description: description.trim(), amount: parseInt(amount, 10), payment_method: payment_method || 'CASH', vendor: vendor || '', reference_no: reference_no || '', recorded_by: currentUser.id, created_at: now });
      await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'CREATE_EXPENSE', 'EXPENSE', expId, 'SUCCESS', { expNum, category, amount });
      return sendJson(res, 201, { message: 'Expense recorded successfully', id: expId, expense_number: expNum });
    } catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname.startsWith('/api/owner/expenses/') && req.method === 'DELETE') {
    if (!currentUser || !['OWNER', 'ADMIN'].includes(currentUser.role)) return sendJson(res, 403, { error: 'Unauthorized: Admin/Owner role required' });
    const id = parseInt(pathname.split('/')[4], 10);
    try { await db.collection('expenses').deleteOne({ id }); await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'DELETE_EXPENSE', 'EXPENSE', id, 'SUCCESS'); return sendJson(res, 200, { message: 'Expense deleted' }); }
    catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  // REPORTS
  if (pathname === '/api/owner/reports/analytics' && req.method === 'GET') {
    if (!canAccessReports) return sendJson(res, 403, { error: 'Unauthorized: Owner or Manager access required for financial analytics reports' });
    try {
      const range = parsedUrl.searchParams.get('range') || 'month'; const start = parsedUrl.searchParams.get('startDate'); const end = parsedUrl.searchParams.get('endDate');
      const { startDate, endDate } = parseDateRange(range, start, end); const sStart = new Date(startDate + 'T00:00:00.000Z'); const sEnd = new Date(endDate + 'T23:59:59.999Z');
      const allOrders = await db.collection('orders').find({ created_at: { $gte: sStart.toISOString(), $lte: sEnd.toISOString() }, status: { $ne: 'CANCELLED' } }).toArray();
      const grossSales = allOrders.reduce((s, o) => s + (o.grand_total || 0), 0); const totalTax = allOrders.reduce((s, o) => s + (o.tax_total || 0), 0);
      const netSales = grossSales; const grossProfit = grossSales;
      const payAgg = await db.collection('orders').aggregate([{ $match: { created_at: { $gte: sStart.toISOString(), $lte: sEnd.toISOString() }, status: { $ne: 'CANCELLED' } } }, { $group: { _id: '$payment_method', total: { $sum: '$grand_total' }, count: { $sum: 1 } } }]).toArray();
      return sendJson(res, 200, {
        period: { range, startDate, endDate },
        financials: { grossSales, totalDiscounts: 0, returns: 0, netSales, cogs: 0, grossProfit, grossMarginPct: netSales > 0 ? Math.round((grossProfit / netSales) * 100) : 0, operatingExpenses: 0, netOperatingProfit: grossProfit, netMarginPct: netSales > 0 ? Math.round((grossProfit / netSales) * 100) : 0 },
        pnl: { gross_sales: grossSales, gross_profit: grossProfit, net_sales: netSales, cogs: 0, operating_expenses: 0, estimated_net_profit: grossProfit },
        taxSummary: { taxableSales: allOrders.reduce((s, o) => s + (o.subtotal || 0), 0), cgstCollected: 0, sgstCollected: 0, igstCollected: 0, totalOutputGst: totalTax, inputTaxCredit: 0, netGstPayable: totalTax },
        purchasesSummary: { total_purchases: 0, taxable_purchases: 0, input_tax_credit: 0, outstanding_balances: 0, count: 0 },
        posVsOnline: [], topProducts: [], categorySales: [], brandSales: [],
        paymentMethods: payAgg.map(p => ({ payment_method: p._id, total: p.total, count: p.count }))
      });
    } catch (err) { console.error('Reports Analytics Error:', err); return sendJson(res, 500, { error: err.message }); }
  }

  // USERS
  if (pathname === '/api/owner/users' && req.method === 'GET') {
    if (!currentUser || !['OWNER', 'ADMIN'].includes(currentUser.role)) return sendJson(res, 403, { error: 'Unauthorized: Admin or Owner role required' });
    const users = await db.collection('users').find({}, { projection: { password_hash: 0 } }).sort({ id: 1 }).toArray();
    return sendJson(res, 200, { users });
  }

  if (pathname === '/api/owner/users' && req.method === 'POST') {
    if (!currentUser || currentUser.role !== 'OWNER') return sendJson(res, 403, { error: 'Unauthorized: Only Owner can create staff accounts' });
    try { const body = await parseJsonBody(req); const { email, password, full_name, phone, staff_role, permissions } = body; if (!email || !password || !full_name) return sendJson(res, 400, { error: 'Email, password, and full name are required' });
      const existing = await db.collection('users').findOne({ email: email.toLowerCase().trim() }); if (existing) return sendJson(res, 400, { error: 'An account with this email already exists' });
      const roleMap = { OWNER: 'OWNER', MANAGER: 'ADMIN', CASHIER: 'STAFF', INVENTORY: 'STAFF', STAFF: 'STAFF' }; const sysRole = roleMap[staff_role] || 'STAFF';
      const userId = await getNextId('users'); const now = new Date().toISOString();
      await db.collection('users').insertOne({ id: userId, email: email.toLowerCase().trim(), password_hash: hashPassword(password), full_name: full_name.trim(), phone: phone || '', role: sysRole, staff_role: staff_role || 'STAFF', status: 'ACTIVE', permissions_json: JSON.stringify(permissions || {}), created_at: now, updated_at: now });
      await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'CREATE_USER', 'USER', userId, 'SUCCESS', { email, staff_role });
      return sendJson(res, 201, { message: 'User created successfully', id: userId });
    } catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname.startsWith('/api/owner/users/') && req.method === 'DELETE') {
    if (!currentUser || currentUser.role !== 'OWNER') return sendJson(res, 403, { error: 'Unauthorized: Only Primary Store Owner can delete staff accounts' });
    const id = parseInt(pathname.split('/')[4], 10);
    try { const targetUser = await db.collection('users').findOne({ id }); if (!targetUser) return sendJson(res, 404, { error: 'User not found' }); if (targetUser.id === 1 || targetUser.role === 'OWNER' || targetUser.email.toLowerCase() === 'owner@motopitshop.com') return sendJson(res, 400, { error: 'Cannot delete the Primary Store Owner account' }); await db.collection('users').deleteOne({ id }); await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'DELETE_USER', 'USER', id, 'SUCCESS'); return sendJson(res, 200, { message: `Staff account ${targetUser.full_name} deleted successfully` }); }
    catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  // SETTINGS
  if (pathname === '/api/owner/settings' && req.method === 'POST') {
    if (!currentUser || !['OWNER', 'ADMIN'].includes(currentUser.role)) return sendJson(res, 403, { error: 'Unauthorized' });
    try { const body = await parseJsonBody(req); for (const key of Object.keys(body)) { await db.collection('store_settings').updateOne({ key }, { $set: { key, value: String(body[key]), updated_at: new Date().toISOString() } }, { upsert: true }); } await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'UPDATE_SETTINGS', 'STORE', null, 'SUCCESS'); return sendJson(res, 200, { message: 'Shop and GST settings saved successfully' }); }
    catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  // CATEGORIES
  if (pathname === '/api/owner/categories' && req.method === 'POST') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    try { const body = await parseJsonBody(req); const { name, slug, icon, description } = body; if (!name || !name.trim()) return sendJson(res, 400, { error: 'Category name is required' });
      const generatedSlug = (slug || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
      const existing = await db.collection('categories').findOne({ slug: generatedSlug }); if (existing) return sendJson(res, 400, { error: `Category with slug "${generatedSlug}" already exists` });
      const maxOrderDoc = await db.collection('categories').find({}).sort({ display_order: -1 }).limit(1).toArray(); const nextOrder = ((maxOrderDoc[0] && maxOrderDoc[0].display_order) || 0) + 1;
      const catId = await getNextId('categories'); await db.collection('categories').insertOne({ id: catId, slug: generatedSlug, name: name.trim(), icon: icon || 'Box', description: description || '', display_order: nextOrder, created_at: new Date().toISOString() });
      await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'CREATE_CATEGORY', 'CATEGORY', catId, 'SUCCESS', { name, slug: generatedSlug });
      return sendJson(res, 201, { message: 'Category created successfully', id: catId, category: { id: catId, name: name.trim(), slug: generatedSlug, icon: icon || 'Box', description: description || '' } });
    } catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname === '/api/owner/categories' && req.method === 'GET') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    const categories = await db.collection('categories').find({}).sort({ display_order: 1 }).toArray();
    return sendJson(res, 200, { categories: categories.map(c => ({ ...c, id: c.id || c._id })) });
  }

  if (pathname.match(/^\/api\/owner\/categories\/\d+$/) && req.method === 'DELETE') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    const id = parseInt(pathname.split('/')[4], 10);
    try { await db.collection('categories').deleteOne({ id }); await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'DELETE_CATEGORY', 'CATEGORY', id, 'SUCCESS'); return sendJson(res, 200, { message: 'Category deleted successfully' }); }
    catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  // BRANDS
  if (pathname === '/api/owner/brands' && req.method === 'POST') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    try { const body = await parseJsonBody(req); const { name, slug, logo, description } = body; if (!name || !name.trim()) return sendJson(res, 400, { error: 'Brand name is required' });
      const generatedSlug = (slug || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
      const existing = await db.collection('brands').findOne({ slug: generatedSlug }); if (existing) return sendJson(res, 400, { error: `Brand with slug "${generatedSlug}" already exists` });
      const brandId = await getNextId('brands'); await db.collection('brands').insertOne({ id: brandId, slug: generatedSlug, name: name.trim(), logo: logo || '', description: description || '', created_at: new Date().toISOString() });
      await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'CREATE_BRAND', 'BRAND', brandId, 'SUCCESS', { name, slug: generatedSlug });
      return sendJson(res, 201, { message: 'Brand created successfully', id: brandId, brand: { id: brandId, name: name.trim(), slug: generatedSlug, logo: logo || '', description: description || '' } });
    } catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  if (pathname === '/api/owner/brands' && req.method === 'GET') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    const brands = await db.collection('brands').find({}).sort({ name: 1 }).toArray();
    return sendJson(res, 200, { brands: brands.map(b => ({ ...b, id: b.id || b._id })) });
  }

  if (pathname.match(/^\/api\/owner\/brands\/\d+$/) && req.method === 'DELETE') {
    if (!isOwnerStaff) return sendJson(res, 403, { error: 'Unauthorized' });
    const id = parseInt(pathname.split('/')[4], 10);
    try { await db.collection('brands').deleteOne({ id }); await logAudit(currentUser.id, currentUser.full_name, currentUser.role, 'DELETE_BRAND', 'BRAND', id, 'SUCCESS'); return sendJson(res, 200, { message: 'Brand deleted successfully' }); }
    catch (err) { return sendJson(res, 500, { error: err.message }); }
  }

  return false;
}

module.exports = { handleOwnerApi };
