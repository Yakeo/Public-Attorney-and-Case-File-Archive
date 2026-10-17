const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../frontend/js/document-search.js'), 'utf8');
const flush = () => new Promise(r => setImmediate(r));
async function harness({ scoped = false, authorized = true, request } = {}) {
  const nodes = new Map(), events = {}, timers = new Map(), calls = [], downloads = []; let ready, id = 0;
  for (const key of ['documentSearchInput', 'documentSearchResults', 'documentSearchStatus', 'clearDocumentSearch', 'documentsList']) {
    const classes = new Set();
    nodes.set(key, { value: '', innerHTML: '', textContent: '', handlers: {}, focus() {},
      classList: { add: v => classes.add(v), remove: v => classes.delete(v), contains: v => classes.has(v) },
      addEventListener(type, fn) { this.handlers[type] = fn; } });
  }
  const document = { hidden: false, getElementById: id => nodes.get(id), addEventListener: (type, fn) => { if (type === 'DOMContentLoaded') ready = fn; else events[type] = fn; } };
  const context = { document, window: { location: { pathname: scoped ? '/case-details.html' : '/dashboard.html', search: '?id=42' }, addEventListener: (type, fn) => events[type] = fn },
    requireWorkspaceSession: async () => authorized ? { role_id: 2 } : null,
    URLSearchParams, AbortController, encodeURIComponent,
    clearTimeout: n => timers.delete(n), setTimeout: (fn, ms) => { timers.set(++id, { fn, ms }); return id; },
    apiDownload: async endpoint => downloads.push(endpoint),
    apiRequest: async (endpoint, ...args) => { calls.push({ endpoint, args }); return request ? request(endpoint) : { data: [], pending: 0, limit: 100 }; } };
  vm.runInNewContext(source, context); await ready();
  async function type(q) { nodes.get('documentSearchInput').value = q; nodes.get('documentSearchInput').handlers.input(); }
  async function tick(ms) { const entry = [...timers].find(([, t]) => t.ms === ms); assert.ok(entry, `Missing ${ms}ms timer`); timers.delete(entry[0]); const result = entry[1].fn(); await result; await flush(); }
  return { nodes, events, timers, calls, downloads, type, tick, document };
}
const row = { document_id: 8, title: '<img src=x onerror=alert(1)>', case_id: 42, case_title: 'Case A', file_name: 'scan.pdf', version_number: 2, ocr_status: 'COMPLETED', match_position: 51 };
test('live search debounces typing, binds case scope, escapes cards and never renders OCR text', async () => {
  const h = await harness({ scoped: true, request: () => ({ data: [{ ...row, extracted_text: 'PRIVATE ENTIRE DOCUMENT' }], pending: 0 }) });
  await h.type('first'); await h.type('ORCHID'); assert.equal(h.calls.length, 0);
  assert.equal([...h.timers.values()].filter(t => t.ms === 250).length, 1);
  await h.tick(250);
  assert.equal(h.calls[0].endpoint, '/documents/search?q=ORCHID&case_id=42');
  const html = h.nodes.get('documentSearchResults').innerHTML;
  assert.match(html, /&lt;img/); assert.ok(!html.includes('<img')); assert.ok(!html.includes('PRIVATE ENTIRE DOCUMENT'));
  assert.match(html, /Matches recognized document text/); assert.match(html, /case-details.html\?id=42#document-8/);
  assert.ok(h.nodes.get('documentsList').classList.contains('hidden'));
});
test('active workspace query polls so a newly completed OCR result appears without retyping', async () => {
  let completed = false;
  const h = await harness({ request: () => ({ data: completed ? [row] : [], pending: completed ? 0 : 1 }) });
  await h.type('ORCHID'); await h.tick(250);
  assert.match(h.nodes.get('documentSearchStatus').textContent, /1 document\(s\) still processing/);
  assert.ok(!h.calls[0].endpoint.includes('case_id'));
  completed = true; await h.tick(3000);
  assert.match(h.nodes.get('documentSearchResults').innerHTML, /scan.pdf/);
  assert.match(h.nodes.get('documentSearchStatus').textContent, /1 matching document\./);
});
test('clearing search stops polling and restores the case archive', async () => {
  const h = await harness(); await h.type('term'); await h.tick(250);
  h.nodes.get('clearDocumentSearch').handlers.click();
  assert.equal(h.nodes.get('documentSearchInput').value, ''); assert.equal(h.timers.size, 0);
  assert.equal(h.nodes.get('documentSearchResults').innerHTML, '');
  assert.ok(!h.nodes.get('documentsList').classList.contains('hidden'));
});
test('late old response cannot replace new-query results', async () => {
  let resolveOld;
  const h = await harness({ request: endpoint => endpoint.includes('old') ? new Promise(r => resolveOld = r) : { data: [row], pending: 0 } });
  await h.type('old'); const old = [...h.timers.values()][0].fn(); await flush();
  await h.type('new'); await h.tick(250);
  resolveOld({ data: [{ ...row, title: 'STALE RESULT' }] }); await old;
  assert.ok(!h.nodes.get('documentSearchResults').innerHTML.includes('STALE RESULT'));
});
test('hidden/unloaded pages cancel polling, visible pages resume', async () => {
  const h = await harness(); await h.type('term'); await h.tick(250);
  h.document.hidden = true; h.events.visibilitychange(); assert.equal(h.timers.size, 0);
  h.document.hidden = false; h.events.visibilitychange(); await flush(); assert.equal(h.calls.length, 2);
  h.events.pagehide(); assert.equal(h.timers.size, 0);
});
test('search downloads use the authenticated helper, not raw file URLs', async () => {
  const h = await harness();
  const button = { dataset: { searchDownload: '8' } };
  await h.nodes.get('documentSearchResults').handlers.click({ target: { closest: () => button } });
  assert.deepEqual(h.downloads, ['/documents/8/download']); assert.equal(button.disabled, false);
});
test('unauthorized page never binds or starts document search', async () => {
  const h = await harness({ authorized: false });
  assert.equal(h.nodes.get('documentSearchInput').handlers.input, undefined); assert.equal(h.calls.length, 0);
});
test('local document changes refresh active search and errors are visible', async () => {
  let fail = false;
  const h = await harness({ request: () => { if (fail) throw new Error('Database unavailable'); return { data: [], pending: 0 }; } });
  await h.type('term'); await h.tick(250); fail = true; h.events['documents-changed'](); await flush();
  assert.match(h.nodes.get('documentSearchStatus').textContent, /Database unavailable/);
  assert.ok([...h.timers.values()].some(t => t.ms === 3000));
});
