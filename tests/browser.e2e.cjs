// Real Chromium + real SQL + real OCR. No API/database/recognizer mocks.
// Requires separate Chromium tooling, OCR fixtures and a test MySQL instance. Uses a NEW disposable database.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const root = path.resolve(__dirname, '..');
const fixtures = path.join(root, '.cache/e2e/fixtures');
const screenshots = path.join(root, '.cache/e2e/screenshots');
const results = [], errors = [];
let admin, pool, server, browser, context, page, appDB, base, caseId, browserVersion, databaseVersion;
const name = `pacfas_browser_${Date.now()}_${process.pid}`;
const password = 'Synthetic-Test-7426!'; // Disposable fixtures only; not a deployment credential.
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function step(title, run) {
  try { await run(); results.push({ check: title, result: 'passed' }); console.log('PASS:', title); }
  catch (error) { results.push({ check: title, result: 'failed', error: error.message }); throw error; }
}
async function shot(file, locator) {
  await (locator || page).screenshot({ path: path.join(screenshots, file), animations: 'disabled', timeout: 60000, ...(locator ? {} : { fullPage: false }) });
}
async function waitText(locator, text) {
  await locator.filter({ hasText: text }).first().waitFor({ state: 'visible', timeout: 60000 });
}
async function upload(title, fixture, revisionCard) {
  if (revisionCard) await revisionCard.getByRole('button', { name: 'Upload revision', exact: true }).click();
  else await page.locator('#openUploadModalBtn').click();
  await page.locator('#docTitleInput').fill(title);
  await page.locator('#docFileInput').setInputFiles(path.join(fixtures, fixture));
  const response = page.waitForResponse(r => r.request().method() === 'POST' && /\/documents\/(upload|\d+\/versions)$/.test(new URL(r.url()).pathname));
  await page.locator('#submitUploadBtn').click();
  const r = await response; assert.equal(r.status(), 201, await r.text());
  return (await r.json()).data;
}
async function login(email, pass = password) {
  await page.goto(base);
  await page.locator('#openLoginBtn').click();
  await page.locator('#loginEmail').fill(email);
  await page.locator('#loginPassword').fill(pass);
  await page.locator('#loginForm button[type="submit"]').click();
  await page.waitForURL('**/dashboard.html');
  await page.locator('#userDisplayName').filter({ hasText: 'Demo' }).waitFor();
}
(async () => {
  fs.mkdirSync(screenshots, { recursive: true });
  const options = { socketPath: process.env.MYSQL_TEST_SOCKET, host: process.env.MYSQL_TEST_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_TEST_PORT) || 3306, user: process.env.MYSQL_TEST_USER || 'root',
    password: process.env.MYSQL_TEST_PASSWORD || '', multipleStatements: true };
  assert.ok(process.env.PACFAS_BROWSER_TEST === '1', 'Explicit PACFAS_BROWSER_TEST=1 opt-in required');
  assert.ok(fs.existsSync(path.join(fixtures, 'scanned.pdf')), 'Generate OCR fixtures first');
  admin = await mysql.createConnection(options);
  await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const [version] = await admin.query('SELECT VERSION() AS version'); databaseVersion = version[0].version;
  pool = mysql.createPool({ ...options, database: name });
  await pool.query(fs.readFileSync(path.join(root, 'database.sql'), 'utf8'));
  for (const [role, email, username] of [[1, 'admin@example.test', 'Demo Administrator'], [3, 'staff@example.test', 'Demo Staff'], [5, 'public@example.test', 'Demo Public']]) {
    await pool.execute('INSERT INTO user_account (role_id, username, email, password_hash) VALUES (?,?,?,?)', [role, username, email, await bcrypt.hash(password, 4)]);
  }
  Object.assign(process.env, { DB_NAME: name, DB_HOST: options.host, DB_PORT: String(options.port), DB_USER: options.user,
    DB_PASSWORD: options.password, DB_SOCKET: options.socketPath || '', JWT_SECRET: crypto.randomBytes(32).toString('hex') });
  const app = require('../app'); appDB = require('../config/db');
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
  const tools = path.join(root, '.cache/browser/node_modules');
  const { default: chromiumBinary, inflate, setupLambdaEnvironment } = await import(path.join(tools, '@sparticuz/chromium/build/index.js'));
  await inflate(path.join(tools, '@sparticuz/chromium/bin/al2023.tar.br'));
  setupLambdaEnvironment('/tmp/al2023/lib');
  const { chromium } = require(path.join(tools, 'playwright-core'));
  // Remove permissive serverless flags: test normal browser same-origin behavior.
  const args = chromiumBinary.args.filter(arg => !['--disable-web-security', '--allow-running-insecure-content'].includes(arg));
  browser = await chromium.launch({ executablePath: await chromiumBinary.executablePath(), args, headless: true });
  browserVersion = browser.version();
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  await step('Public directory search, profile and public case listing load in Chromium', async () => {
    await page.goto(base); await page.locator('.attorney-card').first().waitFor();
    await page.locator('#landingSearchInput').fill('Clara'); await page.locator('#btnLandingSearch').click();
    await waitText(page.locator('#attorneyGrid'), 'Clara'); await shot('01-directory.png');
    await page.locator('.attorney-card a').first().click(); await page.locator('#profileHeader h1, #profileHeader h2').first().waitFor();
    await page.goto(base + '/public-cases.html'); await waitText(page.locator('#publicCasesList'), 'No public cases');
  });
  await step('Login rejects wrong credentials, then accepts administrator login', async () => {
    await page.goto(base); await page.locator('#openLoginBtn').click();
    await page.locator('#loginEmail').fill('admin@example.test'); await page.locator('#loginPassword').fill('incorrect');
    await page.locator('#loginForm button[type="submit"]').click(); await waitText(page.locator('#loginError'), 'Invalid');
    await page.locator('#loginPassword').fill(password); await shot('02-login.png', page.locator('#loginModal .modal-content'));
    await page.locator('#loginForm button[type="submit"]').click(); await page.waitForURL('**/dashboard.html');
    await waitText(page.locator('#userDisplayName'), 'Demo Administrator');
  });
  await step('Create a case with a new client through the drawer and verify both records', async () => {
    await page.locator('#btnCreateCase').click(); await page.locator('#caseCategorySelectInput').selectOption('1');
    await page.locator('#caseTitleInput').fill('Demo Estate Documentation');
    await page.locator('#caseDescriptionInput').fill('Fictional training case. No real client information.');
    await page.locator('#caseClientMode').selectOption('new');
    await page.locator('#newClientFname').fill('Case Intake');
    await page.locator('#newClientLname').fill('Citizen');
    await page.locator('#newClientBirthDate').fill('1991-05-12');
    await page.locator('#caseClientRole').fill('Petitioner');
    assert.match(await page.locator('#caseNumberPreview').inputValue(), /^CIVIL-/);
    await shot('03-create-case.png', page.locator('#createCaseDrawer'));
    const response = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/cases');
    await page.locator('#createCaseForm button[type="submit"]').click(); const r = await response;
    assert.equal(r.status(), 201);
    const created = (await r.json()).data; caseId = created.case_id;
    assert.ok(created.client_id, 'new client is linked to the case atomically');
    await waitText(page.locator('#casesTableBody'), 'Demo Estate Documentation'); await shot('04-dashboard.png');
  });
  await step('Create a client through the Clients page', async () => {
    await page.getByRole('link', { name: 'Clients', exact: true }).click();
    for (const [id, value] of Object.entries({ fname: 'Demo', lname: 'Citizen', birth_date: '1990-05-12', email: 'citizen@example.test', city: 'Cagayan de Oro', region: 'Northern Mindanao' })) await page.locator('#' + id).fill(value);
    await page.locator('#createClientForm button[type="submit"]').click();
    await waitText(page.locator('#clientsList'), 'Demo Citizen'); await shot('05-clients.png');
  });
  await step('Administrator creates an attorney through the Admin page', async () => {
    await page.goto(base + '/admin.html');
    for (const [id, value] of Object.entries({ fname: 'Mara', lname: 'Demo', email: 'mara@example.test', username: 'mara-demo', password, bar_number: 'DEMO-7426' })) await page.locator('#' + id).fill(value);
    await page.locator('#createAttorneyForm button[type="submit"]').click();
    await waitText(page.locator('#attorneyList'), 'Mara Demo'); await shot('06-admin.png');
  });
  await step('Assign counsel and link the real client; creator is not shown as client', async () => {
    await page.goto(base + '/case-details.html?id=' + caseId);
    await page.locator('#attorneySelect option').filter({ hasText: 'Mara Demo' }).waitFor({ state: 'attached' });
    const attorney = await page.locator('#attorneySelect option').filter({ hasText: 'Mara Demo' }).getAttribute('value');
    await page.locator('#attorneySelect').selectOption(attorney); await page.locator('#roleOnCaseInput').fill('Lead Counsel');
    await page.locator('#assignAttorneyForm button[type="submit"]').click(); await waitText(page.locator('#attorneysList'), 'Mara Demo');
    const client = await page.locator('#clientSelect option').filter({ hasText: 'Demo Citizen' }).getAttribute('value');
    await page.locator('#clientSelect').selectOption(client); await page.locator('#clientRoleInput').fill('Petitioner');
    await page.locator('#linkClientForm button[type="submit"]').click(); await waitText(page.locator('#clientsList'), 'Demo Citizen');
    await waitText(page.locator('#caseMetaDetails'), 'Demo Citizen'); await shot('07-case-file.png');
  });
  await step('Schedule a hearing, show a conflict, and explicitly use admin override', async () => {
    await page.locator('#openHearingModalBtn').click();
    await page.locator('#hearingTitle').fill('Pre-trial conference'); await page.locator('#hearingDate').fill('2026-11-17T09:00');
    await page.locator('#hearingVenue').fill('Demo Courtroom 1'); await page.locator('#hearingNotes').fill('Synthetic schedule for training.');
    await shot('08-hearing.png', page.locator('#hearingModal .modal-content'));
    await page.locator('#saveHearingBtn').click(); await waitText(page.locator('#hearingsList'), 'Pre-trial conference');
    await page.locator('#openHearingModalBtn').click(); await page.locator('#hearingTitle').fill('Conflict demonstration');
    await page.locator('#hearingDate').fill('2026-11-17T09:30'); await page.locator('#saveHearingBtn').click();
    await waitText(page.locator('#hearingError'), 'Scheduling conflict'); await shot('09-conflict.png', page.locator('#hearingModal .modal-content'));
    await page.locator('#hearingOverride').check(); await page.locator('#saveHearingBtn').click();
    await waitText(page.locator('#hearingsList'), 'Conflict demonstration');
  });
  let pngDocId;
  await step('Upload a real PNG and retrieve it using recognized text', async () => {
    await page.locator('#openUploadModalBtn').click(); await page.locator('#docTitleInput').fill('Clear image affidavit');
    await page.locator('#docFileInput').setInputFiles(path.join(fixtures, 'clear.png'));
    await shot('10-upload.png', page.locator('#uploadModal .modal-content'));
    const response = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/documents/upload'));
    await page.locator('#submitUploadBtn').click(); const r = await response; assert.equal(r.status(), 201); pngDocId = (await r.json()).data.documentId;
    let card = page.locator('#documentsList .doc-card').filter({ hasText: 'Clear image affidavit' });
    await waitText(card, 'COMPLETED');
    await page.locator('#documentSearchInput').fill('7426');
    await waitText(page.locator('#documentSearchResults'), 'Clear image affidavit');
    await page.locator('#clearDocumentSearch').click();
    await shot('11-ocr.png', card);
  });
  await step('Upload two-page scanned-PDF revision, OCR both pages, download exact current bytes', async () => {
    const card = () => page.locator('#documentsList .doc-card').filter({ hasText: 'Clear image affidavit' });
    const revision = await upload('Scanned PDF revision', 'scanned.pdf', card()); assert.equal(revision.versionNumber, 2);
    await waitText(card(), 'COMPLETED');
    for (const term of ['7426', '7427']) {
      await page.locator('#documentSearchInput').fill(term);
      await waitText(page.locator('#documentSearchResults'), 'Clear image affidavit');
    }
    await page.locator('#clearDocumentSearch').click(); await shot('12-scanned-pdf.png', card());
    const downloaded = page.waitForEvent('download'); await card().getByRole('button', { name: 'Download', exact: false }).click();
    const download = await downloaded; const dest = path.join(root, '.cache/e2e/downloaded.pdf'); await download.saveAs(dest);
    assert.equal(hash(dest), hash(path.join(fixtures, 'scanned.pdf')));
  });
  for (const [fixture, title] of [['clear.jpg', 'JPEG recognition'], ['clear.tiff', 'TIFF recognition'], ['text.pdf', 'Embedded PDF text']]) {
    await step(`Real ${fixture} upload, processing and content retrieval`, async () => {
      await upload(title, fixture); const card = page.locator('#documentsList .doc-card').filter({ hasText: title });
      await waitText(card, 'COMPLETED');
      await page.locator('#documentSearchInput').fill('7426');
      await waitText(page.locator('#documentSearchResults'), title);
      await page.locator('#clearDocumentSearch').click();
    });
  }
  await step('Blank image fails visibly; a real retry is accepted and fails safely again', async () => {
    await upload('Blank scan failure', 'blank.png'); const card = () => page.locator('#documentsList .doc-card').filter({ hasText: 'Blank scan failure' });
    await waitText(card(), 'FAILED'); await shot('13-retry.png', card());
    const response = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/retry'));
    await card().getByRole('button', { name: 'Retry extraction' }).click(); assert.equal((await response).status(), 202);
    await waitText(card(), 'FAILED');
  });
  await step('Corrupt PDF fails without losing the stored document', async () => {
    await upload('Corrupt PDF failure', 'corrupt.pdf');
    await waitText(page.locator('#documentsList .doc-card').filter({ hasText: 'Corrupt PDF failure' }), 'FAILED');
  });
  await step('Unsupported file shows a user-visible validation error', async () => {
    await page.locator('#openUploadModalBtn').click(); await page.locator('#docTitleInput').fill('Invalid type');
    await page.locator('#docFileInput').setInputFiles(path.join(fixtures, 'unsupported.txt')); await page.locator('#submitUploadBtn').click();
    await waitText(page.locator('#uploadError'), 'Invalid file type'); await page.locator('#closeUploadModalBtn').click();
  });
  await step('Extracted-text search finds the recognized current and prior revisions', async () => {
    const result = await page.evaluate(() => apiRequest('/documents/search?q=7426'));
    assert.ok(result.data.some(row => Number(row.document_id) === pngDocId));
    const [rows] = await pool.execute('SELECT ocr_status FROM document_version WHERE document_code=? ORDER BY version_no', [pngDocId]);
    assert.deepEqual(rows.map(row => row.ocr_status), ['COMPLETED', 'COMPLETED']);
  });
  await step('Dashboard filtering, linked-client display and mobile layout', async () => {
    await page.goto(base + '/dashboard.html'); await waitText(page.locator('#casesTableBody'), 'Demo Citizen');
    await page.locator('#caseSearchInput').fill('not-present'); await waitText(page.locator('#casesTableBody'), 'No cases found');
    await page.locator('#caseSearchInput').fill('Estate'); await waitText(page.locator('#casesTableBody'), 'Demo Estate');
    await page.locator('#caseStatusSelect').selectOption('CLOSED'); await waitText(page.locator('#casesTableBody'), 'No cases found');
    await page.locator('#caseStatusSelect').selectOption('All'); await waitText(page.locator('#casesTableBody'), 'Demo Estate');
    await shot('04-dashboard.png'); await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Dashboard must not overflow the mobile viewport');
    await shot('14-mobile.png'); await page.setViewportSize({ width: 1440, height: 1000 });
  });
  await step('Logout removes credentials; staff and public roles enforce real UI/API restrictions', async () => {
    await page.locator('#logoutBtn').click(); await page.waitForURL(base + '/index.html');
    assert.equal(await page.evaluate(() => localStorage.getItem('jwtToken')), null);
    await login('staff@example.test'); assert.ok(await page.locator('a[href="admin.html"]').isHidden());
    await page.goto(base + '/case-details.html?id=' + caseId); await page.locator('#openHearingModalBtn').click();
    await page.locator('#hearingTitle').fill('Staff conflict'); await page.locator('#hearingDate').fill('2026-11-17T09:15');
    await page.locator('#saveHearingBtn').click(); await waitText(page.locator('#hearingError'), 'Scheduling conflict');
    assert.ok(await page.locator('#hearingOverrideLabel').isHidden());
    await page.goto(base + '/index.html'); await page.locator('#logoutBtn').click(); await page.waitForURL(base + '/index.html'); await login('public@example.test');
    const status = await page.evaluate(async () => (await fetch('/api/v1/documents', { headers: { Authorization: `Bearer ${localStorage.getItem('jwtToken')}` } })).status);
    assert.equal(status, 403);
  });
  await step('New internal case is private from unauthenticated public summaries', async () => {
    const response = await context.request.get(base + '/api/v1/cases/public');
    assert.equal(response.status(), 200);
    assert.ok(!(await response.json()).data.some(row => row.id === caseId));
  });
  await step('No uncaught browser JavaScript errors', async () => assert.deepEqual(errors, []));
  console.log(`COMPLETED: ${results.length} real browser/OCR checks`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
  if (appDB) await appDB.end();
  if (pool) {
    const [rows] = await pool.query('SELECT file_path FROM document_version');
    for (const row of rows) if (row.file_path.startsWith(path.join(root, 'uploads/documents/'))) fs.rmSync(row.file_path, { force: true });
    await pool.end();
  }
  if (admin) { try { await admin.query(`DROP DATABASE IF EXISTS \`${name}\``); } finally { await admin.end(); } }
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs/Browser_OCR_Results.json'), JSON.stringify({ date: '2026-10-17', browser: browserVersion, database: databaseVersion, success: process.exitCode !== 1, languageModelSHA256: process.env.TESSDATA_PATH ? hash(path.join(process.env.TESSDATA_PATH, 'eng.traineddata')) : null, mocked: false, results, uncaughtBrowserErrors: errors }, null, 2) + '\n');
});
