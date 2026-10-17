const db = require('../config/db');
const bcrypt = require('bcrypt');
const catchAsync = require('../utils/catchAsync');
const CustomError = require('../utils/customError');
const { logAction, getRequestMeta } = require('../utils/auditLog');

// Ensure a 'Client' role exists (role_id 4)
const ensureClientRole = async () => {
  const [rows] = await db.execute('SELECT role_id FROM role WHERE role_id = 4');
  if (rows.length === 0) {
    await db.execute("INSERT INTO role (role_id, role_name, description) VALUES (4, 'Client', 'Client portal user')");
  }
};

exports.createClient = catchAsync(async (req, res, next) => {
  const {
    user_id, fname, mname, lname, birth_date, gender, email,
    contact_number, purok, barangay, city, region
  } = req.body;

  if (!fname || !lname || !birth_date) {
    return next(new CustomError('fname, lname, and birth_date are required.', 400));
  }

  let resolvedUserId = user_id;
  if (!resolvedUserId) {
    await ensureClientRole();
    const username = email || `${fname}.${lname}`.toLowerCase().replace(/\s+/g, '');
    const hash = await bcrypt.hash(Math.random().toString(36).slice(2), 10);
    const [u] = await db.execute(
      `INSERT INTO user_account (role_id, username, email, password_hash, is_active, created_at, updated_at)
       VALUES (4, ?, ?, ?, 1, NOW(), NOW())`,
      [username, email || null, hash]
    );
    resolvedUserId = u.insertId;
  }

  const [result] = await db.execute(
    `INSERT INTO client
      (user_id, fname, mname, lname, birth_date, gender, email, contact_number, purok, barangay, city, region, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [resolvedUserId, fname, mname || null, lname, birth_date, gender || null, email || null,
     contact_number || null, purok || null, barangay || null, city || null, region || null]
  );

  const metaCl = getRequestMeta(req);
  await logAction({ user_id: req.user.user_id, event_type: 'CREATE', action_taken: 'Created client profile', ...metaCl });

  res.status(201).json({
    status: 'success',
    message: 'Client profile created.',
    data: { client_id: result.insertId, user_id: resolvedUserId }
  });
});

exports.listClients = catchAsync(async (req, res, next) => {
  const { q } = req.query;
  let sql = `SELECT client_id, user_id, fname, mname, lname, email, contact_number, city, region, created_at FROM client`;
  const params = [];
  if (q) {
    sql += ` WHERE fname LIKE ? OR lname LIKE ? OR email LIKE ?`;
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  sql += ` ORDER BY lname, fname`;
  const [rows] = await db.execute(sql, params);
  res.status(200).json({ status: 'success', results: rows.length, data: rows });
});

exports.getClient = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const [rows] = await db.execute(`SELECT * FROM client WHERE client_id = ?`, [id]);
  if (rows.length === 0) return next(new CustomError('Client not found.', 404));
  res.status(200).json({ status: 'success', data: rows[0] });
});

exports.updateClient = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const fields = ['fname','mname','lname','birth_date','gender','email','contact_number','purok','barangay','city','region'];
  const updates = [];
  const params = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = ?`);
      params.push(req.body[f]);
    }
  }
  if (updates.length === 0) return next(new CustomError('No fields to update.', 400));
  updates.push('updated_at = NOW()');
  params.push(id);
  const [result] = await db.execute(`UPDATE client SET ${updates.join(', ')} WHERE client_id = ?`, params);
  if (result.affectedRows === 0) return next(new CustomError('Client not found.', 404));
  res.status(200).json({ status: 'success', message: 'Client updated.' });
});

// Link a client to a case
exports.linkClientToCase = catchAsync(async (req, res, next) => {
  const { id: client_id } = req.params;
  const { cf_code, client_role } = req.body;
  if (!cf_code) return next(new CustomError('cf_code is required.', 400));

  const [c] = await db.execute('SELECT client_id FROM client WHERE client_id = ?', [client_id]);
  if (c.length === 0) return next(new CustomError('Client not found.', 404));
  const [cs] = await db.execute('SELECT cf_code FROM case_file WHERE cf_code = ?', [cf_code]);
  if (cs.length === 0) return next(new CustomError('Case not found.', 404));

  const [result] = await db.execute(
    `INSERT INTO client_case (client_id, cf_code, client_role) VALUES (?, ?, ?)`,
    [client_id, cf_code, client_role || null]
  );
  res.status(201).json({ status: 'success', data: { client_case_id: result.insertId } });
});

exports.listClientCases = catchAsync(async (req, res, next) => {
  const { id: client_id } = req.params;
  const [rows] = await db.execute(
    `SELECT cc.client_case_id, cc.client_role, cf.cf_code, cf.cf_name, cf.filing_date, st.label AS status
     FROM client_case cc
     JOIN case_file cf ON cc.cf_code = cf.cf_code
     LEFT JOIN case_status st ON cf.status_id = st.id
     WHERE cc.client_id = ?`,
    [client_id]
  );
  res.status(200).json({ status: 'success', results: rows.length, data: rows });
});

exports.listCaseClients = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const [rows] = await db.execute(
    `SELECT cc.client_case_id, cc.client_role, cl.client_id, cl.fname, cl.mname, cl.lname, cl.email, cl.contact_number
     FROM client_case cc
     JOIN client cl ON cc.client_id = cl.client_id
     WHERE cc.cf_code = ?`,
    [id]
  );
  res.status(200).json({ status: 'success', results: rows.length, data: rows });
});
