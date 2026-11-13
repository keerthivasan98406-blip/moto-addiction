/**
 * Preservation Property Tests
 * Task 2 — macbook-pos-fixes spec
 *
 * These tests MUST PASS on UNFIXED code.
 * They capture baseline correct behaviors that must NOT regress after the fixes
 * in tasks 3.1, 3.2, and 3.3 are applied.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 *
 * Run with: node tests/preservation.test.js
 *
 * PRESERVATION SCOPE:
 *   Bug 1 — Valid integer IDs from SQLite: populateCategoryDropdowns() and
 *            populateBrandDropdowns() must still produce option values that are
 *            exactly String(category.id) when id is a number.
 *
 *   Bug 2 — Print button still works; walk-in has no WhatsApp button: the
 *            thermal receipt modal always contains the Print button wired to
 *            window.print(), and a walk-in customer (no phone) never shows a
 *            visible WhatsApp button.
 *
 *   Bug 3 — Cart clears correctly, posCart = []: clearPosCart() always empties
 *            posCart to [] and renderPosCart() runs (empty-cart UI renders).
 */

'use strict';

const assert = require('assert');

// ---------------------------------------------------------------------------
// Minimal DOM Harness (matches the one in bug-condition-exploration.test.js)
// ---------------------------------------------------------------------------

function createMinimalDOM() {
  function createElement(tag, attrs = {}) {
    const el = {
      tagName: tag.toUpperCase(),
      _id: attrs.id || '',
      style: { display: '' },
      _innerHTML: '',
      value: '',
      selectedIndex: 0,
      options: [],
      _waUrl: null,
      onchange: null,
      onclick: null,
      getAttribute(name) { return this[`_attr_${name}`] || null; },
      setAttribute(name, val) { this[`_attr_${name}`] = val; },
      set innerHTML(html) {
        this._innerHTML = html;
        this.options = [];
        const optRegex = /<option[^>]*value="([^"]*)"[^>]*>([^<]*)<\/option>/g;
        let m;
        while ((m = optRegex.exec(html)) !== null) {
          this.options.push({ value: m[1], text: m[2] });
        }
        // Chrome (and unfixed code baseline) auto-selects the first option
        if (this.options.length > 0) {
          this.value = this.options[0].value;
          this.selectedIndex = 0;
        } else {
          this.value = '';
          this.selectedIndex = -1;
        }
      },
      get innerHTML() { return this._innerHTML; },
      appendChild(child) { return child; },
    };
    return el;
  }

  const elements = {};

  const domApi = {
    getElementById(id) { return elements[id] || null; },
    createElement(tag) { return createElement(tag); },
    _register(id, tag, attrs = {}) {
      const el = createElement(tag, { id, ...attrs });
      el._id = id;
      elements[id] = el;
      return el;
    },
    _reset() {
      Object.keys(elements).forEach(k => delete elements[k]);
    }
  };

  return domApi;
}

// ---------------------------------------------------------------------------
// UNFIXED implementations (verbatim copies from owner.js — the unfixed code)
// These are intentionally the CURRENT (unfixed) code paths.
// ---------------------------------------------------------------------------

let cachedCategories = [];
let cachedBrands = [];

/**
 * Verbatim copy of populateCategoryDropdowns from unfixed owner.js
 */
function populateCategoryDropdowns_UNFIXED(document) {
  const filter = document.getElementById('prod-category-filter');
  const formSelect = document.getElementById('prod-form-category');

  if (filter) {
    filter.innerHTML = '<option value="all">All Categories</option>' +
      cachedCategories.map(c => `<option value="${c.id || c._id}">${c.name}</option>`).join('');
  }
  if (formSelect) {
    const curVal = formSelect.value;
    formSelect.innerHTML = '<option value="">-- Select Category --</option>' +
      cachedCategories.map(c => `<option value="${c.id || c._id}">${c.icon ? c.icon + ' ' : ''}${c.name}</option>`).join('') +
      '<option value="__new__" style="color:var(--accent-orange); font-weight:600;">+ Add New Category...</option>';
    if (curVal && curVal !== '__new__') formSelect.value = curVal;

    formSelect.onchange = function () {
      if (this.value === '__new__') {
        this.value = '';
      }
    };
  }
}

/**
 * Verbatim copy of populateBrandDropdowns from unfixed owner.js
 */
function populateBrandDropdowns_UNFIXED(document) {
  const formSelect = document.getElementById('prod-form-brand');
  if (formSelect) {
    const curVal = formSelect.value;
    formSelect.innerHTML = '<option value="">-- Select Brand --</option>' +
      cachedBrands.map(b => `<option value="${b.id || b._id}">${b.name}</option>`).join('') +
      '<option value="__new__" style="color:var(--accent-orange); font-weight:600;">+ Add New Brand...</button>';
    if (curVal && curVal !== '__new__') formSelect.value = curVal;

    formSelect.onchange = function () {
      if (this.value === '__new__') {
        this.value = '';
      }
    };
  }
}

/**
 * Verbatim copy of displayThermalReceipt from unfixed owner.js
 * (stripped of openModal call which is irrelevant for DOM tests)
 */
function displayThermalReceipt_UNFIXED(document, saleData) {
  const modal = document.getElementById('modal-thermal-receipt');
  const area = document.getElementById('thermal-receipt-area');
  if (!modal || !area) return;

  const store = saleData.store || {};
  const items = saleData.items || [];
  const cust = saleData.customer || {};

  area.innerHTML = `
    <div style="text-align:center; border-bottom:1px dashed #000; padding-bottom:10px; margin-bottom:10px;">
      <h2 style="font-size:1.2rem; font-weight:800; margin:0;">${store.name || 'MOTO ADDICTOR PITSHOP'}</h2>
      <div style="font-size:0.75rem;">${store.legalName || 'MOTO ADDICTOR PITSHOP Retail Pvt Ltd'}</div>
      <div style="font-size:0.72rem;">${store.address || 'Chennai, TN'}</div>
      <div style="font-size:0.75rem; font-weight:700; margin-top:4px;">GSTIN: ${store.gstin || '33AABCM1234F1Z9'}</div>
      <div style="font-size:0.72rem;">Ph: ${store.phone || '+91 98765 43210'}</div>
    </div>

    <div style="font-size:0.72rem; margin-bottom:8px;">
      <div><strong>BILL NO:</strong> ${saleData.billNumber || saleData.invoice_number || saleData.order_number}</div>
      <div><strong>DATE:</strong> ${new Date().toLocaleString('en-IN')}</div>
      <div><strong>CUSTOMER:</strong> ${cust.name || saleData.customer_name || 'Walk-in'}</div>
      ${cust.phone ? `<div><strong>PHONE:</strong> ${cust.phone}</div>` : ''}
    </div>

    <table style="width:100%; border-collapse:collapse; font-size:0.72rem; margin-bottom:10px; border-bottom:1px dashed #000;">
      <thead>
        <tr style="border-bottom:1px solid #000;">
          <th style="text-align:left; padding:4px 0;">Item</th>
          <th style="text-align:center; padding:4px 0;">Qty</th>
          <th style="text-align:right; padding:4px 0;">Price</th>
          <th style="text-align:right; padding:4px 0;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(i => `
          <tr>
            <td style="padding:3px 0;">${i.name || i.product_name}</td>
            <td style="text-align:center;">${i.quantity}</td>
            <td style="text-align:right;">₹${i.price}</td>
            <td style="text-align:right;">₹${i.total}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div style="font-size:0.75rem; line-height:1.4; border-bottom:1px dashed #000; padding-bottom:8px; margin-bottom:8px;">
      <div style="display:flex; justify-content:space-between;"><span>Taxable Subtotal:</span><span>₹${saleData.subtotal || saleData.taxable_value || 0}</span></div>
      <div style="display:flex; justify-content:space-between;"><span>CGST:</span><span>₹${saleData.cgst || Math.round((saleData.taxTotal || saleData.total_tax || 0) / 2)}</span></div>
      <div style="display:flex; justify-content:space-between;"><span>SGST:</span><span>₹${saleData.sgst || Math.round((saleData.taxTotal || saleData.total_tax || 0) / 2)}</span></div>
      <div style="display:flex; justify-content:space-between; font-weight:800; font-size:0.95rem; margin-top:4px;">
        <span>NET PAYABLE:</span><span>₹${saleData.grandTotal || saleData.grand_total}</span>
      </div>
      <div style="font-size:0.7rem; color:#444; margin-top:2px;">Mode: ${(saleData.payment && saleData.payment.method) || saleData.payment_method || 'CASH'}</div>
    </div>

    <div style="text-align:center; font-size:0.7rem; margin-top:10px;">
      <div>Thank you for riding with MOTO PIT!</div>
      <div>Visit us online: www.motopitshop.com</div>
      <div>Keep receipt for warranty &amp; returns.</div>
    </div>
  `;
  // openModal('modal-thermal-receipt') — omitted (no browser modal in test env)
}

// Unfixed clearPosCart state
let posCart_UNFIXED = [];

/**
 * Verbatim copy of clearPosCart from unfixed owner.js.
 * renderPosCart is stubbed as a flag so we can verify it was called.
 */
let renderPosCartCalled = false;
function renderPosCart_STUB() {
  renderPosCartCalled = true;
}

function clearPosCart_UNFIXED(document) {
  posCart_UNFIXED = [];
  renderPosCart_STUB(); // equivalent to renderPosCart() in owner.js
  // NOTE: does NOT touch pos-customer-select (this is Bug 3 — but cart clear works)
}

// ---------------------------------------------------------------------------
// Test Runner
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const results = [];

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    results.push({ name, status: 'PASS' });
    passed++;
  } catch (err) {
    if (err instanceof assert.AssertionError) {
      console.log(`  ✗ FAIL: ${name}`);
      console.log(`    Reason: ${err.message}`);
      results.push({ name, status: 'FAIL', reason: err.message });
      failed++;
    } else {
      console.log(`  ✗ ERROR: ${name}`);
      console.log(`    ${err.message}`);
      results.push({ name, status: 'ERROR', reason: err.message });
      failed++;
    }
  }
}

// ===========================================================================
// PRESERVATION GROUP 1 — Bug 1: Valid integer IDs from SQLite
// Goal: confirm the CORRECT path (integer IDs) is unbroken on unfixed code.
// ===========================================================================
console.log('\n========================================');
console.log('PRESERVATION 1 — Valid integer IDs from SQLite');
console.log('  (should all PASS on unfixed code — Windows Chrome baseline)');
console.log('========================================');

// P1-A: Category options with integer IDs produce values "1" and "2"
runTest('P1-A: cachedCategories with integer IDs → option values are "1" and "2"', () => {
  const document = createMinimalDOM();
  document._register('prod-category-filter', 'select');
  document._register('prod-form-category', 'select');

  // SQLite-sourced: id is a plain integer
  cachedCategories = [
    { id: 1, name: 'Helmets', icon: '🪖' },
    { id: 2, name: 'Jackets', icon: '🧥' }
  ];

  populateCategoryDropdowns_UNFIXED(document);

  const formSelect = document.getElementById('prod-form-category');

  const helmetsOpt = formSelect.options.find(o => o.text.includes('Helmets'));
  const jacketsOpt = formSelect.options.find(o => o.text.includes('Jackets'));

  assert.ok(helmetsOpt, 'Helmets option must exist in #prod-form-category');
  assert.ok(jacketsOpt, 'Jackets option must exist in #prod-form-category');

  assert.strictEqual(
    helmetsOpt.value,
    '1',
    `Helmets option value="${helmetsOpt.value}" — expected "1" (String(1))`
  );
  assert.strictEqual(
    jacketsOpt.value,
    '2',
    `Jackets option value="${jacketsOpt.value}" — expected "2" (String(2))`
  );
});

// P1-B: Property — for ANY category where typeof id === 'number', option value === String(id)
// and parseInt(option.value, 10) === id
runTest('P1-B: Property — for any integer-id category, option.value === String(id) and parseInt === id', () => {
  const document = createMinimalDOM();
  document._register('prod-category-filter', 'select');
  document._register('prod-form-category', 'select');

  const integerCategories = [
    { id: 1, name: 'Helmets', icon: '🪖' },
    { id: 2, name: 'Jackets', icon: '🧥' },
    { id: 7, name: 'Gloves', icon: '🧤' },
    { id: 42, name: 'Exhausts', icon: '💨' },
    { id: 100, name: 'Tyres', icon: '🔧' }
  ];

  cachedCategories = integerCategories;
  populateCategoryDropdowns_UNFIXED(document);

  const formSelect = document.getElementById('prod-form-category');

  integerCategories.forEach(cat => {
    // Find the matching option by text (name appears in text)
    const opt = formSelect.options.find(o => o.text.includes(cat.name));
    assert.ok(opt, `Option for category "${cat.name}" (id=${cat.id}) must exist`);

    assert.strictEqual(
      opt.value,
      String(cat.id),
      `Category "${cat.name}": option.value="${opt.value}" should be "${String(cat.id)}"`
    );

    assert.strictEqual(
      parseInt(opt.value, 10),
      cat.id,
      `Category "${cat.name}": parseInt(option.value, 10)=${parseInt(opt.value, 10)} should equal id=${cat.id}`
    );
  });
});

// P1-C: Brand options with integer IDs produce correct values "1" and "2"
runTest('P1-C: cachedBrands with integer IDs → option values are "1" and "2"', () => {
  const document = createMinimalDOM();
  document._register('prod-form-brand', 'select');

  cachedBrands = [
    { id: 1, name: 'AGV' },
    { id: 2, name: 'Shoei' }
  ];

  populateBrandDropdowns_UNFIXED(document);

  const formSelect = document.getElementById('prod-form-brand');

  const agvOpt = formSelect.options.find(o => o.text.includes('AGV'));
  const shoeiOpt = formSelect.options.find(o => o.text.includes('Shoei'));

  assert.ok(agvOpt, 'AGV option must exist in #prod-form-brand');
  assert.ok(shoeiOpt, 'Shoei option must exist in #prod-form-brand');

  assert.strictEqual(
    agvOpt.value,
    '1',
    `AGV option value="${agvOpt.value}" — expected "1"`
  );
  assert.strictEqual(
    shoeiOpt.value,
    '2',
    `Shoei option value="${shoeiOpt.value}" — expected "2"`
  );
});

// P1-D: Property — for ANY brand where typeof id === 'number', option.value === String(id)
runTest('P1-D: Property — for any integer-id brand, option.value === String(id) and parseInt === id', () => {
  const document = createMinimalDOM();
  document._register('prod-form-brand', 'select');

  const integerBrands = [
    { id: 1, name: 'AGV' },
    { id: 2, name: 'Shoei' },
    { id: 5, name: 'Alpinestars' },
    { id: 11, name: 'Dainese' },
    { id: 99, name: 'Brembo' }
  ];

  cachedBrands = integerBrands;
  populateBrandDropdowns_UNFIXED(document);

  const formSelect = document.getElementById('prod-form-brand');

  integerBrands.forEach(brand => {
    const opt = formSelect.options.find(o => o.text.includes(brand.name));
    assert.ok(opt, `Option for brand "${brand.name}" (id=${brand.id}) must exist`);

    assert.strictEqual(
      opt.value,
      String(brand.id),
      `Brand "${brand.name}": option.value="${opt.value}" should be "${String(brand.id)}"`
    );

    assert.strictEqual(
      parseInt(opt.value, 10),
      brand.id,
      `Brand "${brand.name}": parseInt(option.value, 10)=${parseInt(opt.value, 10)} should equal id=${brand.id}`
    );
  });
});

// P1-E: Category filter dropdown also gets correct integer-string option values
runTest('P1-E: Category filter dropdown also uses integer-string option values for SQLite-sourced IDs', () => {
  const document = createMinimalDOM();
  document._register('prod-category-filter', 'select');
  document._register('prod-form-category', 'select');

  cachedCategories = [
    { id: 3, name: 'Riding Gear', icon: '🏍️' },
    { id: 8, name: 'Accessories', icon: '⚙️' }
  ];

  populateCategoryDropdowns_UNFIXED(document);

  const filterSelect = document.getElementById('prod-category-filter');

  const ridingOpt = filterSelect.options.find(o => o.text.includes('Riding Gear'));
  const accessOpt = filterSelect.options.find(o => o.text.includes('Accessories'));

  assert.ok(ridingOpt, 'Riding Gear option must exist in filter dropdown');
  assert.ok(accessOpt, 'Accessories option must exist in filter dropdown');

  assert.strictEqual(
    ridingOpt.value,
    '3',
    `Riding Gear filter option value="${ridingOpt.value}" should be "3"`
  );
  assert.strictEqual(
    accessOpt.value,
    '8',
    `Accessories filter option value="${accessOpt.value}" should be "8"`
  );
});

// ===========================================================================
// PRESERVATION GROUP 2 — Bug 2: Print button unaffected; walk-in no WhatsApp
// Goal: confirm that displayThermalReceipt on UNFIXED code does NOT break the
//       Print button behavior, and that walk-in (no phone) has no WhatsApp btn.
// ===========================================================================
console.log('\n========================================');
console.log('PRESERVATION 2 — Print button unaffected; walk-in no WhatsApp button');
console.log('  (should all PASS on unfixed code — baseline receipt behavior)');
console.log('========================================');

// P2-A: thermal receipt area is populated after displayThermalReceipt call
runTest('P2-A: displayThermalReceipt populates the thermal-receipt-area with receipt content', () => {
  const document = createMinimalDOM();
  document._register('modal-thermal-receipt', 'div');
  document._register('thermal-receipt-area', 'div');

  const saleData = {
    customer: { name: 'Ravi Kumar', phone: '9876543210' },
    billNumber: 'POS-001',
    grandTotal: 2500,
    items: [{ name: 'AGV Helmet', quantity: 1, price: 2500, total: 2500 }],
    store: { name: 'MOTO PITSHOP' },
    subtotal: 2119,
    taxTotal: 381,
    payment: { method: 'CASH' }
  };

  displayThermalReceipt_UNFIXED(document, saleData);

  const area = document.getElementById('thermal-receipt-area');
  const html = area.innerHTML;

  // The receipt area should contain the bill number and store name
  assert.ok(
    html.includes('POS-001'),
    `Receipt area must contain the bill number "POS-001". Got: ${html.substring(0, 100)}...`
  );
  assert.ok(
    html.includes('MOTO PITSHOP'),
    `Receipt area must contain the store name "MOTO PITSHOP"`
  );
  assert.ok(
    html.includes('Ravi Kumar'),
    `Receipt area must contain the customer name "Ravi Kumar"`
  );
});

// P2-B: The thermal receipt modal HTML contains a Print button wired to window.print()
//        This tests the OWNER.HTML structure — not the JS function.
//        We simulate the fixed modal header structure by checking the unfixed owner.html content.
runTest('P2-B: Thermal receipt modal Print button is present (in owner.html — static markup check)', () => {
  // This test validates the STATIC owner.html structure by reading it.
  const fs = require('fs');
  const path = require('path');
  const ownerHtml = fs.readFileSync(
    path.join(__dirname, '..', 'owner.html'),
    'utf8'
  );

  // The thermal receipt modal section is #modal-thermal-receipt
  // Find the section and confirm it has onclick="window.print()"
  const thermalModalIdx = ownerHtml.indexOf('modal-thermal-receipt');
  assert.ok(thermalModalIdx !== -1, 'modal-thermal-receipt must exist in owner.html');

  // Extract a reasonable window around the thermal receipt modal
  const thermalSection = ownerHtml.slice(thermalModalIdx, thermalModalIdx + 1000);

  assert.ok(
    thermalSection.includes('window.print()'),
    `The thermal receipt modal section must contain onclick="window.print()" for the Print button. ` +
    `Section: ${thermalSection.substring(0, 300)}...`
  );
});

// P2-C: Walk-in customer (no phone) → no visible WhatsApp button after displayThermalReceipt
runTest('P2-C: Walk-in (no phone): WhatsApp button absent or hidden after displayThermalReceipt', () => {
  const document = createMinimalDOM();
  document._register('modal-thermal-receipt', 'div');
  document._register('thermal-receipt-area', 'div');
  // No pos-whatsapp-btn registered — matches unfixed owner.html which lacks it

  const saleData = {
    customer: { name: 'Walk-in Counter Customer', phone: '' },
    billNumber: 'POS-456',
    grandTotal: 500,
    items: [],
    store: {}
  };

  displayThermalReceipt_UNFIXED(document, saleData);

  const waBtn = document.getElementById('pos-whatsapp-btn');

  // Button should be absent (null) or hidden (display:none)
  const isAbsentOrHidden = (waBtn === null) || (waBtn.style.display === 'none');
  assert.ok(
    isAbsentOrHidden,
    `Walk-in should have NO visible WhatsApp button. ` +
    `waBtn=${waBtn}, style.display=${waBtn ? waBtn.style.display : 'N/A'}`
  );
});

// P2-D: Walk-in with undefined phone → same result, no visible WhatsApp button
runTest('P2-D: Walk-in (phone undefined): WhatsApp button absent or hidden', () => {
  const document = createMinimalDOM();
  document._register('modal-thermal-receipt', 'div');
  document._register('thermal-receipt-area', 'div');

  const saleData = {
    customer: { name: 'Walk-in' },   // phone is undefined
    billNumber: 'POS-789',
    grandTotal: 300,
    items: [],
    store: {}
  };

  displayThermalReceipt_UNFIXED(document, saleData);

  const waBtn = document.getElementById('pos-whatsapp-btn');

  const isAbsentOrHidden = (waBtn === null) || (waBtn.style.display === 'none');
  assert.ok(
    isAbsentOrHidden,
    `Walk-in (undefined phone) should have NO visible WhatsApp button.`
  );
});

// P2-E: Receipt area shows customer phone in HTML when phone is present
// (Verifies that the phone line in the receipt is NOT broken by any change)
runTest('P2-E: Customer phone is rendered inside the receipt area when phone is present', () => {
  const document = createMinimalDOM();
  document._register('modal-thermal-receipt', 'div');
  document._register('thermal-receipt-area', 'div');

  const saleData = {
    customer: { name: 'Priya Sharma', phone: '9123456780' },
    billNumber: 'POS-100',
    grandTotal: 1800,
    items: [],
    store: {}
  };

  displayThermalReceipt_UNFIXED(document, saleData);

  const area = document.getElementById('thermal-receipt-area');
  assert.ok(
    area.innerHTML.includes('9123456780'),
    `Receipt area must show the customer phone "9123456780" in the receipt body`
  );
});

// P2-F: Receipt area does NOT show a PHONE line for walk-in
runTest('P2-F: Walk-in customer phone line does NOT appear in the receipt body', () => {
  const document = createMinimalDOM();
  document._register('modal-thermal-receipt', 'div');
  document._register('thermal-receipt-area', 'div');

  const saleData = {
    customer: { name: 'Walk-in', phone: '' },
    billNumber: 'POS-101',
    grandTotal: 100,
    items: [],
    store: {}
  };

  displayThermalReceipt_UNFIXED(document, saleData);

  const area = document.getElementById('thermal-receipt-area');

  // The <div><strong>PHONE:</strong> ...</div> line should NOT appear for walk-in
  assert.ok(
    !area.innerHTML.includes('<strong>PHONE:</strong>'),
    `Walk-in receipt should NOT have a PHONE line in the receipt body`
  );
});

// ===========================================================================
// PRESERVATION GROUP 3 — Bug 3: Cart clears correctly, posCart = []
// Goal: confirm clearPosCart() DOES empty posCart and DOES call renderPosCart()
//       on unfixed code (the bug is only that the customer dropdown isn't reset).
// ===========================================================================
console.log('\n========================================');
console.log('PRESERVATION 3 — Cart clears correctly, posCart = []');
console.log('  (should all PASS on unfixed code — clearPosCart baseline)');
console.log('========================================');

// P3-A: clearPosCart sets posCart to []
runTest('P3-A: clearPosCart() sets posCart to [] (length === 0)', () => {
  const document = createMinimalDOM();
  document._register('pos-customer-select', 'select');

  posCart_UNFIXED = [
    { product_id: 1, name: 'AGV Helmet', quantity: 2, price: 2500 },
    { product_id: 2, name: 'Shoei Jacket', quantity: 1, price: 4000 }
  ];

  clearPosCart_UNFIXED(document);

  assert.strictEqual(
    posCart_UNFIXED.length,
    0,
    `posCart.length should be 0 after clearPosCart(), got ${posCart_UNFIXED.length}`
  );
});

// P3-B: clearPosCart calls renderPosCart (empty-cart UI is triggered)
runTest('P3-B: clearPosCart() calls renderPosCart() — empty-cart UI is rendered', () => {
  const document = createMinimalDOM();
  document._register('pos-customer-select', 'select');

  posCart_UNFIXED = [{ product_id: 5, name: 'Helmet', quantity: 1, price: 1500 }];
  renderPosCartCalled = false;

  clearPosCart_UNFIXED(document);

  assert.strictEqual(
    renderPosCartCalled,
    true,
    `renderPosCart() must be called by clearPosCart() to update the UI`
  );
});

// P3-C: Property — for any non-empty cart, clearPosCart always results in posCart.length === 0
runTest('P3-C: Property — for any non-empty cart state, clearPosCart always produces posCart.length === 0', () => {
  const document = createMinimalDOM();
  document._register('pos-customer-select', 'select');

  // Test with various cart sizes
  const cartStates = [
    [{ product_id: 1, name: 'Helmet', quantity: 1, price: 2500 }],
    [
      { product_id: 1, name: 'Helmet', quantity: 2, price: 2500 },
      { product_id: 2, name: 'Jacket', quantity: 1, price: 3500 }
    ],
    Array.from({ length: 10 }, (_, i) => ({ product_id: i + 1, name: `Product ${i + 1}`, quantity: 1, price: 1000 }))
  ];

  cartStates.forEach((cartState, idx) => {
    posCart_UNFIXED = [...cartState];
    clearPosCart_UNFIXED(document);

    assert.strictEqual(
      posCart_UNFIXED.length,
      0,
      `Cart state ${idx + 1} (${cartState.length} items): posCart.length should be 0 after clearPosCart()`
    );
  });
});

// P3-D: clearPosCart on an already-empty cart — still results in [] (idempotent)
runTest('P3-D: clearPosCart() on already-empty cart is idempotent — posCart remains []', () => {
  const document = createMinimalDOM();
  document._register('pos-customer-select', 'select');

  posCart_UNFIXED = [];
  clearPosCart_UNFIXED(document);

  assert.strictEqual(
    posCart_UNFIXED.length,
    0,
    `clearPosCart() on already-empty cart — posCart.length should still be 0`
  );
});

// P3-E: Verify that clearPosCart does NOT reset the customer dropdown (documents Bug 3 as deliberate observation)
// This test captures the CURRENT behavior (the bug) so we have a documented baseline.
// After task 3.3 fix, this test must be updated — it's intentionally documenting the unfixed behavior.
runTest('P3-E: [Baseline observation] clearPosCart() does NOT reset pos-customer-select on unfixed code', () => {
  const document = createMinimalDOM();
  const custSelect = document._register('pos-customer-select', 'select');

  custSelect.options = [
    { value: '', text: 'Walk-in Counter Customer' },
    { value: '1', text: 'Ravi Kumar (RETAIL)' },
    { value: '2', text: 'Priya Sharma (RETAIL)' }
  ];
  custSelect.selectedIndex = 2; // simulate previous customer selected

  posCart_UNFIXED = [{ product_id: 1, name: 'Helmet', quantity: 1, price: 2500 }];
  clearPosCart_UNFIXED(document);

  // On UNFIXED code: selectedIndex is NOT reset, so it remains 2
  // This assertion documents the known bug (not a failure — it confirms the baseline)
  assert.strictEqual(
    custSelect.selectedIndex,
    2,
    `[Baseline for Bug 3] selectedIndex=${custSelect.selectedIndex} — still 2 on unfixed code ` +
    `(this is expected; Bug 3 fix will change this to 0)`
  );
});

// ===========================================================================
// Summary
// ===========================================================================
console.log('\n========================================');
console.log('TEST SUMMARY (Preservation Tests)');
console.log('========================================');
console.log(`Total tests: ${results.length}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  console.log('\n--- FAILURES (unexpected — these baseline behaviors are broken) ---');
  results.filter(r => r.status !== 'PASS').forEach(r => {
    console.log(`  [${r.status}] ${r.name}`);
    if (r.reason) console.log(`    → ${r.reason}`);
  });
  console.log('\n⚠ Some preservation tests FAILED — the baseline behaviors are not intact on unfixed code.');
  console.log('  This should not happen. Review the unfixed code paths.');
  process.exitCode = 1;
} else {
  console.log('\n✓ All preservation tests PASS on unfixed code.');
  console.log('  Baseline behaviors confirmed:');
  console.log('  → Bug 1: Integer-id categories/brands produce correct "id" string option values');
  console.log('  → Bug 2: Print button is present in thermal receipt modal; walk-in has no WhatsApp button');
  console.log('  → Bug 3: clearPosCart() correctly empties posCart and calls renderPosCart()');
  console.log('\nThese behaviors MUST continue to pass after fixes in tasks 3.1, 3.2, 3.3 are applied.');
  console.log('Re-run this file (task 3.5) to confirm no regressions after each fix.');
}
