// Opt-in integration against a NEW disposable database, never the configured app DB.
// PACFAS_MYSQL_TEST=1 MYSQL_TEST_HOST=127.0.0.1 MYSQL_TEST_USER=root \
// MYSQL_TEST_PASSWORD=... npm run test:integration
// Requires permission to CREATE/DROP a temporary database. No secrets in output.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');

test('real MySQL/MariaDB migration and core HTTP workflows', {
  skip: process.env.PACFAS_MYSQL_TEST !== '1' && 'Requires opt-in and a reachable test MySQL/MariaDB server'
}, async t => {
  const name = `pacfas_test_${Date.now()}_${process.pid}`;
  let admin, pool, server;
  const files = new Set();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pacfas-mysql-'));
  const options = {
    host: process.env.MYSQL_TEST_HOST || '127.0.0.1', port: Number(process.env.MYSQL_TEST_PORT) || 3306,
    user: process.env.MYSQL_TEST_USER || 'root', password: process.env.MYSQL_TEST_PASSWORD || '',
    multipleStatements: true, connectTimeout: 5000
  };
  try {
    admin = await mysql.createConnection(options);
    await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    pool = mysql.createPool({ ...options, database: name, connectionLimit: 5 });
    await pool.query(fs.readFileSync(path.join(__dirname, '../database.sql'), 'utf8'));
    const hash = await bcrypt.hash('synthetic-test-password', 4);
    const [user] = await pool.execute('INSERT INTO user_account (username, email, password_hash, role_id) VALUES (?, ?, ?, 1)', ['integration-admin', 'integration-admin@example.test', hash]);
    const [caseRow] = await pool.execute('INSERT INTO case_file (cf_name, category_id, status_id, creation_date, created_by) VALUES (?,1,1,CURDATE(),?)', ['Synthetic integration case', user.insertId]);
    const caseId = caseRow.insertId;
    await t.test('migration preserves legacy text and marks unfinished versions retryable', async () => {
      const file = path.join(temp, 'legacy.png'); fs.writeFileSync(file, 'legacy');
      const [doc] = await pool.execute('INSERT INTO document (cf_code, doc_name, file_path, uploaded_by, date_added) VALUES (?, ?, ?, ?, CURDATE())', [caseId, 'Legacy', file, user.insertId]);
      await pool.execute('INSERT INTO document_version (document_code, version_no, file_path, extracted_text, uploaded_by) VALUES (?,1,?,?,?)', [doc.insertId, file, 'Legacy useful text', user.insertId]);
      await pool.execute('INSERT INTO document_version (document_code, version_no, file_path, uploaded_by) VALUES (?,2,?,?)', [doc.insertId, file, user.insertId]);
      await pool.query('ALTER TABLE document MODIFY file_type VARCHAR(10) DEFAULT NULL');
      await pool.query('ALTER TABLE document_version DROP INDEX uq_document_version, DROP COLUMN ocr_status, DROP COLUMN ocr_error');
      await pool.query(fs.readFileSync(path.join(__dirname, '../migrations/001_document_ocr.sql'), 'utf8'));
      const [versions] = await pool.execute('SELECT extracted_text, ocr_status FROM document_version WHERE document_code=? ORDER BY version_no', [doc.insertId]);
      assert.equal(versions[0].extracted_text, 'Legacy useful text');
      assert.deepEqual(versions.map(v => v.ocr_status), ['COMPLETED', 'FAILED']);
      await assert.rejects(pool.execute('INSERT INTO document_version (document_code, version_no, file_path, uploaded_by) VALUES (?,1,?,?)', [doc.insertId, file, user.insertId]));
    });
    const id = require.resolve('../config/db');
    require.cache[id] = { id, filename: id, loaded: true, exports: pool };
    const ocrId = require.resolve('../utils/documentOCR');
    require.cache[ocrId] = { id: ocrId, filename: ocrId, loaded: true, exports: { scheduleOCR() {} } };
    // OCR scheduling is disabled here to isolate SQL/file persistence. Actual text-PDF
    // parsing and OCR status transitions have separate tests.
    process.env.JWT_SECRET = 'integration-test-only-secret';
    const app = require('../app');
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const base = `http://127.0.0.1:${server.address().port}/api/v1`;
    let token;
    async function req(endpoint, method = 'GET', body) {
      const headers = token ? { authorization: `Bearer ${token}` } : {};
      const form = body instanceof FormData;
      if (body && !form) headers['content-type'] = 'application/json';
      return fetch(base + endpoint, { method, headers, body: form ? body : body ? JSON.stringify(body) : undefined });
    }
    await t.test('active user logs in against real password hash', async () => {
      const r = await req('/auth/login', 'POST', { email: 'integration-admin@example.test', password: 'synthetic-test-password' });
      assert.equal(r.status, 200); token = (await r.json()).token;
    });
    await t.test('public registration cannot choose administrator role in real storage', async () => {
      const r = await req('/auth/register', 'POST', { username: 'integration-public', email: 'integration-public@example.test', password: 'synthetic-test-password', role_id: 1 });
      assert.equal(r.status, 201);
      const [rows] = await pool.execute('SELECT role_id FROM user_account WHERE email=?', ['integration-public@example.test']);
      assert.equal(rows[0].role_id, 5);
    });
    await t.test('client creation, linking and linked-case listing execute real SQL', async () => {
      const created = await req('/clients', 'POST', { fname: 'Synthetic', lname: 'Client', birth_date: '1990-01-01', email: 'integration-client@example.test' });
      assert.equal(created.status, 201); const clientId = (await created.json()).data.client_id;
      assert.equal((await req(`/clients/${clientId}/cases`, 'POST', { cf_code: caseId })).status, 201);
      const listed = await req(`/clients/${clientId}/cases`); assert.equal(listed.status, 200);
      assert.equal((await listed.json()).data[0].cf_code, caseId);
    });
    await t.test('hearing creation, case detail query and calendar query execute real SQL', async () => {
      assert.equal((await req('/hearings', 'POST', { case_id: caseId, title: 'Synthetic hearing', hearing_date: '2026-11-01 10:00:00' })).status, 201);
      const detail = await req(`/hearings?case_id=${caseId}`); assert.equal(detail.status, 200);
      assert.equal((await detail.json()).data[0].title, 'Synthetic hearing');
      const calendar = await req('/hearings/calendar?startDate=2026-11-01&endDate=2026-11-30');
      assert.equal(calendar.status, 200); assert.ok((await calendar.json()).data.length);
    });
    await t.test('PDF metadata fits storage, revision advances and download uses latest bytes', async () => {
      function form(marker) {
        const data = new FormData(); data.append('case_id', String(caseId)); data.append('title', 'Synthetic PDF');
        data.append('document', new Blob([`%PDF-1.4\n${marker}`], { type: 'application/pdf' }), 'synthetic.pdf');
        return data;
      }
      // Signature-valid but intentionally not a complete PDF: parser is not invoked in this SQL test.
      const r = await req('/documents/upload', 'POST', form('ORIGINAL'));
      assert.equal(r.status, 201); const docId = (await r.json()).data.documentId;
      const revision = await req(`/documents/${docId}/versions`, 'POST', form('LATEST'));
      assert.equal(revision.status, 201); assert.equal((await revision.json()).data.versionNumber, 2);
      const [rows] = await pool.execute('SELECT file_path FROM document_version WHERE document_code=?', [docId]);
      rows.forEach(row => files.add(row.file_path));
      const downloaded = await req(`/documents/${docId}/download`); assert.equal(downloaded.status, 200);
      assert.match(await downloaded.text(), /LATEST/);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (pool) {
      // Also collect files if an assertion failed after upload but before explicit collection.
      try { const [rows] = await pool.query('SELECT file_path FROM document_version'); rows.forEach(row => {
        if (row.file_path.startsWith(path.join(__dirname, '../uploads/documents/'))) files.add(row.file_path);
      }); } catch {}
      await pool.end();
    }
    for (const file of files) fs.rmSync(file, { force: true });
    fs.rmSync(temp, { recursive: true, force: true });
    if (admin) { try { await admin.query(`DROP DATABASE IF EXISTS \`${name}\``); } finally { await admin.end(); } }
  }
});
