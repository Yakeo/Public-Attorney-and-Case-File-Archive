const db = require('../config/db');
const catchAsync = require('../utils/catchAsync');
const CustomError = require('../utils/customError');

exports.assignAttorney = catchAsync(async (req, res, next) => {
  const { id } = req.params; // cf_code
  const { attorney_id, role_on_case, assigned_date } = req.body;

  if (!attorney_id) return next(new CustomError('attorney_id is required.', 400));

  const [cs] = await db.execute('SELECT cf_code FROM case_file WHERE cf_code = ?', [id]);
  if (cs.length === 0) return next(new CustomError('Case not found.', 404));

  const [att] = await db.execute(
    `SELECT a.attorney_id, u.is_active
     FROM attorney a JOIN user_account u ON a.user_id = u.user_id
     WHERE a.attorney_id = ?`,
    [attorney_id]
  );
  if (att.length === 0) return next(new CustomError('Attorney not found.', 404));
  if (!att[0].is_active) return next(new CustomError('Attorney account is inactive.', 403));

  const [result] = await db.execute(
    `INSERT INTO case_attorney (cf_code, attorney_id, role_on_case, assigned_date)
     VALUES (?, ?, ?, ?)`,
    [id, attorney_id, role_on_case || null, assigned_date || new Date().toISOString().slice(0, 10)]
  );

  res.status(201).json({
    status: 'success',
    message: 'Attorney assigned to case.',
    data: { case_attorney_id: result.insertId }
  });
});

exports.listCaseAttorneys = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const [rows] = await db.execute(
    `SELECT ca.case_attorney_id, ca.role_on_case, ca.assigned_date,
            a.attorney_id, a.fname, a.lname, a.bar_number,
            s.specialization_name
     FROM case_attorney ca
     JOIN attorney a ON ca.attorney_id = a.attorney_id
     LEFT JOIN specialization s ON a.specialization_id = s.specialization_id
     WHERE ca.cf_code = ?
     ORDER BY ca.assigned_date DESC`,
    [id]
  );
  res.status(200).json({ status: 'success', results: rows.length, data: rows });
});

exports.listAttorneyCases = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const [rows] = await db.execute(
    `SELECT ca.case_attorney_id, ca.role_on_case, ca.assigned_date,
            cf.cf_code, cf.cf_name, cf.filing_date, st.label AS status
     FROM case_attorney ca
     JOIN case_file cf ON ca.cf_code = cf.cf_code
     LEFT JOIN case_status st ON cf.status_id = st.id
     WHERE ca.attorney_id = ? AND cf.is_deleted = 0
     ORDER BY ca.assigned_date DESC`,
    [id]
  );
  res.status(200).json({ status: 'success', results: rows.length, data: rows });
});
