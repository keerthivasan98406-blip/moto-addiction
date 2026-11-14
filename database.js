// database.js - Moto Pitshop MongoDB Data Layer (No SQLite)
const crypto = require('crypto');
const { getDb } = require('./mongodb.js');

function hashPassword(password) {
  const salt = 'motopitshop_prod_salt_2026';
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

async function getNextId(collectionName) {
  const db = getDb();
  if (!db) throw new Error('MongoDB not connected');
  const result = await db.collection('counters').findOneAndUpdate(
    { _id: collectionName },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  return result.seq;
}

async function initDatabase() {
  const db = getDb();
  if (!db) { console.warn('[DB] MongoDB not connected yet, skipping seed'); return; }
  console.log('[DB] Initializing MongoDB collections and seed data...');

  await db.collection('users').createIndex({ email: 1 }, { unique: true });
  await db.collection('products').createIndex({ sku: 1 }, { unique: true, sparse: true });
  await db.collection('orders').createIndex({ order_number: 1 }, { unique: true });
  await db.collection('invoices').createIndex({ invoice_number: 1 }, { unique: true });
  await db.collection('sessions').createIndex({ token: 1 }, { unique: true });
  await db.collection('store_settings').createIndex({ key: 1 }, { unique: true });

  const userCount = await db.collection('users').countDocuments();
  if (userCount === 0) {
    const now = new Date().toISOString();
    await db.collection('users').insertMany([
      { id: 1, email: 'owner@motopitshop.com', password_hash: hashPassword('MotoPit@2026!Owner'), full_name: 'Balaji MJ', phone: '+91 9876543210', role: 'OWNER', status: 'ACTIVE', permissions_json: JSON.stringify({ all: true }), staff_role: 'OWNER', created_at: now, updated_at: now },
      { id: 2, email: 'admin@motopitshop.com', password_hash: hashPassword('MotoPit@2026!Admin'), full_name: 'Moto Pitshop Administrator', phone: '+91 9876543211', role: 'ADMIN', status: 'ACTIVE', permissions_json: JSON.stringify({ all: true }), staff_role: 'MANAGER', created_at: now, updated_at: now },
      { id: 3, email: 'staff@motopitshop.com', password_hash: hashPassword('MotoPit@2026!Staff'), full_name: 'Moto Pitshop Operations', phone: '+91 9876543212', role: 'STAFF', status: 'ACTIVE', permissions_json: JSON.stringify({ orders: 'READ_WRITE', inventory: 'READ_WRITE', customers: 'READ' }), staff_role: 'STAFF', created_at: now, updated_at: now },
      { id: 4, email: 'customer@motopitshop.com', password_hash: hashPassword('MotoPit@2026!Customer'), full_name: 'Demo Customer', phone: '+91 9876543213', role: 'CUSTOMER', status: 'ACTIVE', permissions_json: '{}', staff_role: 'CUSTOMER', created_at: now, updated_at: now },
      { id: 5, email: 'cashier@motopitshop.com', password_hash: hashPassword('MotoPit@2026!Cashier'), full_name: 'Counter Cashier', phone: '+91 9876543214', role: 'STAFF', status: 'ACTIVE', permissions_json: JSON.stringify({ pos: true, billing: true, customers: true }), staff_role: 'CASHIER', created_at: now, updated_at: now },
      { id: 6, email: 'inventory@motopitshop.com', password_hash: hashPassword('MotoPit@2026!Inventory'), full_name: 'Warehouse Manager', phone: '+91 9876543215', role: 'STAFF', status: 'ACTIVE', permissions_json: JSON.stringify({ products: true, stock: true, purchases: true }), staff_role: 'INVENTORY', created_at: now, updated_at: now }
    ]);
    await db.collection('counters').updateOne({ _id: 'users' }, { $set: { seq: 6 } }, { upsert: true });
    console.log('[DB] Seeded 6 users');
  }

  const catCount = await db.collection('categories').countDocuments();
  if (catCount === 0) {
    const cats = [
      { slug: 'helmets', name: 'Helmets', icon: 'Helmets', description: 'Full-face, modular and off-road certified helmets', display_order: 1 },
      { slug: 'gear', name: 'Riding Gear', icon: 'Gear', description: 'Jackets, gloves, boots and body armor', display_order: 2 },
      { slug: 'engine', name: 'Engine Parts', icon: 'Engine', description: 'Pistons, valves, cylinder heads & gaskets', display_order: 3 },
      { slug: 'brake', name: 'Brake Parts', icon: 'Brake', description: 'Brake pads, discs, master cylinders & lines', display_order: 4 },
      { slug: 'clutch', name: 'Clutch Parts', icon: 'Clutch', description: 'Clutch plates, springs, cables & assemblies', display_order: 5 },
      { slug: 'chain-sprocket', name: 'Chain & Sprocket', icon: 'Chain', description: 'Drive chains, front & rear sprockets kits', display_order: 6 },
      { slug: 'filters', name: 'Filters & Fluids', icon: 'Filters', description: 'Oil filters, air filters, engine oils & coolants', display_order: 7 },
      { slug: 'electrical', name: 'Electrical & LED', icon: 'Electrical', description: 'Batteries, spark plugs, headlamps & turn signals', display_order: 8 },
      { slug: 'suspension', name: 'Suspension & Steering', icon: 'Suspension', description: 'Front forks, rear shocks, seals & bearings', display_order: 9 },
      { slug: 'accessories', name: 'Accessories', icon: 'Accessories', description: 'Mobile holders, luggage bags, covers & guards', display_order: 10 },
      { slug: 'tools', name: 'Tools & Maintenance', icon: 'Tools', description: 'Paddock stands, chain lube, torque wrenches', display_order: 11 }
    ];
    let catDocs = []; for (let i = 0; i < cats.length; i++) catDocs.push({ id: i + 1, ...cats[i], created_at: new Date().toISOString() });
    await db.collection('categories').insertMany(catDocs);
    await db.collection('counters').updateOne({ _id: 'categories' }, { $set: { seq: cats.length } }, { upsert: true });
    console.log('[DB] Seeded 11 categories');
  }

  const brandCount = await db.collection('brands').countDocuments();
  if (brandCount === 0) {
    const brands = [
      { slug: 'shoei', name: 'Shoei', logo: 'brands/shoei.svg', description: 'Japanese premier helmet technology' },
      { slug: 'brembo', name: 'Brembo', logo: 'brands/brembo.svg', description: 'World-leading high performance braking systems' },
      { slug: 'akrapovic', name: 'Akrapovic', logo: 'brands/akrapovic.svg', description: 'Premium titanium exhaust systems' },
      { slug: 'dainese', name: 'Dainese', logo: 'brands/dainese.svg', description: 'Italian safety equipment & gear' },
      { slug: 'agv', name: 'AGV', logo: 'brands/agv.svg', description: 'Championship winning helmets' },
      { slug: 'alpinestars', name: 'Alpinestars', logo: 'brands/alpinestars.svg', description: 'Motorsports performance apparel' },
      { slug: 'arai', name: 'Arai', logo: 'brands/arai.svg', description: 'Handcrafted Japanese motorcycle safety helmets' },
      { slug: 'garmin', name: 'Garmin', logo: 'brands/garmin.svg', description: 'GPS navigation and smart sensors' },
      { slug: 'moto-pitshop-oem', name: 'Moto Pitshop Genuine Parts', logo: '', description: 'OEM certified motorcycle spare parts' }
    ];
    let brandDocs = []; for (let i = 0; i < brands.length; i++) brandDocs.push({ id: i + 1, ...brands[i], created_at: new Date().toISOString() });
    await db.collection('brands').insertMany(brandDocs);
    await db.collection('counters').updateOne({ _id: 'brands' }, { $set: { seq: brands.length } }, { upsert: true });
    console.log('[DB] Seeded 9 brands');
  }

  const bikeCount = await db.collection('bikes').countDocuments();
  if (bikeCount === 0) {
    const bikes = [
      { brand: 'Yamaha', model: 'R15', year: 2023, variant: 'V4', engine_cc: 155 },
      { brand: 'Yamaha', model: 'R15', year: 2022, variant: 'V3', engine_cc: 155 },
      { brand: 'Yamaha', model: 'MT-15', year: 2023, variant: 'V2', engine_cc: 155 },
      { brand: 'Royal Enfield', model: 'Classic 350', year: 2023, variant: 'Reborn', engine_cc: 349 },
      { brand: 'Royal Enfield', model: 'Himalayan', year: 2023, variant: '411', engine_cc: 411 },
      { brand: 'KTM', model: 'Duke 390', year: 2023, variant: 'BS6', engine_cc: 373 },
      { brand: 'KTM', model: 'RC 390', year: 2023, variant: 'BS6', engine_cc: 373 },
      { brand: 'TVS', model: 'Apache RTR 200', year: 2023, variant: '4V', engine_cc: 197 },
      { brand: 'Bajaj', model: 'Pulsar NS200', year: 2023, variant: 'BS6', engine_cc: 199 },
      { brand: 'Honda', model: 'CBR 250R', year: 2022, variant: 'ABS', engine_cc: 249 },
      { brand: 'Kawasaki', model: 'Ninja 300', year: 2023, variant: 'BS6', engine_cc: 296 },
      { brand: 'Triumph', model: 'Speed 400', year: 2023, variant: 'Standard', engine_cc: 398 },
      { brand: 'BMW', model: 'G310R', year: 2023, variant: 'BS6', engine_cc: 313 }
    ];
    let bikeDocs = []; for (let i = 0; i < bikes.length; i++) bikeDocs.push({ id: i + 1, ...bikes[i], created_at: new Date().toISOString() });
    await db.collection('bikes').insertMany(bikeDocs);
    await db.collection('counters').updateOne({ _id: 'bikes' }, { $set: { seq: bikes.length } }, { upsert: true });
    console.log('[DB] Seeded 13 bikes');
  }

  const suppCount = await db.collection('suppliers').countDocuments();
  if (suppCount === 0) {
    await db.collection('suppliers').insertMany([
      { id: 1, name: 'Apex Moto Supplies Ltd', contact_person: 'Rajesh Sharma', email: 'sales@apexmoto.in', phone: '+91 9811223344', address: 'Plot 42, Industrial Zone, Chennai, TN', gstin: '33AAPCA9876E1Z2', status: 'ACTIVE', created_at: new Date().toISOString() },
      { id: 2, name: 'Performance Gears India', contact_person: 'Vikram Singh', email: 'supply@performancegears.com', phone: '+91 9722334455', address: 'Sector 18, Gurugram, HR', gstin: '06AAACP4321D1Z8', status: 'ACTIVE', created_at: new Date().toISOString() }
    ]);
    await db.collection('counters').updateOne({ _id: 'suppliers' }, { $set: { seq: 2 } }, { upsert: true });
    console.log('[DB] Seeded 2 suppliers');
  }

  const settingCount = await db.collection('store_settings').countDocuments();
  if (settingCount === 0) {
    const settings = [
      { key: 'BUSINESS_NAME', value: 'MOTO PITSHOP' }, { key: 'STORE_NAME', value: 'MOTO PITSHOP' },
      { key: 'STORE_LEGAL_NAME', value: 'Moto Pitshop Retail Pvt Ltd' }, { key: 'BUSINESS_OWNER', value: 'Balaji MJ' },
      { key: 'TAGLINE', value: 'Your Ride. Your Parts. Your Pitstop.' }, { key: 'STORE_EMAIL', value: 'owner@motopitshop.com' },
      { key: 'STORE_PHONE', value: '+91 98765 43210' }, { key: 'STORE_ADDRESS', value: '124 Racing Track Boulevard, Motor City, Chennai, TN 600001' },
      { key: 'STORE_GSTIN', value: '33AABCM1234F1Z9' }, { key: 'STORE_STATE', value: 'Tamil Nadu' },
      { key: 'STORE_STATE_CODE', value: '33' }, { key: 'CURRENCY', value: 'INR' },
      { key: 'CURRENCY_SYMBOL', value: 'Rs' }, { key: 'COUNTRY', value: 'India' },
      { key: 'INVOICE_PREFIX', value: 'INV-' }, { key: 'POS_INVOICE_PREFIX', value: 'POS-' },
      { key: 'PURCHASE_PREFIX', value: 'PUR-' }, { key: 'ORDER_PREFIX', value: 'MPS-ORD-' },
      { key: 'TAX_INCLUSIVE', value: 'true' }, { key: 'LOW_STOCK_THRESHOLD', value: '5' }
    ];
    await db.collection('store_settings').insertMany(settings.map(s => ({ ...s, created_at: new Date().toISOString() })));
    console.log('[DB] Seeded store settings');
  }

  const couponCount = await db.collection('coupons').countDocuments();
  if (couponCount === 0) {
    await db.collection('coupons').insertMany([
      { id: 1, code: 'PITSTOP10', discount_type: 'PERCENTAGE', discount_value: 10, min_order_amount: 1000, max_discount: 500, is_active: 1, created_at: new Date().toISOString() },
      { id: 2, code: 'RIDER500', discount_type: 'FIXED', discount_value: 500, min_order_amount: 3000, max_discount: 500, is_active: 1, created_at: new Date().toISOString() }
    ]);
    await db.collection('counters').updateOne({ _id: 'coupons' }, { $set: { seq: 2 } }, { upsert: true });
    console.log('[DB] Seeded 2 coupons');
  }

  // Seed Products if none exist or ensure Product #4 (Shoei Helmet) exists
  const prodCount = await db.collection('products').countDocuments();
  if (prodCount === 0) {
    const defaultProducts = [
      {
        id: 1,
        sku: 'MPS-PROD-5983',
        product_code: 'MPS-PROD-5983',
        name: 'Silman Silencer',
        slug: 'silman-silencer',
        brand_id: 1,
        brand_name: 'Silman',
        category_id: 3,
        category_name: 'Engine Parts',
        category_slug: 'engine',
        description: 'Performance exhaust silencer for motorcycles',
        price: 2500,
        old_price: 3000,
        purchase_price: 1500,
        discount: 16,
        gst_rate: 18,
        hsn: '8714',
        stock: 10,
        min_stock: 5,
        primary_image: 'hero1.png',
        images: ['hero1.png'],
        images_json: JSON.stringify(['hero1.png']),
        variants: [],
        variants_json: '[]',
        warranty: '1 Year Manufacturer',
        weight: '1.0 kg',
        barcode: '890633412526',
        is_archived: 0,
        status: 'ACTIVE',
        rating: 5.0,
        rating_count: 1,
        is_featured: 0,
        is_bestseller: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 4,
        sku: 'MPS-SHOEI-X15',
        product_code: 'MPS-SHOEI-X15',
        name: 'Shoei X-Fifteen Carbon Racing Helmet',
        slug: 'shoei-x-fifteen-carbon-racing-helmet',
        brand_id: 1,
        brand_name: 'Shoei',
        category_id: 1,
        category_name: 'Helmets',
        category_slug: 'helmets',
        description: 'ECE 22.06 & FIM homologated carbon track helmet. Ultra aerodynamic shell with multi-density EPS.',
        price: 64999,
        old_price: 72000,
        purchase_price: 42000,
        discount: 10,
        gst_rate: 18,
        hsn: '6506',
        stock: 10,
        min_stock: 3,
        primary_image: 'hero2.png',
        images: ['hero2.png', 'gloves.png', 'jacket.png'],
        images_json: JSON.stringify(['hero2.png', 'gloves.png', 'jacket.png']),
        variants: [],
        variants_json: '[]',
        warranty: '6 Months Manufacturer',
        weight: '0.5 kg',
        barcode: '890816252107',
        is_archived: 0,
        status: 'ACTIVE',
        rating: 5.0,
        rating_count: 1,
        is_featured: 1,
        is_bestseller: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];
    await db.collection('products').insertMany(defaultProducts);
    console.log('[DB] Seeded default products');
  } else {
    const shoei = await db.collection('products').findOne({ $or: [{ id: 4 }, { sku: 'MPS-SHOEI-X15' }] });
    if (!shoei) {
      await db.collection('products').insertOne({
        id: 4,
        sku: 'MPS-SHOEI-X15',
        product_code: 'MPS-SHOEI-X15',
        name: 'Shoei X-Fifteen Carbon Racing Helmet',
        slug: 'shoei-x-fifteen-carbon-racing-helmet',
        brand_id: 1,
        brand_name: 'Shoei',
        category_id: 1,
        category_name: 'Helmets',
        category_slug: 'helmets',
        description: 'ECE 22.06 & FIM homologated carbon track helmet. Ultra aerodynamic shell with multi-density EPS.',
        price: 64999,
        old_price: 72000,
        purchase_price: 42000,
        discount: 10,
        gst_rate: 18,
        hsn: '6506',
        stock: 10,
        min_stock: 3,
        primary_image: 'hero2.png',
        images: ['hero2.png', 'gloves.png', 'jacket.png'],
        images_json: JSON.stringify(['hero2.png', 'gloves.png', 'jacket.png']),
        variants: [],
        variants_json: '[]',
        warranty: '6 Months Manufacturer',
        weight: '0.5 kg',
        barcode: '890816252107',
        is_archived: 0,
        status: 'ACTIVE',
        rating: 5.0,
        rating_count: 1,
        is_featured: 1,
        is_bestseller: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      console.log('[DB] Seeded Shoei X-Fifteen Carbon Racing Helmet');
    }
  }

  // Ensure counters match highest existing numeric IDs
  const collectionsWithIds = ['products', 'users', 'categories', 'brands', 'bikes', 'suppliers', 'orders', 'order_items', 'invoices', 'customers', 'inventory_transactions', 'coupons'];
  for (const col of collectionsWithIds) {
    const highest = await db.collection(col).find({ id: { $type: 'number' } }).sort({ id: -1 }).limit(1).toArray();
    if (highest.length > 0 && highest[0].id) {
      await db.collection('counters').updateOne(
        { _id: col },
        { $max: { seq: highest[0].id } },
        { upsert: true }
      );
    }
  }

  console.log('[DB] MongoDB initialization complete.');
}

module.exports = { initDatabase, hashPassword, getNextId, getDb };
