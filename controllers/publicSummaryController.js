const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const db = require('../config/db');
const catchAsync = require('../utils/catchAsync');
const CustomError = require('../utils/customError');
const { logAction, getRequestMeta } = require('../utils/auditLog');

const PRIVATE_SUMMARY_DIR = path.resolve(__dirname, '../private-storage/public-summaries');
const MAX_SUMMARY_LENGTH = 10000;

const makePublicCaseNumber = (row) => {
  const year = row.creation_date ? new Date(row.creation_date).getFullYear() : new Date().getFullYear();
  return `CASE-${year}-${String(row.cf_code).padStart(4, '0')}`;
};

// Public API returns only fields explicitly authored for public release.
exports.listPublishedSummaries = catchAsync(async (req, res) => {
  const { attorney_id } = req.query;
  let sql = `
    SELECT s.cf_code, s.public_title, s.summary_text, s.pdf_file_name,
           cf.creation_date, a.fname, a.lname, a.attorney_id
    FROM public_case_summary s
    JOIN case_file cf ON cf.cf_code = s.cf_code
    JOIN attorney a ON a.attorney_id = s.handling_attorney_id
    WHERE s.is_current = 1 AND s.approved_at IS NOT NULL AND cf.is_deleted = 0
  `;
  const params = [];
  if (attorney_id) {
    sql += ` AND EXISTS (
      SELECT 1 FROM case_attorney ca
      WHERE ca.cf_code = s.cf_code AND ca.attorney_id = ?
    )`;
    params.push(attorney_id);
  }
  sql += ' ORDER BY s.approved_at DESC';

  const [rows] = await db.execute(sql, params);
  const data = rows.map((row) => ({
    id: row.cf_code,
    case_number: makePublicCaseNumber(row),
    title: row.public_title,
    summary: row.summary_text,
    handling_attorney: `Atty. ${row.fname} ${row.lname}`.trim(),
    pdf_available: Boolean(row.pdf_file_name)
  }));
  res.status(200).json({ status: 'success', results: data.length, data });
});

exports.downloadPublishedSummary = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const [rows] = await db.execute(
    `SELECT s.pdf_file_path, s.pdf_file_name
     FROM public_case_summary s
     JOIN case_file cf ON cf.cf_code = s.cf_code
     WHERE s.cf_code = ? AND s.is_current = 1
       AND s.approved_at IS NOT NULL AND cf.is_deleted = 0
     LIMIT 1`,
    [id]
  );
  if (!rows.length) return next(new CustomError('No approved public summary is available for this case.', 404));

  const filePath = path.resolve(rows[0].pdf_file_path);
  if (!filePath.startsWith(`${PRIVATE_SUMMARY_DIR}${path.sep}`)) {
    return next(new CustomError('Summary file is unavailable.', 404));
  }
  try {
    await fsp.access(filePath, fs.constants.R_OK);
  } catch (_err) {
    return next(new CustomError('Approved summary PDF is missing from storage.', 404));
  }

  const safeName = path.basename(rows[0].pdf_file_name || 'public-summary.pdf').replace(/[\r\n"\\]/g, '_');
  res.set({
    'Content-Type': 'application/pdf',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.download(filePath, safeName);
});

exports.listManagedSummaries = catchAsync(async (_req, res) => {
  const [rows] = await db.execute(
    `SELECT s.cf_code, s.version_no, s.public_title, s.handling_attorney_id,
            s.is_current, s.approved_at, a.fname, a.lname
     FROM public_case_summary s
     JOIN (
       SELECT cf_code, MAX(version_no) AS latest_version
       FROM public_case_summary GROUP BY cf_code
     ) latest ON latest.cf_code = s.cf_code AND latest.latest_version = s.version_no
     LEFT JOIN attorney a ON a.attorney_id = s.handling_attorney_id
     ORDER BY s.approved_at DESC`
  );
  res.status(200).json({
    status: 'success',
    results: rows.length,
    data: rows.map((row) => ({
      id: row.cf_code,
      version: row.version_no,
      title: row.public_title,
      handling_attorney: row.fname ? `Atty. ${row.fname} ${row.lname}` : null,
      published: Boolean(row.is_current && row.approved_at),
      approved_at: row.approved_at
    }))
  });
});

// Publishing is an explicit admin action. Each upload creates a new approved version;
// prior versions remain in the private store for internal history but are not public.
exports.publishSummary = catchAsync(async (req, res, next) => {
  if (!req.file) return next(new CustomError('Upload the approved public-summary PDF.', 400));
  const { id } = req.params;
  const publicTitle = String(req.body.public_title || '').trim();
  const summaryText = String(req.body.summary_text || '').trim();
  const handlingAttorneyId = String(req.body.handling_attorney_id || '').trim();

  if (!publicTitle || publicTitle.length > 150) {
    return next(new CustomError('Provide a public title of 1 to 150 characters.', 400));
  }
  if (!summaryText || summaryText.length > MAX_SUMMARY_LENGTH) {
    return next(new CustomError(`Provide a public summary of 1 to ${MAX_SUMMARY_LENGTH} characters.`, 400));
  }
  if (!handlingAttorneyId) return next(new CustomError('Select the handling attorney approved for disclosure.', 400));

  // MIME and extension are client supplied; verify the PDF signature as well.
  const handle = await fsp.open(req.file.path, 'r');
  let signature;
  try {
    const buffer = Buffer.alloc(5);
    await handle.read(buffer, 0, 5, 0);
    signature = buffer.toString('ascii');
  } finally {
    await handle.close();
  }
  if (signature !== '%PDF-') {
    return next(new CustomError('The uploaded file is not a valid PDF.', 400));
  }

  const [attorneyRows] = await db.execute(
    `SELECT a.attorney_id
     FROM attorney a
     JOIN case_attorney ca ON ca.attorney_id = a.attorney_id
     WHERE a.attorney_id = ? AND ca.cf_code = ?
     LIMIT 1`,
    [handlingAttorneyId, id]
  );
  if (!attorneyRows.length) {
    return next(new CustomError('The selected handling attorney must be associated with this case.', 400));
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [caseRows] = await connection.execute(
      'SELECT cf_code FROM case_file WHERE cf_code = ? AND is_deleted = 0 FOR UPDATE',
      [id]
    );
    if (!caseRows.length) {
      await connection.rollback();
      connection.release();
      return next(new CustomError('Case not found.', 404));
    }

    const [versionRows] = await connection.execute(
      'SELECT COALESCE(MAX(version_no), 0) AS latest_version FROM public_case_summary WHERE cf_code = ?',
      [id]
    );
    const nextVersion = Number(versionRows[0].latest_version) + 1;
    await connection.execute(
      'UPDATE public_case_summary SET is_current = 0 WHERE cf_code = ? AND is_current = 1',
      [id]
    );
    await connection.execute(
      `INSERT INTO public_case_summary
       (cf_code, version_no, public_title, summary_text, handling_attorney_id,
        pdf_file_path, pdf_file_name, approved_by, approved_at, is_current)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), 1)`,
      [id, nextVersion, publicTitle, summaryText, handlingAttorneyId,
        req.file.path,
        path.basename(String(req.file.originalname || '').replace(/\\\\/g, '/')).slice(0, 255) || 'public-summary.pdf',
        req.user.user_id]
    );
    await connection.commit();
    connection.release();

    const meta = getRequestMeta(req);
    await logAction({
      user_id: req.user.user_id,
      event_type: 'CREATE',
      action_taken: `Published public case summary v${nextVersion}`,
      target_cf_code: id,
      ...meta
    });
    res.status(201).json({
      status: 'success',
      message: 'Approved public summary published.',
      data: { case_id: Number(id), version: nextVersion }
    });
  } catch (err) {
    try { await connection.rollback(); } catch (_rollbackErr) { /* handled below */ }
    connection.release();
    return next(err);
  }
});

exports.unpublishSummary = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const [result] = await db.execute(
    'UPDATE public_case_summary SET is_current = 0 WHERE cf_code = ? AND is_current = 1',
    [id]
  );
  if (result.affectedRows === 0) {
    return next(new CustomError('No published summary exists for this case.', 404));
  }
  const meta = getRequestMeta(req);
  await logAction({
    user_id: req.user.user_id,
    event_type: 'UPDATE',
    action_taken: 'Unpublished public case summary',
    target_cf_code: id,
    ...meta
  });
  res.status(200).json({ status: 'success', message: 'Public summary unpublished.' });
});
