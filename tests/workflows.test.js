// HTTP route/controller tests with an explicitly mocked database and image OCR.
// These DO NOT validate real SQL execution, locking, OCR accuracy, or browser rendering.
// REGRESSION tests assert the desired behavior and intentionally fail on current defects.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const root = path.resolve(__dirname, '..');
const secret = 'test-only-secret-not-a-deployment-credential';
process.env.JWT_SECRET = secret;
let calls = [], transaction = [], responder, server, base;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pacfas-test-'));
const uploadPaths = new Set();
const execute = async (sql, params = []) => {
  calls.push({ sql, params });
  if (params.includes(undefined)) throw new TypeError('Bind parameters must not contain undefined');
  return [await responder(sql, params), []];
};
const connection = {
  execute,
  beginTransaction: async () => transaction.push('begin'),
  commit: async () => transaction.push('commit'),
  rollback: async () => transaction.push('rollback'),
  release: () => transaction.push('release')
};
const dbPath = require.resolve('../config/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { execute, getConnection: async () => connection } };
const auditPath = require.resolve('../utils/auditLog');
require.cache[auditPath] = { id: auditPath, filename: auditPath, loaded: true, exports: { logAction: async () => {}, getRequestMeta: () => ({}) } };
const tesseract = require('tesseract.js');
const originalWorker = tesseract.createWorker;
tesseract.createWorker = async () => ({ recognize: async () => ({ data: { text: 'MOCK OCR affidavit text' } }), terminate: async () => {} });

before(async () => {
  const app = express();
  app.use(express.json());
  for (const name of ['auth', 'case', 'client', 'attorney', 'hearing', 'document']) {
    const prefix = { case: 'cases', client: 'clients', attorney: 'attorneys', hearing: 'hearings', document: 'documents', auth: 'auth' }[name];
    app.use(`/api/v1/${prefix}`, require(`../routes/${name}Routes`));
  }
  app.use(require('../middleware/errorHandler'));
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});
beforeEach(() => {
  calls = []; transaction = [];
  responder = sql => /^(INSERT|UPDATE)/i.test(sql.trim()) ? { insertId: 42, affectedRows: 1 } : [];
});
after(async () => {
  tesseract.createWorker = originalWorker;
  await new Promise(resolve => server.close(resolve));
  for (const p of uploadPaths) fs.rmSync(p, { force: true });
  fs.rmSync(tmp, { recursive: true, force: true });
});
async function request(endpoint, { method = 'GET', body, role = 1, token, form } = {}) {
  const headers = { authorization: `Bearer ${token || jwt.sign({ user_id: 7, role_id: role }, secret, { expiresIn: '1h' })}` };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + endpoint, { method, headers, body: form || (body === undefined ? undefined : JSON.stringify(body)) });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data, text };
}

test('AUTH: expired token rejected', async () => {
  const r = await request('/cases', { token: jwt.sign({ user_id: 7 }, secret, { expiresIn: -1 }) });
  assert.equal(r.status, 401); assert.equal(calls.length, 0);
});
test('AUTH: incorrect signing secret rejected', async () => {
  assert.equal((await request('/cases', { token: jwt.sign({ user_id: 7 }, 'wrong-secret') })).status, 401);
});
test('AUTH: standard user cannot create a case', async () => {
  assert.equal((await request('/cases', { method: 'POST', role: 5, body: { title: 'Test' } })).status, 403);
  assert.equal(calls.length, 0);
});
test('AUTH: standard user cannot manage clients', async () => {
  assert.equal((await request('/clients', { role: 5 })).status, 403);
});
test('AUTH: nonadministrator cannot create attorneys', async () => {
  assert.equal((await request('/attorneys', { method: 'POST', role: 3, body: {} })).status, 403);
});
test('AUTH: login rejects unknown email', async () => {
  assert.equal((await request('/auth/login', { method: 'POST', body: { email: 'nobody@example.test', password: 'test' } })).status, 401);
});
test('AUTH: correct password returns verifiable token', async () => {
  const hash = await bcrypt.hash('test-password', 4);
  responder = () => [{ user_id: 7, username: 'tester', email: 'tester@example.test', password_hash: hash, role_id: 3 }];
  const r = await request('/auth/login', { method: 'POST', body: { email: 'tester@example.test', password: 'test-password' } });
  assert.equal(r.status, 200);
  assert.equal(jwt.verify(r.data.token, secret).role_id, 3);
  assert.equal(r.data.user.password_hash, undefined);
});
test('AUTH: incorrect password rejected', async () => {
  const hash = await bcrypt.hash('right-password', 4);
  responder = () => [{ password_hash: hash }];
  assert.equal((await request('/auth/login', { method: 'POST', body: { email: 'tester@example.test', password: 'wrong' } })).status, 401);
});
test('AUTH: registration hashes password and defaults to role 5', async () => {
  const r = await request('/auth/register', { method: 'POST', body: { username: 'test', email: 'test@example.test', password: 'test-password' } });
  assert.equal(r.status, 201);
  const insert = calls.find(c => c.sql.includes('INSERT INTO user_account'));
  assert.equal(insert.params[3], 5);
  assert.equal(await bcrypt.compare('test-password', insert.params[2]), true);
});
test('REGRESSION SECURITY: public registration must not accept administrator role', async () => {
  await request('/auth/register', { method: 'POST', body: { username: 'test', email: 'test@example.test', password: 'test-password', role_id: 1 } });
  const insert = calls.find(c => c.sql.includes('INSERT INTO user_account'));
  assert.ok(!insert || insert.params[3] !== 1, 'Client-supplied role 1 reached the user INSERT');
});

test('CASES: title is required', async () => {
  assert.equal((await request('/cases', { method: 'POST', body: {} })).status, 400);
});
test('CASES: category/year/padded ID are returned', async () => {
  responder = sql => sql.includes('SELECT code FROM case_category') ? [{ code: 'CIV' }] : { insertId: 42 };
  const r = await request('/cases', { method: 'POST', body: { title: 'Synthetic case', category_id: 1 } });
  assert.equal(r.status, 201);
  assert.equal(r.data.data.case_id, 42);
  assert.equal(r.data.data.case_number, `CIV-${new Date().getFullYear()}-0042`);
});
test('CASES: missing case returns 404', async () => {
  assert.equal((await request('/cases/999')).status, 404);
});
test('CASES: filters use bound parameters', async () => {
  assert.equal((await request('/cases?q=affidavit&category=Civil&status=Active')).status, 200);
  assert.ok(calls[0].params.some(p => String(p).includes('affidavit')));
  assert.ok(!calls[0].sql.includes('affidavit'));
});
test('ASSIGNMENT: missing attorney ID rejected', async () => {
  assert.equal((await request('/cases/42/attorneys', { method: 'POST', body: {} })).status, 400);
});
test('ASSIGNMENT: inactive attorney rejected', async () => {
  responder = sql => sql.includes('SELECT cf_code') ? [{ cf_code: 42 }] : [{ attorney_id: 'A0007', is_active: 0 }];
  assert.equal((await request('/cases/42/attorneys', { method: 'POST', body: { attorney_id: 'A0007' } })).status, 403);
});
test('ASSIGNMENT: valid attorney association inserted', async () => {
  responder = sql => sql.includes('SELECT cf_code') ? [{ cf_code: 42 }] : sql.includes('SELECT a.attorney_id') ? [{ attorney_id: 'A0007', is_active: 1 }] : { insertId: 12 };
  assert.equal((await request('/cases/42/attorneys', { method: 'POST', body: { attorney_id: 'A0007' } })).status, 201);
});
test('REGRESSION SECURITY: standard user must not modify attorney assignments', async () => {
  responder = sql => sql.includes('SELECT cf_code') ? [{ cf_code: 42 }] : sql.includes('SELECT a.attorney_id') ? [{ attorney_id: 'A0007', is_active: 1 }] : { insertId: 12 };
  const r = await request('/cases/42/attorneys', { method: 'POST', role: 5, body: { attorney_id: 'A0007' } });
  assert.equal(r.status, 403, 'Assignment route has authentication but no staff-role restriction');
});

test('CLIENTS: required fields rejected', async () => {
  assert.equal((await request('/clients', { method: 'POST', body: { fname: 'Test' } })).status, 400);
});
test('CLIENTS: profile created for existing account', async () => {
  const r = await request('/clients', { method: 'POST', body: { user_id: 8, fname: 'Test', lname: 'Client', birth_date: '1990-01-01' } });
  assert.equal(r.status, 201);
});
test('CLIENTS: empty update rejected', async () => {
  assert.equal((await request('/clients/1', { method: 'PATCH', body: {} })).status, 400);
});
test('CLIENTS: missing profile rejected', async () => {
  assert.equal((await request('/clients/999')).status, 404);
});
test('REGRESSION CLIENTS: linking route passes client ID to controller', async () => {
  responder = sql => sql.includes('SELECT client_id') ? [{ client_id: 1 }] : sql.includes('SELECT cf_code') ? [{ cf_code: 42 }] : { insertId: 1 };
  assert.equal((await request('/clients/1/cases', { method: 'POST', body: { cf_code: 42 } })).status, 201);
});
test('REGRESSION CLIENTS: assigned-case route binds client ID', async () => {
  assert.equal((await request('/clients/1/cases')).status, 200);
});

test('DIRECTORY: public list returns shaped profiles', async () => {
  responder = () => [{ attorney_id: 'A0007', fname: 'Test', lname: 'Counsel', email: 'test@example.test', specialization_name: 'Civil' }];
  const r = await request('/attorneys');
  assert.equal(r.status, 200); assert.equal(r.data.data[0].full_name, 'Test Counsel');
});
test('DIRECTORY: unknown attorney returns 404', async () => {
  assert.equal((await request('/attorneys/A9999')).status, 404);
});
test('ADMIN: attorney creation commits both account and profile', async () => {
  const r = await request('/attorneys', { method: 'POST', body: { fname: 'Test', lname: 'Counsel', email: 'test@example.test', password: 'test-password' } });
  assert.equal(r.status, 201); assert.deepEqual(transaction, ['begin', 'commit', 'release']);
  assert.equal(r.data.data.attorney_id, 'A0042');
});
test('ADMIN: profile insertion failure rolls back account', async () => {
  responder = sql => { if (sql.includes('INSERT INTO attorney')) throw new Error('Synthetic insert failure'); return { insertId: 42 }; };
  assert.equal((await request('/attorneys', { method: 'POST', body: { fname: 'Test', lname: 'Counsel', email: 'test@example.test' } })).status, 500);
  assert.deepEqual(transaction, ['begin', 'rollback', 'release']);
});

test('HEARINGS: required fields rejected', async () => {
  assert.equal((await request('/hearings', { method: 'POST', body: {} })).status, 400);
});
const hearing = { case_id: 42, title: 'Test hearing', hearing_date: '2026-11-01 10:00:00', attorney_id: 'A0007' };
test('HEARINGS: conflict returns 409 for staff', async () => {
  responder = () => [{ hearing_id: 1 }];
  assert.equal((await request('/hearings', { method: 'POST', role: 3, body: hearing })).status, 409);
});
test('HEARINGS: staff cannot request administrator override', async () => {
  responder = () => [{ hearing_id: 1 }];
  assert.equal((await request('/hearings', { method: 'POST', role: 3, body: { ...hearing, override_conflict: true } })).status, 409);
});
test('HEARINGS: administrator explicit override accepted', async () => {
  responder = sql => sql.includes('SELECT h.hearing_id') ? [{ hearing_id: 1 }] : { insertId: 42 };
  assert.equal((await request('/hearings', { method: 'POST', body: { ...hearing, override_conflict: true } })).status, 201);
});
test('HEARINGS: missing calendar bounds rejected', async () => {
  assert.equal((await request('/hearings/calendar')).status, 400);
});
const schema = fs.readFileSync(path.join(root, 'database.sql'), 'utf8');
const hearingTable = schema.match(/CREATE TABLE IF NOT EXISTS `hearing_schedule` \(([\s\S]*?)\) ENGINE/)[1];
test('REGRESSION SCHEMA: hearing detail query references existing columns', async () => {
  await request('/hearings?case_id=42');
  assert.ok(!calls[0].sql.includes('h.title') || /`title`/.test(hearingTable), 'Query selects h.title but hearing_schedule has no title column');
});
test('REGRESSION SCHEMA: calendar defines hearing_status alias before using it', async () => {
  await request('/hearings/calendar?startDate=2026-11-01&endDate=2026-11-30');
  const sql = calls[0].sql;
  assert.ok(!sql.includes('hs.code') || /JOIN\s+hearing_status\s+hs/i.test(sql), 'Calendar selects hs.code/hs.label without joining hearing_status hs');
});

test('DOCUMENTS: standard user cannot upload', async () => {
  assert.equal((await request('/documents/upload', { method: 'POST', role: 5 })).status, 403);
});
test('DOCUMENTS: missing file rejected', async () => {
  assert.equal((await request('/documents/upload', { method: 'POST' })).status, 400);
});
test('DOCUMENTS: unsupported MIME type rejected', async () => {
  const form = new FormData(); form.append('document', new Blob(['text'], { type: 'text/plain' }), 'test.txt');
  assert.equal((await request('/documents/upload', { method: 'POST', form })).status, 400);
});
test('DOCUMENTS: image upload commits parent/version (OCR stubbed)', async () => {
  const form = new FormData(); form.append('case_id', '42');
  form.append('document', new Blob(['synthetic-image'], { type: 'image/png' }), 'test.png');
  responder = (sql, params) => {
    if (sql.includes('INSERT INTO document_version')) uploadPaths.add(params[3]);
    return { insertId: 42, affectedRows: 1 };
  };
  const r = await request('/documents/upload', { method: 'POST', form });
  assert.equal(r.status, 201); assert.equal(r.data.data.status, 'PROCESSING');
  assert.deepEqual(transaction, ['begin', 'commit', 'release']);
  assert.ok(calls.some(c => c.sql.includes('SET extracted_text') && c.params[0] === 'MOCK OCR affidavit text'));
});
test('REGRESSION SCHEMA: stored upload MIME fits document.file_type', async () => {
  const form = new FormData(); form.append('case_id', '42');
  form.append('document', new Blob(['synthetic-image'], { type: 'image/png' }), 'test.png');
  responder = (sql, params) => {
    if (sql.includes('INSERT INTO document_version')) uploadPaths.add(params[3]);
    return { insertId: 42, affectedRows: 1 };
  };
  await request('/documents/upload', { method: 'POST', form });
  const insert = calls.find(c => /INSERT INTO document\s*\(/.test(c.sql));
  const capacity = Number(schema.match(/`file_type` varchar\((\d+)\)/)[1]);
  // image/png and image/jpeg fit; application/pdf does not.
  const source = fs.readFileSync(path.join(root, 'controllers/documentController.js'), 'utf8');
  assert.ok(!source.includes('req.file.mimetype, req.file.path') || 'application/pdf'.length <= capacity,
    `Controller stores full MIME types but file_type capacity is ${capacity}; application/pdf needs 15`);
  assert.ok(insert);
});
test('DOCUMENTS: missing version history returns 404', async () => {
  assert.equal((await request('/documents/999/versions')).status, 404);
});
test('DOCUMENTS: new version advances pointer (OCR stubbed)', async () => {
  const form = new FormData(); form.append('document', new Blob(['synthetic-image'], { type: 'image/png' }), 'revision.png');
  responder = (sql, params) => {
    if (sql.includes('SELECT document_code')) return [{ document_code: 42 }];
    if (sql.includes('MAX(version_no)')) return [{ max_version: 2 }];
    if (sql.includes('INSERT INTO document_version')) uploadPaths.add(params[3]);
    return { insertId: 43, affectedRows: 1 };
  };
  const r = await request('/documents/42/versions', { method: 'POST', form });
  assert.equal(r.status, 201); assert.equal(r.data.data.versionNumber, 3);
  assert.ok(calls.some(c => c.sql.includes('SET current_version_no') && c.params[0] === 3));
});
test('DOCUMENTS: empty search rejected', async () => {
  assert.equal((await request('/documents/search?q=')).status, 400);
});
test('DOCUMENTS: search query is parameterized with optional case filter', async () => {
  assert.equal((await request('/documents/search?q=affidavit&case_id=42')).status, 200);
  assert.deepEqual(calls[0].params, ['affidavit', '%affidavit%', '42']);
});
test('REGRESSION DOCUMENTS: download query selects current revision path', async () => {
  await request('/documents/42/download');
  assert.match(calls[0].sql, /document_version/, 'Download selects parent file_path instead of current document_version path');
});
test('REGRESSION OCR: installed pdf-parse supports current callable API', () => {
  assert.equal(typeof require('pdf-parse'), 'function', 'pdf-parse 2.x exports an object; current pdfParse(buffer) call will throw');
});

// Execute the real frontend script in a lightweight fake DOM. This tests event logic,
// not CSS, layout, navigation, or a real browser.
async function caseViewHarness() {
  const nodes = new Map(); let ready; const requests = [];
  for (const id of ['uploadDocForm', 'uploadModal', 'uploadError', 'submitUploadBtn', 'openUploadModalBtn', 'closeUploadModalBtn', 'documentsList']) {
    nodes.set(id, { listeners: {}, classList: { add() {}, remove() {} }, addEventListener(type, fn) { this.listeners[type] = fn; }, reset() {}, innerHTML: '' });
  }
  const context = {
    document: { addEventListener: (type, fn) => { ready = fn; }, getElementById: id => nodes.get(id) || null },
    window: { location: { search: '?id=42' } }, URLSearchParams, FormData,
    apiRequest: async (url, method = 'GET', body) => {
      requests.push({ url, method, body });
      if (url === '/auth/me') return { data: { role_id: 1 } };
      if (url.startsWith('/documents?')) return { data: [{ id: 1, title: 'Test', ocr_text: 'text' }] };
      return { data: [] };
    }, showToast() {}
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'frontend/js/case-details.js'), 'utf8'), context);
  await ready(); await new Promise(resolve => setImmediate(resolve));
  return { nodes, requests };
}
test('REGRESSION UI: submitting upload sends multipart request', async () => {
  const { nodes, requests } = await caseViewHarness();
  await nodes.get('uploadDocForm').listeners.submit({ preventDefault() {} });
  assert.ok(requests.some(r => r.method === 'POST' && r.url.includes('/documents/upload')), 'Upload submit sends no POST request');
});
test('REGRESSION UI: document download uses authenticated request', async () => {
  const { nodes } = await caseViewHarness();
  assert.ok(!nodes.get('documentsList').innerHTML.includes('href="/api/v1/documents/'),
    'Direct anchor navigation cannot attach the Bearer header required by the download route');
});
