const db = require('../config/db');
const catchAsync = require('../utils/catchAsync');
const CustomError = require('../utils/customError');
const { logAction, getRequestMeta } = require('../utils/auditLog');

// Helper: resolve a status string (e.g. "Active") to a case_status.id
const resolveStatusId = async (status) => {
  if (!status) return 1;
  if (Number.isInteger(Number(status))) return Number(status);
  const [rows] = await db.execute(
    'SELECT id FROM case_status WHERE LOWER(code)=LOWER(?) OR LOWER(label)=LOWER(?) LIMIT 1',
    [status, status]
  );
  return rows.length ? rows[0].id : 1;
};

// Shape a DB row into the frontend-friendly case object
const shapeCase = (row) => ({
  ...row,
  id: row.cf_code,
  case_number: `${row.category_code || 'CASE'}-${row.creation_date ? new Date(row.creation_date).getFullYear() : new Date().getFullYear()}-${String(row.cf_code).padStart(4, '0')}`,
  title: row.cf_name,
  client_name: row.created_by_user || null,
  status: row.status_label || row.status_code || 'Active',
  created_at: row.creation_date || row.filing_date || null,
  document_count: row.document_count || 0
});

// Create a new case file
exports.createCase = catchAsync(async (req, res, next) => {
  const {
    cf_name, title, case_number, description,
    category_id, status_id, status, priority_id, filing_date
  } = req.body;
  const created_by = req.user.user_id;

  const name = cf_name || title || case_number;
  if (!name) {
    return next(new CustomError('Missing required case field: title/cf_name.', 400));
  }

  const resolvedCategoryId = category_id || 1;
  const resolvedPriorityId = priority_id || 2;
  const resolvedStatusId = status_id || (await resolveStatusId(status));

  const [result] = await db.execute(
    `INSERT INTO case_file
      (cf_name, description, category_id, status_id, priority_id, filing_date, creation_date, created_by)
     VALUES (?, ?, ?, ?, ?, ?, CURDATE(), ?)`,
    [name, description || null, resolvedCategoryId, resolvedStatusId, resolvedPriorityId, filing_date || null, created_by]
  );

  const [catRows] = await db.execute('SELECT code FROM case_category WHERE id = ?', [resolvedCategoryId]);
  const catCode = (catRows[0] && catRows[0].code) || 'CASE';
  const year = new Date().getFullYear();
  const caseNumber = `${catCode}-${year}-${String(result.insertId).padStart(4, '0')}`;

  res.status(201).json({
    status: 'success',
    message: 'Case file created successfully.',
    data: {
      case_id: result.insertId,
      cf_code: result.insertId,
      case_number: caseNumber,
      title: name
    }
  });
});

// Fetch all active, visible cases (with optional filters)
exports.getAllCases = catchAsync(async (req, res, next) => {
  const { q, category, priority, status, attorney } = req.query;

  let sql = `
    SELECT
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
      u.username AS created_by_user,
      (SELECT COUNT(*) FROM document d WHERE d.cf_code = cf.cf_code AND d.is_deleted = 0) AS document_count
     FROM case_file cf
     LEFT JOIN case_category cat ON cf.category_id = cat.id
     LEFT JOIN case_status st ON cf.status_id = st.id
     LEFT JOIN case_priority pr ON cf.priority_id = pr.id
     LEFT JOIN user_account u ON cf.created_by = u.user_id
  `;
  const params = [];
  const conditions = ['cf.is_deleted = 0', 'cf.is_visible = 1'];

  if (q) {
    conditions.push('(cf.cf_name LIKE ? OR cf.description LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  if (category) {
    conditions.push('cat.code = ?');
    params.push(category);
  }
  if (priority) {
    conditions.push('pr.code = ?');
    params.push(priority);
  }
  if (status) {
    conditions.push('st.code = ?');
    params.push(status);
  }
  if (attorney) {
    sql += ` JOIN case_attorney ca ON cf.cf_code = ca.cf_code`;
    conditions.push('ca.attorney_id = ?');
    params.push(attorney);
  }

  sql += ` WHERE ` + conditions.join(' AND ') + ` ORDER BY cf.creation_date DESC`;

  const [cases] = await db.execute(sql, params);

  res.status(200).json({
    status: 'success',
    results: cases.length,
    data: cases.map(shapeCase)
  });
});

// Fetch single case by ID (cf_code)
exports.getCaseById = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const [rows] = await db.execute(
    `SELECT
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
     WHERE cf.cf_code = ? AND cf.is_deleted = 0`,
    [id]
  );

  if (rows.length === 0) {
    return next(new CustomError('Case file not found.', 404));
  }

  res.status(200).json({
    status: 'success',
    data: shapeCase(rows[0])
  });
});

// Public case-summary routes are implemented in publicSummaryController.
// They intentionally read only explicitly approved public summary records.
