// database.js - Moto Pitshop Database Initialization & Data Layer
const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'motopitshop.db');
const db = new DatabaseSync(DB_PATH);

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
  addColumnIfNotExists('invoices', 'invoice_type', "TEXT DEFAULT 'ONLINE'");
  addColumnIfNotExists('invoices', 'customer_phone', 'TEXT');
  addColumnIfNotExists('invoices', 'place_of_supply', "TEXT DEFAULT 'Tamil Nadu (33)'");
  addColumnIfNotExists('invoices', 'state_code', "TEXT DEFAULT '33'");
  addColumnIfNotExists('invoices', 'payment_method', "TEXT DEFAULT 'UPI'");
  addColumnIfNotExists('invoices', 'payment_status', "TEXT DEFAULT 'PAID'");
  addColumnIfNotExists('invoices', 'notes', 'TEXT');

  // 6. Upgrade Users Table
  addColumnIfNotExists('users', 'staff_role', "TEXT DEFAULT 'STAFF'");

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

  // Seed Products
  const prodCount = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
  if (prodCount === 0) {
    const insertProd = db.prepare(`
      INSERT INTO products (
        sku, product_code, name, slug, brand_id, category_id, description,
        price, old_price, discount, gst_rate, hsn, stock, min_stock, supplier_id,
        primary_image, images_json, is_featured, is_bestseller, rating, rating_count,
        barcode, purchase_price
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const prods = [
      [
        'MPS-HLM-001', 'SH-R15-PRO', 'Shoei Pro Racing Helmet – Full Face', 'shoei-pro-racing-helmet', 1, 1,
        'CE/DOT certified aerodynamic full-face race helmet with dual visor, anti-fog pinlock, and emergency quick release system.',
        8999, 12999, 31, 18.0, '6506', 25, 5, 2,
        'hero2.png', JSON.stringify(['hero2.png', 'hero1.png']), 1, 1, 4.9, 248,
        '890123456001', 6200
      ],
      [
        'MPS-GLV-002', 'MPS-GLV-CB', 'Carbon Fiber Racing Gloves', 'carbon-fiber-racing-gloves', 6, 2,
        'Full-leather riding gloves with real carbon fiber knuckle protection, touchscreen compatibility, and reinforced palm slider.',
        2499, 3499, 28, 18.0, '6216', 40, 10, 2,
        'gloves.png', JSON.stringify(['gloves.png']), 1, 1, 4.8, 184,
        '890123456002', 1600
      ],
      [
        'MPS-EXH-003', 'AKR-SLP-TI', 'Akrapovič Slip-On Titanium Exhaust System', 'akrapovic-titanium-exhaust', 3, 3,
        'Ultra-lightweight titanium slip-on exhaust tuned for aggressive exhaust note, enhanced horsepower, and torque gain across mid-range RPMs.',
        34999, 42000, 17, 28.0, '8714', 8, 2, 1,
        'exhaust.png', JSON.stringify(['exhaust.png']), 1, 0, 5.0, 96,
        '890123456003', 24500
      ],
      [
        'MPS-JKT-004', 'DNS-JKT-STR', 'Dainese Stealth Waterproof Armored Jacket', 'dainese-stealth-jacket', 4, 2,
        'All-weather 600D Cordura textile jacket with removable thermal liner, CE Level 2 shoulder/elbow armor, and reflective striping.',
        12499, 15999, 22, 18.0, '6201', 15, 3, 2,
        'jacket.png', JSON.stringify(['jacket.png']), 1, 1, 4.9, 132,
        '890123456004', 8500
      ],
      [
        'MPS-BRK-005', 'BRM-PAD-SYN', 'Brembo Sintered High-Performance Front Brake Pads', 'brembo-sintered-brake-pads', 2, 4,
        'Premium sintered compound front brake pads offering high friction coefficient, zero fade at extreme temperatures, and immediate bite.',
        2199, 2799, 21, 18.0, '8714', 50, 10, 1,
        'hero3.png', JSON.stringify(['hero3.png']), 1, 1, 4.9, 310,
        '890123456005', 1450
      ],
      [
        'MPS-CHN-006', 'MPS-520-XRG', 'Heavy Duty Gold X-Ring Drive Chain & Sprocket Kit', 'heavy-duty-gold-xring-chain-kit', 9, 6,
        'High tensile steel front and rear sprocket set paired with Japanese technology 520 pitch Gold X-Ring sealed chain for maximum durability.',
        4299, 5299, 19, 18.0, '8714', 30, 8, 1,
        'hero1.png', JSON.stringify(['hero1.png']), 0, 1, 4.8, 175,
        '890123456006', 2900
      ],
      [
        'MPS-FLT-007', 'MPS-KN-AIR', 'High-Flow Washable Performance Air Filter', 'high-flow-washable-air-filter', 9, 7,
        'Multi-layer cotton gauze high-flow air filter delivering up to 50% more airflow for crisp throttle response. Fully washable and reusable.',
        1899, 2399, 21, 18.0, '8421', 45, 10, 1,
        'hero3.png', JSON.stringify(['hero3.png']), 0, 0, 4.7, 89,
        '890123456007', 1200
      ],
      [
        'MPS-ACC-008', 'GAR-MNT-VIV', 'Vibration-Dampened CNC Alloy Mobile Mount', 'cnc-alloy-mobile-mount', 8, 10,
        'Aerospace-grade CNC aluminum mobile phone holder with built-in silicone vibration dampeners to protect smartphone camera OIS.',
        1499, 1999, 25, 18.0, '8714', 60, 15, 2,
        'hero1.png', JSON.stringify(['hero1.png']), 1, 1, 4.9, 412,
        '890123456008', 950
      ]
    ];

    prods.forEach(p => insertProd.run(...p));

    // Seed Compatibility for Products
    const insertComp = db.prepare(`INSERT INTO bike_compatibility (product_id, bike_id) VALUES (?, ?)`);
    [1, 2, 4, 8].forEach(pid => {
      for (let bid = 1; bid <= 13; bid++) {
        insertComp.run(pid, bid);
      }
    });
    [3, 5, 6, 7].forEach(pid => {
      [1, 2, 3, 6, 7, 8, 9].forEach(bid => {
        try { insertComp.run(pid, bid); } catch(e){}
      });
    });
  }

  // Seed Customers
  const custCount = db.prepare('SELECT COUNT(*) as count FROM customers').get().count;
  if (custCount === 0) {
    const insertCust = db.prepare(`
      INSERT INTO customers (customer_code, name, phone, email, billing_address, shipping_address, gstin, customer_type, notes, total_spend, total_orders)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertCust.run('MPS-CUST-1001', 'Walk-in Counter Customer', '+91 98000 00000', 'walkin@motopitshop.com', 'Store Counter Sale, Chennai', 'Store Counter Sale', '', 'COUNTER', 'General retail walk-in customer', 0, 0);
    insertCust.run('MPS-CUST-1002', 'Karthik Raja', '+91 98401 23456', 'karthik.r@example.com', '12, Anna Nagar West, Chennai, TN 600040', '12, Anna Nagar West, Chennai, TN 600040', '', 'RETAIL', 'Yamaha R15 V4 rider', 4999, 1);
    insertCust.run('MPS-CUST-1003', 'SpeedTrack Racing Academy', '+91 99401 98765', 'contact@speedtrack.in', 'Irungattukottai Race Track, Sriperumbudur, TN 602105', 'Irungattukottai Race Track, Sriperumbudur, TN 602105', '33AAACS1234F1Z1', 'B2B', 'Track day academy & racing club', 42000, 2);
    insertCust.run('MPS-CUST-1004', 'Suresh Kumar', '+91 97890 12345', 'suresh.k@gmail.com', '45 Gandhi Road, Velachery, Chennai, TN 600042', '45 Gandhi Road, Velachery, Chennai, TN 600042', '', 'RETAIL', 'KTM Duke 390 rider', 8999, 1);
  }

  // Seed Expenses
  const expCount = db.prepare('SELECT COUNT(*) as count FROM expenses').get().count;
  if (expCount === 0) {
    const insertExp = db.prepare(`
      INSERT INTO expenses (expense_number, expense_date, category, description, amount, payment_method, vendor, reference_number, recorded_by)
      VALUES (?, date('now', '-5 days'), ?, ?, ?, ?, ?, ?, 1)
    `);
    insertExp.run('EXP-2026-001', 'Shop Rent', 'Monthly showroom and workshop rental fee', 35000, 'BANK_TRANSFER', 'Chennai Commercial Real Estate', 'NEFT-889911');
    insertExp.run('EXP-2026-002', 'Electricity', 'TNEB commercial electricity bill for showroom lighting & AC', 4850, 'UPI', 'TNEB Chennai', 'UPI-992200');
    insertExp.run('EXP-2026-003', 'Internet and Telephone', 'Airtel Fiber high speed broadband & VoIP line', 1499, 'UPI', 'Airtel Business', 'AIR-445566');
    insertExp.run('EXP-2026-004', 'Packaging', 'Bubble wrap, corrugated shipping boxes & branded tape', 3200, 'CASH', 'PackPro Supplies', 'CASH-REC-102');
  }

  // Seed Supplier Purchases & Initial Inventory Transactions
  const purCount = db.prepare('SELECT COUNT(*) as count FROM purchases').get().count;
  if (purCount === 0) {
    const insertPur = db.prepare(`
      INSERT INTO purchases (
        purchase_number, supplier_id, supplier_invoice_no, purchase_date, goods_received_date,
        total_cost, gst_amount, grand_total, amount_paid, outstanding_balance, payment_status, status, payment_method, notes
      ) VALUES (?, ?, ?, date('now', '-10 days'), date('now', '-9 days'), ?, ?, ?, ?, ?, ?, 'RECEIVED', 'BANK_TRANSFER', ?)
    `);

    // Purchase 1 from Apex Moto Supplies
    const p1 = insertPur.run('PUR-2026-001', 1, 'APX-INV-9901', 50000, 9000, 59000, 39000, 20000, 'PARTIAL', 'Initial stock replenishment of Akrapovic exhausts and Brembo pads');
    const p1Id = p1.lastInsertRowid;

    db.prepare(`
      INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_cost, total, gst_rate, tax_amount)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(p1Id, 3, 2, 24500, 49000, 28.0, 13720);

    // Supplier Payment for Purchase 1
    db.prepare(`
      INSERT INTO supplier_payments (payment_number, supplier_id, purchase_id, payment_date, amount, payment_method, reference_no, notes, recorded_by)
      VALUES (?, 1, ?, date('now', '-8 days'), 39000, 'BANK_TRANSFER', 'NEFT-APX-8822', 'Partial invoice advance payment', 1)
    `).run('SPAY-2026-001', p1Id);

    // Initial Inventory Transaction Log
    db.prepare(`
      INSERT INTO inventory_transactions (product_id, transaction_type, quantity_change, previous_stock, new_stock, notes, user_id)
      VALUES (3, 'PURCHASE', 2, 6, 8, 'Purchase entry #PUR-2026-001 received', 1)
    `).run();
  }

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

  // Seed Sample Order if not exists
  const orderCount = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
  if (orderCount === 0) {
    const insertOrd = db.prepare(`
      INSERT INTO orders (order_number, user_id, customer_name, customer_email, customer_phone, shipping_address_json, status, payment_status, payment_method, payment_ref, subtotal, tax_total, cgst_total, sgst_total, igst_total, grand_total, order_type)
      VALUES (?, 4, 'Demo Customer', 'customer@motopitshop.com', '+91 9876543213', '{"address":"Flat 302, Phase 1, Dynamic City, Bangalore"}', 'CONFIRMED', 'SUCCESS', 'UPI', 'REF-987654', 4236, 763, 381, 381, 0, 4999, 'ONLINE')
    `);
    const ordRes = insertOrd.run('MPS-ORD-100888');
    const ordId = ordRes.lastInsertRowid;

    db.prepare(`
      INSERT INTO order_items (order_id, product_id, product_name, product_sku, price, quantity, hsn, gst_rate, tax_amount, total)
      VALUES (?, 1, 'Shoei Pro Racing Helmet – Full Face', 'MPS-HLM-001', 4999, 1, '6506', 18.0, 763, 4999)
    `).run(ordId);

    db.prepare(`
      INSERT INTO invoices (invoice_number, order_id, user_id, customer_name, customer_phone, taxable_value, cgst, sgst, igst, total_tax, grand_total, invoice_type)
      VALUES ('INV-100888', ?, 4, 'Demo Customer', '+91 9876543213', 4236, 381, 381, 0, 763, 4999, 'ONLINE')
    `).run(ordId);
  }
}

module.exports = {
  db,
  initDatabase,
  hashPassword
};

