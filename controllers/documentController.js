const Tesseract = require('tesseract.js');
const pdfParse = require('pdf-parse');
const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const catchAsync = require('../utils/catchAsync');
const CustomError = require('../utils/customError');
const { logAction, getRequestMeta } = require('../utils/auditLog');

const processOCRInBackground = async (documentCode, versionNumber, filePath) => {
  try {
    let extractedText = '';

    if (String(filePath).toLowerCase().endsWith('.pdf')) {
      // PDF text extraction (text-based PDFs)
      const dataBuffer = fs.readFileSync(filePath);
      const parsed = await pdfParse(dataBuffer);
      extractedText = parsed.text || '';
    } else {
      // Image OCR via Tesseract
      let worker = null;
      try {
        worker = await Tesseract.createWorker('eng');
        const ret = await worker.recognize(filePath);
        extractedText = ret.data.text || '';
      } finally {
        if (worker) await worker.terminate();
      }
    }

    await db.execute(
      `UPDATE document_version
       SET extracted_text = ?
       WHERE document_code = ? AND version_no = ?`,
      [extractedText, documentCode, versionNumber]
    );

    console.log(`[OCR SUCCESS] document_code: ${documentCode}, v${versionNumber}`);
  } catch (error) {
    console.error(`[OCR FAILURE] document_code: ${documentCode}, v${versionNumber}:`, error);
  }
};

exports.uploadAndProcessDocument = catchAsync(async (req, res, next) => {
  if (!req.file) {
    return next(new CustomError('No document file was uploaded.', 400));
  }

  const { case_id, title } = req.body;
  const userId = req.user?.user_id;

  if (!case_id) {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return next(new CustomError('Missing required field: case_id.', 400));
  }

  const connection = await db.getConnection();
  req.dbConnection = connection;

  try {
    await connection.beginTransaction();

    const [docResult] = await connection.execute(
      `INSERT INTO document
        (cf_code, doc_name, file_type, file_path, status_id, current_version_no, uploaded_by, date_added)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE())`,
      [case_id, title || req.file.originalname, req.file.mimetype, req.file.path, 1, 1, userId]
    );

    const documentCode = docResult.insertId;

    await connection.execute(
      `INSERT INTO document_version
        (document_code, version_no, file_name, file_path, file_size, mime_type, extracted_text, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [documentCode, 1, req.file.filename, req.file.path, req.file.size, req.file.mimetype, null, userId]
    );

    await connection.commit();
    connection.release();
    req.dbConnection = null;

    processOCRInBackground(documentCode, 1, req.file.path);

    res.status(201).json({
      status: 'success',
      message: 'Document uploaded successfully. OCR text extraction is running in the background.',
      data: {
        documentId: documentCode,
        filename: req.file.filename,
        versionNumber: 1,
        status: 'PROCESSING'
      }
    });
  } catch (error) {
    await connection.rollback();
    connection.release();
    req.dbConnection = null;
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return next(error);
  }
});

exports.uploadNewVersion = catchAsync(async (req, res, next) => {
  if (!req.file) {
    return next(new CustomError('No file uploaded for new version.', 400));
  }

  const { document_id } = req.params;
  const uploadedBy = req.user?.user_id;

  const [docCheck] = await db.execute(
    `SELECT document_code FROM document WHERE document_code = ?`,
    [document_id]
  );

  if (docCheck.length === 0) {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return next(new CustomError(`Document with ID ${document_id} not found.`, 404));
  }

  const connection = await db.getConnection();
  req.dbConnection = connection;

  try {
    await connection.beginTransaction();

    const [existingVersions] = await connection.execute(
      `SELECT MAX(version_no) AS max_version FROM document_version WHERE document_code = ? FOR UPDATE`,
      [document_id]
    );

    const nextVersionNumber = (existingVersions[0].max_version || 0) + 1;

    await connection.execute(
      `INSERT INTO document_version
        (document_code, version_no, file_name, file_path, file_size, mime_type, extracted_text, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [document_id, nextVersionNumber, req.file.filename, req.file.path, req.file.size, req.file.mimetype, null, uploadedBy]
    );

    await connection.execute(
      `UPDATE document SET current_version_no = ? WHERE document_code = ?`,
      [nextVersionNumber, document_id]
    );

    await connection.commit();
    connection.release();
    req.dbConnection = null;

    processOCRInBackground(document_id, nextVersionNumber, req.file.path);

    res.status(201).json({
      status: 'success',
      message: `Document version ${nextVersionNumber} uploaded successfully. Processing OCR in background.`,
      data: {
        documentId: Number(document_id),
        versionNumber: nextVersionNumber,
        filename: req.file.filename,
        status: 'PROCESSING'
      }
    });
  } catch (error) {
    await connection.rollback();
    connection.release();
    req.dbConnection = null;
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return next(error);
  }
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
      CASE WHEN dv.extracted_text IS NOT NULL THEN 'COMPLETED' ELSE 'PROCESSING' END AS ocr_status,
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

  if (!q || q.trim() === '') {
    return next(new CustomError('Query parameter "q" is required for text search.', 400));
  }

  let sql = `
    SELECT
      d.document_code AS document_id,
      d.doc_name AS title,
      d.cf_code AS case_id,
      dv.version_id,
      dv.version_no AS version_number,
      dv.file_name,
      dv.file_path,
      dv.uploaded_at AS created_at,
      INSTR(LOWER(dv.extracted_text), LOWER(?)) AS match_position
    FROM document_version dv
    JOIN document d ON dv.document_code = d.document_code
    WHERE dv.extracted_text LIKE ?
  `;

  const params = [q, `%${q}%`];

  if (case_id) {
    sql += ` AND d.cf_code = ?`;
    params.push(case_id);
  }

  sql += ` ORDER BY dv.uploaded_at DESC`;

  const [results] = await db.execute(sql, params);

  res.status(200).json({
    status: 'success',
    results: results.length,
    data: results
  });
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
      dv.extracted_text AS ocr_text,
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
