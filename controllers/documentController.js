const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const catchAsync = require('../utils/catchAsync');
const CustomError = require('../utils/customError');
const validateDocument = require('../utils/validateDocument');
const { scheduleOCR } = require('../utils/documentOCR');

// Both parent and revision metadata are saved together. Files are compensated on
// failure by the global handler; committed uploads must never be deleted there.
async function saveUpload(req, existingId) {
  await validateDocument(req.file);
  if (!existingId && !/^[1-9]\d*$/.test(String(req.body.case_id || ''))) {
    throw new CustomError('A valid case_id is required.', 400);
  }
  const connection = await db.getConnection();
  req.dbConnection = connection;
  let documentCode = existingId, versionNumber = 1;
  try {
    await connection.beginTransaction();
    if (existingId) {
      // Lock the parent before reading MAX so concurrent version uploads serialize.
      const [documents] = await connection.execute(
        'SELECT document_code FROM document WHERE document_code = ? AND is_deleted = 0 FOR UPDATE', [existingId]
      );
      if (!documents.length) throw new CustomError('Document not found.', 404);
      const [versions] = await connection.execute(
        'SELECT MAX(version_no) AS max_version FROM document_version WHERE document_code = ?', [existingId]
      );
      versionNumber = (versions[0].max_version || 0) + 1;
    } else {
      const [cases] = await connection.execute(
        'SELECT cf_code FROM case_file WHERE cf_code = ? AND is_deleted = 0', [req.body.case_id]
      );
      if (!cases.length) throw new CustomError('Case not found.', 404);
      const [result] = await connection.execute(
        `INSERT INTO document
         (cf_code, doc_name, file_type, file_path, status_id, current_version_no, uploaded_by, date_added)
         VALUES (?, ?, ?, ?, 1, 1, ?, CURDATE())`,
        [req.body.case_id, req.body.title || req.file.originalname, req.file.mimetype, req.file.path, req.user.user_id]
      );
      documentCode = result.insertId;
    }
    await connection.execute(
      `INSERT INTO document_version
       (document_code, version_no, file_name, file_path, file_size, mime_type, extracted_text, uploaded_by, ocr_status)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 'PENDING')`,
      [documentCode, versionNumber, path.basename(req.file.originalname.replace(/\\/g, '/')).slice(0, 255), req.file.path, req.file.size, req.file.mimetype, req.user.user_id]
    );
    if (existingId) await connection.execute(
      'UPDATE document SET current_version_no = ? WHERE document_code = ?', [versionNumber, documentCode]
    );
    await connection.commit();
    req.uploadCommitted = true;
  } catch (error) {
    try { await connection.rollback(); } catch (rollbackError) { console.error('Upload rollback failed:', rollbackError.message); }
    throw error;
  } finally {
    req.dbConnection = null;
    connection.release();
  }
  scheduleOCR(documentCode, versionNumber, req.file.path);
  return { documentId: Number(documentCode), versionNumber, filename: req.file.filename, status: 'PENDING' };
}

exports.uploadAndProcessDocument = catchAsync(async (req, res) => {
  const data = await saveUpload(req);
  res.status(201).json({ status: 'success', message: 'Document saved. Text extraction is pending.', data });
});
exports.uploadNewVersion = catchAsync(async (req, res) => {
  const data = await saveUpload(req, req.params.document_id);
  res.status(201).json({ status: 'success', message: 'Revision saved. Text extraction is pending.', data });
});

exports.retryOCR = catchAsync(async (req, res, next) => {
  const { document_id, version_no } = req.params;
  const [rows] = await db.execute(
    `SELECT dv.file_path FROM document_version dv JOIN document d ON d.document_code = dv.document_code
     WHERE dv.document_code = ? AND dv.version_no = ? AND d.is_deleted = 0`, [document_id, version_no]
  );
  if (!rows.length) return next(new CustomError('Document version not found.', 404));
  if (!fs.existsSync(rows[0].file_path)) return next(new CustomError('File not found on disk.', 404));
  const [result] = await db.execute(
    `UPDATE document_version SET ocr_status = 'PENDING', ocr_error = NULL
     WHERE document_code = ? AND version_no = ? AND ocr_status = 'FAILED'`, [document_id, version_no]
  );
  if (!result.affectedRows) return next(new CustomError('Only failed extractions can be retried.', 409));
  scheduleOCR(document_id, version_no, rows[0].file_path);
  res.status(202).json({ status: 'success', message: 'Text extraction queued.', data: { status: 'PENDING' } });
});

exports.getDocumentVersions = catchAsync(async (req, res, next) => {
  const { document_id } = req.params;

  const [versions] = await db.execute(
    `SELECT
      dv.version_id,
      dv.document_code AS document_id,
      dv.version_no AS version_number,
      dv.file_name,
      dv.file_path,
      dv.file_size,
      dv.mime_type,
      dv.extracted_text,
      dv.uploaded_at AS created_at,
      dv.ocr_status,
      dv.ocr_error,
      u.username AS uploaded_by_user
     FROM document_version dv
     LEFT JOIN user_account u ON dv.uploaded_by = u.user_id
     WHERE dv.document_code = ?
     ORDER BY dv.version_no DESC`,
    [document_id]
  );

  if (versions.length === 0) {
    return next(new CustomError(`No versions found for document ID ${document_id}.`, 404));
  }

  res.status(200).json({
    status: 'success',
    results: versions.length,
    data: versions
  });
});

exports.searchDocumentText = catchAsync(async (req, res, next) => {
  const { q, case_id } = req.query;
  if (typeof q !== 'string' || !q.trim() || q.trim().length > 200) {
    return next(new CustomError('Enter a search query between 1 and 200 characters.', 400));
  }
  if (case_id !== undefined && (typeof case_id !== 'string' || !/^[1-9]\d*$/.test(case_id))) {
    return next(new CustomError('A valid case_id is required.', 400));
  }
  const query = q.trim();
  // Treat LIKE wildcard characters literally; all user values remain bound parameters.
  const pattern = `%${query.replace(/[!%_]/g, '!$&')}%`;
  const scope = case_id ? ' AND d.cf_code = ?' : '';
  const params = [query, pattern, pattern, pattern];
  if (case_id) params.push(case_id);
  const [results] = await db.execute(`
    SELECT d.document_code AS document_id, d.doc_name AS title,
      d.cf_code AS case_id, cf.cf_name AS case_title,
      dv.version_no AS version_number, dv.file_name, dv.ocr_status,
      dv.uploaded_at AS created_at,
      INSTR(LOWER(COALESCE(dv.extracted_text, '')), LOWER(?)) AS match_position
    FROM document d
    JOIN case_file cf ON cf.cf_code = d.cf_code
    JOIN document_version dv ON dv.document_code = d.document_code
      AND dv.version_no = d.current_version_no
    WHERE d.is_deleted = 0 AND cf.is_deleted = 0
      AND (d.doc_name LIKE ? ESCAPE '!' OR dv.file_name LIKE ? ESCAPE '!'
        OR (dv.ocr_status = 'COMPLETED' AND dv.extracted_text LIKE ? ESCAPE '!'))
      ${scope}
    ORDER BY dv.uploaded_at DESC, d.document_code DESC LIMIT 100`, params);
  const [pending] = await db.execute(`
    SELECT COUNT(*) AS pending FROM document d
    JOIN case_file cf ON cf.cf_code = d.cf_code
    JOIN document_version dv ON dv.document_code = d.document_code
      AND dv.version_no = d.current_version_no
    WHERE d.is_deleted = 0 AND cf.is_deleted = 0
      AND dv.ocr_status IN ('PENDING','PROCESSING') ${scope}`, case_id ? [case_id] : []);
  res.status(200).json({ status: 'success', results: results.length, limit: 100,
    pending: Number(pending[0]?.pending || 0), data: results });
});

// List documents for a case (used by frontend case details)
exports.listDocuments = catchAsync(async (req, res, next) => {
  const { case_id } = req.query;

  let sql = `
    SELECT
      d.document_code AS id,
      d.doc_name AS title,
      d.cf_code AS case_id,
      dv.file_name AS filename,
      dv.ocr_status,
      dv.ocr_error,
      dv.version_no AS version_number,
      dv.uploaded_at AS created_at
    FROM document d
    LEFT JOIN document_version dv ON dv.document_code = d.document_code
      AND dv.version_no = d.current_version_no
    WHERE d.is_deleted = 0
  `;
  const params = [];
  if (case_id) {
    sql += ` AND d.cf_code = ?`;
    params.push(case_id);
  }
  sql += ` ORDER BY d.date_added DESC`;

  const [rows] = await db.execute(sql, params);

  res.status(200).json({
    status: 'success',
    results: rows.length,
    data: rows
  });
});


exports.downloadDocument = catchAsync(async (req, res, next) => {
  const { document_id } = req.params;
  const [rows] = await db.execute(
    `SELECT dv.file_path, dv.file_name, dv.mime_type, d.doc_name
     FROM document d JOIN document_version dv ON dv.document_code = d.document_code
       AND dv.version_no = d.current_version_no
     WHERE d.document_code = ? AND d.is_deleted = 0`,
    [document_id]
  );
  if (rows.length === 0) return next(new CustomError('Document not found.', 404));
  const filePath = rows[0].file_path;
  const fs = require('fs');
  if (!fs.existsSync(filePath)) return next(new CustomError('File not found on disk.', 404));
  const ext = path.extname(filePath); // Validated storage extension, not an arbitrary uploaded filename.
  const name = path.basename(rows[0].doc_name || 'document').replace(/[\r\n]/g, '');
  res.download(filePath, name.toLowerCase().endsWith(ext.toLowerCase()) ? name : name + ext);
});
