// database.js - Moto Pitshop Database Initialization & Data Layer
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');

// On Render (read-only filesystem), use /tmp for SQLite or fall back to in-memory
const DB_PATH = process.env.DB_PATH || 
  (process.env.NODE_ENV === 'production' 
    ? '/tmp/motopitshop.db'   // Render allows writes to /tmp
    : path.join(__dirname, 'motopitshop.db'));

let db;
try {
  db = new Database(DB_PATH);
} catch (err) {
  console.warn('[DB] Could not open SQLite at', DB_PATH, '- using in-memory DB:', err.message);
  db = new Database(':memory:');
}

// Enable Foreign Keys
db.exec('PRAGMA foreign_keys = ON;');

function hashPassword(password) {
  const salt = 'motopitshop_prod_salt_2026';
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function initDatabase() {
  // 1. Users Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT,
      role TEXT CHECK(role IN ('CUSTOMER', 'STAFF', 'ADMIN', 'OWNER')) NOT NULL DEFAULT 'CUSTOMER',
      status TEXT CHECK(status IN ('ACTIVE', 'SUSPENDED', 'DISABLED')) NOT NULL DEFAULT 'ACTIVE',
      permissions_json TEXT DEFAULT '{}',
      last_login_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // 2. Categories Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      icon TEXT,
      description TEXT,
      display_order INTEGER DEFAULT 0
    );
  `);

  // 3. Brands Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS brands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      logo TEXT,
      description TEXT
    );
  `);

  // 4. Bikes Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS bikes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand TEXT NOT NULL,
      model TEXT NOT NULL,
      year INTEGER NOT NULL,
      variant TEXT NOT NULL,
      engine_cc INTEGER,
      UNIQUE(brand, model, year, variant)
    );
  `);

  // 5. Suppliers Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      contact_person TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      gstin TEXT,
      status TEXT DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // 6. Products Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT UNIQUE NOT NULL,
      product_code TEXT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      brand_id INTEGER,
      category_id INTEGER,
      description TEXT,
      price INTEGER NOT NULL,
      old_price INTEGER,
      discount INTEGER,
      gst_rate REAL DEFAULT 18.0,
      hsn TEXT DEFAULT '8714',
      stock INTEGER NOT NULL DEFAULT 0,
      min_stock INTEGER NOT NULL DEFAULT 5,
      reserved_stock INTEGER NOT NULL DEFAULT 0,
      supplier_id INTEGER,
      warranty TEXT DEFAULT '6 Months Manufacturer',
      weight TEXT DEFAULT '0.5 kg',
      status TEXT DEFAULT 'ACTIVE',
      primary_image TEXT NOT NULL,
      images_json TEXT DEFAULT '[]',
      is_featured INTEGER DEFAULT 0,
      is_bestseller INTEGER DEFAULT 0,
      rating REAL DEFAULT 5.0,
      rating_count INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (brand_id) REFERENCES brands(id),
      FOREIGN KEY (category_id) REFERENCES categories(id),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    );
  `);

  // 7. Bike Compatibility Matrix Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS bike_compatibility (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      bike_id INTEGER NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (bike_id) REFERENCES bikes(id) ON DELETE CASCADE,
      UNIQUE(product_id, bike_id)
    );
  `);

  // 8. Carts & Cart Items
  db.exec(`
    CREATE TABLE IF NOT EXISTS carts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS cart_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cart_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      UNIQUE(cart_id, product_id)
    );
  `);

  // 9. Wishlists & Wishlist Items
  db.exec(`
    CREATE TABLE IF NOT EXISTS wishlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS wishlist_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wishlist_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      FOREIGN KEY (wishlist_id) REFERENCES wishlists(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      UNIQUE(wishlist_id, product_id)
    );
  `);

  // 10. Orders Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT UNIQUE NOT NULL,
      user_id INTEGER,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      shipping_address_json TEXT NOT NULL,
      status TEXT CHECK(status IN ('PLACED', 'CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURNED')) NOT NULL DEFAULT 'PLACED',
      payment_status TEXT CHECK(payment_status IN ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED', 'REFUNDED')) NOT NULL DEFAULT 'PENDING',
      payment_method TEXT DEFAULT 'UPI',
      payment_ref TEXT,
      payment_screenshot TEXT,
      subtotal INTEGER NOT NULL,
      tax_total INTEGER NOT NULL DEFAULT 0,
      cgst_total INTEGER NOT NULL DEFAULT 0,
      sgst_total INTEGER NOT NULL DEFAULT 0,
      igst_total INTEGER NOT NULL DEFAULT 0,
      discount_total INTEGER NOT NULL DEFAULT 0,
      grand_total INTEGER NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // 11. Order Items Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER,
      product_name TEXT NOT NULL,
      product_sku TEXT,
      price INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      hsn TEXT DEFAULT '8714',
      gst_rate REAL DEFAULT 18.0,
      tax_amount INTEGER DEFAULT 0,
      total INTEGER NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `);

  // 12. Payments Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      user_id INTEGER,
      provider TEXT DEFAULT 'RAZORPAY_SANDBOX',
      method TEXT NOT NULL,
      provider_order_id TEXT,
      provider_payment_id TEXT,
      amount INTEGER NOT NULL,
      currency TEXT DEFAULT 'INR',
      status TEXT CHECK(status IN ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED')) NOT NULL DEFAULT 'PENDING',
      failure_reason TEXT,
      transaction_ref TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );
  `);

  // 13. Invoices Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT UNIQUE NOT NULL,
      order_id INTEGER UNIQUE NOT NULL,
      user_id INTEGER,
      customer_name TEXT NOT NULL,
      customer_gstin TEXT,
      store_name TEXT DEFAULT 'MOTO PITSHOP',
      store_address TEXT DEFAULT '124 Racing Track Boulevard, Motor City, TN 600001',
      store_gstin TEXT DEFAULT '33AABCM1234F1Z9',
      taxable_value INTEGER NOT NULL,
      cgst INTEGER DEFAULT 0,
      sgst INTEGER DEFAULT 0,
      igst INTEGER DEFAULT 0,
      total_tax INTEGER NOT NULL,
      grand_total INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );
  `);

  // 14. Inventory Transactions Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      transaction_type TEXT CHECK(transaction_type IN ('PURCHASE', 'SALE', 'RETURN', 'ADJUSTMENT', 'DAMAGE', 'CANCELLATION')) NOT NULL,
      quantity_change INTEGER NOT NULL,
      previous_stock INTEGER NOT NULL,
      new_stock INTEGER NOT NULL,
      notes TEXT,
      user_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );
  `);

  // 15. Purchases Table & Purchase Items
  db.exec(`
    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_number TEXT UNIQUE NOT NULL,
      supplier_id INTEGER NOT NULL,
      supplier_invoice_no TEXT,
      total_cost INTEGER NOT NULL,
      gst_amount INTEGER DEFAULT 0,
      grand_total INTEGER NOT NULL,
      payment_status TEXT DEFAULT 'UNPAID',
      status TEXT DEFAULT 'RECEIVED',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    );
    CREATE TABLE IF NOT EXISTS purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      unit_cost INTEGER NOT NULL,
      total INTEGER NOT NULL,
      FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `);

  // 16. Support Tickets Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_number TEXT UNIQUE NOT NULL,
      user_id INTEGER,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      order_number TEXT,
      issue_type TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT DEFAULT 'OPEN',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // 17. Coupons Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      discount_type TEXT CHECK(discount_type IN ('PERCENTAGE', 'FIXED')) NOT NULL,
      discount_value INTEGER NOT NULL,
      min_order_amount INTEGER DEFAULT 0,
      max_discount INTEGER,
      valid_from TEXT,
      valid_until TEXT,
      usage_limit INTEGER DEFAULT 100,
      usage_count INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // 18. Reviews Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      user_id INTEGER,
      customer_name TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      comment TEXT NOT NULL,
      is_approved INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );
  `);

  // 19. Audit Logs Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      user_name TEXT NOT NULL,
      user_role TEXT NOT NULL,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT,
      ip_address TEXT DEFAULT '127.0.0.1',
      result TEXT DEFAULT 'SUCCESS',
      details_json TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // 20. Store Settings & Business Profile Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS store_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // 21. Persistent User Sessions Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // 22. Expenses Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_number TEXT UNIQUE NOT NULL,
      expense_date TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      amount INTEGER NOT NULL,
      payment_method TEXT DEFAULT 'CASH',
      vendor TEXT,
      reference_number TEXT,
      recorded_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (recorded_by) REFERENCES users(id)
    );
  `);

  // 23. Credit Notes Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS credit_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      credit_note_number TEXT UNIQUE NOT NULL,
      invoice_id INTEGER NOT NULL,
      reason TEXT NOT NULL,
      amount INTEGER NOT NULL,
      status TEXT DEFAULT 'ACTIVE',
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );
  `);

  runSchemaMigrations();
  seedInitialData();
}

function addColumnIfNotExists(table, column, colDef) {
  try {
    const pragma = db.prepare(`PRAGMA table_info("${table}")`).all();
    const exists = pragma.some(c => c.name === column);
    if (!exists) {
      db.exec(`ALTER TABLE "${table}" ADD COLUMN ${column} ${colDef};`);
    }
  } catch (err) {
    console.error(`Migration error adding ${column} to ${table}:`, err.message);
  }
}

function runSchemaMigrations() {
  // 1. Upgrade Products Table
  addColumnIfNotExists('products', 'barcode', 'TEXT');
  addColumnIfNotExists('products', 'purchase_price', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('products', 'variants_json', "TEXT DEFAULT '[]'");
  addColumnIfNotExists('products', 'is_archived', 'INTEGER DEFAULT 0');

  // 2. Upgrade Orders Table
  addColumnIfNotExists('orders', 'order_type', "TEXT DEFAULT 'ONLINE'");
  addColumnIfNotExists('orders', 'courier_name', 'TEXT');
  addColumnIfNotExists('orders', 'tracking_number', 'TEXT');
  addColumnIfNotExists('orders', 'invoice_id', 'INTEGER');
  addColumnIfNotExists('orders', 'pos_cashier_id', 'INTEGER');
  addColumnIfNotExists('orders', 'dispatch_date', 'TEXT');
  addColumnIfNotExists('orders', 'delivery_date', 'TEXT');

  // 3. Upgrade Purchases Table
  addColumnIfNotExists('purchases', 'purchase_date', "TEXT DEFAULT (date('now'))");
  addColumnIfNotExists('purchases', 'goods_received_date', 'TEXT');
  addColumnIfNotExists('purchases', 'taxable_value', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('purchases', 'discount', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('purchases', 'amount_paid', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('purchases', 'outstanding_balance', 'INTEGER DEFAULT 0');
  addColumnIfNotExists('purchases', 'payment_method', "TEXT DEFAULT 'BANK_TRANSFER'");
  addColumnIfNotExists('purchases', 'notes', 'TEXT');

  // 4. Upgrade Purchase Items Table
  addColumnIfNotExists('purchase_items', 'variant', 'TEXT');
  addColumnIfNotExists('purchase_items', 'gst_rate', 'REAL DEFAULT 18.0');
  addColumnIfNotExists('purchase_items', 'tax_amount', 'INTEGER DEFAULT 0');

  // 5. Upgrade Invoices Table
  addColumnIfNotExists('invoices', 'order_number', 'TEXT');
  addColumnIfNotExists('invoices', 'invoice_type', "TEXT DEFAULT 'ONLINE'");
  addColumnIfNotExists('invoices', 'customer_phone', 'TEXT');
  addColumnIfNotExists('invoices', 'place_of_supply', "TEXT DEFAULT 'Tamil Nadu (33)'");
  addColumnIfNotExists('invoices', 'state_code', "TEXT DEFAULT '33'");
  addColumnIfNotExists('invoices', 'payment_method', "TEXT DEFAULT 'UPI'");
  addColumnIfNotExists('invoices', 'payment_status', "TEXT DEFAULT 'PAID'");
  addColumnIfNotExists('invoices', 'notes', 'TEXT');

  // Backfill order_number in invoices if matching order exists
  try {
    db.exec("UPDATE invoices SET order_number = (SELECT order_number FROM orders WHERE orders.id = invoices.order_id) WHERE (order_number IS NULL OR order_number = '') AND order_id IS NOT NULL;");
  } catch (e) {}

  // 6. Upgrade Users Table
  addColumnIfNotExists('users', 'staff_role', "TEXT DEFAULT 'STAFF'");
  addColumnIfNotExists('users', 'shipping_address', 'TEXT');

  // 7. Customers Table (Unified for Counter & Online)
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      billing_address TEXT,
      shipping_address TEXT,
      gstin TEXT,
      customer_type TEXT DEFAULT 'RETAIL',
      notes TEXT,
      total_spend INTEGER DEFAULT 0,
      total_orders INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // 8. Expenses Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_number TEXT UNIQUE NOT NULL,
      expense_date TEXT NOT NULL DEFAULT (date('now')),
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      amount INTEGER NOT NULL,
      payment_method TEXT DEFAULT 'CASH',
      vendor TEXT,
      reference_no TEXT,
      receipt_url TEXT,
      recorded_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (recorded_by) REFERENCES users(id)
    );
  `);

  // 9. Supplier Payments Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS supplier_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_number TEXT UNIQUE NOT NULL,
      supplier_id INTEGER NOT NULL,
      purchase_id INTEGER,
      payment_date TEXT NOT NULL DEFAULT (date('now')),
      amount INTEGER NOT NULL,
      payment_method TEXT DEFAULT 'BANK_TRANSFER',
      reference_no TEXT,
      notes TEXT,
      recorded_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
      FOREIGN KEY (purchase_id) REFERENCES purchases(id)
    );
  `);

  // 10. Credit Notes Table (Returns & Refunds)
  db.exec(`
    CREATE TABLE IF NOT EXISTS credit_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      credit_note_number TEXT UNIQUE NOT NULL,
      order_id INTEGER,
      invoice_id INTEGER,
      customer_name TEXT NOT NULL,
      customer_phone TEXT,
      return_date TEXT NOT NULL DEFAULT (date('now')),
      subtotal INTEGER NOT NULL,
      tax_amount INTEGER NOT NULL DEFAULT 0,
      total_amount INTEGER NOT NULL,
      reason TEXT,
      stock_restored INTEGER DEFAULT 1,
      refund_status TEXT DEFAULT 'COMPLETED',
      refund_method TEXT DEFAULT 'CASH',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );
  `);

  // 11. Credit Note Items Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS credit_note_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      credit_note_id INTEGER NOT NULL,
      product_id INTEGER,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      price INTEGER NOT NULL,
      tax_amount INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL,
      condition TEXT DEFAULT 'GOOD',
      FOREIGN KEY (credit_note_id) REFERENCES credit_notes(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `);

  // Update existing products with standard barcodes and purchase prices if not set
  try {
    const prods = db.prepare('SELECT id, sku, price, barcode, purchase_price FROM products').all();
    const updateProd = db.prepare('UPDATE products SET barcode = ?, purchase_price = ? WHERE id = ?');
    prods.forEach(p => {
      let changed = false;
      let bc = p.barcode;
      let pp = p.purchase_price;
      if (!bc) {
        bc = '890' + String(100000000 + p.id * 12345).slice(-9);
        changed = true;
      }
      if (!pp || pp === 0) {
        pp = Math.round(p.price * 0.70); // 30% margin default
        changed = true;
      }
      if (changed) {
        updateProd.run(bc, pp, p.id);
      }
    });
  } catch (e) {
    console.error('Error updating product barcodes/prices:', e.message);
  }
}

function seedInitialData() {
  // Ensure development seed credentials match explicit user prompt requirements (Sec. 8 & 15)
  const ownerPass = hashPassword('MotoPit@2026!Owner');
  const adminPass = hashPassword('MotoPit@2026!Admin');
  const staffPass = hashPassword('MotoPit@2026!Staff');
  const custPass = hashPassword('MotoPit@2026!Customer');
  const cashierPass = hashPassword('MotoPit@2026!Cashier');
  const inventoryPass = hashPassword('MotoPit@2026!Inventory');

  const insertUser = db.prepare(`
    INSERT OR REPLACE INTO users (id, email, password_hash, full_name, phone, role, status, permissions_json, staff_role)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertUser.run(1, 'owner@motopitshop.com', ownerPass, 'Balaji MJ', '+91 9876543210', 'OWNER', 'ACTIVE', JSON.stringify({ all: true }), 'OWNER');
  insertUser.run(2, 'admin@motopitshop.com', adminPass, 'Moto Pitshop Administrator', '+91 9876543211', 'ADMIN', 'ACTIVE', JSON.stringify({ all: true }), 'MANAGER');
  insertUser.run(3, 'staff@motopitshop.com', staffPass, 'Moto Pitshop Operations', '+91 9876543212', 'STAFF', 'ACTIVE', JSON.stringify({ orders: 'READ_WRITE', inventory: 'READ_WRITE', customers: 'READ' }), 'STAFF');
  insertUser.run(4, 'customer@motopitshop.com', custPass, 'Demo Customer', '+91 9876543213', 'CUSTOMER', 'ACTIVE', '{}', 'CUSTOMER');
  insertUser.run(5, 'cashier@motopitshop.com', cashierPass, 'Counter Cashier', '+91 9876543214', 'STAFF', 'ACTIVE', JSON.stringify({ pos: true, billing: true, customers: true }), 'CASHIER');
  insertUser.run(6, 'inventory@motopitshop.com', inventoryPass, 'Warehouse Manager', '+91 9876543215', 'STAFF', 'ACTIVE', JSON.stringify({ products: true, stock: true, purchases: true }), 'INVENTORY');

  // Seed Categories
  const catCount = db.prepare('SELECT COUNT(*) as count FROM categories').get().count;
  if (catCount === 0) {
    const insertCat = db.prepare(`INSERT INTO categories (slug, name, icon, description, display_order) VALUES (?, ?, ?, ?, ?)`);
    const cats = [
      ['helmets', 'Helmets', '🪖', 'Full-face, modular and off-road certified helmets', 1],
      ['gear', 'Riding Gear', '🧥', 'Jackets, gloves, boots and body armor', 2],
      ['engine', 'Engine Parts', '⚙️', 'Pistons, valves, cylinder heads & gaskets', 3],
      ['brake', 'Brake Parts', '🛑', 'Brake pads, discs, master cylinders & lines', 4],
      ['clutch', 'Clutch Parts', '⛓️', 'Clutch plates, springs, cables & assemblies', 5],
      ['chain-sprocket', 'Chain & Sprocket', '🔗', 'Drive chains, front & rear sprockets kits', 6],
      ['filters', 'Filters & Fluids', '🛢️', 'Oil filters, air filters, engine oils & coolants', 7],
      ['electrical', 'Electrical & LED', '⚡', 'Batteries, spark plugs, headlamps & turn signals', 8],
      ['suspension', 'Suspension & Steering', '🏍️', 'Front forks, rear shocks, seals & bearings', 9],
      ['accessories', 'Accessories', '🎒', 'Mobile holders, luggage bags, covers & guards', 10],
      ['tools', 'Tools & Maintenance', '🔧', 'Paddock stands, chain lube, torque wrenches', 11]
    ];
    cats.forEach(c => insertCat.run(...c));
  }

  // Seed Brands
  const brandCount = db.prepare('SELECT COUNT(*) as count FROM brands').get().count;
  if (brandCount === 0) {
    const insertBrand = db.prepare(`INSERT INTO brands (slug, name, logo, description) VALUES (?, ?, ?, ?)`);
    const brands = [
      ['shoei', 'Shoei', 'brands/shoei.svg', 'Japanese premier helmet technology'],
      ['brembo', 'Brembo', 'brands/brembo.svg', 'World-leading high performance braking systems'],
      ['akrapovic', 'Akrapovič', 'brands/akrapovic.svg', 'Premium titanium exhaust systems'],
      ['dainese', 'Dainese', 'brands/dainese.svg', 'Italian safety equipment & gear'],
      ['agv', 'AGV', 'brands/agv.svg', 'Championship winning helmets'],
      ['alpinestars', 'Alpinestars', 'brands/alpinestars.svg', 'Motorsports performance apparel'],
      ['arai', 'Arai', 'brands/arai.svg', 'Handcrafted Japanese motorcycle safety helmets'],
      ['garmin', 'Garmin', 'brands/garmin.svg', 'GPS navigation and smart sensors'],
      ['moto-pitshop-oem', 'Moto Pitshop Genuine Parts', '', 'OEM certified motorcycle spare parts']
    ];
    brands.forEach(b => insertBrand.run(...b));
  }

  // Seed Bike Models
  const bikeCount = db.prepare('SELECT COUNT(*) as count FROM bikes').get().count;
  if (bikeCount === 0) {
    const insertBike = db.prepare(`INSERT INTO bikes (brand, model, year, variant, engine_cc) VALUES (?, ?, ?, ?, ?)`);
    const bikes = [
      ['Yamaha', 'R15', 2023, 'V4', 155],
      ['Yamaha', 'R15', 2022, 'V3', 155],
      ['Yamaha', 'MT-15', 2023, 'V2', 155],
      ['Royal Enfield', 'Classic 350', 2023, 'Reborn', 349],
      ['Royal Enfield', 'Himalayan', 2023, '411', 411],
      ['KTM', 'Duke 390', 2023, 'BS6', 373],
      ['KTM', 'RC 390', 2023, 'BS6', 373],
      ['TVS', 'Apache RTR 200', 2023, '4V', 197],
      ['Bajaj', 'Pulsar NS200', 2023, 'BS6', 199],
      ['Honda', 'CBR 250R', 2022, 'ABS', 249],
      ['Kawasaki', 'Ninja 300', 2023, 'BS6', 296],
      ['Triumph', 'Speed 400', 2023, 'Standard', 398],
      ['BMW', 'G310R', 2023, 'BS6', 313]
    ];
    bikes.forEach(b => insertBike.run(...b));
  }

  // Seed Suppliers
  const suppCount = db.prepare('SELECT COUNT(*) as count FROM suppliers').get().count;
  if (suppCount === 0) {
    const insertSupp = db.prepare(`INSERT INTO suppliers (name, contact_person, email, phone, address, gstin) VALUES (?, ?, ?, ?, ?, ?)`);
    insertSupp.run('Apex Moto Supplies Ltd', 'Rajesh Sharma', 'sales@apexmoto.in', '+91 9811223344', 'Plot 42, Industrial Zone, Chennai, TN', '33AAPCA9876E1Z2');
    insertSupp.run('Performance Gears India', 'Vikram Singh', 'supply@performancegears.com', '+91 9722334455', 'Sector 18, Gurugram, HR', '06AAACP4321D1Z8');
  }

  // Note: Catalog Products, Orders, Purchases, Expenses start 100% clean for Owner Portal entry
  // Seed Store Settings & Business Profile (Sec. 12 & 14 Requirements)
  const insertSetting = db.prepare(`INSERT OR REPLACE INTO store_settings (key, value) VALUES (?, ?)`);
  insertSetting.run('BUSINESS_NAME', 'MOTO PITSHOP');
  insertSetting.run('STORE_NAME', 'MOTO PITSHOP');
  insertSetting.run('STORE_LEGAL_NAME', 'Moto Pitshop Retail Pvt Ltd');
  insertSetting.run('BUSINESS_OWNER', 'Balaji MJ');
  insertSetting.run('TAGLINE', 'Your Ride. Your Parts. Your Pitstop.');
  insertSetting.run('STORE_EMAIL', 'owner@motopitshop.com');
  insertSetting.run('STORE_PHONE', '+91 98765 43210');
  insertSetting.run('STORE_ADDRESS', '124 Racing Track Boulevard, Motor City, Chennai, TN 600001');
  insertSetting.run('STORE_GSTIN', '33AABCM1234F1Z9');
  insertSetting.run('STORE_STATE', 'Tamil Nadu');
  insertSetting.run('STORE_STATE_CODE', '33');
  insertSetting.run('CURRENCY', 'INR');
  insertSetting.run('CURRENCY_SYMBOL', '₹');
  insertSetting.run('COUNTRY', 'India');
  insertSetting.run('INVOICE_PREFIX', 'INV-');
  insertSetting.run('POS_INVOICE_PREFIX', 'POS-');
  insertSetting.run('PURCHASE_PREFIX', 'PUR-');
  insertSetting.run('ORDER_PREFIX', 'MPS-ORD-');
  insertSetting.run('TAX_INCLUSIVE', 'true');
  insertSetting.run('LOW_STOCK_THRESHOLD', '5');

  // Seed Sample Coupon
  const couponCount = db.prepare('SELECT COUNT(*) as count FROM coupons').get().count;
  if (couponCount === 0) {
    const insertCpn = db.prepare(`INSERT INTO coupons (code, discount_type, discount_value, min_order_amount, max_discount, is_active) VALUES (?, ?, ?, ?, ?, ?)`);
    insertCpn.run('PITSTOP10', 'PERCENTAGE', 10, 1000, 500, 1);
    insertCpn.run('RIDER500', 'FIXED', 500, 3000, 500, 1);
  }

  // Catalog, Orders & Purchases ready for new owner entries
}

module.exports = {
  db,
  initDatabase,
  hashPassword
};

