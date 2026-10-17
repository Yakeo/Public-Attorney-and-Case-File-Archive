const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pacfas-ocr-'));
let calls, claim, recognized, terminated, workerError;
const dbId = require.resolve('../config/db');
require.cache[dbId] = { id: dbId, filename: dbId, loaded: true, exports: { execute: async (sql, params) => {
  calls.push({ sql, params }); return [{ affectedRows: claim ? 1 : 0 }];
} } };
const tesseract = require('tesseract.js');
const original = tesseract.createWorker;
tesseract.createWorker = async () => ({ recognize: async () => {
  if (workerError) throw workerError;
  return { data: { text: recognized } };
}, terminate: async () => { terminated++; } });
const { extractText, processOCR } = require('../utils/documentOCR');
beforeEach(() => { calls = []; claim = true; recognized = 'Synthetic affidavit'; terminated = 0; workerError = null; });
after(() => { tesseract.createWorker = original; fs.rmSync(temp, { recursive: true, force: true }); });

// A genuine minimal text PDF with correct byte offsets, not a mock parser result.
function createPDF(file) {
  const text = 'Synthetic affidavit for regression testing. This is not real client evidence and contains enough embedded text.';
  const stream = `BT /F1 12 Tf 50 700 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
  ];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const start = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  fs.writeFileSync(file, pdf);
}
test('real installed PDFParse extracts embedded text from a genuine PDF', async () => {
  const file = path.join(temp, 'embedded.pdf'); createPDF(file);
  assert.match(await extractText(file), /Synthetic affidavit/);
  assert.equal(terminated, 0, 'Long embedded text should not need image OCR');
});
test('OCR marks the exact version completed with nonempty text', async () => {
  await processOCR(42, 2, path.join(temp, 'image.png'));
  assert.match(calls[0].sql, /ocr_status = 'PENDING'/);
  assert.match(calls.at(-1).sql, /ocr_status = 'COMPLETED'/);
  assert.deepEqual(calls.at(-1).params, ['Synthetic affidavit', 42, 2]);
  assert.equal(terminated, 1);
});
test('another task cannot process an already claimed version', async () => {
  claim = false; await processOCR(42, 2, 'image.png');
  assert.equal(calls.length, 1); assert.equal(terminated, 0);
});
test('empty image recognition becomes FAILED rather than COMPLETED', async () => {
  recognized = '   '; await processOCR(42, 2, 'image.png');
  assert.match(calls.at(-1).sql, /ocr_status = 'FAILED'/);
  assert.equal(terminated, 1);
});
test('worker failure terminates worker and persists safe failure message', async () => {
  workerError = new Error('Sensitive internal path /private/file');
  await processOCR(42, 2, 'image.png');
  assert.match(calls.at(-1).sql, /ocr_status = 'FAILED'/);
  assert.ok(!calls.at(-1).params[0].includes('/private'));
  assert.equal(terminated, 1);
});
test('corrupt PDF becomes a persisted failure', async () => {
  const file = path.join(temp, 'corrupt.pdf'); fs.writeFileSync(file, '%PDF-broken');
  await processOCR(42, 2, file);
  assert.match(calls.at(-1).sql, /ocr_status = 'FAILED'/);
});

test('offline recovery marks only unfinished jobs as retryable failures', async () => {
  const { recoverInterruptedOCR } = require('../scripts/recover-ocr');
  let query;
  const count = await recoverInterruptedOCR({ execute: async sql => { query = sql; return [{ affectedRows: 3 }]; } });
  assert.equal(count, 3);
  assert.match(query, /WHERE ocr_status IN \('PENDING', 'PROCESSING'\)/);
});
