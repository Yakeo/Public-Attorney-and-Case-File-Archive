const db = require('../config/db');
const catchAsync = require('../utils/catchAsync');
const CustomError = require('../utils/customError');

const shapeAttorney = (row) => ({
  id: row.attorney_id,
  full_name: `${row.fname} ${row.lname}`.trim(),
  specialization: row.specialization_name || 'General Practice',
  bio: row.bio || null,
  email: row.email,
  bar_number: row.bar_number
});

exports.listAttorneys = catchAsync(async (req, res, next) => {
  const { q, specialty } = req.query;

  let sql = `
    SELECT a.attorney_id, a.fname, a.lname, a.bar_number,
           s.specialization_name,
           u.email
    FROM attorney a
    JOIN user_account u ON a.user_id = u.user_id
    LEFT JOIN specialization s ON a.specialization_id = s.specialization_id
    WHERE u.is_active = 1
  `;
  const params = [];

  if (q) {
    sql += ` AND (a.fname LIKE ? OR a.lname LIKE ? OR s.specialization_name LIKE ?)`;
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (specialty && specialty !== 'All') {
    sql += ` AND LOWER(s.specialization_name) = LOWER(?)`;
    params.push(specialty);
  }

  sql += ` ORDER BY a.lname, a.fname`;

  const [rows] = await db.execute(sql, params);

  res.status(200).json({
    status: 'success',
    results: rows.length,
    data: rows.map(shapeAttorney)
  });
});

exports.getAttorney = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const [rows] = await db.execute(
    `SELECT a.attorney_id, a.fname, a.lname, a.bar_number,
            s.specialization_name,
            u.email
     FROM attorney a
     JOIN user_account u ON a.user_id = u.user_id
     LEFT JOIN specialization s ON a.specialization_id = s.specialization_id
     WHERE a.attorney_id = ?`,
    [id]
  );

  if (rows.length === 0) {
    return next(new CustomError('Attorney not found.', 404));
  }

  res.status(200).json({
    status: 'success',
    data: shapeAttorney(rows[0])
  });
});
