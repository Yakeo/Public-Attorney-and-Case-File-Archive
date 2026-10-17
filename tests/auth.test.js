const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
async function session({ page = 'dashboard.html', token = 'saved-token', role = 1, status, cachedRole = 1 } = {}) {
  const storage = new Map([['userData', JSON.stringify({ role_id: cachedRole, full_name: 'Stale label' })]]);
  if (token) storage.set('jwtToken', token);
  const redirects = [], requests = [], removedClasses = [];
  const context = vm.createContext({
    window: { location: { pathname: '/' + page, search: '', replace: url => redirects.push(url) } },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    document: { addEventListener() {}, documentElement: { classList: { remove: name => removedClasses.push(name) } } },
    apiRequest: async endpoint => {
      requests.push(endpoint);
      if (status) { const e = new Error('Session rejected'); e.status = status; throw e; }
      return { data: { role_id: role, full_name: 'Verified user' } };
    }
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'frontend/js/auth.js'), 'utf8'), context);
  const user = await vm.runInContext('requireWorkspaceSession()', context);
  return { user, redirects, requests, storage, removedClasses };
}
for (const page of ['dashboard.html', 'case-details.html', 'clients.html', 'admin.html']) {
  test(`direct anonymous access to ${page} redirects before loading private data`, async () => {
    const result = await session({ page, token: null });
    assert.equal(result.user, null); assert.deepEqual(result.redirects, ['index.html?login=1']);
    assert.deepEqual(result.requests, []); assert.deepEqual(result.removedClasses, []);
  });
}
test('cached administrator label does not authorize a server-confirmed public user', async () => {
  const result = await session({ role: 5, cachedRole: 1 });
  assert.equal(result.user, null); assert.deepEqual(result.redirects, ['index.html?login=1&reason=staff']);
  assert.deepEqual(result.removedClasses, []);
});
for (const status of [401, 403]) {
  test(`rejected session ${status} clears saved credentials and redirects`, async () => {
    const result = await session({ status });
    assert.equal(result.user, null); assert.equal(result.storage.has('jwtToken'), false);
    assert.equal(result.storage.has('userData'), false); assert.equal(result.redirects.length, 1);
  });
}
test('database outage blocks private initialization without destroying saved credentials', async () => {
  const result = await session({ status: 503 });
  assert.equal(result.user, null); assert.equal(result.storage.has('jwtToken'), true);
  assert.deepEqual(result.removedClasses, []); assert.equal(result.redirects.length, 1);
});
for (const role of [1, 2, 3]) {
  test(`server-confirmed office role ${role} can enter the workspace`, async () => {
    const result = await session({ role });
    assert.equal(result.user.role_id, role); assert.deepEqual(result.redirects, []);
    assert.deepEqual(result.removedClasses, ['auth-pending']); assert.deepEqual(result.requests, ['/auth/me']);
  });
}
test('attorney cannot enter client-management page and staff cannot enter admin page', async () => {
  for (const options of [{ page: 'clients.html', role: 2 }, { page: 'admin.html', role: 3 }]) {
    const result = await session(options);
    assert.equal(result.user, null); assert.deepEqual(result.redirects, ['dashboard.html']);
    assert.deepEqual(result.removedClasses, []);
  }
});
test('anonymous landing remains public and does not request a private session', async () => {
  const result = await session({ page: 'index.html', token: null });
  assert.deepEqual(result.redirects, []); assert.deepEqual(result.requests, []);
});
test('all private page initializers wait for the verified session before doing work', () => {
  for (const page of ['dashboard', 'case-details', 'clients', 'admin', 'hearing-form']) {
    const source = fs.readFileSync(path.join(root, 'frontend/js', page + '.js'), 'utf8');
    assert.match(source, /DOMContentLoaded', async \(\) => \{\s*if \(!await requireWorkspaceSession\(\)\) return;/);
  }
  for (const page of ['dashboard', 'case-details', 'clients', 'admin']) {
    assert.match(fs.readFileSync(path.join(root, 'frontend', page + '.html'), 'utf8'), /<html lang="en" class="auth-pending">/);
  }
});
test('login overlay has fixed full-screen layout and a labelled dialog', () => {
  const css = fs.readFileSync(path.join(root, 'frontend/css/styles.css'), 'utf8');
  const overlay = css.match(/\.modal\s*\{([^}]+)\}/)[1];
  for (const rule of [/position:\s*fixed/, /inset:\s*0/, /align-items:\s*center/, /justify-content:\s*center/, /z-index:\s*2000/]) assert.match(overlay, rule);
  assert.match(css, /\.hidden\s*\{\s*display:\s*none\s*!important/);
  assert.match(fs.readFileSync(path.join(root, 'frontend/index.html'), 'utf8'), /role="dialog" aria-modal="true" aria-labelledby="loginTitle"/);
});
