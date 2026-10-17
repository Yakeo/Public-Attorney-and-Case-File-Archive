const db = require('../config/db');
const crypto = require('node:crypto');
const catchAsync = require('../utils/catchAsync');
const CustomError = require('../utils/customError');

// Helper: resolve a status string (e.g. "Active") to a case_status.id
const resolveStatusId = async (status, executor = db) => {
  if (!status) return 1;
  if (Number.isInteger(Number(status))) return Number(status);
  const [rows] = await executor.execute(
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
  client_name: row.client_name || null,
  status: row.status_label || row.status_code || 'Active',
  created_at: row.creation_date || row.filing_date || null,
  document_count: row.document_count || 0
});

// Return only the identifying fields needed by the case-intake client picker.
exports.listCaseIntakeClients = catchAsync(async (_req, res) => {
  const [rows] = await db.execute(
    'SELECT client_id, fname, mname, lname FROM client ORDER BY lname, fname'
  );
  res.status(200).json({ status: 'success', results: rows.length, data: rows });
});

// Create a case and, when supplied, its client link as one atomic intake action.
exports.createCase = catchAsync(async (req, res) => {
  const {
    cf_name, title, case_number, description,
    category_id, status_id, status, priority_id, filing_date,
    client_id, client_role, new_client
  } = req.body;
  const created_by = req.user.user_id;
  const name = cf_name || title || case_number;
  if (!name) throw new CustomError('Missing required case field: title/cf_name.', 400);

  const hasExistingClient = client_id !== undefined && client_id !== null && String(client_id).trim() !== '';
  const hasNewClient = new_client !== undefined && new_client !== null;
  if (hasExistingClient && hasNewClient) throw new CustomError('Choose an existing client or enter a new client, not both.', 400);
  if (hasExistingClient && (!/^\d+$/.test(String(client_id)) || Number(client_id) < 1)) {
    throw new CustomError('Choose a valid existing client.', 400);
  }
  if (hasNewClient && (typeof new_client !== 'object' || Array.isArray(new_client))) {
    throw new CustomError('Provide valid new client details.', 400);
  }
  if (hasNewClient && (!String(new_client.fname || '').trim() || !String(new_client.lname || '').trim() || !String(new_client.birth_date || '').trim())) {
    throw new CustomError('First name, last name, and birth date are required for a new client.', 400);
  }
  const normalizedClientRole = String(client_role || '').trim() || null;
  if (normalizedClientRole && normalizedClientRole.length > 20) {
    throw new CustomError('Client role must be 20 characters or fewer.', 400);
  }

  const resolvedCategoryId = category_id || 1;
  const resolvedPriorityId = priority_id || 2;
  const connection = await db.getConnection();
  let transactionStarted = false;
  let committed = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const resolvedStatusId = status_id || (await resolveStatusId(status, connection));
    const [result] = await connection.execute(
      `INSERT INTO case_file
        (cf_name, description, category_id, status_id, priority_id, filing_date, creation_date, created_by, is_visible)
       VALUES (?, ?, ?, ?, ?, ?, CURDATE(), ?, 0)`,
      [name, description || null, resolvedCategoryId, resolvedStatusId, resolvedPriorityId, filing_date || null, created_by]
    );

    const [catRows] = await connection.execute('SELECT code FROM case_category WHERE id = ?', [resolvedCategoryId]);
    const catCode = (catRows[0] && catRows[0].code) || 'CASE';
    const year = new Date().getFullYear();
    const caseNumber = `${catCode}-${year}-${String(result.insertId).padStart(4, '0')}`;
    let linkedClientId = null;

    if (hasExistingClient) {
      const selectedClientId = Number(client_id);
      const [clients] = await connection.execute('SELECT client_id FROM client WHERE client_id = ?', [selectedClientId]);
      if (!clients.length) throw new CustomError('Selected client was not found.', 404);
      linkedClientId = selectedClientId;
    } else if (hasNewClient) {
      const profile = new_client;
      const [roles] = await connection.execute('SELECT role_id FROM role WHERE role_id = 4');
      if (!roles.length) {
        await connection.execute("INSERT INTO role (role_id, role_name, description) VALUES (4, 'Client', 'Client portal user')");
      }
      const accountId = crypto.randomUUID().replace(/-/g, '');
      const username = `case_client_${accountId}`;
      const accountEmail = String(profile.email || '').trim() || `case-client-${accountId}@no-login.invalid`;
      // New case clients have no portal credentials yet. Keep the account inactive until an admin provisions access.
      const [user] = await connection.execute(
        'INSERT INTO user_account (role_id, username, email, password_hash, is_active) VALUES (4, ?, ?, NULL, 0)',
        [username, accountEmail]
      );
      const [client] = await connection.execute(
        `INSERT INTO client
         (user_id, fname, mname, lname, birth_date, gender, email, contact_number, purok, barangay, city, region)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [user.insertId, String(profile.fname).trim(), String(profile.mname || '').trim() || null,
          String(profile.lname).trim(), profile.birth_date, String(profile.gender || '').trim() || null,
          String(profile.email || '').trim() || null, String(profile.contact_number || '').trim() || null,
          String(profile.purok || '').trim() || null, String(profile.barangay || '').trim() || null,
          String(profile.city || '').trim() || null, String(profile.region || '').trim() || null]
      );
      linkedClientId = client.insertId;
    }

    if (linkedClientId !== null) {
      await connection.execute(
        'INSERT INTO client_case (client_id, cf_code, client_role) VALUES (?, ?, ?)',
        [linkedClientId, result.insertId, normalizedClientRole]
      );
    }
    await connection.commit();
    committed = true;
    res.status(201).json({
      status: 'success',
      message: 'Case file created successfully.',
      data: {
        case_id: result.insertId,
        cf_code: result.insertId,
        case_number: caseNumber,
        title: name,
        client_id: linkedClientId
      }
    });
  } catch (error) {
    if (transactionStarted && !committed) { try { await connection.rollback(); } catch {} }
    throw error;
  } finally {
    connection.release();
  }
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
      (SELECT GROUP_CONCAT(CONCAT_WS(' ', c.fname, c.lname) ORDER BY c.lname, c.fname SEPARATOR ', ')
       FROM client_case cc JOIN client c ON c.client_id = cc.client_id
       WHERE cc.cf_code = cf.cf_code) AS client_name,
      (SELECT COUNT(*) FROM document d WHERE d.cf_code = cf.cf_code AND d.is_deleted = 0) AS document_count
     FROM case_file cf
     LEFT JOIN case_category cat ON cf.category_id = cat.id
     LEFT JOIN case_status st ON cf.status_id = st.id
     LEFT JOIN case_priority pr ON cf.priority_id = pr.id
     LEFT JOIN user_account u ON cf.created_by = u.user_id
  `;
  const params = [];
  const conditions = ['cf.is_deleted = 0'];

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
      u.username AS created_by_user,
      (SELECT GROUP_CONCAT(CONCAT_WS(' ', c.fname, c.lname) ORDER BY c.lname, c.fname SEPARATOR ', ')
       FROM client_case cc JOIN client c ON c.client_id = cc.client_id
       WHERE cc.cf_code = cf.cf_code) AS client_name
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
