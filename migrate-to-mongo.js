// migrate-to-mongo.js - Complete Data Migration & Sync from Local DB to MongoDB Atlas
const { connectMongo, getDb, getMongoStatus, closeMongo } = require('./mongodb.js');
const { db } = require('./database.js');

async function migrateAllToMongo() {
  console.log('========================================================');
  console.log(' MOTO PITSHOP -> MONGODB ATLAS COMPLETE DATA MIGRATION');
  console.log('========================================================');

  const mongoDb = await connectMongo();
  if (!mongoDb) {
    const status = getMongoStatus();
    console.error('[MIGRATION FAILED] Could not connect to MongoDB Atlas:');
    console.error(status.error);
    return {
      success: false,
      error: status.error,
      reason: status.error && (status.error.includes('alert number 80') || status.error.includes('tlsv1 alert internal error'))
        ? 'IP_NOT_WHITELISTED: Please whitelist your IP or 0.0.0.0/0 in MongoDB Atlas Network Access.'
        : status.error
    };
  }

  const results = {};

  try {
    // 1. Users
    const users = db.prepare('SELECT * FROM users').all();
    const cleanUsers = users.map(u => ({
      ...u,
      permissions: typeof u.permissions_json === 'string' ? JSON.parse(u.permissions_json || '{}') : (u.permissions_json || {})
    }));
    for (const u of cleanUsers) {
      await mongoDb.collection('users').updateOne(
        { email: u.email },
        { $set: u },
        { upsert: true }
      );
    }
    results.users = cleanUsers.length;
    console.log(`[OK] Migrated ${cleanUsers.length} Users`);

    // 2. Categories
    const categories = db.prepare('SELECT * FROM categories').all();
    for (const c of categories) {
      await mongoDb.collection('categories').updateOne(
        { slug: c.slug },
        { $set: c },
        { upsert: true }
      );
    }
    results.categories = categories.length;
    console.log(`[OK] Migrated ${categories.length} Categories`);

    // 3. Brands
    const brands = db.prepare('SELECT * FROM brands').all();
    for (const b of brands) {
      await mongoDb.collection('brands').updateOne(
        { slug: b.slug },
        { $set: b },
        { upsert: true }
      );
    }
    results.brands = brands.length;
    console.log(`[OK] Migrated ${brands.length} Brands`);

    // 4. Bikes
    const bikes = db.prepare('SELECT * FROM bikes').all();
    for (const bk of bikes) {
      await mongoDb.collection('bikes').updateOne(
        { brand: bk.brand, model: bk.model, year: bk.year, variant: bk.variant },
        { $set: bk },
        { upsert: true }
      );
    }
    results.bikes = bikes.length;
    console.log(`[OK] Migrated ${bikes.length} Bikes`);

    // 5. Suppliers
    const suppliers = db.prepare('SELECT * FROM suppliers').all();
    for (const s of suppliers) {
      await mongoDb.collection('suppliers').updateOne(
        { name: s.name },
        { $set: s },
        { upsert: true }
      );
    }
    results.suppliers = suppliers.length;
    console.log(`[OK] Migrated ${suppliers.length} Suppliers`);

    // 6. Products
    const products = db.prepare('SELECT * FROM products').all();
    for (const p of products) {
      // Fetch bike compatibility
      const compBikes = db.prepare('SELECT bike_id FROM bike_compatibility WHERE product_id = ?').all(p.id);
      const doc = {
        ...p,
        images: typeof p.images_json === 'string' ? JSON.parse(p.images_json || '[]') : (p.images_json || []),
        variants: typeof p.variants_json === 'string' ? JSON.parse(p.variants_json || '[]') : (p.variants_json || []),
        compatible_bike_ids: compBikes.map(cb => cb.bike_id)
      };
      await mongoDb.collection('products').updateOne(
        { sku: p.sku },
        { $set: doc },
        { upsert: true }
      );
    }
    results.products = products.length;
    console.log(`[OK] Migrated ${products.length} Products`);

    // 7. Orders & Order Items
    const orders = db.prepare('SELECT * FROM orders').all();
    for (const o of orders) {
      const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id);
      const doc = {
        ...o,
        shipping_address: typeof o.shipping_address_json === 'string' ? JSON.parse(o.shipping_address_json || '{}') : (o.shipping_address_json || {}),
        items: items
      };
      await mongoDb.collection('orders').updateOne(
        { order_number: o.order_number },
        { $set: doc },
        { upsert: true }
      );
    }
    results.orders = orders.length;
    console.log(`[OK] Migrated ${orders.length} Orders`);

    // 8. Invoices
    const invoices = db.prepare('SELECT * FROM invoices').all();
    for (const inv of invoices) {
      await mongoDb.collection('invoices').updateOne(
        { invoice_number: inv.invoice_number },
        { $set: inv },
        { upsert: true }
      );
    }
    results.invoices = invoices.length;
    console.log(`[OK] Migrated ${invoices.length} Invoices`);

    // 9. Customers
    const customers = db.prepare('SELECT * FROM customers').all();
    for (const c of customers) {
      await mongoDb.collection('customers').updateOne(
        { customer_code: c.customer_code },
        { $set: c },
        { upsert: true }
      );
    }
    results.customers = customers.length;
    console.log(`[OK] Migrated ${customers.length} Customers`);

    // 10. Purchases & Purchase Items
    const purchases = db.prepare('SELECT * FROM purchases').all();
    for (const pur of purchases) {
      const items = db.prepare('SELECT * FROM purchase_items WHERE purchase_id = ?').all(pur.id);
      const doc = {
        ...pur,
        items: items
      };
      await mongoDb.collection('purchases').updateOne(
        { purchase_number: pur.purchase_number },
        { $set: doc },
        { upsert: true }
      );
    }
    results.purchases = purchases.length;
    console.log(`[OK] Migrated ${purchases.length} Purchases`);

    // 11. Supplier Payments
    const suppPayments = db.prepare('SELECT * FROM supplier_payments').all();
    for (const sp of suppPayments) {
      await mongoDb.collection('supplier_payments').updateOne(
        { payment_number: sp.payment_number },
        { $set: sp },
        { upsert: true }
      );
    }
    results.supplier_payments = suppPayments.length;
    console.log(`[OK] Migrated ${suppPayments.length} Supplier Payments`);

    // 12. Expenses
    const expenses = db.prepare('SELECT * FROM expenses').all();
    for (const exp of expenses) {
      await mongoDb.collection('expenses').updateOne(
        { expense_number: exp.expense_number },
        { $set: exp },
        { upsert: true }
      );
    }
    results.expenses = expenses.length;
    console.log(`[OK] Migrated ${expenses.length} Expenses`);

    // 13. Credit Notes
    const creditNotes = db.prepare('SELECT * FROM credit_notes').all();
    for (const cn of creditNotes) {
      const items = db.prepare('SELECT * FROM credit_note_items WHERE credit_note_id = ?').all(cn.id);
      const doc = {
        ...cn,
        items: items
      };
      await mongoDb.collection('credit_notes').updateOne(
        { credit_note_number: cn.credit_note_number },
        { $set: doc },
        { upsert: true }
      );
    }
    results.credit_notes = creditNotes.length;
    console.log(`[OK] Migrated ${creditNotes.length} Credit Notes`);

    // 14. Inventory Transactions
    const transactions = db.prepare('SELECT * FROM inventory_transactions').all();
    for (const txn of transactions) {
      await mongoDb.collection('inventory_transactions').updateOne(
        { id: txn.id },
        { $set: txn },
        { upsert: true }
      );
    }
    results.inventory_transactions = transactions.length;
    console.log(`[OK] Migrated ${transactions.length} Inventory Transactions`);

    // 15. Store Settings
    const settings = db.prepare('SELECT * FROM store_settings').all();
    for (const s of settings) {
      await mongoDb.collection('store_settings').updateOne(
        { key: s.key },
        { $set: s },
        { upsert: true }
      );
    }
    results.store_settings = settings.length;
    console.log(`[OK] Migrated ${settings.length} Store Settings`);

    // 16. Coupons
    const coupons = db.prepare('SELECT * FROM coupons').all();
    for (const c of coupons) {
      await mongoDb.collection('coupons').updateOne(
        { code: c.code },
        { $set: c },
        { upsert: true }
      );
    }
    results.coupons = coupons.length;
    console.log(`[OK] Migrated ${coupons.length} Coupons`);

    // 17. Audit Logs
    const auditLogs = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 500').all();
    for (const a of auditLogs) {
      await mongoDb.collection('audit_logs').updateOne(
        { id: a.id },
        { $set: a },
        { upsert: true }
      );
    }
    results.audit_logs = auditLogs.length;
    console.log(`[OK] Migrated ${auditLogs.length} Audit Logs`);

    console.log('========================================================');
    console.log(' [SUCCESS] ALL OWNER PORTAL DATA STORED IN MONGODB!');
    console.log('========================================================');

    return {
      success: true,
      counts: results,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    console.error('[MIGRATION ERROR]', err);
    return {
      success: false,
      error: err.message
    };
  }
}

if (require.main === module) {
  migrateAllToMongo().then(res => {
    console.log('Migration Result:', JSON.stringify(res, null, 2));
    closeMongo().then(() => process.exit(res.success ? 0 : 1));
  });
}

module.exports = {
  migrateAllToMongo
};

