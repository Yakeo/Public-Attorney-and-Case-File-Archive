const Tesseract = require('tesseract.js');
const fs = require('fs');
const db = require('../config/db');
const catchAsync = require('../utils/catchAsync');
const CustomError = require('../utils/customError');

/**
 * Background worker task that executes Tesseract OCR outside the HTTP request loop.
 * Updates the document_version record once complete.
 */
const processOCRInBackground = async (documentId, versionNumber, filePath) => {
  let worker = null;
  try {
    worker = await Tesseract.createWorker('eng');
    const ret = await worker.recognize(filePath);
    const extractedText = ret.data.text || '';

    // Save extracted text to document_version table upon completion
    await db.execute(
      `UPDATE document_version 
       SET extracted_text = ? 
       WHERE document_id = ? AND version_number = ?`,
      [extractedText, documentId, versionNumber]
    );

    console.log(`[OCR SUCCESS] Processed document_id: ${documentId}, v${versionNumber}`);
  } catch (error) {
    console.error(`[OCR FAILURE] Document_id: ${documentId}, v${versionNumber}:`, error);
  } finally {
    if (worker) {
      await worker.terminate(); // Free WebAssembly memory allocations
    }
  }
};

/**
 * @desc   Upload initial document and queue async background OCR
 * @route  POST /api/v1/documents/upload
 */
exports.uploadAndProcessDocument = catchAsync(async (req, res, next) => {
    if (!req.file) {
        return next(new CustomError('No document file was uploaded.', 400));
    }

    const { case_id, title } = req.body;
    const userId = req.user?.user_id;

    if (!case_id) {
        // Clean up file if validation fails
        if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        return next(new CustomError('Missing required field: case_id.', 400));
    }

    const connection = await db.getConnection();
    req.dbConnection = connection;

    try {
        await connection.beginTransaction();

        // 1. Insert master document record
        const [docResult] = await connection.execute(
            `INSERT INTO document (case_id, title, created_by) VALUES (?, ?, ?)`,
            [case_id, title || req.file.originalname, userId]
        );

        const documentId = docResult.insertId;

        // 2. Insert initial document_version record with empty text placeholder
        await connection.execute(
            `INSERT INTO document_version 
            (document_id, version_number, file_name, file_path, file_size, mime_type, extracted_text, uploaded_by) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                documentId,
                1,
                req.file.filename,
                req.file.path,
                req.file.size,
                req.file.mimetype,
                null, // OCR text will be populated asynchronously
                userId
            ]
        );

        await connection.commit();
        connection.release();
        req.dbConnection = null;

        // 3. Dispatch background task WITHOUT await
        processOCRInBackground(documentId, 1, req.file.path);

        // 4. Send immediate response to the client
        res.status(201).json({
            status: 'success',
            message: 'Document uploaded successfully. OCR text extraction is running in the background.',
            data: {
                documentId,
                filename: req.file.filename,
                versionNumber: 1,
                status: 'PROCESSING'
            }
        });

    } catch (error) {
        // Roll back DB transaction if SQL query fails
        await connection.rollback();
        connection.release();
        req.dbConnection = null;

        // Remove uploaded file from disk so uploads/ doesn't accumulate orphaned files
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        return next(error);
    }
});

/**
 * @desc   Upload a new version and queue async background OCR
 * @route  POST /api/v1/documents/:document_id/versions
 */
exports.uploadNewVersion = catchAsync(async (req, res, next) => {
  if (!req.file) {
    return next(new CustomError('No file uploaded for new version.', 400));
  }

  const { document_id } = req.params;
  const uploadedBy = req.user?.user_id;

  // 1. Verify target document exists
  const [docCheck] = await db.execute(
    `SELECT document_id FROM document WHERE document_id = ?`,
    [document_id]
  );

  if (docCheck.length === 0) {
    // Clean up uploaded file if parent document doesn't exist
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return next(new CustomError(`Document with ID ${document_id} not found.`, 404));
  }

  const connection = await db.getConnection();
  req.dbConnection = connection;

  try {
    await connection.beginTransaction();

    // 2. Get current highest version number safely with FOR UPDATE lock
    const [existingVersions] = await connection.execute(
      `SELECT MAX(version_number) AS max_version FROM document_version WHERE document_id = ? FOR UPDATE`,
      [document_id]
    );

    const nextVersionNumber = (existingVersions[0].max_version || 0) + 1;

    // 3. Insert new version with null text placeholder
    await connection.execute(
      `INSERT INTO document_version 
        (document_id, version_number, file_name, file_path, file_size, mime_type, extracted_text, uploaded_by) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        document_id,
        nextVersionNumber,
        req.file.filename,
        req.file.path,
        req.file.size,
        req.file.mimetype,
        null,
        uploadedBy
      ]
    );

    await connection.commit();
    connection.release();
    req.dbConnection = null;

    // 4. Dispatch background task WITHOUT await
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
    // Rollback DB transaction if SQL fails
    await connection.rollback();
    connection.release();
    req.dbConnection = null;

    // Delete orphaned uploaded file from disk
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    return next(error);
  }
});

/**
 * @desc   Get version history for a document
 * @route  GET /api/v1/documents/:document_id/versions
 */
exports.getDocumentVersions = catchAsync(async (req, res, next) => {
  const { document_id } = req.params;

  const [versions] = await db.execute(
    `SELECT 
      dv.version_id,
      dv.document_id,
      dv.version_number,
      dv.file_name,
      dv.file_path,
      dv.file_size,
      dv.mime_type,
      dv.created_at,
      CASE WHEN dv.extracted_text IS NOT NULL THEN 'COMPLETED' ELSE 'PROCESSING' END AS ocr_status,
      u.username AS uploaded_by_user
     FROM document_version dv
     LEFT JOIN user_account u ON dv.uploaded_by = u.user_id
     WHERE dv.document_id = ?
     ORDER BY dv.version_number DESC`,
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

/**
 * @desc   Full-text search across extracted OCR text
 * @route  GET /api/v1/documents/search?q=keyword
 */
exports.searchDocumentText = catchAsync(async (req, res, next) => {
  const { q, case_id } = req.query;

  if (!q || q.trim() === '') {
    return next(new CustomError('Query parameter "q" is required for text search.', 400));
  }

  let sql = `
    SELECT 
      d.document_id,
      d.title,
      d.case_id,
      dv.version_id,
      dv.version_number,
      dv.file_name,
      dv.file_path,
      dv.created_at,
      INSTR(LOWER(dv.extracted_text), LOWER(?)) AS match_position
    FROM document_version dv
    JOIN document d ON dv.document_id = d.document_id
    WHERE dv.extracted_text LIKE ?
  `;

  const params = [q, `%${q}%`];

  if (case_id) {
    sql += ` AND d.case_id = ?`;
    params.push(case_id);
  }

  sql += ` ORDER BY dv.created_at DESC`;

  const [results] = await db.execute(sql, params);

  res.status(200).json({
    status: 'success',
    results: results.length,
    data: results
  });
}); 