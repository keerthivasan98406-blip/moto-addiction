// db-compat.js - SQLite-to-MongoDB compatibility adapter
// Makes db.prepare().get/all/run work with MongoDB synchronously via pre-cached data

const { User, Category, Brand, Supplier, Product, Order, OrderItem, Invoice, InventoryTransaction, Purchase, PurchaseItem, Expense, CreditNote, Customer, AuditLog, StoreSetting, Session, Bike, Review, SupportTicket } = require('./database.js');

// Map table names to Mongoose models
const TABLE_MAP = {
  users: User, categories: Category, brands: Brand, suppliers: Supplier,
  products: Product, orders: Order, order_items: OrderItem, invoices: Invoice,
  inventory_transactions: InventoryTransaction, purchases: Purchase,
  purchase_items: PurchaseItem, expenses: Expense, credit_notes: CreditNote,
  customers: Customer, audit_logs: AuditLog, store_settings: StoreSetting,
  sessions: Session, bikes: Bike, reviews: Review, support_tickets: SupportTicket
};

// Convert MongoDB document to plain object with id field
function toRow(doc) {
  if (!doc) return null;
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  obj.id = obj._id ? obj._id.toString() : obj.id;
  // Flatten populated refs
  if (obj.supplier_id && typeof obj.supplier_id === 'object') { obj.supplier_name = obj.supplier_id.name; obj.supplier_id = obj.supplier_id._id?.toString() || obj.supplier_id; }
  if (obj.category_id && typeof obj.category_id === 'object') { obj.category_name = obj.category_id.name; obj.category_id = obj.category_id._id?.toString() || obj.category_id; }
  if (obj.brand_id && typeof obj.brand_id === 'object') { obj.brand_name = obj.brand_id.name; obj.brand_id = obj.brand_id._id?.toString() || obj.brand_id; }
  if (obj.user_id && typeof obj.user_id === 'object') { obj.user_name = obj.user_id.full_name; obj.user_id = obj.user_id._id?.toString() || obj.user_id; }
  if (obj.product_id && typeof obj.product_id === 'object') { obj.product_name = obj.product_id.name; obj.product_id = obj.product_id._id?.toString() || obj.product_id; }
  if (obj.order_id && typeof obj.order_id === 'object') { obj.order_number = obj.order_id.order_number; obj.order_id = obj.order_id._id?.toString() || obj.order_id; }
  if (obj.invoice_id && typeof obj.invoice_id === 'object') { obj.invoice_number = obj.invoice_id.invoice_number; obj.invoice_id = obj.invoice_id._id?.toString() || obj.invoice_id; }
  if (obj.purchase_id && typeof obj.purchase_id === 'object') { obj.purchase_id = obj.purchase_id._id?.toString() || obj.purchase_id; }
  if (obj.recorded_by && typeof obj.recorded_by === 'object') { obj.recorded_by_name = obj.recorded_by.full_name; obj.recorded_by = obj.recorded_by._id?.toString() || obj.recorded_by; }
  // Convert timestamps
  if (obj.created_at instanceof Date) obj.created_at = obj.created_at.toISOString();
  if (obj.updated_at instanceof Date) obj.updated_at = obj.updated_at.toISOString();
  if (obj.last_login_at instanceof Date) obj.last_login_at = obj.last_login_at.toISOString();
  // Ensure numeric fields
  if (obj.price !== undefined) obj.price = Number(obj.price) || 0;
  if (obj.stock !== undefined) obj.stock = Number(obj.stock) || 0;
  if (obj.grand_total !== undefined) obj.grand_total = Number(obj.grand_total) || 0;
  if (obj.amount !== undefined) obj.amount = Number(obj.amount) || 0;
  return obj;
}

module.exports = { TABLE_MAP, toRow };
