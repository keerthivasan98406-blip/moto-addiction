// database.js - MongoDB-only data layer (SQLite removed)
// All data is stored in MongoDB Atlas. No local file database.

const crypto = require('crypto');
const { getDb, connectMongo } = require('./mongodb.js');

function hashPassword(password) {
  const salt = 'motopitshop_prod_salt_2026';
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

// Auto-increment counter helper (replaces SQLite AUTOINCREMENT)
async function getNextId(collection) {
  const mdb = getDb();
  if (!mdb) throw new Error('MongoDB not connected');
  const result = await mdb.collection('_counters').findOneAndUpdate(
    { _id: collection },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  return result.seq;
}

async function initDatabase() {
  const mdb = getDb();
  if (!mdb) {
    console.warn('[DB] MongoDB not connected — skipping seed.');
    return;
  }

  // Create indexes
  try {
    await mdb.collection('users').createIndex({ email: 1 }, { unique: true });
    await mdb.collection('sessions').createIndex({ token: 1 }, { unique: true });
    await mdb.collection('sessions').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
    await mdb.collection('products').createIndex({ sku: 1 }, { unique: true });
    await mdb.collection('products').createIndex({ slug: 1 });
    await mdb.collection('products').createIndex({ barcode: 1 });
    await mdb.collection('orders').createIndex({ order_number: 1 }, { unique: true });
    await mdb.collection('invoices').createIndex({ invoice_number: 1 }, { unique: true });
    await mdb.collection('categories').createIndex({ slug: 1 }, { unique: true });
    await mdb.collection('brands').createIndex({ slug: 1 }, { unique: true });
    await mdb.collection('customers').createIndex({ phone: 1 });
    await mdb.collection('coupons').createIndex({ code: 1 }, { unique: true });
    console.log('[DB] MongoDB indexes created.');
  } catch (e) {
    // Indexes may already exist
  }

  await seedInitialData(mdb);
}

async function seedInitialData(mdb) {
  // Seed users
  const userCount = await mdb.collection('users').countDocuments();
  if (userCount === 0) {
    const users = [
      { id: 1, email: 'owner@motopitshop.com', password_hash: hashPassword('MotoPit@2026!Owner'), full_name: 'Balaji MJ', phone: '+91 9876543210', role: 'OWNER', status: 'ACTIVE', permissions_json: JSON.stringify({ all: true }), staff_role: 'OWNER', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 2, email: 'admin@motopitshop.com', password_hash: hashPassword('MotoPit@2026!Admin'), full_name: 'Moto Pitshop Administrator', phone: '+91 9876543211', role: 'ADMIN', status: 'ACTIVE', permissions_json: JSON.stringify({ all: true }), staff_role: 'MANAGER', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 3, email: 'staff@motopitshop.com', password_hash: hashPassword('MotoPit@2026!Staff'), full_name: 'Moto Pitshop Operations', phone: '+91 9876543212', role: 'STAFF', status: 'ACTIVE', permissions_json: JSON.stringify({ orders: 'READ_WRITE', inventory: 'READ_WRITE', customers: 'READ' }), staff_role: 'STAFF', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 4, email: 'customer@motopitshop.com', password_hash: hashPassword('MotoPit@2026!Customer'), full_name: 'Demo Customer', phone: '+91 9876543213', role: 'CUSTOMER', status: 'ACTIVE', permissions_json: '{}', staff_role: 'CUSTOMER', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 5, email: 'cashier@motopitshop.com', password_hash: hashPassword('MotoPit@2026!Cashier'), full_name: 'Counter Cashier', phone: '+91 9876543214', role: 'STAFF', status: 'ACTIVE', permissions_json: JSON.stringify({ pos: true, billing: true, customers: true }), staff_role: 'CASHIER', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 6, email: 'inventory@motopitshop.com', password_hash: hashPassword('MotoPit@2026!Inventory'), full_name: 'Warehouse Manager', phone: '+91 9876543215', role: 'STAFF', status: 'ACTIVE', permissions_json: JSON.stringify({ products: true, stock: true, purchases: true }), staff_role: 'INVENTORY', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    ];
    await mdb.collection('users').insertMany(users);
    await mdb.collection('_counters').updateOne({ _id: 'users' }, { $set: { seq: 6 } }, { upsert: true });
    console.log('[DB] Seeded users.');
  }

  // Seed categories
  const catCount = await mdb.collection('categories').countDocuments();
  if (catCount === 0) {
    const cats = [
      { id: 1, slug: 'helmets', name: 'Helmets', icon: '🪖', description: 'Full-face, modular and off-road certified helmets', display_order: 1 },
      { id: 2, slug: 'gear', name: 'Riding Gear', icon: '🧥', description: 'Jackets, gloves, boots and body armor', display_order: 2 },
      { id: 3, slug: 'engine', name: 'Engine Parts', icon: '⚙️', description: 'Pistons, valves, cylinder heads & gaskets', display_order: 3 },
      { id: 4, slug: 'brake', name: 'Brake Parts', icon: '🛑', description: 'Brake pads, discs, master cylinders & lines', display_order: 4 },
      { id: 5, slug: 'clutch', name: 'Clutch Parts', icon: '⛓️', description: 'Clutch plates, springs, cables & assemblies', display_order: 5 },
      { id: 6, slug: 'chain-sprocket', name: 'Chain & Sprocket', icon: '🔗', description: 'Drive chains, front & rear sprockets kits', display_order: 6 },
      { id: 7, slug: 'filters', name: 'Filters & Fluids', icon: '🛢️', description: 'Oil filters, air filters, engine oils & coolants', display_order: 7 },
      { id: 8, slug: 'electrical', name: 'Electrical & LED', icon: '⚡', description: 'Batteries, spark plugs, headlamps & turn signals', display_order: 8 },
      { id: 9, slug: 'suspension', name: 'Suspension & Steering', icon: '🏍️', description: 'Front forks, rear shocks, seals & bearings', display_order: 9 },
      { id: 10, slug: 'accessories', name: 'Accessories', icon: '🎒', description: 'Mobile holders, luggage bags, covers & guards', display_order: 10 },
      { id: 11, slug: 'tools', name: 'Tools & Maintenance', icon: '🔧', description: 'Paddock stands, chain lube, torque wrenches', display_order: 11 }
    ];
    await mdb.collection('categories').insertMany(cats);
    await mdb.collection('_counters').updateOne({ _id: 'categories' }, { $set: { seq: 11 } }, { upsert: true });
    console.log('[DB] Seeded categories.');
  }

  // Seed brands
  const brandCount = await mdb.collection('brands').countDocuments();
  if (brandCount === 0) {
    const brands = [
      { id: 1, slug: 'shoei', name: 'Shoei', logo: 'brands/shoei.svg', description: 'Japanese premier helmet technology' },
      { id: 2, slug: 'brembo', name: 'Brembo', logo: 'brands/brembo.svg', description: 'World-leading high performance braking systems' },
      { id: 3, slug: 'akrapovic', name: 'Akrapovič', logo: 'brands/akrapovic.svg', description: 'Premium titanium exhaust systems' },
      { id: 4, slug: 'dainese', name: 'Dainese', logo: 'brands/dainese.svg', description: 'Italian safety equipment & gear' },
      { id: 5, slug: 'agv', name: 'AGV', logo: 'brands/agv.svg', description: 'Championship winning helmets' },
      { id: 6, slug: 'alpinestars', name: 'Alpinestars', logo: 'brands/alpinestars.svg', description: 'Motorsports performance apparel' },
      { id: 7, slug: 'arai', name: 'Arai', logo: 'brands/arai.svg', description: 'Handcrafted Japanese motorcycle safety helmets' },
      { id: 8, slug: 'garmin', name: 'Garmin', logo: 'brands/garmin.svg', description: 'GPS navigation and smart sensors' },
      { id: 9, slug: 'moto-pitshop-oem', name: 'Moto Pitshop Genuine Parts', logo: '', description: 'OEM certified motorcycle spare parts' }
    ];
    await mdb.collection('brands').insertMany(brands);
    await mdb.collection('_counters').updateOne({ _id: 'brands' }, { $set: { seq: 9 } }, { upsert: true });
    console.log('[DB] Seeded brands.');
  }

  // Seed bikes
  const bikeCount = await mdb.collection('bikes').countDocuments();
  if (bikeCount === 0) {
    const bikes = [
      { id: 1, brand: 'Yamaha', model: 'R15', year: 2023, variant: 'V4', engine_cc: 155 },
      { id: 2, brand: 'Yamaha', model: 'R15', year: 2022, variant: 'V3', engine_cc: 155 },
      { id: 3, brand: 'Yamaha', model: 'MT-15', year: 2023, variant: 'V2', engine_cc: 155 },
      { id: 4, brand: 'Royal Enfield', model: 'Classic 350', year: 2023, variant: 'Reborn', engine_cc: 349 },
      { id: 5, brand: 'Royal Enfield', model: 'Himalayan', year: 2023, variant: '411', engine_cc: 411 },
      { id: 6, brand: 'KTM', model: 'Duke 390', year: 2023, variant: 'BS6', engine_cc: 373 },
      { id: 7, brand: 'KTM', model: 'RC 390', year: 2023, variant: 'BS6', engine_cc: 373 },
      { id: 8, brand: 'TVS', model: 'Apache RTR 200', year: 2023, variant: '4V', engine_cc: 197 },
      { id: 9, brand: 'Bajaj', model: 'Pulsar NS200', year: 2023, variant: 'BS6', engine_cc: 199 },
      { id: 10, brand: 'Honda', model: 'CBR 250R', year: 2022, variant: 'ABS', engine_cc: 249 },
      { id: 11, brand: 'Kawasaki', model: 'Ninja 300', year: 2023, variant: 'BS6', engine_cc: 296 },
      { id: 12, brand: 'Triumph', model: 'Speed 400', year: 2023, variant: 'Standard', engine_cc: 398 },
      { id: 13, brand: 'BMW', model: 'G310R', year: 2023, variant: 'BS6', engine_cc: 313 }
    ];
    await mdb.collection('bikes').insertMany(bikes);
    await mdb.collection('_counters').updateOne({ _id: 'bikes' }, { $set: { seq: 13 } }, { upsert: true });
    console.log('[DB] Seeded bikes.');
  }

  // Seed suppliers
  const suppCount = await mdb.collection('suppliers').countDocuments();
  if (suppCount === 0) {
    const suppliers = [
      { id: 1, name: 'Apex Moto Supplies Ltd', contact_person: 'Rajesh Sharma', email: 'sales@apexmoto.in', phone: '+91 9811223344', address: 'Plot 42, Industrial Zone, Chennai, TN', gstin: '33AAPCA9876E1Z2', status: 'ACTIVE', created_at: new Date().toISOString() },
      { id: 2, name: 'Performance Gears India', contact_person: 'Vikram Singh', email: 'supply@performancegears.com', phone: '+91 9722334455', address: 'Sector 18, Gurugram, HR', gstin: '06AAACP4321D1Z8', status: 'ACTIVE', created_at: new Date().toISOString() }
    ];
    await mdb.collection('suppliers').insertMany(suppliers);
    await mdb.collection('_counters').updateOne({ _id: 'suppliers' }, { $set: { seq: 2 } }, { upsert: true });
    console.log('[DB] Seeded suppliers.');
  }

  // Seed store settings
  const settingsCount = await mdb.collection('store_settings').countDocuments();
  if (settingsCount === 0) {
    const settings = [
      { key: 'BUSINESS_NAME', value: 'MOTO PITSHOP' },
      { key: 'STORE_NAME', value: 'MOTO PITSHOP' },
      { key: 'STORE_LEGAL_NAME', value: 'Moto Pitshop Retail Pvt Ltd' },
      { key: 'BUSINESS_OWNER', value: 'Balaji MJ' },
      { key: 'TAGLINE', value: 'Your Ride. Your Parts. Your Pitstop.' },
      { key: 'STORE_EMAIL', value: 'owner@motopitshop.com' },
      { key: 'STORE_PHONE', value: '+91 98765 43210' },
      { key: 'STORE_ADDRESS', value: '124 Racing Track Boulevard, Motor City, Chennai, TN 600001' },
      { key: 'STORE_GSTIN', value: '33AABCM1234F1Z9' },
      { key: 'STORE_STATE', value: 'Tamil Nadu' },
      { key: 'STORE_STATE_CODE', value: '33' },
      { key: 'CURRENCY', value: 'INR' },
      { key: 'CURRENCY_SYMBOL', value: '₹' },
      { key: 'COUNTRY', value: 'India' },
      { key: 'INVOICE_PREFIX', value: 'INV-' },
      { key: 'POS_INVOICE_PREFIX', value: 'POS-' },
      { key: 'PURCHASE_PREFIX', value: 'PUR-' },
      { key: 'ORDER_PREFIX', value: 'MPS-ORD-' },
      { key: 'TAX_INCLUSIVE', value: 'true' },
      { key: 'LOW_STOCK_THRESHOLD', value: '5' }
    ];
    await mdb.collection('store_settings').insertMany(settings);
    console.log('[DB] Seeded store settings.');
  }

  // Seed coupons
  const couponCount = await mdb.collection('coupons').countDocuments();
  if (couponCount === 0) {
    await mdb.collection('coupons').insertMany([
      { id: 1, code: 'PITSTOP10', discount_type: 'PERCENTAGE', discount_value: 10, min_order_amount: 1000, max_discount: 500, is_active: 1, usage_count: 0, usage_limit: 100, created_at: new Date().toISOString() },
      { id: 2, code: 'RIDER500', discount_type: 'FIXED', discount_value: 500, min_order_amount: 3000, max_discount: 500, is_active: 1, usage_count: 0, usage_limit: 100, created_at: new Date().toISOString() }
    ]);
    await mdb.collection('_counters').updateOne({ _id: 'coupons' }, { $set: { seq: 2 } }, { upsert: true });
    console.log('[DB] Seeded coupons.');
  }
}

module.exports = { hashPassword, initDatabase, getNextId };
