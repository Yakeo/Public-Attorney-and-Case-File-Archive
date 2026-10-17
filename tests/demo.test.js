const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createPlan, documentContent, dateOffset } = require('../scripts/demo/plan');
const { assertTarget, schemaForDemo, loadBundle, publicSummaryFor, summaryPdfBuffer, seedPublicSummaries } = require('../scripts/demo/install');
const { parseArgs, connectionOptions } = require('../scripts/demo/cli');
const { pdfBuffer, parse, starterGuide, buildBundle } = require('../scripts/demo/files');

test('demo plan is deterministic, fictional, balanced and private by default', () => {
  const plan = createPlan('2026-10-17');
  assert.deepEqual(plan, createPlan('2026-10-17'));
  assert.equal(plan.attorneys.length, 5); assert.equal(plan.cases.length, 18); assert.equal(plan.clients.length, 18);
  assert.ok(plan.accounts.every(a => a.email.endsWith('@example.test')));
  assert.ok(plan.clients.every(c => c.email.endsWith('@example.test')));
  assert.equal(plan.cases.filter(c => !c.public).length, 16);
  assert.deepEqual(plan.attorneys.map((_, i) => plan.cases.filter(c => c.primaryAttorney === i).length), [4, 4, 4, 3, 3]);
  assert.equal(plan.cases[0].primaryAttorney, plan.cases[5].primaryAttorney);
  assert.equal(dateOffset(plan.date, 14), '2026-10-31');
});
test('approved public demo summaries are synthetic and identify DEMO-17/18 handling attorneys', async () => {
  const plan = createPlan();
  const publicCases = plan.cases.filter(c => c.public);
  const summaries = publicCases.map(c => publicSummaryFor(plan, c));
  assert.deepEqual(summaries.map(s => s.handlingAttorneyId), ['D0002', 'D0003']);
  assert.match(summaries[1].title, /DEMO-18 - Public Training Summary B/);
  assert.match(summaries[1].summaryText, /SYNTHETIC DEMO DATA/);
  assert.doesNotMatch(summaries[1].summaryText, /Amihan Sample18|client18@example\.test/);

  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pacfas-public-summary-'));
  try {
    const file = path.join(temp, 'demo18-public-summary.pdf');
    await fs.writeFile(file, summaryPdfBuffer(summaries[1].title, summaries[1].paragraphs));
    const text = await parse(file);
    assert.match(text, /DEMO-18 - Public Training Summary B/);
    assert.match(text, /Iris Demo/);
    assert.match(text, /NOT A REAL LEGAL RECORD/);
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
});

test('summary seeding adds missing demo rows/PDFs once and preserves the case dataset', async () => {
  const plan = createPlan();
  const ids = Object.fromEntries(plan.cases.map((c, i) => [c.key, 1700 + i]));
  const existingSummaries = new Map();
  let commits = 0;
  const db = {
    async execute(sql, params) {
      if (sql.includes('FROM public_case_summary WHERE cf_code')) {
        return [existingSummaries.has(params[0]) ? [{ public_case_summary_id: existingSummaries.get(params[0]).id }] : []];
      }
      if (sql.includes('FROM case_file WHERE cf_code')) return [[{ cf_code: params[0] }]];
      if (sql.includes('FROM case_attorney WHERE cf_code')) {
        const c = plan.cases.find(item => ids[item.key] === params[0]);
        return [c && plan.attorneys[c.primaryAttorney].id === params[1] ? [{ attorney_id: params[1] }] : []];
      }
      if (sql.includes('INSERT INTO public_case_summary')) {
        const [caseId, title, summaryText, handlingAttorneyId, pdfPath, pdfName] = params;
        existingSummaries.set(caseId, { id: existingSummaries.size + 1, title, summaryText, handlingAttorneyId, pdfPath, pdfName });
        return [{ insertId: existingSummaries.size }];
      }
      throw new Error(`Unexpected demo summary query: ${sql}`);
    },
    async beginTransaction() {},
    async commit() { commits++; },
    async rollback() { throw new Error('Unexpected rollback'); }
  };
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pacfas-demo-seed-'));
  try {
    const receipt = { cases: ids, users: { admin: 'D0001' } };
    assert.equal(await seedPublicSummaries(db, 'unit_demo', plan, receipt, root), 2);
    assert.equal(existingSummaries.size, 2);
    assert.equal(commits, 1);
    const existing18 = existingSummaries.get(ids['case-18']);
    assert.match(existing18.title, /DEMO-18/);
    assert.equal(existing18.handlingAttorneyId, 'D0003');
    assert.match(existing18.summaryText, /SYNTHETIC DEMO DATA/);
    assert.equal((await fs.readFile(existing18.pdfPath)).toString('ascii', 0, 5), '%PDF-');
    assert.equal(await seedPublicSummaries(db, 'unit_demo', plan, receipt, root), 0);
    assert.equal(commits, 1);
    assert.equal(existingSummaries.get(ids['case-18']).pdfPath, existing18.pdfPath);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('demo dates reject malformed and impossible dates', () => {
  for (const date of ['2026-02-30', '2026-13-01', 'not-a-date', '2026-1-1']) assert.throws(() => createPlan(date));
  assert.equal(createPlan('2024-02-29').date, '2024-02-29');
});
test('demo text varies by case and document, and revision markers differ', () => {
  const plan = createPlan(); const texts = new Set();
  for (const c of plan.cases) for (let i = 0; i < 5; i++) {
    const content = documentContent(plan, c, i);
    assert.match(content.paragraphs.join('\n'), /SYNTHETIC DEMO DATA - NOT A REAL LEGAL RECORD/);
    assert.ok(content.paragraphs.join('\n').includes(c.marker));
    texts.add(content.paragraphs.join('\n'));
  }
  assert.equal(texts.size, 90);
  assert.match(documentContent(plan, plan.cases[1], 0, 2).paragraphs.join('\n'), /REVISIONTWO/);
});
test('demo target guard rejects production names, missing confirmation and injection', () => {
  for (const name of ['', 'pacfas_db', 'real_records', '../x_demo', 'x-demo', 'x_demo`; DROP DATABASE real_db;--', 'a'.repeat(60) + '_demo']) {
    assert.throws(() => assertTarget(name, true));
  }
  assert.throws(() => assertTarget('pacfas_defense_demo', false));
  assert.doesNotThrow(() => assertTarget('pacfas_defense_demo', true));
});
test('demo CLI refuses destructive/ambiguous options and never defaults to DB_NAME', () => {
  assert.throws(() => parseArgs(['seed']));
  assert.throws(() => parseArgs(['seed', '--database', 'pacfas_db', '--confirm-demo']));
  assert.throws(() => parseArgs(['seed', '--database', 'x_demo', '--confirm-demo', '--reset']));
  assert.throws(() => parseArgs(['build', '--out', 'a', '--out', 'b']));
  assert.equal(parseArgs(['verify', '--database', 'x_demo', '--confirm-demo']).database, 'x_demo');
  assert.equal(connectionOptions({ DB_NAME: 'precious_real_data' }).database, undefined);
});
test('fresh demo schema preserves lookups but excludes default directory accounts', async () => {
  const schema = schemaForDemo(await fs.readFile(path.join(__dirname, '../database.sql'), 'utf8'));
  assert.match(schema, /INSERT INTO `role`/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS `attorney`/);
  assert.doesNotMatch(schema, /INSERT INTO `user_account`/);
  assert.throws(() => schemaForDemo('unexpected schema'));
});
test('actual PDF contains selectable case-specific text; scan contains only pixels', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pacfas-demo-pdf-'));
  try {
    const plan = createPlan(), content = documentContent(plan, plan.cases[0], 0);
    const textPDF = path.join(temp, 'text.pdf');
    await fs.writeFile(textPDF, await pdfBuffer(content, plan.date));
    assert.match(await parse(textPDF), /ORCHID/);
    const images = await parse(textPDF, true);
    assert.equal(images.length, 1);
    const scan = path.join(temp, 'scan.pdf');
    await fs.writeFile(scan, await pdfBuffer(content, plan.date, images));
    assert.ok((await parse(scan)).length < 50, 'Image-only PDF must require real OCR');
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
});
test('builder refuses existing output before any download or replacement', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pacfas-demo-existing-'));
  try {
    const sentinel = path.join(temp, 'keep.txt'); await fs.writeFile(sentinel, 'preserve me');
    await assert.rejects(buildBundle(temp), /Output exists/);
    assert.equal(await fs.readFile(sentinel, 'utf8'), 'preserve me');
    await fs.writeFile(path.join(temp, 'PACFAS-Defense-Demo.zip'), 'preserve zip');
    await assert.rejects(buildBundle(path.join(temp, 'new-bundle')), /ZIP output exists/);
    assert.equal(await fs.readFile(path.join(temp, 'PACFAS-Defense-Demo.zip'), 'utf8'), 'preserve zip');
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
});
test('manifest rejects mismatched metadata before any database operation', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pacfas-demo-manifest-'));
  try {
    const plan = createPlan(); plan.attorneys[0].fname = 'Unexpected';
    plan.documents = Array.from({ length: 90 }, () => ({}));
    await fs.writeFile(path.join(temp, 'manifest.json'), JSON.stringify(plan));
    await assert.rejects(loadBundle(temp), /Unexpected manifest metadata/);
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
});
test('walkthrough documents real interface limitations and isolated startup', () => {
  const guide = starterGuide(createPlan());
  for (const text of ['90 distinct documents', '92 version files', 'demo:start', '--confirm-demo', 'example.test', 'not a history picker', 'NO wipe/reset', '2026-10-31']) assert.ok(guide.includes(text), text);
});
test('manifest rejects traversal filenames before reading files outside the bundle', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pacfas-demo-traversal-'));
  try {
    const plan = createPlan();
    plan.documents = plan.cases.flatMap(c => Array.from({ length: 5 }, (_, i) => ({
      key: `${c.key}-doc-${i + 1}`, caseKey: c.key, versions: [{ number: 1, file: '../outside.pdf' }]
    })));
    await fs.writeFile(path.join(temp, 'manifest.json'), JSON.stringify(plan));
    await assert.rejects(loadBundle(temp), /Invalid or duplicate file path/);
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
});
test('installer checks the actual selected database before touching schema or files', async () => {
  const { install } = require('../scripts/demo/install'); const queries = [];
  const db = { async query(sql) { queries.push(sql); return [[{ name: 'real_archive' }]]; } };
  await assert.rejects(install(db, 'safe_demo', '/nonexistent-bundle'), /Selected database does not match/);
  assert.deepEqual(queries, ['SELECT DATABASE() AS name']);
});
