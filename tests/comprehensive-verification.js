// tests/comprehensive-verification.js
// Comprehensive verification of Moto Pitshop server, APIs, product CRUD, image upload, and SQLite persistence.

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const TEST_PORT = 3456;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

function makeRequest(method, urlPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    const reqOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: { ...headers }
    };

    let payload = null;
    if (body) {
      payload = typeof body === 'string' ? body : JSON.stringify(body);
      reqOptions.headers['Content-Type'] = 'application/json';
      reqOptions.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(reqOptions, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data,
          json
        });
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log(' STARTING COMPREHENSIVE E2E SERVER & API VERIFICATION');
  console.log('====================================================');

  const serverPath = path.join(__dirname, '..', 'server.js');
  console.log('[E2E] Spawning server at:', serverPath);
  const serverProcess = spawn(process.execPath, [serverPath], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(TEST_PORT), NODE_ENV: 'production' }
  });

  serverProcess.stdout.on('data', d => console.log('[SERVER]', d.toString().trim()));
  serverProcess.stderr.on('data', d => console.error('[SERVER-ERR]', d.toString().trim()));

  // Wait for server to be ready
  let serverReady = false;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 300));
    try {
      const res = await makeRequest('GET', '/health');
      if (res.status === 200) {
        serverReady = true;
        break;
      }
    } catch (e) {}
  }

  if (!serverReady) {
    serverProcess.kill();
    throw new Error('Server failed to start within timeout');
  }
  console.log('-> Server is up and responding at', BASE_URL);

  let sessionToken = null;
  let cookieHeader = null;

  try {
    // 1. Health check
    console.log('\n[TEST 1] GET /health');
    const health = await makeRequest('GET', '/health');
    console.log('  Status:', health.status, 'Response:', health.body);
    if (health.status !== 200 || !health.json || health.json.status !== 'OK') {
      throw new Error('Health check failed');
    }

    // 2. Categories API
    console.log('\n[TEST 2] GET /api/categories');
    const cats = await makeRequest('GET', '/api/categories');
    console.log('  Status:', cats.status, 'Count:', cats.json?.categories?.length || cats.json?.length);
    if (cats.status !== 200) throw new Error('Categories API failed');

    // 3. Brands API
    console.log('\n[TEST 3] GET /api/brands');
    const brands = await makeRequest('GET', '/api/brands');
    console.log('  Status:', brands.status, 'Count:', brands.json?.brands?.length || brands.json?.length);
    if (brands.status !== 200) throw new Error('Brands API failed');

    // 4. Products API (List)
    console.log('\n[TEST 4] GET /api/products');
    const prods = await makeRequest('GET', '/api/products');
    console.log('  Status:', prods.status, 'Products:', prods.json?.products?.length);
    if (prods.status !== 200) throw new Error('Products API failed');

    // 5. Auth Login (Owner)
    console.log('\n[TEST 5] POST /api/auth/login (Owner credentials)');
    const loginRes = await makeRequest('POST', '/api/auth/login', {}, {
      email: 'owner@motopitshop.com',
      password: 'MotoPit@2026!Owner'
    });
    console.log('  Status:', loginRes.status, 'Role:', loginRes.json?.user?.role);
    if (loginRes.status !== 200 || !loginRes.json?.token) {
      throw new Error('Owner login failed');
    }
    sessionToken = loginRes.json.token;
    const rawCookies = loginRes.headers['set-cookie'];
    cookieHeader = Array.isArray(rawCookies) ? rawCookies.map(c => c.split(';')[0]).join('; ') : '';

    const authHeaders = {
      'Authorization': `Bearer ${sessionToken}`,
      'Cookie': cookieHeader
    };

    // 6. Auth Me
    console.log('\n[TEST 6] GET /api/auth/me');
    const meRes = await makeRequest('GET', '/api/auth/me', authHeaders);
    console.log('  Status:', meRes.status, 'User:', meRes.json?.user?.full_name);
    if (meRes.status !== 200 || meRes.json?.user?.role !== 'OWNER') {
      throw new Error('Auth me check failed');
    }

    // 7. Product CRUD: Create
    console.log('\n[TEST 7] Product CRUD - CREATE (POST /api/products)');
    const testSku = 'TEST-BRAKE-' + Date.now();
    const createRes = await makeRequest('POST', '/api/products', authHeaders, {
      name: 'Ceramic Racing Brake Pads',
      sku: testSku,
      slug: 'ceramic-racing-brake-pads-' + Date.now(),
      brand_id: 2, // Brembo
      category_id: 4, // Brake
      price: 2499,
      old_price: 2999,
      stock: 25,
      description: 'High performance racing brake pads for track and road use.',
      primary_image: 'exhaust.png',
      status: 'ACTIVE'
    });
    console.log('  Status:', createRes.status, 'Created ID:', createRes.json?.id || createRes.json?.product?.id);
    const createdId = createRes.json?.id || createRes.json?.product?.id;
    if (createRes.status !== 200 && createRes.status !== 201) {
      throw new Error('Create product failed: ' + createRes.body);
    }

    // 8. Product CRUD: Read
    console.log(`\n[TEST 8] Product CRUD - READ (GET /api/products/${createdId})`);
    const readRes = await makeRequest('GET', `/api/products/${createdId}`);
    console.log('  Status:', readRes.status, 'Name:', readRes.json?.product?.name || readRes.json?.name);
    if (readRes.status !== 200) throw new Error('Read product failed');

    // 9. Product CRUD: Update
    console.log(`\n[TEST 9] Product CRUD - UPDATE (PUT /api/products/${createdId})`);
    const updateRes = await makeRequest('PUT', `/api/products/${createdId}`, authHeaders, {
      price: 2299,
      stock: 30,
      name: 'Ceramic Racing Brake Pads (Updated)'
    });
    console.log('  Status:', updateRes.status);
    if (updateRes.status !== 200) throw new Error('Update product failed: ' + updateRes.body);

    // 10. Product CRUD: Delete
    console.log(`\n[TEST 10] Product CRUD - DELETE (DELETE /api/products/${createdId})`);
    const deleteRes = await makeRequest('DELETE', `/api/products/${createdId}`, authHeaders);
    console.log('  Status:', deleteRes.status);
    if (deleteRes.status !== 200) throw new Error('Delete product failed: ' + deleteRes.body);

    // 11. Image Upload
    console.log('\n[TEST 11] POST /api/owner/upload');
    const uploadRes = await makeRequest('POST', '/api/owner/upload', authHeaders, {
      filename: 'sample_part.png',
      image: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    });
    console.log('  Status:', uploadRes.status, 'URL prefix:', uploadRes.json?.url?.slice(0, 30));
    if (uploadRes.status !== 200 || !uploadRes.json?.url) {
      throw new Error('Image upload failed: ' + uploadRes.body);
    }

    // 12. Database Persistence Verification
    console.log('\n[TEST 12] Database Persistence & Integrity Check');
    const { db } = require('../database.js');
    const usersCount = db.prepare('SELECT count(*) as count FROM users').get().count;
    const catsCount = db.prepare('SELECT count(*) as count FROM categories').get().count;
    const brandsCount = db.prepare('SELECT count(*) as count FROM brands').get().count;
    console.log('  Persistent counts -> Users:', usersCount, 'Categories:', catsCount, 'Brands:', brandsCount);
    if (usersCount < 6 || catsCount < 11 || brandsCount < 9) {
      throw new Error('Persistent table counts degraded');
    }

    console.log('\n====================================================');
    console.log(' ALL 12 INTEGRATION & CRUD TESTS PASSED SUCCESSFULLY!');
    console.log('====================================================');

  } finally {
    serverProcess.kill('SIGTERM');
  }
}

runTests().then(() => {
  console.log('[COMPREHENSIVE VERIFICATION COMPLETE] Exit 0');
  process.exit(0);
}).catch(err => {
  console.error('[COMPREHENSIVE VERIFICATION FAILED]', err);
  process.exit(1);
});
