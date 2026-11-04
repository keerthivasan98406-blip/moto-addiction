// mongodb.js - Moto Pitshop MongoDB Atlas Connection & Data Layer
const { MongoClient } = require('mongodb');
const dns = require('dns');
const path = require('path');
const fs = require('fs');

// Ensure DNS servers include public resolvers to avoid Windows SRV lookup failures
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
  // Ignore if not permitted
}

// Load .env if present
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
  }
} catch (e) {
  // dotenv optional
}

// Connection URI configuration
// Defaults to the user provided cluster URI with proper formatting (no < > and .mongodb.net host)
const RAW_URI = process.env.MONGODB_URI || 
  'mongodb+srv://Motopitshop:Motopitshop2026@motopit.c8x6ms0.mongodb.net/motopitshop?retryWrites=true&w=majority';

// Clean any accidental angle brackets if user put <Motopitshop2026> in env
const MONGODB_URI = RAW_URI.replace(/<([^>]+)>/g, '$1');
const DB_NAME = process.env.DB_NAME || 'motopitshop';

let client = null;
let dbInstance = null;
let connectionState = 'DISCONNECTED'; // 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR'
let lastConnectionError = null;
let connectPromise = null;

/**
 * Connect to MongoDB Atlas cluster
 */
async function connectMongo() {
  if (dbInstance && connectionState === 'CONNECTED') {
    return dbInstance;
  }

  if (connectPromise) {
    return connectPromise;
  }

  connectionState = 'CONNECTING';

  connectPromise = (async () => {
    try {
      console.log('[MONGODB] Initializing connection to cluster...');
      
      client = new MongoClient(MONGODB_URI, {
        serverSelectionTimeoutMS: 8000,
        connectTimeoutMS: 10000,
        maxPoolSize: 20,
        minPoolSize: 2
      });

      await client.connect();
      dbInstance = client.db(DB_NAME);
      connectionState = 'CONNECTED';
      lastConnectionError = null;

      console.log(`[MONGODB] Connected successfully to database: "${DB_NAME}"`);

      // Ensure indexes for all owner portal collections
      await initMongoIndexes(dbInstance);

      return dbInstance;
    } catch (err) {
      connectionState = 'ERROR';
      lastConnectionError = err.message;
      console.warn(`[MONGODB] Connection warning: ${err.message}`);
      if (err.message.includes('alert number 80') || err.message.includes('tlsv1 alert internal error')) {
        console.warn('[MONGODB] NOTE: MongoDB Atlas rejected the TLS connection (SSL Alert 80).');
        console.warn('[MONGODB] Please ensure your IP is added to the MongoDB Atlas Network Access whitelist (or allow 0.0.0.0/0).');
      }
      return null;
    } finally {
      connectPromise = null;
    }
  })();

  return connectPromise;
}

/**
 * Initialize all necessary indexes on MongoDB collections
 */
async function initMongoIndexes(db) {
  try {
    // 1. Products
    const products = db.collection('products');
    await products.createIndex({ sku: 1 }, { unique: true, sparse: true });
    await products.createIndex({ barcode: 1 }, { sparse: true });
    await products.createIndex({ slug: 1 }, { sparse: true });
    await products.createIndex({ category_id: 1 });
    await products.createIndex({ brand_id: 1 });
    await products.createIndex({ stock: 1 });

    // 2. Orders & POS Bills
    const orders = db.collection('orders');
    await orders.createIndex({ order_number: 1 }, { unique: true });
    await orders.createIndex({ created_at: -1 });
    await orders.createIndex({ order_type: 1 });
    await orders.createIndex({ status: 1 });
    await orders.createIndex({ customer_phone: 1 });

    // 3. Invoices
    const invoices = db.collection('invoices');
    await invoices.createIndex({ invoice_number: 1 }, { unique: true });
    await invoices.createIndex({ order_id: 1 });
    await invoices.createIndex({ created_at: -1 });

    // 4. Customers
    const customers = db.collection('customers');
    await customers.createIndex({ customer_code: 1 }, { unique: true, sparse: true });
    await customers.createIndex({ phone: 1 }, { sparse: true });
    await customers.createIndex({ email: 1 }, { sparse: true });

    // 5. Suppliers / Distributors
    const suppliers = db.collection('suppliers');
    await suppliers.createIndex({ name: 1 });

    // 6. Purchases
    const purchases = db.collection('purchases');
    await purchases.createIndex({ purchase_number: 1 }, { unique: true });
    await purchases.createIndex({ supplier_id: 1 });
    await purchases.createIndex({ purchase_date: -1 });

    // 7. Supplier Payments
    const supplierPayments = db.collection('supplier_payments');
    await supplierPayments.createIndex({ payment_number: 1 }, { unique: true });
    await supplierPayments.createIndex({ supplier_id: 1 });

    // 8. Expenses
    const expenses = db.collection('expenses');
    await expenses.createIndex({ expense_number: 1 }, { unique: true });
    await expenses.createIndex({ expense_date: -1 });
    await expenses.createIndex({ category: 1 });

    // 9. Credit Notes
    const creditNotes = db.collection('credit_notes');
    await creditNotes.createIndex({ credit_note_number: 1 }, { unique: true });
    await creditNotes.createIndex({ invoice_id: 1 });

    // 10. Inventory Transactions
    const invTxn = db.collection('inventory_transactions');
    await invTxn.createIndex({ product_id: 1 });
    await invTxn.createIndex({ created_at: -1 });

    // 11. Store Settings
    const settings = db.collection('store_settings');
    await settings.createIndex({ key: 1 }, { unique: true });

    // 12. Users
    const users = db.collection('users');
    await users.createIndex({ email: 1 }, { unique: true });

    // 13. Sessions
    const sessions = db.collection('sessions');
    await sessions.createIndex({ token: 1 }, { unique: true });
    await sessions.createIndex({ expires_at: 1 });

    // 14. Audit Logs
    const audit = db.collection('audit_logs');
    await audit.createIndex({ created_at: -1 });
    await audit.createIndex({ user_id: 1 });

    console.log('[MONGODB] Indexes verified for all collections.');
  } catch (err) {
    console.error('[MONGODB] Error creating indexes:', err.message);
  }
}

/**
 * Get the current MongoDB database instance
 */
function getDb() {
  return dbInstance;
}

/**
 * Get MongoDB connection status
 */
function getMongoStatus() {
  return {
    state: connectionState,
    connected: connectionState === 'CONNECTED' && dbInstance !== null,
    dbName: DB_NAME,
    uri: MONGODB_URI.replace(/:\/\/[^:]+:[^@]+@/, '://[CREDENTIALS]@'),
    error: lastConnectionError
  };
}

/**
 * Helper to safely sync an entity to MongoDB in the background
 */
async function syncToMongo(collectionName, filter, document, options = { upsert: true }) {
  if (!dbInstance || connectionState !== 'CONNECTED') {
    return false;
  }

  try {
    const col = dbInstance.collection(collectionName);
    const docToSave = { ...document, _synced_at: new Date() };
    await col.updateOne(filter, { $set: docToSave }, options);
    return true;
  } catch (err) {
    console.warn(`[MONGODB SYNC] Error syncing to "${collectionName}":`, err.message);
    return false;
  }
}

/**
 * Helper to sync a full SQLite record to MongoDB
 */
async function syncTableRecordToMongo(sqliteDb, tableName, recordId) {
  if (!dbInstance || connectionState !== 'CONNECTED' || !sqliteDb) return;
  try {
    const row = sqliteDb.prepare(`SELECT * FROM "${tableName}" WHERE id = ?`).get(recordId);
    if (!row) return;

    if (tableName === 'orders') {
      const items = sqliteDb.prepare('SELECT * FROM order_items WHERE order_id = ?').all(recordId);
      const doc = {
        ...row,
        shipping_address: typeof row.shipping_address_json === 'string' ? JSON.parse(row.shipping_address_json || '{}') : row.shipping_address_json,
        items,
        _synced_at: new Date()
      };
      await dbInstance.collection('orders').updateOne({ order_number: row.order_number }, { $set: doc }, { upsert: true });
    } else if (tableName === 'products') {
      const compBikes = sqliteDb.prepare('SELECT bike_id FROM bike_compatibility WHERE product_id = ?').all(recordId);
      const doc = {
        ...row,
        images: typeof row.images_json === 'string' ? JSON.parse(row.images_json || '[]') : row.images_json,
        variants: typeof row.variants_json === 'string' ? JSON.parse(row.variants_json || '[]') : row.variants_json,
        compatible_bike_ids: compBikes.map(b => b.bike_id),
        _synced_at: new Date()
      };
      await dbInstance.collection('products').updateOne({ sku: row.sku }, { $set: doc }, { upsert: true });
    } else if (tableName === 'purchases') {
      const items = sqliteDb.prepare('SELECT * FROM purchase_items WHERE purchase_id = ?').all(recordId);
      const doc = { ...row, items, _synced_at: new Date() };
      await dbInstance.collection('purchases').updateOne({ purchase_number: row.purchase_number }, { $set: doc }, { upsert: true });
    } else if (tableName === 'credit_notes') {
      const items = sqliteDb.prepare('SELECT * FROM credit_note_items WHERE credit_note_id = ?').all(recordId);
      const doc = { ...row, items, _synced_at: new Date() };
      await dbInstance.collection('credit_notes').updateOne({ credit_note_number: row.credit_note_number }, { $set: doc }, { upsert: true });
    } else {
      const uniqueField = tableName === 'invoices' ? 'invoice_number'
        : tableName === 'customers' ? 'customer_code'
        : tableName === 'expenses' ? 'expense_number'
        : tableName === 'supplier_payments' ? 'payment_number'
        : tableName === 'users' ? 'email'
        : 'id';
      const filter = {};
      filter[uniqueField] = row[uniqueField];
      await dbInstance.collection(tableName).updateOne(filter, { $set: { ...row, _synced_at: new Date() } }, { upsert: true });
    }
  } catch (e) {
    console.warn(`[SYNC WARNING] Failed syncing ${tableName} #${recordId}:`, e.message);
  }
}

async function syncSettingToMongo(key, value) {
  if (!dbInstance || connectionState !== 'CONNECTED') return;
  try {
    await dbInstance.collection('store_settings').updateOne({ key }, { $set: { key, value, _synced_at: new Date() } }, { upsert: true });
  } catch(e) {}
}

/**
 * Helper to delete an entity from MongoDB
 */
async function deleteFromMongo(collectionName, filter) {
  if (!dbInstance || connectionState !== 'CONNECTED') {
    return false;
  }

  try {
    const col = dbInstance.collection(collectionName);
    await col.deleteOne(filter);
    return true;
  } catch (err) {
    console.warn(`[MONGODB DELETE] Error deleting from "${collectionName}":`, err.message);
    return false;
  }
}

/**
 * Close MongoDB connection
 */
async function closeMongo() {
  if (client) {
    await client.close();
    client = null;
    dbInstance = null;
    connectionState = 'DISCONNECTED';
    console.log('[MONGODB] Connection closed.');
  }
}

module.exports = {
  connectMongo,
  getDb,
  getMongoStatus,
  syncToMongo,
  syncTableRecordToMongo,
  syncSettingToMongo,
  deleteFromMongo,
  closeMongo,
  MONGODB_URI,
  DB_NAME
};
