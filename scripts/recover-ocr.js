// Offline maintenance only. Stop ALL app/worker instances before running this.
async function recoverInterruptedOCR(db) {
  const [result] = await db.execute(
    `UPDATE document_version SET ocr_status = 'FAILED',
       ocr_error = 'Extraction was interrupted. Retry text extraction.'
     WHERE ocr_status IN ('PENDING', 'PROCESSING')`
  );
  return result.affectedRows;
}
if (require.main === module) {
  if (!process.argv.includes('--confirm-workers-stopped')) {
    console.error('Stop ALL app/worker instances first, then pass --confirm-workers-stopped.');
    process.exitCode = 1;
  } else {
    const db = require('../config/db');
    recoverInterruptedOCR(db)
      .then(count => console.log(`Marked ${count} interrupted extraction(s) as failed. Staff can now retry.`))
      .catch(error => { console.error('OCR recovery failed:', error.code || error.message); process.exitCode = 1; })
      .finally(() => db.end());
  }
}
module.exports = { recoverInterruptedOCR };
