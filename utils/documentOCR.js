const fs = require('fs/promises');
const { PDFParse } = require('pdf-parse');
const Tesseract = require('tesseract.js');
const db = require('../config/db');

async function recognizeImages(images) {
  const worker = await Tesseract.createWorker('eng', 1, process.env.TESSDATA_PATH
    ? { langPath: process.env.TESSDATA_PATH, cachePath: process.env.TESSDATA_PATH, gzip: false } : {});
  try {
    const parts = [];
    for (const image of images) {
      const result = await worker.recognize(image);
      const text = (result.data.text || '').trim();
      if (text) parts.push(text);
    }
    return parts.join('\n\n');
  } finally { await worker.terminate(); }
}

async function extractText(filePath) {
  if (!filePath.toLowerCase().endsWith('.pdf')) return recognizeImages([filePath]);
  const parser = new PDFParse({ data: await fs.readFile(filePath) });
  try {
    const text = ((await parser.getText()).text || '').trim();
    if (text.length >= 50) return text;
    // Render with the SAME pdf.js instance used for extraction. Mixing a second
    // PDF renderer can reuse an incompatible global worker after getText().
    const screenshots = await parser.getScreenshot({ scale: 2, imageBuffer: true, imageDataUrl: false });
    return (await recognizeImages(screenshots.pages.map(page => Buffer.from(page.data)))) || text;
  } finally { await parser.destroy(); }
}

async function processOCR(documentCode, versionNumber, filePath) {
  try {
    // Only one task can claim a PENDING version, including concurrent retries.
    const [claim] = await db.execute(
      `UPDATE document_version SET ocr_status = 'PROCESSING', ocr_error = NULL
       WHERE document_code = ? AND version_no = ? AND ocr_status = 'PENDING'`,
      [documentCode, versionNumber]
    );
    if (!claim.affectedRows) return;
    const text = (await extractText(filePath)).trim();
    if (!text) throw new Error('No readable text found');
    await db.execute(
      `UPDATE document_version SET extracted_text = ?, ocr_status = 'COMPLETED', ocr_error = NULL
       WHERE document_code = ? AND version_no = ?`, [text, documentCode, versionNumber]
    );
  } catch (error) {
    console.error(`[OCR FAILURE] document ${documentCode}, version ${versionNumber}:`, error.message);
    try {
      await db.execute(
        `UPDATE document_version SET ocr_status = 'FAILED', ocr_error = ?
         WHERE document_code = ? AND version_no = ?`,
        ['Text extraction failed. Check scan quality or ask staff to retry.', documentCode, versionNumber]
      );
    } catch (statusError) { console.error('[OCR STATUS SAVE FAILURE]', statusError.message); }
  }
}

// This is explicitly an in-process job, not a durable queue. See deployment notes.
function scheduleOCR(documentCode, versionNumber, filePath) {
  setImmediate(() => { void processOCR(documentCode, versionNumber, filePath); });
}
module.exports = { extractText, processOCR, scheduleOCR };
