// Execute real frontend event logic in a fake DOM. This is not browser/layout testing.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = file => fs.readFileSync(path.join(__dirname, '../frontend/js', file), 'utf8');
async function harness({ failUpload = false } = {}) {
  const nodes = new Map(), calls = [], downloads = [], timers = new Map(); let ready, nextTimer = 0;
  for (const id of ['uploadDocForm', 'uploadModal', 'uploadError', 'submitUploadBtn', 'openUploadModalBtn', 'closeUploadModalBtn', 'documentsList', 'docFileInput', 'docTitleInput']) {
    nodes.set(id, { listeners: {}, style: {}, value: 'Synthetic title', files: [new Blob(['synthetic-image'], { type: 'image/png' })],
      classList: { add() {}, remove() {} }, addEventListener(type, fn) { this.listeners[type] = fn; }, reset() {}, innerHTML: '' });
  }
  const context = {
    document: { addEventListener: (event, fn) => { ready = fn; }, getElementById: id => nodes.get(id) || null },
    window: { location: { search: '?id=42' }, addEventListener() {} },
    requireWorkspaceSession: async () => ({ role_id: 1 }),
    URLSearchParams, FormData, showToast() {},
    setTimeout: (fn, ms) => { timers.set(++nextTimer, { fn, ms }); return nextTimer; }, clearTimeout: id => timers.delete(id),
    apiDownload: async endpoint => downloads.push(endpoint),
    apiRequest: async (endpoint, method = 'GET', body) => {
      calls.push({ endpoint, method, body });
      if (failUpload && method === 'POST') throw new Error('Upload failed for testing');
      if (endpoint === '/auth/me') return { data: { role_id: 1 } };
      if (endpoint === '/cases/42') return { data: { id: 42, title: 'Synthetic case', case_number: 'CIV-2026-0042' } };
      if (endpoint.startsWith('/documents?')) return { data: [{ id: 8, title: 'Synthetic affidavit', ocr_status: 'PENDING', version_number: 1 }] };
      return { data: [] };
    }
  };
  vm.runInNewContext(source('case-details.js'), context);
  await ready(); await new Promise(resolve => setImmediate(resolve));
  async function click(dataset) {
    const button = { dataset, disabled: false };
    await nodes.get('documentsList').listeners.click({ target: { closest: () => button } });
  }
  return { nodes, calls, downloads, timers, click };
}
test('upload submits real FormData with file, case and title', async () => {
  const { nodes, calls } = await harness();
  await nodes.get('uploadDocForm').listeners.submit({ preventDefault() {} });
  const call = calls.find(c => c.endpoint === '/documents/upload' && c.method === 'POST');
  assert.ok(call.body instanceof FormData);
  assert.equal(call.body.get('case_id'), '42'); assert.equal(call.body.get('title'), 'Synthetic title');
  assert.ok(call.body.get('document') instanceof Blob); assert.equal(nodes.get('submitUploadBtn').disabled, false);
});
test('upload errors are visible and submit is re-enabled', async () => {
  const { nodes } = await harness({ failUpload: true });
  await nodes.get('uploadDocForm').listeners.submit({ preventDefault() {} });
  assert.equal(nodes.get('uploadError').textContent, 'Upload failed for testing');
  assert.equal(nodes.get('submitUploadBtn').disabled, false);
});
test('document actions use authenticated download helper rather than direct anchor', async () => {
  const { nodes, downloads, click } = await harness();
  assert.ok(!nodes.get('documentsList').innerHTML.includes('href="/api/v1/documents/'));
  await click({ action: 'download', id: '8' });
  assert.deepEqual(downloads, ['/documents/8/download']);
});
test('revision action posts to version endpoint, not new-document endpoint', async () => {
  const { nodes, calls, click } = await harness();
  await click({ action: 'revision', id: '8' });
  await nodes.get('uploadDocForm').listeners.submit({ preventDefault() {} });
  assert.ok(calls.some(c => c.method === 'POST' && c.endpoint === '/documents/8/versions'));
});
test('retry action identifies the exact document version', async () => {
  const { calls, click } = await harness();
  await click({ action: 'retry', id: '8', version: '1' });
  assert.ok(calls.some(c => c.method === 'POST' && c.endpoint === '/documents/8/versions/1/retry'));
});
test('pending extraction schedules polling and displays status', async () => {
  const { nodes, timers } = await harness();
  assert.match(nodes.get('documentsList').innerHTML, /PENDING/);
  assert.ok([...timers.values()].some(timer => timer.ms === 2500));
});
function clientHarness(response) {
  const calls = [], actions = [];
  const context = {
    FormData, localStorage: { getItem: key => key === 'jwtToken' ? 'synthetic-token' : null },
    fetch: async (url, options) => { calls.push({ url, options }); return response; },
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL: url => actions.push(url) },
    document: { body: { appendChild() {} }, createElement: () => ({ click() { actions.push('clicked'); }, remove() {} }) },
    setTimeout: fn => fn()
  };
  vm.runInNewContext(source('api.js') + '\nglobalThis.client = { apiRequest, apiDownload };', context);
  return { client: context.client, calls, actions };
}
test('multipart client leaves Content-Type to browser and attaches token', async () => {
  const { client, calls } = clientHarness({ ok: true, json: async () => ({}) });
  const form = new FormData(); await client.apiRequest('/documents/upload', 'POST', form);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer synthetic-token');
  assert.equal(calls[0].options.headers['Content-Type'], undefined);
  assert.equal(calls[0].options.body, form);
});
test('JSON requests still serialize their payload', async () => {
  const { client, calls } = clientHarness({ ok: true, json: async () => ({}) });
  await client.apiRequest('/cases', 'POST', { title: 'Test' });
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
  assert.equal(calls[0].options.body, '{"title":"Test"}');
});
test('download fetch attaches token, clicks blob link and releases URL', async () => {
  const { client, calls, actions } = clientHarness({ ok: true, blob: async () => new Blob(['current revision']), headers: { get: () => 'attachment; filename="Evidence.pdf"' } });
  await client.apiDownload('/documents/8/download');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer synthetic-token');
  assert.deepEqual(actions, ['clicked', 'blob:test']);
});

test('document cards expose retrieval status without displaying full extracted text', async () => {
  const code = source('case-details.js');
  assert.ok(!code.includes('View Extracted OCR Text'));
  assert.ok(!code.includes('d.ocr_text'));
  assert.match(code, /Ready for document-content search/);
});
