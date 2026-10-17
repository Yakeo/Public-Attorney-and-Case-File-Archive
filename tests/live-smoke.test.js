// Read-only checks against a running instance; no records are created or changed.
// PACFAS_TEST_URL=http://127.0.0.1:5000 node --test tests/live-smoke.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const base = process.env.PACFAS_TEST_URL;
const live = (name, fn) => test(name, { skip: !base && 'Set PACFAS_TEST_URL to a running instance' }, fn);

live('LIVE: health responds with process uptime', async () => {
  const r = await fetch(`${base}/health`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.status, 'ok');
  assert.equal(typeof body.uptime, 'number');
});
for (const page of ['/', '/dashboard.html', '/case-details.html', '/clients.html', '/admin.html', '/public-cases.html']) {
  live(`LIVE: serves HTML ${page}`, async () => {
    const r = await fetch(`${base}${page}`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/html/);
    assert.match(await r.text(), /<!DOCTYPE html>/i);
  });
}
for (const endpoint of ['/auth/me', '/cases', '/clients', '/hearings', '/documents', '/documents/1/download']) {
  live(`LIVE: unauthenticated ${endpoint} is rejected`, async () => {
    const r = await fetch(`${base}/api/v1${endpoint}`);
    assert.equal(r.status, 401);
  });
}
live('LIVE: invalid bearer token is rejected', async () => {
  const r = await fetch(`${base}/api/v1/cases`, { headers: { authorization: 'Bearer not-a-valid-token' } });
  assert.equal(r.status, 401);
});
live('LIVE: unknown API endpoint returns JSON 404', async () => {
  const r = await fetch(`${base}/api/v1/not-a-route`);
  assert.equal(r.status, 404);
  assert.match(r.headers.get('content-type'), /json/);
});
for (const endpoint of ['/auth/login', '/auth/register']) {
  live(`LIVE: ${endpoint} rejects missing fields before database access`, async () => {
    const r = await fetch(`${base}/api/v1${endpoint}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
    });
    assert.equal(r.status, 400);
  });
}
// Read-only readiness gates. Failures here are environment blockers, not proof of faulty SQL.
for (const endpoint of ['/attorneys', '/cases/public']) {
  live(`LIVE READINESS: public database-backed ${endpoint} returns data`, async () => {
    const r = await fetch(`${base}/api/v1${endpoint}`);
    assert.equal(r.status, 200, `Public endpoint returned ${r.status}; inspect server/database availability`);
    assert.ok(Array.isArray((await r.json()).data));
  });
}
