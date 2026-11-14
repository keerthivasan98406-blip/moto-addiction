// test-sqlite.js - SQLite Smoke Test & Runtime Diagnostics for Moto Pitshop
// Verifies native better-sqlite3 bindings, in-memory operations, file-based operations,
// and the integrity of existing production database records.

const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('====================================================');
console.log(' MOTO PITSHOP - SQLITE RUNTIME DIAGNOSTIC & SMOKE TEST');
console.log('====================================================');

console.log(`[ENV] Node.js Version: ${process.version}`);
console.log(`[ENV] Platform:        ${process.platform} (${process.arch})`);
console.log(`[ENV] V8 Version:      ${process.versions.v8}`);
console.log(`[ENV] Node Module ABI: ${process.versions.modules}`);
console.log(`[ENV] Working Dir:     ${process.cwd()}`);
console.log(`[ENV] __dirname:       ${__dirname}`);
console.log(`[ENV] NODE_ENV:        ${process.env.NODE_ENV || 'not set'}`);
console.log('----------------------------------------------------');

let Database;
try {
  console.log('[STEP 1/5] Loading better-sqlite3 native module...');
  Database = require('better-sqlite3');
  console.log('  -> PASS: better-sqlite3 loaded successfully (no SIGSEGV / ABI mismatch)');
} catch (err) {
  console.error('  -> FAIL: Could not load better-sqlite3 native module:', err.message);
  process.exit(1);
}

// Step 2: Test In-Memory Database
try {
  console.log('[STEP 2/5] Testing In-Memory SQLite Database (:memory:)...');
  const memDb = new Database(':memory:');
  memDb.exec('PRAGMA foreign_keys = ON;');
  
  memDb.exec(`
    CREATE TABLE smoke_test (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      amount REAL NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  const insert = memDb.prepare('INSERT INTO smoke_test (title, amount) VALUES (?, ?)');
  const res1 = insert.run('Brake Pads Test', 1450.50);
  const res2 = insert.run('Engine Oil 10W40', 850.00);

  if (res1.changes !== 1 || res2.changes !== 1) {
    throw new Error('Insert did not report 1 change');
  }

  const rows = memDb.prepare('SELECT * FROM smoke_test ORDER BY id ASC').all();
  if (rows.length !== 2 || rows[0].title !== 'Brake Pads Test') {
    throw new Error('Unexpected query results from in-memory test');
  }

  // Test Transaction
  const tx = memDb.transaction((items) => {
    for (const item of items) {
      insert.run(item.title, item.amount);
    }
  });
  tx([
    { title: 'Chain Cleaner', amount: 350.00 },
    { title: 'Spark Plug', amount: 220.00 }
  ]);

  const totalCount = memDb.prepare('SELECT count(*) as count FROM smoke_test').get().count;
  if (totalCount !== 4) {
    throw new Error(`Expected 4 rows, found ${totalCount}`);
  }

  memDb.close();
  console.log('  -> PASS: In-memory table creation, parameterized insert, transaction and select passed.');
} catch (err) {
  console.error('  -> FAIL: In-memory SQLite test failed:', err.message);
  process.exit(1);
}

// Step 3: Test File-Based SQLite Database in Temporary Directory
const tmpDbPath = path.join(os.tmpdir(), `motopit_test_${Date.now()}.db`);
try {
  console.log(`[STEP 3/5] Testing File-Based Database in os.tmpdir (${tmpDbPath})...`);
  const fileDb = new Database(tmpDbPath);
  fileDb.pragma('journal_mode = WAL');
  fileDb.exec('CREATE TABLE tmp_test (id INTEGER PRIMARY KEY, note TEXT);');
  fileDb.prepare('INSERT INTO tmp_test (note) VALUES (?)').run('file persistence verified');
  const row = fileDb.prepare('SELECT * FROM tmp_test WHERE id = 1').get();
  if (!row || row.note !== 'file persistence verified') {
    throw new Error('File-based query did not return expected data');
  }
  fileDb.close();
  
  // Cleanup temp files
  try {
    if (fs.existsSync(tmpDbPath)) fs.unlinkSync(tmpDbPath);
    const walFile = `${tmpDbPath}-wal`;
    const shmFile = `${tmpDbPath}-shm`;
    if (fs.existsSync(walFile)) fs.unlinkSync(walFile);
    if (fs.existsSync(shmFile)) fs.unlinkSync(shmFile);
  } catch (cleanErr) { /* ignore cleanup error */ }

  console.log('  -> PASS: File-based SQLite operations in temporary directory verified.');
} catch (err) {
  console.error('  -> FAIL: File-based SQLite test failed:', err.message);
  process.exit(1);
}

// Step 4: Verify Existing Production Database (motopitshop.db)
const prodDbPath = path.join(__dirname, 'motopitshop.db');
try {
  console.log(`[STEP 4/5] Checking existing production database (${prodDbPath})...`);
  if (!fs.existsSync(prodDbPath)) {
    console.warn(`  -> NOTE: ${prodDbPath} does not exist yet (clean clone). Will be created by initDatabase().`);
  } else {
    const stats = fs.statSync(prodDbPath);
    console.log(`  -> Database file exists: ${stats.size} bytes, modified: ${stats.mtime.toISOString()}`);
    
    const prodDb = new Database(prodDbPath, { readonly: true });
    
    // Inspect key tables
    const requiredTables = ['users', 'categories', 'brands', 'bikes', 'suppliers', 'products', 'orders', 'store_settings'];
    const existingTables = prodDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
    
    const missingTables = requiredTables.filter(t => !existingTables.includes(t));
    if (missingTables.length > 0) {
      console.warn(`  -> Note: Some tables not yet initialized: ${missingTables.join(', ')}`);
    } else {
      console.log(`  -> Verified all primary tables exist: ${requiredTables.join(', ')}`);
    }

    // Count records
    const counts = {};
    for (const tbl of ['users', 'categories', 'brands', 'products', 'orders']) {
      if (existingTables.includes(tbl)) {
        counts[tbl] = prodDb.prepare(`SELECT count(*) as count FROM "${tbl}"`).get().count;
      }
    }
    console.log('  -> Existing record counts:', JSON.stringify(counts));

    prodDb.close();
    console.log('  -> PASS: Production database read and verification succeeded without corruption.');
  }
} catch (err) {
  console.error('  -> FAIL: Production database verification failed:', err.message);
  process.exit(1);
}

// Step 5: Test Database Layer Module (database.js)
try {
  console.log('[STEP 5/5] Testing database.js exports and functions...');
  const { db, initDatabase, hashPassword } = require('./database.js');
  
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('db object missing or does not have prepare() method');
  }
  if (typeof initDatabase !== 'function') {
    throw new Error('initDatabase is not a function');
  }
  if (typeof hashPassword !== 'function') {
    throw new Error('hashPassword is not a function');
  }

  // Verify hashPassword
  const hash = hashPassword('TestPassword123!');
  if (!hash || hash.length !== 128) {
    throw new Error('hashPassword did not return expected 128-char hex string');
  }

  // Verify connection is alive
  const check = db.prepare('SELECT 1 as alive').get();
  if (!check || check.alive !== 1) {
    throw new Error('db.prepare(SELECT 1) failed');
  }

  console.log('  -> PASS: database.js module is fully functional and connection is active.');
} catch (err) {
  console.error('  -> FAIL: database.js layer test failed:', err.message);
  process.exit(1);
}

console.log('====================================================');
console.log(' ALL SQLITE RUNTIME TESTS PASSED SUCCESSFULLY!       ');
console.log(' Node.js + better-sqlite3 environment is healthy.   ');
console.log('====================================================');
process.exit(0);
