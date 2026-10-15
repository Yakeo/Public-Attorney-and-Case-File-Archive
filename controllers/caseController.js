const db = require('../config/db');
const catchAsync = require('../utils/catchAsync');
const CustomError = require('../utils/customError');

// Create a new case file
exports.createCase = catchAsync(async (req, res, next) => {
  const { cf_code, cf_name, description, category_id, status_id, priority_id, filing_date } = req.body;
  const created_by = req.user.user_id;

  // Fixed ReferenceError: cf_code is now explicitly checked
  if (!cf_code || !cf_name || !category_id || !status_id || !priority_id) {
    return next(new CustomError('Missing required case fields (cf_code, cf_name, category_id, status_id, priority_id).', 400));
  }

  try {
    const [result] = await db.execute(
      `INSERT INTO case_file 
        (cf_code, cf_name, description, category_id, status_id, priority_id, filing_date, creation_date, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE(), ?)`,
      [cf_code, cf_name, description || null, category_id, status_id, priority_id, filing_date || null, created_by]
    );

    res.status(201).json({
      status: 'success',
      message: 'Case file created successfully.',
      data: {
        case_id: result.insertId,
        cf_code
      }
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return next(new CustomError('Case code (cf_code) already exists.', 409));
    }
    throw error; // Forward to catchAsync -> errorHandler
  }
});

// Fetch all active, visible cases
exports.getAllCases = catchAsync(async (req, res, next) => {
  const [cases] = await db.execute(
    `SELECT 
      cf.case_id,
      cf.cf_code,
      cf.cf_name,
      cf.description,
      cf.filing_date,
      cf.creation_date,
      cf.last_updated_at,
      cat.code AS category_code,
      cat.label AS category_label,
      st.code AS status_code,
      st.label AS status_label,
      pr.code AS priority_code,
      pr.label AS priority_label,
      u.username AS created_by_user
     FROM case_file cf
     LEFT JOIN case_category cat ON cf.category_id = cat.id
     LEFT JOIN case_status st ON cf.status_id = st.id
     LEFT JOIN case_priority pr ON cf.priority_id = pr.id
     LEFT JOIN user_account u ON cf.created_by = u.user_id
     WHERE cf.is_deleted = 0 AND cf.is_visible = 1
     ORDER BY cf.creation_date DESC`
  );

  res.status(200).json({
    status: 'success',
    results: cases.length,
    data: cases
  });
});

// Fetch single case by ID
exports.getCaseById = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const [rows] = await db.execute(
    `SELECT 
      cf.case_id,
      cf.cf_code,
      cf.cf_name,
      cf.description,
      cf.filing_date,
      cf.creation_date,
      cf.last_updated_at,
      cf.category_id,
      cat.code AS category_code,
      cat.label AS category_label,
      cf.status_id,
      st.code AS status_code,
      st.label AS status_label,
      cf.priority_id,
      pr.code AS priority_code,
      pr.label AS priority_label,
      cf.created_by,
      u.username AS created_by_user
     FROM case_file cf
     LEFT JOIN case_category cat ON cf.category_id = cat.id
     LEFT JOIN case_status st ON cf.status_id = st.id
     LEFT JOIN case_priority pr ON cf.priority_id = pr.id
     LEFT JOIN user_account u ON cf.created_by = u.user_id
     WHERE (cf.case_id = ? OR cf.cf_code = ?) AND cf.is_deleted = 0`,
    [id, id]
  );

  if (rows.length === 0) {
    return next(new CustomError('Case file not found.', 404));
  }

  res.status(200).json({
    status: 'success',
    data: rows[0]
  });
});