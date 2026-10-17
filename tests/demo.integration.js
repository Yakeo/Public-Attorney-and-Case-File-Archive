// Opt-in only. Uses newly created *_demo databases and removes only those DBs/files.
// Requires an actual bundle (npm run demo:build) and MySQL/MariaDB create/drop permission.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const { install, verifyInstall, loadBundle, ROOT } = require('../scripts/demo/install');
const { DEMO_PASSWORD, dateOffset } = require('../scripts/demo/plan');
const digest = b => crypto.createHash('sha256').update(b).digest('hex');

test('real demo install, idempotence, isolation, HTTP downloads/search/privacy and actual OCR', {
  skip: process.env.PACFAS_DEMO_TEST !== '1' && 'Requires PACFAS_DEMO_TEST=1 and a generated bundle'
}, async t => {
  const bundle = path.resolve(process.env.DEMO_BUNDLE || path.join(ROOT, 'demo-data/defense-v1'));
  const { plan } = await loadBundle(bundle);
  const dbname = `pacfas_seed_${Date.now()}_${process.pid}_demo`;
  const protect = `pacfas_keep_${Date.now()}_${process.pid}_demo`;
  const options = { host: process.env.MYSQL_TEST_HOST || '127.0.0.1', port: Number(process.env.MYSQL_TEST_PORT || 3306),
    socketPath: process.env.MYSQL_TEST_SOCKET || undefined, user: process.env.MYSQL_TEST_USER || 'root',
    password: process.env.MYSQL_TEST_PASSWORD || '', multipleStatements: true };
  let db, server, appDB, receipt;
  try {
    db = await mysql.createConnection(options);
    await db.query(`CREATE DATABASE \`${dbname}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await db.query(`CREATE DATABASE \`${protect}\``);
    await db.query(`USE \`${protect}\``);
    await db.query("CREATE TABLE sentinel (value VARCHAR(30)); INSERT INTO sentinel VALUES ('preserve this record')");
    await t.test('unmarked populated database is rejected without touching its record', async () => {
      const protectedConnection = await mysql.createConnection({ ...options, database: protect });
      try { await assert.rejects(install(protectedConnection, protect, bundle), /Refusing to modify/); }
      finally { await protectedConnection.end(); }
      const [rows] = await db.query('SELECT value FROM sentinel');
      assert.equal(rows[0].value, 'preserve this record');
    });
    await db.query(`USE \`${dbname}\``);
    await t.test('fresh isolated DB contains precisely 5 attorneys, 18 cases, 90 documents and 92 real versions', async () => {
      const result = await install(db, dbname, bundle); receipt = result.receipt;
      assert.equal(result.alreadyInstalled, false);
      for (const [table, expected] of [['attorney', 5], ['client', 18], ['case_file', 18], ['document', 90], ['document_version', 92], ['hearing_schedule', 8]]) {
        const [rows] = await db.query(`SELECT COUNT(*) AS n FROM ${table}`); assert.equal(rows[0].n, expected, table);
      }
      const [inactive] = await db.query('SELECT COUNT(*) AS n FROM user_account WHERE is_active=0');
      assert.equal(inactive[0].n, 18);
      assert.ok(Object.values(receipt.paths).every(p => !path.isAbsolute(p) && !p.includes('\\')));
    });
    await t.test('identical rerun verifies/skips instead of duplicating or wiping data', async () => {
      const result = await install(db, dbname, bundle);
      assert.equal(result.alreadyInstalled, true); assert.deepEqual(result.receipt, receipt);
      const [rows] = await db.query('SELECT COUNT(*) AS n FROM document_version'); assert.equal(rows[0].n, 92);
    });
    await t.test('manifest fingerprint mismatch is rejected without rewriting records', async () => {
      await db.execute('UPDATE demo_dataset SET manifest_sha256=?', ['0'.repeat(64)]);
      await assert.rejects(install(db, dbname, bundle), /Refusing to modify/);
      await db.execute('UPDATE demo_dataset SET manifest_sha256=?', [(await loadBundle(bundle)).hash]);
      await verifyInstall(db, bundle);
    });
    Object.assign(process.env, { DB_NAME: dbname, DB_HOST: options.host, DB_PORT: String(options.port),
      DB_USER: options.user, DB_PASSWORD: options.password, DB_SOCKET: options.socketPath || '',
      TESSDATA_PATH: path.join(bundle, 'language-data'), JWT_SECRET: crypto.randomBytes(32).toString('hex') });
    const app = require('../app'); appDB = require('../config/db');
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    let token, staff, publicToken;
    async function req(endpoint, auth = token, body) {
      return fetch(base + '/api/v1' + endpoint, { method: body ? 'POST' : 'GET',
        headers: { ...(auth ? { authorization: `Bearer ${auth}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined });
    }
    await t.test('all eight demo logins work and client profile login is disabled', async () => {
      for (const account of plan.accounts) {
        const r = await req('/auth/login', null, { email: account.email, password: DEMO_PASSWORD });
        assert.equal(r.status, 200, account.key); const data = await r.json();
        if (account.key === 'admin') token = data.token;
        if (account.key === 'staff') staff = data.token;
        if (account.key === 'public') publicToken = data.token;
      }
      assert.equal((await req('/auth/login', null, { email: plan.clients[0].email, password: DEMO_PASSWORD })).status, 401);
    });
    await t.test('public directory has five attorneys; only two summaries are public; document privacy is enforced', async () => {
      assert.equal((await (await req('/attorneys', null)).json()).results, 5);
      const pub = await req('/cases/public', null); assert.equal(pub.status, 200);
      const data = (await pub.json()).data; assert.equal(data.length, 2);
      assert.ok(data.every(c => /DEMO-1[78]/.test(c.title || c.cf_name)));
      assert.equal((await req('/documents', null)).status, 401);
      assert.equal((await req('/documents', publicToken)).status, 403);
      assert.equal((await req('/cases', publicToken)).status, 403);
      const raw = Object.values(receipt.paths)[0]; assert.equal((await fetch(`${base}/${raw}`)).status, 404);
    });
    await t.test('all cases have five current documents and all 90 current downloads match actual bytes', async () => {
      for (const c of plan.cases) {
        const r = await req(`/documents?case_id=${receipt.cases[c.key]}`); assert.equal(r.status, 200);
        assert.equal((await r.json()).data.length, 5);
      }
      for (const doc of plan.documents) {
        const r = await req(`/documents/${receipt.documents[doc.key]}/download`); assert.equal(r.status, 200, doc.key);
        assert.equal(digest(Buffer.from(await r.arrayBuffer())), doc.versions.at(-1).sha256, doc.key);
      }
    });
    await t.test('real full-text endpoint finds OCR marker and both preloaded revision histories', async () => {
      const search = await req('/documents/search?q=ORCHID'); assert.equal(search.status, 200);
      assert.equal((await search.json()).data.length, 5);
      const revisions = await req('/documents/search?q=REVISIONTWO'); assert.equal((await revisions.json()).data.length, 2);
      for (const key of ['case-2-doc-1', 'case-3-doc-1']) {
        const r = await req(`/documents/${receipt.documents[key]}/versions`); const rows = (await r.json()).data;
        assert.deepEqual(rows.map(v => v.version_number), [2, 1]);
        assert.match(rows[0].extracted_text, /REVISIONTWO/); assert.match(rows[1].extracted_text, /INITIALCOPY/);
      }
    });
    await t.test('document search finds filenames, excludes old versions and deleted parent cases', async () => {
      const filename = await req('/documents/search?q=DEMO-01-doc2-v1.png');
      assert.equal((await filename.json()).data.length, 1);
      const initial = (await (await req('/documents/search?q=INITIALCOPY')).json()).data;
      for (const key of ['case-2-doc-1', 'case-3-doc-1']) assert.ok(!initial.some(d => d.document_id === receipt.documents[key]));
      await db.execute('UPDATE case_file SET is_deleted=1 WHERE cf_code=?', [receipt.cases['case-1']]);
      try { assert.equal((await (await req('/documents/search?q=ORCHID')).json()).data.length, 0); }
      finally { await db.execute('UPDATE case_file SET is_deleted=0 WHERE cf_code=?', [receipt.cases['case-1']]); }
    });
    await t.test('real queued OCR becomes searchable only after successful recognition', async () => {
      const sample = plan.documents[0].versions[0];
      const file = receipt.paths[sample.file];
      const [doc] = await db.execute(`INSERT INTO document
        (cf_code,doc_name,file_path,uploaded_by,date_added,current_version_no) VALUES (?,?,?,?,CURDATE(),1)`,
        [receipt.cases['case-1'], 'Queued recognition sample', file, receipt.users.admin]);
      try {
        await db.execute(`INSERT INTO document_version
          (document_code,version_no,file_name,file_path,uploaded_by,ocr_status) VALUES (?,1,?,?,?,'PENDING')`,
          [doc.insertId, 'queued-scan.pdf', file, receipt.users.admin]);
        const before = await (await req('/documents/search?q=ORCHID')).json();
        assert.ok(!before.data.some(d => d.document_id === doc.insertId)); assert.ok(before.pending >= 1);
        await require('../utils/documentOCR').processOCR(doc.insertId, 1, path.join(ROOT, file));
        const after = await (await req('/documents/search?q=ORCHID')).json();
        assert.ok(after.data.some(d => d.document_id === doc.insertId && d.ocr_status === 'COMPLETED'));
      } finally {
        await db.execute('DELETE FROM document_version WHERE document_code=?', [doc.insertId]);
        await db.execute('DELETE FROM document WHERE document_code=?', [doc.insertId]);
      }
    });
    await t.test('shared clients/counsel are real links and staff hearing conflict returns 409', async () => {
      const id = receipt.cases['case-3'];
      assert.equal((await (await req(`/cases/${id}/clients`)).json()).data.length, 2);
      assert.equal((await (await req(`/cases/${id}/attorneys`)).json()).data.length, 2);
      const r = await req('/hearings', staff, { case_id: receipt.cases['case-6'], title: 'Demo conflict attempt', hearing_date: `${dateOffset(plan.date, 14)} 09:30:00` });
      assert.equal(r.status, 409); assert.match((await r.json()).message, /conflict/i);
      const [rows] = await db.query('SELECT COUNT(*) AS n FROM hearing_schedule'); assert.equal(rows[0].n, 8);
    });
    await t.test('app extractor independently recognizes bundled image-only PDF and PNG', async () => {
      const { extractText } = require('../utils/documentOCR');
      for (const doc of plan.documents.slice(0, 2)) {
        const text = await extractText(path.join(ROOT, receipt.paths[doc.versions[0].file]));
        assert.match(text, /ORCHID/); assert.match(text, /SYNTHETIC DEMO DATA/);
      }
    });
    if (process.env.PACFAS_SEARCH_BROWSER === '1') {
      await t.test('real browser upload-to-OCR-to-live-search workflow', async () => {
        await require('./search.browser.cjs').runSearchBrowser({ base, bundle, receipt, db });
      });
    }
    await t.test('baseline verification still passes after real authenticated rehearsal', async () => {
      assert.equal((await verifyInstall(db, bundle)).status, 'verified');
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (appDB) await appDB.end();
    if (db) {
      await db.query(`DROP DATABASE IF EXISTS \`${dbname}\``);
      await db.query(`DROP DATABASE IF EXISTS \`${protect}\``);
      await db.end();
    }
    await fs.rm(path.join(ROOT, 'uploads/defense-v1', dbname), { recursive: true, force: true });
  }
});
