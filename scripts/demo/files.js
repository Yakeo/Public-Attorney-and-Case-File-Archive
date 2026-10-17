const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const PDFDocument = require('pdfkit');
const { PDFParse } = require('pdf-parse');
const Tesseract = require('tesseract.js');
const { zipSync } = require('fflate');
const { createPlan, documentContent, DEMO_PASSWORD, VERSION, dateOffset } = require('./plan');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const MODEL_HASH = '7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2';

async function pdfBuffer(content, date, images) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'LETTER', margin: 48, info: {
      Title: content.title, Author: 'PACFAS Synthetic Demo Generator',
      CreationDate: new Date(date + 'T12:00:00Z'), ModDate: new Date(date + 'T12:00:00Z')
    } });
    const chunks = [];
    pdf.on('data', b => chunks.push(b)); pdf.on('error', reject);
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    if (images) {
      images.forEach((image, i) => { if (i) pdf.addPage(); pdf.image(image, 0, 0, { width: 612, height: 792 }); });
    } else {
      pdf.font('Helvetica-Bold').fontSize(17).text(content.title);
      pdf.moveDown(.5);
      for (const [i, text] of content.paragraphs.entries()) {
        pdf.font(i === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(10.5).text(text, { lineGap: 2 });
        pdf.moveDown(.55);
      }
    }
    pdf.end();
  });
}
async function parse(file, screenshots = false) {
  const parser = new PDFParse({ data: await fs.readFile(file) });
  try {
    if (screenshots) return (await parser.getScreenshot({ scale: 2.4, imageBuffer: true, imageDataUrl: false })).pages.map(p => Buffer.from(p.data));
    return ((await parser.getText()).text || '').trim();
  } finally { await parser.destroy(); }
}
async function download(url) {
  let r;
  try { r = await fetch(url, { headers: { Accept: 'application/vnd.github.raw+json', 'User-Agent': 'PACFAS-defense-demo-builder' }, signal: AbortSignal.timeout(45000) }); }
  catch (e) { throw new Error(`Language-data download failed (${e.cause?.code || e.message}). Supply --language-data /path/to/eng.traineddata; never disable TLS verification.`); }
  if (!r.ok) throw new Error(`Language-data download failed: HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}
function starterGuide(plan) {
  return `PACFAS SMALL DEFENSE DEMO - ${VERSION}\n\n` +
    `5 fictional attorneys; 18 cases; 90 distinct documents; 92 version files.\n` +
    `All people, events and records are synthetic. NOT legal advice or actual evidence.\n\n` +
    `SETUP (Node.js 22+, running MySQL/MariaDB):\n` +
    `1. Extract this ZIP into the latest repository root. It creates demo-data/defense-v1/.\n` +
    `2. Run npm ci (include development dependencies if also rebuilding documents).\n` +
    `3. Configure MySQL connection in .env; keep real database records separate.\n` +
    `4. Run: npm run demo:seed -- --database pacfas_defense_demo --confirm-demo\n` +
    `   This only initializes an EMPTY demo database. Never import database.sql over real data.\n` +
    `5. Preferred: npm run demo:start -- --database pacfas_defense_demo --confirm-demo\n` +
    `   This selects the demo DB and offline model without changing .env.\n` +
    `   Alternatively, set DB_NAME=pacfas_defense_demo and TESSDATA_PATH to the absolute\n` +
    `   path of demo-data/defense-v1/language-data for offline OCR. Remove/change DB_SOCKET\n` +
    `   if moving to Windows or another MySQL installation. Keep your own JWT_SECRET.\n` +
    `6. If using the alternative, run npm start. Open the configured app port, select Staff Login.\n` +
    `7. Verify with npm run demo:verify -- --database pacfas_defense_demo --confirm-demo\n\n` +
    `DEMO-ONLY PASSWORD: ${DEMO_PASSWORD}\n` +
    plan.accounts.map(a => `${a.email} | ${a.key} | role ${a.role}`).join('\n') +
    `\nClient profiles are NOT provided with usable portal passwords.\n` +
    `Never expose these public, shared demo credentials on a live deployment.\n\n` +
    `SUGGESTED WALKTHROUGH (reference date ${plan.date}):\n` +
    `- DEMO-01: scan + PNG OCR. Search extracted text for ORCHID using the real search API.\n` +
    `  Open the cards' extracted text; download the original; upload a new revision.\n` +
    `- DEMO-02 and DEMO-03: document 1 has two revisions with INITIALCOPY / REVISIONTWO markers.\n` +
    `  Current downloads use version 2. The browser lists the current revision, not a history picker.\n` +
    `- DEMO-03: two counsel and two linked clients.\n` +
    `- DEMO-01 has a hearing ${dateOffset(plan.date, 14)} at 09:00. Try scheduling DEMO-06\n` +
    `  for the same date at 09:30: both share Tala Demo, so the UI should show a conflict.\n` +
    `  Sign in as staff to demonstrate rejection; admin override is explicit.\n` +
    `- DEMO-17 and DEMO-18: deliberately public fictional summaries; the other 16 remain private.\n` +
    `- Accounts for counsel can view the office archive but cannot create cases or assign counsel.\n\n` +
    `Existing complete installs are recognized, not duplicated or overwritten. This generator\n` +
    `has NO wipe/reset command. For a fresh rehearsal use another EMPTY *_demo database.\n` +
    `Files are copied to uploads/defense-v1/<database>/ with portable relative DB paths.\n` +
    `The ZIP does not contain Node modules, database binaries, your .env, or real records.\n`;
}
async function buildBundle(out, { date = '2026-10-17', languageData } = {}) {
  const plan = createPlan(date);
  try { await fs.access(out); throw new Error('Output exists; preserved it. Use a different --out directory to rebuild.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const zip = path.join(path.dirname(out), 'PACFAS-Defense-Demo.zip');
  try { await fs.access(zip); throw new Error('ZIP output exists; preserved it. Choose --out in a new parent directory.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await fs.mkdir(path.dirname(out), { recursive: true });
  const stage = await fs.mkdtemp(path.join(path.dirname(out), '.defense-build-'));
  let worker;
  try {
    await fs.mkdir(path.join(stage, 'files'));
    await fs.mkdir(path.join(stage, 'language-data'));
    const model = languageData ? await fs.readFile(languageData) : await download('https://api.github.com/repos/tesseract-ocr/tessdata_fast/contents/eng.traineddata');
    if (digest(model) !== MODEL_HASH) throw new Error('English model checksum differs from the validated version. Use the validated model or review the update.');
    await fs.writeFile(path.join(stage, 'language-data/eng.traineddata'), model);
    const license = await fs.readFile(path.join(__dirname, 'tessdata-LICENSE.txt'));
    await fs.writeFile(path.join(stage, 'language-data/LICENSE.txt'), license);
    worker = await Tesseract.createWorker('eng', 1, { langPath: path.resolve(stage, 'language-data'), cachePath: path.resolve(stage, 'language-data'), gzip: false });
    const documents = [];
    for (const c of plan.cases) {
      for (let kind = 0; kind < 5; kind++) {
        const title = documentContent(plan, c, kind).title;
        const document = { key: `${c.key}-doc-${kind + 1}`, caseKey: c.key, title, versions: [] };
        const revisionCount = kind === 0 && [1, 2].includes(plan.cases.indexOf(c)) ? 2 : 1;
        for (let revision = 1; revision <= revisionCount; revision++) {
          const content = documentContent(plan, c, kind, revision);
          let bytes = await pdfBuffer(content, plan.date), mime = 'application/pdf', method = 'pdf-parse';
          let file = `${c.ref}-doc${kind + 1}-v${revision}.pdf`;
          let filePath = path.join(stage, 'files', file);
          await fs.writeFile(filePath, bytes);
          let text;
          if (c.key === 'case-1' && kind < 2) {
            const images = await parse(filePath, true);
            const parts = [];
            for (const image of images) parts.push((await worker.recognize(image)).data.text.trim());
            text = parts.join('\n\n'); method = 'tesseract';
            if (kind === 0) bytes = await pdfBuffer(content, plan.date, images);
            else {
              if (images.length !== 1) throw new Error('PNG demonstration content must fit one page.');
              await fs.unlink(filePath); mime = 'image/png'; bytes = images[0];
              file = `${c.ref}-doc${kind + 1}-v${revision}.png`; filePath = path.join(stage, 'files', file);
            }
            await fs.writeFile(filePath, bytes);
          } else text = await parse(filePath);
          if (!text || !text.includes(c.marker)) throw new Error(`Actual extraction failed for ${file}; refusing to label it completed.`);
          document.versions.push({ number: revision, file: `files/${file}`, size: bytes.length,
            sha256: digest(bytes), mime, extractedText: text, method, ocrStatus: 'COMPLETED' });
        }
        documents.push(document);
      }
    }
    const manifest = { ...plan, documents, languageModel: { file: 'language-data/eng.traineddata', sha256: MODEL_HASH },
      counts: { attorneys: 5, clients: 18, cases: 18, documents: 90, versions: 92 } };
    await fs.writeFile(path.join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    await fs.writeFile(path.join(stage, 'START-HERE.txt'), starterGuide(plan));
    await fs.copyFile(path.join(__dirname, '../../docs/Defense_Demo.md'), path.join(stage, 'DEFENSE-WALKTHROUGH.md'));
    await fs.rename(stage, out);
    const entries = {};
    async function collect(dir, prefix) {
      for (const item of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, item.name), name = `${prefix}/${item.name}`;
        if (item.isDirectory()) await collect(full, name);
        else entries[name] = new Uint8Array(await fs.readFile(full));
      }
    }
    await collect(out, 'demo-data/defense-v1');
    await fs.writeFile(zip, zipSync(entries, { level: 6 }));
    return { out, zip, manifest };
  } catch (error) { await fs.rm(stage, { recursive: true, force: true }); throw error; }
  finally { if (worker) await worker.terminate(); }
}
module.exports = { buildBundle, pdfBuffer, parse, digest, starterGuide, MODEL_HASH };
