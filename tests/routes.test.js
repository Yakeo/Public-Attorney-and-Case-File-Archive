// Actual Express HTTP routes with a fake database/OCR scheduler. No production writes.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
let base, server, calls, transactions, jobs, handler, roleOverride, inactive;
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pacfas-regression-'));
const files = new Set();
process.env.JWT_SECRET = 'local-regression-test-secret';
const execute = async (sql, params = []) => {
  calls.push({ sql, params });
  if (params.includes(undefined)) throw new TypeError('Undefined SQL binding');
  if (sql.startsWith('SELECT user_id, role_id, is_active')) {
    return [[{ user_id: params[0], role_id: roleOverride ?? params[0], is_active: !inactive }]];
  }
  return [await handler(sql, params), []];
};
const connection = { execute, beginTransaction: async () => transactions.push('begin'),
  commit: async () => transactions.push('commit'), rollback: async () => transactions.push('rollback'),
  release: () => transactions.push('release') };
function replace(modulePath, exports) {
  const id = require.resolve(modulePath);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}
replace('../config/db', { execute, getConnection: async () => connection });
replace('../utils/auditLog', { logAction: async () => {}, getRequestMeta: () => ({}) });
replace('../utils/documentOCR', { scheduleOCR: (...args) => jobs.push(args) });
before(async () => {
  const app = require('../app');
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(() => {
  calls = []; transactions = []; jobs = []; roleOverride = undefined; inactive = false;
  handler = sql => /^(INSERT|UPDATE)/i.test(sql.trim()) ? { insertId: 42, affectedRows: 1 } : [];
});
after(async () => {
  await new Promise(resolve => server.close(resolve));
  for (const file of files) fs.rmSync(file, { force: true });
  fs.rmSync(temp, { recursive: true, force: true });
});
async function request(url, { method = 'GET', role = 1, body, form, token, noAuth } = {}) {
  const headers = noAuth ? {} : { Authorization: `Bearer ${token || jwt.sign({ user_id: role, role_id: role }, process.env.JWT_SECRET)}` };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(base + url, { method, headers, body: form || (body === undefined ? undefined : JSON.stringify(body)) });
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data, headers: response.headers };
}
const api = (url, options) => request('/api/v1' + url, options);
function pngForm() {
  const form = new FormData(); form.append('case_id', '42'); form.append('title', 'Synthetic evidence');
  form.append('document', new Blob([Buffer.from([137,80,78,71,13,10,26,10])], { type: 'image/png' }), 'evidence.png');
  return form;
}
function publicSummaryForm() {
  const form = new FormData();
  form.append('public_title', 'Approved Demo Summary');
  form.append('summary_text', 'Only approved public information.');
  form.append('handling_attorney_id', 'A0001');
  form.append('summary_pdf', new Blob([Buffer.from('%PDF-1.4\nSynthetic approved summary')], { type: 'application/pdf' }), 'approved-summary.pdf');
  return form;
}
function uploadHandler(sql, params) {
  if (sql.includes('SELECT cf_code')) return [{ cf_code: 42 }];
  if (sql.includes('SELECT document_code')) return [{ document_code: 42 }];
  if (sql.includes('MAX(version_no)')) return [{ max_version: 2 }];
  if (sql.includes('INSERT INTO document_version')) files.add(params[3]);
  return { insertId: 42, affectedRows: 1 };
}

test('server serves frontend and health; readiness checks the database', async () => {
  assert.equal((await request('/', { noAuth: true })).status, 200);
  assert.equal((await request('/health', { noAuth: true })).status, 200);
  assert.equal((await request('/ready', { noAuth: true })).status, 200);
  handler = () => { throw new Error('Database unavailable'); };
  assert.equal((await request('/ready', { noAuth: true })).status, 503);
});
test('raw uploaded files are not exposed, even without a token', async () => {
  assert.equal((await request('/uploads/documents/private.pdf', { noAuth: true })).status, 404);
});
test('unknown API route returns JSON 404', async () => {
  const r = await api('/not-a-route'); assert.equal(r.status, 404); assert.equal(r.data.status, 'fail');
});
for (const endpoint of ['/cases', '/clients', '/documents', '/hearings', '/documents/1/download']) {
  test(`missing token rejected: ${endpoint}`, async () => assert.equal((await api(endpoint, { noAuth: true })).status, 401));
}
test('expired token rejected before any query', async () => {
  const token = jwt.sign({ user_id: 1 }, process.env.JWT_SECRET, { expiresIn: -1 });
  assert.equal((await api('/cases', { token })).status, 401); assert.equal(calls.length, 0);
});
test('inactive account cannot use an otherwise valid token', async () => {
  inactive = true; assert.equal((await api('/cases')).status, 401);
});
test('current database role overrides stale administrator claims', async () => {
  roleOverride = 5; assert.equal((await api('/cases')).status, 403);
});
for (const endpoint of ['/cases', '/documents', '/hearings']) {
  test(`public role cannot read private archive: ${endpoint}`, async () => assert.equal((await api(endpoint, { role: 5 })).status, 403));
}
test('public registration always stores standard role, regardless of supplied role', async () => {
  const r = await api('/auth/register', { method: 'POST', noAuth: true, body: { username: 'synthetic', email: 'synthetic@example.test', password: 'synthetic-password', role_id: 1 } });
  assert.equal(r.status, 201);
  const insert = calls.find(c => c.sql.includes('INSERT INTO user_account'));
  assert.equal(insert.params[3], 5);
  assert.ok(await bcrypt.compare('synthetic-password', insert.params[2]));
});
test('inactive user cannot log in', async () => {
  handler = () => [{ user_id: 1, is_active: 0, password_hash: 'not-used' }];
  assert.equal((await api('/auth/login', { method: 'POST', body: { email: 'test@example.test', password: 'test' } })).status, 401);
});
test('active login returns signed token, never password hash', async () => {
  const hash = await bcrypt.hash('synthetic-password', 4);
  handler = () => [{ user_id: 1, role_id: 1, is_active: 1, password_hash: hash }];
  const r = await api('/auth/login', { method: 'POST', body: { email: 'test@example.test', password: 'synthetic-password' } });
  assert.equal(r.status, 200); assert.equal(jwt.verify(r.data.token, process.env.JWT_SECRET).user_id, 1);
  assert.equal(r.data.user.password_hash, undefined);
});
test('attorneys cannot change staff-only case assignments', async () => {
  assert.equal((await api('/cases/42/attorneys', { method: 'POST', role: 2, body: { attorney_id: 'A0001' } })).status, 403);
});
test('client link route binds the client ID correctly', async () => {
  handler = sql => sql.includes('SELECT client_id') ? [{ client_id: 1 }] : sql.includes('SELECT cf_code') ? [{ cf_code: 42 }] : { insertId: 9 };
  const r = await api('/clients/1/cases', { method: 'POST', body: { cf_code: 42 } });
  assert.equal(r.status, 201);
  assert.deepEqual(calls.find(c => c.sql.includes('INSERT INTO client_case')).params, ['1', 42, null]);
});
test('client assigned-case listing binds the client ID', async () => {
  assert.equal((await api('/clients/1/cases')).status, 200);
  assert.deepEqual(calls.at(-1).params, ['1']);
});
test('case hearing query uses an existing title source', async () => {
  assert.equal((await api('/hearings?case_id=42')).status, 200);
  assert.ok(!calls.at(-1).sql.includes('h.title'));
  assert.match(calls.at(-1).sql, /h.hearing_type AS title/);
});
test('calendar query joins the hearing status alias, including attorney filter', async () => {
  assert.equal((await api('/hearings/calendar?startDate=2026-11-01&endDate=2026-11-30&attorneyId=A0001')).status, 200);
  assert.match(calls.at(-1).sql, /JOIN hearing_status hs/);
  assert.ok(calls.at(-1).params.includes('A0001'));
});
test('upload requires a file', async () => {
  assert.equal((await api('/documents/upload', { method: 'POST' })).status, 400);
});
test('spoofed PNG contents are rejected and file is removed', async () => {
  const dir = path.join(__dirname, '../uploads/documents');
  const existing = new Set(fs.readdirSync(dir));
  const form = new FormData(); form.append('document', new Blob(['not a PNG'], { type: 'image/png' }), 'bad.png');
  assert.equal((await api('/documents/upload', { method: 'POST', form })).status, 400);
  assert.deepEqual(new Set(fs.readdirSync(dir)), existing);
});
test('unsupported MIME is rejected before controller', async () => {
  const form = new FormData(); form.append('document', new Blob(['text'], { type: 'text/plain' }), 'bad.txt');
  assert.equal((await api('/documents/upload', { method: 'POST', form })).status, 400);
});
test('oversized file is rejected and partial storage removed', async () => {
  const dir = path.join(__dirname, '../uploads/documents');
  const existing = new Set(fs.readdirSync(dir));
  const form = new FormData(); form.append('document', new Blob([new Uint8Array(25 * 1024 * 1024 + 1)], { type: 'image/png' }), 'big.png');
  const r = await api('/documents/upload', { method: 'POST', form });
  assert.equal(r.status, 400); assert.match(r.data.message, /25MB/);
  assert.deepEqual(new Set(fs.readdirSync(dir)), existing);
});
test('upload commits parent and first version before scheduling OCR', async () => {
  handler = uploadHandler;
  const r = await api('/documents/upload', { method: 'POST', form: pngForm() });
  assert.equal(r.status, 201); assert.equal(r.data.data.status, 'PENDING');
  assert.deepEqual(transactions, ['begin', 'commit', 'release']); assert.equal(jobs.length, 1);
  assert.ok(fs.existsSync(jobs[0][2]));
});
test('PDF MIME metadata fits the updated schema', async () => {
  const schema = fs.readFileSync(path.join(__dirname, '../database.sql'), 'utf8');
  assert.ok(Number(schema.match(/`file_type` varchar\((\d+)\)/)[1]) >= 'application/pdf'.length);
});
test('upload failure rolls back and removes uncommitted file', async () => {
  const dir = path.join(__dirname, '../uploads/documents'); const existing = new Set(fs.readdirSync(dir));
  handler = (sql, params) => { if (sql.includes('INSERT INTO document_version')) throw new Error('Synthetic failure'); return uploadHandler(sql, params); };
  assert.equal((await api('/documents/upload', { method: 'POST', form: pngForm() })).status, 500);
  assert.deepEqual(transactions, ['begin', 'rollback', 'release']); assert.equal(jobs.length, 0);
  assert.deepEqual(new Set(fs.readdirSync(dir)), existing);
});
test('new revision locks parent before choosing next number', async () => {
  handler = uploadHandler;
  const r = await api('/documents/42/versions', { method: 'POST', form: pngForm() });
  assert.equal(r.status, 201); assert.equal(r.data.data.versionNumber, 3);
  const lock = calls.findIndex(c => /SELECT document_code.*FOR UPDATE/.test(c.sql));
  const max = calls.findIndex(c => c.sql.includes('MAX(version_no)'));
  assert.ok(lock >= 0 && max > lock); assert.equal(jobs[0][1], 3);
});
test('download resolves current revision bytes and retains extension', async () => {
  const file = path.join(temp, 'current.pdf'); fs.writeFileSync(file, 'CURRENT-REVISION');
  handler = () => [{ file_path: file, file_name: 'current.pdf', doc_name: 'Evidence' }];
  const r = await api('/documents/42/download');
  assert.equal(r.status, 200); assert.equal(r.data, 'CURRENT-REVISION');
  assert.match(calls.at(-1).sql, /dv.version_no = d.current_version_no/);
  assert.match(r.headers.get('content-disposition'), /Evidence.pdf/);
});
test('failed extraction retry changes status conditionally before scheduling', async () => {
  const file = path.join(temp, 'retry.png'); fs.writeFileSync(file, 'synthetic');
  handler = sql => sql.includes('SELECT dv.file_path') ? [{ file_path: file }] : { affectedRows: 1 };
  assert.equal((await api('/documents/42/versions/2/retry', { method: 'POST', body: {} })).status, 202);
  assert.match(calls.at(-1).sql, /ocr_status = 'FAILED'/); assert.equal(jobs.length, 1);
});
test('running/completed extraction cannot be retried', async () => {
  const file = path.join(temp, 'retry.png'); fs.writeFileSync(file, 'synthetic');
  handler = sql => sql.includes('SELECT dv.file_path') ? [{ file_path: file }] : { affectedRows: 0 };
  assert.equal((await api('/documents/42/versions/2/retry', { method: 'POST', body: {} })).status, 409);
  assert.equal(jobs.length, 0);
});
test('search excludes deleted documents and uses bound values', async () => {
  assert.equal((await api('/documents/search?q=affidavit&case_id=42')).status, 200);
  const query = calls.find(c => c.sql.includes('INSTR('));
  assert.match(query.sql, /d.is_deleted = 0/);
  assert.match(query.sql, /cf.is_deleted = 0/);
  assert.match(query.sql, /dv.version_no = d.current_version_no/);
  assert.match(query.sql, /d.doc_name LIKE/);
  assert.match(query.sql, /dv.file_name LIKE/);
  assert.deepEqual(query.params, ['affidavit', '%affidavit%', '%affidavit%', '%affidavit%', '42']);
});
test('global cleanup never deletes an already committed upload', async () => {
  const file = path.join(temp, 'committed.png'); fs.writeFileSync(file, 'saved');
  const errorHandler = require('../middleware/errorHandler');
  await errorHandler(new Error('Post-commit error'), { uploadCommitted: true, file: { path: file } }, { status() { return this; }, json() {} }, () => {});
  assert.ok(fs.existsSync(file));
});

test('current profile returns an active user for case-view role checks', async () => {
  handler = () => [{ user_id: 1, role_id: 1, is_active: 1, username: 'Synthetic Admin' }];
  const r = await api('/auth/me');
  assert.equal(r.status, 200); assert.equal(r.data.data.role_id, 1);
  assert.match(calls.at(-1).sql, /role_id, is_active/);
});

test('administrator must supply a strong initial attorney password, not a shared default', async () => {
  for (const password of [undefined, 'short']) {
    const r = await api('/attorneys', { method: 'POST', body: { fname: 'Demo', lname: 'Counsel', email: 'counsel@example.test', password } });
    assert.equal(r.status, 400);
    assert.match(r.data.message, /at least 12/);
  }
});

test('new cases are private and public lookup requires an approved summary record', async () => {
  handler = sql => sql.includes('SELECT code FROM case_category') ? [{ code: 'CIVIL' }] : { insertId: 42 };
  const created = await api('/cases', { method: 'POST', body: { title: 'Private synthetic case' } });
  assert.equal(created.status, 201);
  const insert = calls.find(c => c.sql.includes('INSERT INTO case_file'));
  assert.match(insert.sql, /created_by, is_visible/);
  assert.match(insert.sql, /CURDATE\(\), \?, 0\)/);
  handler = () => [];
  await api('/cases'); assert.ok(!calls.at(-1).sql.includes('cf.is_visible = 1'));
  await api('/cases/public', { noAuth: true });
  const publicQuery = calls.at(-1).sql;
  assert.ok(publicQuery.includes('FROM public_case_summary'));
  assert.ok(publicQuery.includes('s.is_current = 1'));
  assert.ok(publicQuery.includes('s.approved_at IS NOT NULL'));
  assert.ok(!publicQuery.includes('cf.is_visible = 1'));
  assert.ok(!publicQuery.includes('cf.description'));
});

test('admin publication exposes only the approved summary PDF and unpublishing blocks it', async () => {
  let storedPdfPath;
  let published = true;
  handler = (sql, params) => {
    if (sql.includes('JOIN case_attorney')) return [{ attorney_id: 'A0001' }];
    if (sql.includes('SELECT cf_code FROM case_file')) return [{ cf_code: 42 }];
    if (sql.includes('MAX(version_no)')) return [{ latest_version: 0 }];
    if (sql.includes('INSERT INTO public_case_summary')) {
      storedPdfPath = params[5]; files.add(storedPdfPath); published = true; return { insertId: 7, affectedRows: 1 };
    }
    if (sql.includes('SELECT s.cf_code')) return [{
      cf_code: 42, public_title: 'Approved Demo Summary', summary_text: 'Only approved public information.',
      pdf_file_name: 'approved-summary.pdf', creation_date: '2026-01-01',
      fname: 'Demo', lname: 'Attorney', attorney_id: 'A0001'
    }];
    if (sql.includes('SELECT s.pdf_file_path')) return published
      ? [{ pdf_file_path: storedPdfPath, pdf_file_name: 'approved-summary.pdf' }]
      : [];
    if (sql.includes('UPDATE public_case_summary SET is_current = 0')) { published = false; return { affectedRows: 1 }; }
    return [];
  };

  const post = await api('/cases/42/public-summary', { method: 'POST', form: publicSummaryForm() });
  assert.equal(post.status, 201);
  assert.equal(post.data.data.version, 1);

  const publicList = await api('/cases/public', { noAuth: true });
  assert.equal(publicList.status, 200);
  assert.equal(publicList.data.data[0].summary, 'Only approved public information.');
  assert.equal(publicList.data.data[0].handling_attorney, 'Atty. Demo Attorney');
  assert.equal(publicList.data.data[0].description, undefined);

  const download = await api('/cases/public/42/summary.pdf', { noAuth: true });
  assert.equal(download.status, 200);
  assert.match(download.headers.get('content-type'), /application\/pdf/);
  assert.match(download.data, /^%PDF-1\.4/);

  assert.equal((await api('/cases/42/public-summary', { method: 'DELETE' })).status, 200);
  assert.equal((await api('/cases/public/42/summary.pdf', { noAuth: true })).status, 404);
});

test('non-admins cannot publish public summaries', async () => {
  assert.equal((await api('/cases/42/public-summary', { method: 'POST', role: 2, form: publicSummaryForm() })).status, 403);
  assert.equal(calls.some(c => c.sql.includes('INSERT INTO public_case_summary')), false);
});

for (const options of [{ noAuth: true, status: 401 }, { role: 5, status: 403 }]) {
  test(`document text search protects private contents (${options.status})`, async () => {
    assert.equal((await api('/documents/search?q=ORCHID', options)).status, options.status);
    assert.ok(!calls.some(c => c.sql.includes('INSTR(')));
  });
}
test('document search validates inputs and treats wildcard characters literally', async () => {
  for (const query of ['', 'q=', 'q=' + 'x'.repeat(201), 'q[x]=a', 'q=word&case_id=bad']) {
    assert.equal((await api('/documents/search?' + query)).status, 400);
  }
  await api('/documents/search?q=100%25_under!');
  const sql = calls.find(c => c.sql.includes('INSTR('));
  assert.equal(sql.params[1], '%100!%!_under!!%');
  assert.match(sql.sql, /LIMIT 100/);
});

test('attorneys can register a private case without gaining counsel-assignment privileges', async () => {
  handler = sql => sql.includes('SELECT code FROM case_category') ? [{ code: 'CIVIL' }] : { insertId: 42 };
  assert.equal((await api('/cases', { role: 2, method: 'POST', body: { title: 'Attorney-created sample' } })).status, 201);
  assert.equal((await api('/cases/42/attorneys', { role: 2, method: 'POST', body: { attorney_id: 'D0001' } })).status, 403);
});

test('upload stores searchable original filename separately from the physical storage path', async () => {
  handler = uploadHandler;
  assert.equal((await api('/documents/upload', { method: 'POST', form: pngForm() })).status, 201);
  const version = calls.find(c => c.sql.includes('INSERT INTO document_version'));
  assert.equal(version.params[2], 'evidence.png');
  assert.notEqual(version.params[3], version.params[2]);
});
