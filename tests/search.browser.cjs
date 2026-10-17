// Real browser + disposable real database + real OCR. No API/recognizer mocks.
const path = require('node:path');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { DEMO_PASSWORD } = require('../scripts/demo/plan');
async function runSearchBrowser({ base, bundle, receipt, db }) {
  const tools = path.resolve(process.env.PACFAS_BROWSER_TOOLS || '.cache/search-browser/node_modules');
  const { default: binary, inflate, setupLambdaEnvironment } = await import(path.join(tools, '@sparticuz/chromium/build/index.js'));
  await inflate(path.join(tools, '@sparticuz/chromium/bin/al2023.tar.br'));
  setupLambdaEnvironment('/tmp/al2023/lib');
  const { chromium } = require(path.join(tools, 'playwright-core'));
  let browser, uploadedId;
  try {
    browser = await chromium.launch({ executablePath: await binary.executablePath(), headless: true,
      args: binary.args.filter(a => !['--disable-web-security', '--allow-running-insecure-content'].includes(a)) });
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
    await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.locator('#openLoginBtn').click();
    await page.locator('#loginEmail').fill('demo.admin@example.test');
    await page.locator('#loginPassword').fill(DEMO_PASSWORD);
    await page.locator('#loginForm button[type="submit"]').click();
    await page.waitForURL('**/dashboard.html');
    await page.locator('#documentSearchInput').fill('ORCHID');
    await page.locator('#documentSearchStatus').filter({ hasText: '5 matching documents.' }).waitFor();
    assert.equal(await page.locator('#documentSearchResults article').count(), 5);
    assert.ok(!await page.locator('#documentSearchResults').innerText().then(t => t.includes('INITIALCOPY')));
    await page.locator('#documentSearchInput').fill('DEMO-01-doc2-v1.png');
    await page.locator('#documentSearchStatus').filter({ hasText: '1 matching document.' }).waitFor();
    const downloadEvent = page.waitForEvent('download');
    await page.locator('#documentSearchResults button').click();
    const download = await downloadEvent;
    const downloaded = await fs.readFile(await download.path());
    const original = await fs.readFile(path.join(bundle, 'files/DEMO-01-doc2-v1.png'));
    const hash = b => crypto.createHash('sha256').update(b).digest('hex');
    assert.equal(hash(downloaded), hash(original));
    await page.locator('#documentSearchResults a').click();
    await page.waitForURL('**/case-details.html?id=*');
    await page.locator('#documentSearchInput').fill('ORCHID');
    await page.locator('#documentSearchStatus').filter({ hasText: '5 matching documents.' }).waitFor();
    await page.locator('#openUploadModalBtn').click();
    await page.locator('#docTitleInput').fill('Search Workflow Sample');
    await page.locator('#docFileInput').setInputFiles(path.join(bundle, 'files/DEMO-01-doc2-v1.png'));
    const uploaded = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/documents/upload'));
    await page.locator('#submitUploadBtn').click();
    const response = await uploaded; assert.equal(response.status(), 201);
    uploadedId = (await response.json()).data.documentId;
    // Title/filename do not contain ORCHID. Only successful real OCR can add this match.
    await page.locator('#documentSearchResults article').filter({ hasText: 'Search Workflow Sample' }).waitFor({ timeout: 90000 });
    assert.equal(await page.locator('#documentSearchInput').inputValue(), 'ORCHID');
    await page.locator('#documentSearchStatus').filter({ hasText: '6 matching documents.' }).waitFor();
    await page.locator('#clearDocumentSearch').click();
    await page.locator('#documentsList').waitFor({ state: 'visible' });
    assert.equal(await page.locator('summary').filter({ hasText: 'Extracted OCR' }).count(), 0);
    // A query belonging to another case must never escape this case scope.
    await page.locator('#documentSearchInput').fill('TRAINING02');
    await page.locator('#documentSearchStatus').filter({ hasText: '0 matching documents.' }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    const width = await page.evaluate(() => ({ full: document.documentElement.scrollWidth, viewport: innerWidth }));
    assert.ok(width.full <= width.viewport + 2, 'Search must fit mobile viewport');
    assert.deepEqual(errors, []);
    console.log('Real Chromium search: OCR-only match, filename, authenticated download hash, scoped results, live upload-to-search, clear, mobile, zero uncaught JS errors passed.');
  } finally {
    if (browser) await browser.close();
    if (uploadedId) {
      const [rows] = await db.execute('SELECT file_path FROM document_version WHERE document_code=?', [uploadedId]);
      await db.execute('DELETE FROM document_version WHERE document_code=?', [uploadedId]);
      await db.execute('DELETE FROM document WHERE document_code=?', [uploadedId]);
      for (const row of rows) await fs.rm(row.file_path, { force: true });
    }
  }
}
module.exports = { runSearchBrowser };
if (require.main === module) {
  process.env.PACFAS_DEMO_TEST = '1';
  process.env.PACFAS_SEARCH_BROWSER = '1';
  require('./demo.integration.js');
}
