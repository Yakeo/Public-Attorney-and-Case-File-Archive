const db = require('../config/db');
const catchAsync = require('../utils/catchAsync');
const CustomError = require('../utils/customError');
const bcrypt = require('bcrypt');
const { logAction, getRequestMeta } = require('../utils/auditLog');

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


// Admin: create attorney (user + attorney profile)
exports.createAttorney = catchAsync(async (req, res, next) => {
  const { fname, lname, email, username, password, specialization_id, bar_number } = req.body;
  if (!fname || !lname || !email) {
    return next(new CustomError('fname, lname, and email are required.', 400));
  }
  if (typeof password !== 'string' || password.length < 12) {
    return next(new CustomError('Provide an initial password of at least 12 characters.', 400));
  }
  const uname = username || email.split('@')[0];
  const hash = await bcrypt.hash(password, 10);

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [u] = await conn.execute(
      `INSERT INTO user_account (role_id, username, email, password_hash, is_active, created_at, updated_at)
       VALUES (2, ?, ?, ?, 1, NOW(), NOW())`,
      [uname, email, hash]
    );
    const userId = u.insertId;
    const [a] = await conn.execute(
      `INSERT INTO attorney (attorney_id, user_id, fname, lname, specialization_id, bar_number, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [`A${String(userId).padStart(4, '0')}`, userId, fname, lname, specialization_id || null, bar_number || null]
    );
    await conn.commit();
    conn.release();
    const meta = getRequestMeta(req);
    await logAction({ user_id: req.user.user_id, event_type: 'CREATE', action_taken: 'Created attorney', ...meta });
    res.status(201).json({ status: 'success', data: { attorney_id: `A${String(userId).padStart(4, '0')}`, user_id: userId } });
  } catch (err) {
    await conn.rollback();
    conn.release();
    return next(err);
  }
});

// Admin: update attorney profile
exports.updateAttorney = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { fname, lname, specialization_id, bar_number, email } = req.body;
  const updates = [];
  const params = [];
  if (fname !== undefined) { updates.push('fname = ?'); params.push(fname); }
  if (lname !== undefined) { updates.push('lname = ?'); params.push(lname); }
  if (specialization_id !== undefined) { updates.push('specialization_id = ?'); params.push(specialization_id); }
  if (bar_number !== undefined) { updates.push('bar_number = ?'); params.push(bar_number); }
  if (updates.length === 0 && email === undefined) {
    return next(new CustomError('No fields to update.', 400));
  }
  updates.push('updated_at = NOW()');
  params.push(id);
  const [result] = await db.execute(`UPDATE attorney SET ${updates.join(', ')} WHERE attorney_id = ?`, params);
  if (result.affectedRows === 0) return next(new CustomError('Attorney not found.', 404));

  if (email !== undefined) {
    const [att] = await db.execute('SELECT user_id FROM attorney WHERE attorney_id = ?', [id]);
    if (att.length) {
      await db.execute('UPDATE user_account SET email = ?, updated_at = NOW() WHERE user_id = ?', [email, att[0].user_id]);
    }
  }

  const meta = getRequestMeta(req);
  await logAction({ user_id: req.user.user_id, event_type: 'UPDATE', action_taken: 'Updated attorney', ...meta });
  res.status(200).json({ status: 'success', message: 'Attorney updated.' });
});

// Admin: deactivate attorney (soft delete via user account)
exports.deleteAttorney = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const [att] = await db.execute('SELECT user_id FROM attorney WHERE attorney_id = ?', [id]);
  if (att.length === 0) return next(new CustomError('Attorney not found.', 404));
  await db.execute('UPDATE user_account SET is_active = 0, deleted_at = NOW() WHERE user_id = ?', [att[0].user_id]);
  const meta = getRequestMeta(req);
  await logAction({ user_id: req.user.user_id, event_type: 'DELETE', action_taken: 'Deactivated attorney', ...meta });
  res.status(200).json({ status: 'success', message: 'Attorney deactivated.' });
});
