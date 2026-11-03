// database.js - MongoDB Atlas Database Layer for Moto Pitshop
const mongoose = require('mongoose');
const crypto = require('crypto');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://Motopitshop:Motopitshop2026@motopit.c8x6ms0.mongodb.net/motopitshop?retryWrites=true&w=majority';

// ==================== MONGOOSE CONNECTION ====================
let isConnected = false;

async function connectDB() {
  if (isConnected) return;
  try {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    isConnected = true;
    console.log('✅ MongoDB Atlas connected successfully');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  }
}

// ==================== PASSWORD HASHING ====================
function hashPassword(password) {
  const salt = 'motopitshop_prod_salt_2026';
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

// ==================== SCHEMAS ====================

const UserSchema = new mongoose.Schema({
  email: { type: String, unique: true, lowercase: true, trim: true },
  password_hash: String,
  full_name: String,
  phone: String,
  role: { type: String, enum: ['CUSTOMER','STAFF','ADMIN','OWNER'], default: 'CUSTOMER' },
  staff_role: String,
  status: { type: String, enum: ['ACTIVE','SUSPENDED','DISABLED'], default: 'ACTIVE' },
  permissions_json: { type: String, default: '{}' },
  last_login_at: Date,
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

const CategorySchema = new mongoose.Schema({
  slug: { type: String, unique: true },
  name: String,
  icon: String,
  description: String,
  display_order: { type: Number, default: 0 },
});

const BrandSchema = new mongoose.Schema({
  slug: { type: String, unique: true },
  name: String,
  logo: String,
  description: String,
});

const SupplierSchema = new mongoose.Schema({
  name: String,
  contact_person: String,
  email: String,
  phone: String,
  address: String,
  gstin: String,
  status: { type: String, default: 'ACTIVE' },
}, { timestamps: { createdAt: 'created_at' } });

const ProductSchema = new mongoose.Schema({
  sku: { type: String, unique: true },
  product_code: String,
  barcode: String,
  name: String,
  slug: { type: String, unique: true },
  brand_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' },
  category_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  supplier_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  description: String,
  price: Number,
  old_price: Number,
  purchase_price: Number,
  discount: Number,
  gst_rate: { type: Number, default: 18.0 },
  hsn: { type: String, default: '8714' },
  stock: { type: Number, default: 0 },
  min_stock: { type: Number, default: 5 },
  reserved_stock: { type: Number, default: 0 },
  primary_image: String,
  images_json: String,
  variants_json: String,
  is_featured: { type: Boolean, default: false },
  is_bestseller: { type: Boolean, default: false },
  is_archived: { type: Boolean, default: false },
  status: { type: String, default: 'ACTIVE' },
  rating: { type: Number, default: 5.0 },
  rating_count: { type: Number, default: 1 },
  warranty: String,
  weight: String,
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

const OrderSchema = new mongoose.Schema({
  order_number: { type: String, unique: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  customer_name: String,
  customer_email: String,
  customer_phone: String,
  shipping_address_json: String,
  status: { type: String, default: 'PLACED' },
  payment_status: { type: String, default: 'PENDING' },
  payment_method: { type: String, default: 'UPI' },
  payment_ref: String,
  payment_screenshot: String,
  subtotal: Number,
  tax_total: { type: Number, default: 0 },
  cgst_total: { type: Number, default: 0 },
  sgst_total: { type: Number, default: 0 },
  igst_total: { type: Number, default: 0 },
  discount_total: { type: Number, default: 0 },
  grand_total: Number,
  order_type: { type: String, default: 'ONLINE' },
  pos_cashier_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  courier_name: String,
  tracking_number: String,
  notes: String,
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

const OrderItemSchema = new mongoose.Schema({
  order_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  product_name: String,
  product_sku: String,
  price: Number,
  quantity: Number,
  hsn: String,
  gst_rate: Number,
  tax_amount: Number,
  total: Number,
});

const InvoiceSchema = new mongoose.Schema({
  invoice_number: { type: String, unique: true },
  order_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', unique: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  customer_name: String,
  customer_phone: String,
  customer_gstin: String,
  store_name: { type: String, default: 'MOTO PITSHOP' },
  store_address: { type: String, default: '124 Racing Track Boulevard, Motor City, Chennai, TN 600001' },
  store_gstin: { type: String, default: '33AABCM1234F1Z9' },
  taxable_value: Number,
  cgst: { type: Number, default: 0 },
  sgst: { type: Number, default: 0 },
  igst: { type: Number, default: 0 },
  total_tax: Number,
  grand_total: Number,
  invoice_type: { type: String, default: 'ONLINE' },
  place_of_supply: String,
  state_code: String,
  payment_method: String,
  payment_status: String,
  notes: String,
}, { timestamps: { createdAt: 'created_at' } });

const InventoryTransactionSchema = new mongoose.Schema({
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  transaction_type: String,
  quantity_change: Number,
  previous_stock: Number,
  new_stock: Number,
  notes: String,
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: { createdAt: 'created_at' } });

const PurchaseSchema = new mongoose.Schema({
  purchase_number: { type: String, unique: true },
  supplier_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  supplier_invoice_no: String,
  purchase_date: String,
  goods_received_date: String,
  total_cost: Number,
  gst_amount: { type: Number, default: 0 },
  grand_total: Number,
  amount_paid: { type: Number, default: 0 },
  outstanding_balance: { type: Number, default: 0 },
  payment_status: { type: String, default: 'UNPAID' },
  status: { type: String, default: 'RECEIVED' },
  payment_method: String,
  notes: String,
}, { timestamps: { createdAt: 'created_at' } });

const PurchaseItemSchema = new mongoose.Schema({
  purchase_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase' },
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  quantity: Number,
  unit_cost: Number,
  total: Number,
  gst_rate: Number,
  tax_amount: Number,
});

const ExpenseSchema = new mongoose.Schema({
  expense_number: { type: String, unique: true },
  expense_date: String,
  category: String,
  description: String,
  amount: Number,
  payment_method: { type: String, default: 'CASH' },
  vendor: String,
  reference_number: String,
  recorded_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: { createdAt: 'created_at' } });

const CreditNoteSchema = new mongoose.Schema({
  credit_note_number: { type: String, unique: true },
  order_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  invoice_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
  customer_name: String,
  customer_phone: String,
  subtotal: Number,
  tax_amount: Number,
  total_amount: Number,
  reason: String,
  stock_restored: { type: Boolean, default: true },
  refund_status: { type: String, default: 'COMPLETED' },
  refund_method: String,
}, { timestamps: { createdAt: 'created_at' } });

const CreditNoteItemSchema = new mongoose.Schema({
  credit_note_id: { type: mongoose.Schema.Types.ObjectId, ref: 'CreditNote' },
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  product_name: String,
  quantity: Number,
  price: Number,
  tax_amount: Number,
  total: Number,
  condition: { type: String, default: 'GOOD' },
});

const CustomerSchema = new mongoose.Schema({
  customer_code: { type: String, unique: true },
  name: String,
  phone: String,
  email: String,
  billing_address: String,
  shipping_address: String,
  gstin: String,
  customer_type: { type: String, default: 'RETAIL' },
  notes: String,
  total_spend: { type: Number, default: 0 },
  total_orders: { type: Number, default: 0 },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

const ReviewSchema = new mongoose.Schema({
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  customer_name: String,
  rating: Number,
  comment: String,
  is_approved: { type: Boolean, default: true },
}, { timestamps: { createdAt: 'created_at' } });

const AuditLogSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  user_name: String,
  user_role: String,
  action: String,
  entity: String,
  entity_id: String,
  result: { type: String, default: 'SUCCESS' },
  details_json: String,
}, { timestamps: { createdAt: 'created_at' } });

const StoreSettingSchema = new mongoose.Schema({
  key: { type: String, unique: true },
  value: String,
});

const SessionSchema = new mongoose.Schema({
  token: { type: String, unique: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  created_at: Number,
  expires_at: Number,
});

const SupportTicketSchema = new mongoose.Schema({
  ticket_number: { type: String, unique: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  customer_name: String,
  customer_email: String,
  order_number: String,
  issue_type: String,
  subject: String,
  message: String,
  status: { type: String, default: 'OPEN' },
}, { timestamps: { createdAt: 'created_at' } });

const BikeSchema = new mongoose.Schema({
  brand: String,
  model: String,
  year: Number,
  variant: String,
  engine_cc: Number,
});

const BikeCompatibilitySchema = new mongoose.Schema({
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  bike_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Bike' },
});

const SupplierPaymentSchema = new mongoose.Schema({
  payment_number: { type: String, unique: true },
  supplier_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  purchase_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase' },
  payment_date: String,
  amount: Number,
  payment_method: String,
  reference_no: String,
  notes: String,
  recorded_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: { createdAt: 'created_at' } });

// ==================== MODELS ====================
const User = mongoose.model('User', UserSchema);
const Category = mongoose.model('Category', CategorySchema);
const Brand = mongoose.model('Brand', BrandSchema);
const Supplier = mongoose.model('Supplier', SupplierSchema);
const Product = mongoose.model('Product', ProductSchema);
const Order = mongoose.model('Order', OrderSchema);
const OrderItem = mongoose.model('OrderItem', OrderItemSchema);
const Invoice = mongoose.model('Invoice', InvoiceSchema);
const InventoryTransaction = mongoose.model('InventoryTransaction', InventoryTransactionSchema);
const Purchase = mongoose.model('Purchase', PurchaseSchema);
const PurchaseItem = mongoose.model('PurchaseItem', PurchaseItemSchema);
const Expense = mongoose.model('Expense', ExpenseSchema);
const CreditNote = mongoose.model('CreditNote', CreditNoteSchema);
const CreditNoteItem = mongoose.model('CreditNoteItem', CreditNoteItemSchema);
const Customer = mongoose.model('Customer', CustomerSchema);
const Review = mongoose.model('Review', ReviewSchema);
const AuditLog = mongoose.model('AuditLog', AuditLogSchema);
const StoreSetting = mongoose.model('StoreSetting', StoreSettingSchema);
const Session = mongoose.model('Session', SessionSchema);
const SupportTicket = mongoose.model('SupportTicket', SupportTicketSchema);
const Bike = mongoose.model('Bike', BikeSchema);
const BikeCompatibility = mongoose.model('BikeCompatibility', BikeCompatibilitySchema);
const SupplierPayment = mongoose.model('SupplierPayment', SupplierPaymentSchema);

// ==================== SEED DATA ====================
async function seedInitialData() {
  try {
    // Seed users
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      await User.insertMany([
        { email: 'owner@motopitshop.com', password_hash: hashPassword('MotoPit@2026!Owner'), full_name: 'Balaji MJ', phone: '+91 9876543210', role: 'OWNER', staff_role: 'OWNER', status: 'ACTIVE', permissions_json: JSON.stringify({ all: true }) },
        { email: 'admin@motopitshop.com', password_hash: hashPassword('MotoPit@2026!Admin'), full_name: 'Moto Pitshop Administrator', phone: '+91 9876543211', role: 'ADMIN', staff_role: 'ADMIN', status: 'ACTIVE', permissions_json: JSON.stringify({ all: true }) },
        { email: 'staff@motopitshop.com', password_hash: hashPassword('MotoPit@2026!Staff'), full_name: 'Moto Pitshop Operations', phone: '+91 9876543212', role: 'STAFF', staff_role: 'STAFF', status: 'ACTIVE', permissions_json: '{}' },
        { email: 'customer@motopitshop.com', password_hash: hashPassword('MotoPit@2026!Customer'), full_name: 'Demo Customer', phone: '+91 9876543213', role: 'CUSTOMER', status: 'ACTIVE', permissions_json: '{}' },
      ]);
      console.log('✅ Users seeded');
    }

    // Seed categories
    const catCount = await Category.countDocuments();
    if (catCount === 0) {
      await Category.insertMany([
        { slug: 'helmets', name: 'Helmets', icon: '🪖', display_order: 1 },
        { slug: 'gear', name: 'Riding Gear', icon: '🧥', display_order: 2 },
        { slug: 'engine', name: 'Engine Parts', icon: '⚙️', display_order: 3 },
        { slug: 'brake', name: 'Brake Parts', icon: '🛑', display_order: 4 },
        { slug: 'chain-sprocket', name: 'Chain & Sprocket', icon: '🔗', display_order: 5 },
        { slug: 'filters', name: 'Filters & Fluids', icon: '🛢️', display_order: 6 },
        { slug: 'electrical', name: 'Electrical & LED', icon: '⚡', display_order: 7 },
        { slug: 'suspension', name: 'Suspension', icon: '🏍️', display_order: 8 },
        { slug: 'accessories', name: 'Accessories', icon: '🎒', display_order: 9 },
      ]);
      console.log('✅ Categories seeded');
    }

    // Seed brands
    const brandCount = await Brand.countDocuments();
    if (brandCount === 0) {
      await Brand.insertMany([
        { slug: 'shoei', name: 'Shoei', logo: 'brands/shoei.svg' },
        { slug: 'brembo', name: 'Brembo', logo: 'brands/brembo.svg' },
        { slug: 'akrapovic', name: 'Akrapovič', logo: 'brands/akrapovic.svg' },
        { slug: 'dainese', name: 'Dainese', logo: 'brands/dainese.svg' },
        { slug: 'agv', name: 'AGV', logo: 'brands/agv.svg' },
        { slug: 'alpinestars', name: 'Alpinestars', logo: 'brands/alpinestars.svg' },
        { slug: 'arai', name: 'Arai', logo: 'brands/arai.svg' },
        { slug: 'garmin', name: 'Garmin', logo: 'brands/garmin.svg' },
      ]);
      console.log('✅ Brands seeded');
    }

    // Seed suppliers
    const suppCount = await Supplier.countDocuments();
    if (suppCount === 0) {
      await Supplier.insertMany([
        { name: 'Apex Moto Supplies Ltd', contact_person: 'Rajesh Sharma', email: 'sales@apexmoto.in', phone: '+91 9811223344', address: 'Plot 42, Industrial Zone, Chennai, TN', gstin: '33AAPCA9876E1Z2' },
        { name: 'Performance Gears India', contact_person: 'Vikram Singh', email: 'supply@performancegears.com', phone: '+91 9722334455', address: 'Sector 18, Gurugram, HR', gstin: '06AAACP4321D1Z8' },
      ]);
      console.log('✅ Suppliers seeded');
    }

    // Seed store settings
    const settingsCount = await StoreSetting.countDocuments();
    if (settingsCount === 0) {
      await StoreSetting.insertMany([
        { key: 'BUSINESS_NAME', value: 'MOTO PITSHOP' },
        { key: 'STORE_NAME', value: 'MOTO PITSHOP' },
        { key: 'BUSINESS_OWNER', value: 'Balaji MJ' },
        { key: 'TAGLINE', value: 'Your Ride. Your Parts. Your Pitstop.' },
        { key: 'STORE_EMAIL', value: 'owner@motopitshop.com' },
        { key: 'STORE_PHONE', value: '+91 98765 43210' },
        { key: 'STORE_ADDRESS', value: '124 Racing Track Boulevard, Motor City, Chennai, TN 600001' },
        { key: 'STORE_GSTIN', value: '33AABCM1234F1Z9' },
        { key: 'STORE_STATE', value: 'Tamil Nadu' },
        { key: 'STORE_STATE_CODE', value: '33' },
        { key: 'CURRENCY', value: 'INR' },
        { key: 'INVOICE_PREFIX', value: 'INV-' },
        { key: 'ORDER_PREFIX', value: 'MPS-ORD-' },
        { key: 'TAX_INCLUSIVE', value: 'true' },
      ]);
      console.log('✅ Store settings seeded');
    }

    // Seed products
    const prodCount = await Product.countDocuments();
    if (prodCount === 0) {
      const cat = await Category.findOne({ slug: 'helmets' });
      const brand = await Brand.findOne({ slug: 'shoei' });
      const supp = await Supplier.findOne({ name: 'Apex Moto Supplies Ltd' });
      await Product.insertMany([
        { sku: 'MPS-HLM-001', product_code: 'SH-R15-PRO', barcode: '8901234567890', name: 'Shoei Pro Racing Helmet – Full Face', slug: 'shoei-pro-racing-helmet', brand_id: brand?._id, category_id: cat?._id, supplier_id: supp?._id, description: 'CE/DOT certified aerodynamic full-face race helmet.', price: 8999, old_price: 12999, purchase_price: 6300, discount: 31, gst_rate: 18.0, hsn: '6506', stock: 25, min_stock: 5, primary_image: 'hero2.png', images_json: '["hero2.png"]', is_featured: true, is_bestseller: true, rating: 4.9, rating_count: 248 },
        { sku: 'MPS-GLV-002', product_code: 'MPS-GLV-CB', barcode: '8901234567891', name: 'Carbon Fiber Racing Gloves', slug: 'carbon-fiber-racing-gloves', category_id: cat?._id, description: 'Full-leather riding gloves with carbon fiber knuckle protection.', price: 2499, old_price: 3499, purchase_price: 1750, discount: 28, gst_rate: 18.0, hsn: '6216', stock: 40, min_stock: 10, primary_image: 'gloves.png', images_json: '["gloves.png"]', is_featured: true, is_bestseller: true, rating: 4.8, rating_count: 184 },
        { sku: 'MPS-JKT-004', product_code: 'DNS-JKT-STR', barcode: '8901234567892', name: 'Dainese Stealth Waterproof Armored Jacket', slug: 'dainese-stealth-jacket', category_id: cat?._id, description: 'All-weather 600D Cordura textile jacket with CE Level 2 armor.', price: 12499, old_price: 15999, purchase_price: 8750, discount: 22, gst_rate: 18.0, hsn: '6201', stock: 15, min_stock: 3, primary_image: 'jacket.png', images_json: '["jacket.png"]', is_featured: true, rating: 4.9, rating_count: 132 },
        { sku: 'MPS-BRK-005', product_code: 'BRM-PAD-SYN', barcode: '8901234567893', name: 'Brembo Sintered High-Performance Front Brake Pads', slug: 'brembo-sintered-brake-pads', category_id: cat?._id, description: 'Premium sintered compound front brake pads.', price: 2199, old_price: 2799, purchase_price: 1540, discount: 21, gst_rate: 18.0, hsn: '8714', stock: 50, min_stock: 10, primary_image: 'hero3.png', images_json: '["hero3.png"]', is_bestseller: true, rating: 4.9, rating_count: 310 },
      ]);
      console.log('✅ Products seeded');
    }

    // Seed bikes
    const bikeCount = await Bike.countDocuments();
    if (bikeCount === 0) {
      await Bike.insertMany([
        { brand: 'Yamaha', model: 'R15', year: 2023, variant: 'V4', engine_cc: 155 },
        { brand: 'KTM', model: 'Duke 390', year: 2023, variant: 'BS6', engine_cc: 373 },
        { brand: 'Royal Enfield', model: 'Classic 350', year: 2023, variant: 'Reborn', engine_cc: 349 },
        { brand: 'Honda', model: 'CBR 250R', year: 2022, variant: 'ABS', engine_cc: 249 },
        { brand: 'Kawasaki', model: 'Ninja 300', year: 2023, variant: 'BS6', engine_cc: 296 },
      ]);
      console.log('✅ Bikes seeded');
    }

    console.log('✅ Database seeded successfully');
  } catch (err) {
    console.error('❌ Seed error:', err.message);
  }
}

async function initDatabase() {
  await connectDB();
  await seedInitialData();
}

module.exports = {
  initDatabase,
  hashPassword,
  connectDB,
  // Models
  User,
  Category,
  Brand,
  Supplier,
  Product,
  Order,
  OrderItem,
  Invoice,
  InventoryTransaction,
  Purchase,
  PurchaseItem,
  Expense,
  CreditNote,
  CreditNoteItem,
  Customer,
  Review,
  AuditLog,
  StoreSetting,
  Session,
  SupportTicket,
  Bike,
  BikeCompatibility,
  SupplierPayment,
};
