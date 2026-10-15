const catchAsync = require('../utils/catchAsync');
const CustomError = require('../utils/customError');
const db = require('../config/db');
const { logAction, getRequestMeta } = require('../utils/auditLog');

const resolveHearingStatusId = async (status) => {
  if (!status) return 1;
  if (Number.isInteger(Number(status))) return Number(status);
  const [rows] = await db.execute(
    'SELECT id FROM hearing_status WHERE LOWER(code)=LOWER(?) OR LOWER(label)=LOWER(?) LIMIT 1',
    [status, status]
  );
  return rows.length ? rows[0].id : 1;
};

const shapeHearing = (row) => ({
  ...row,
  scheduled_date: row.hearing_date,
  location: row.venue || row.courtroom || 'Courtroom Unassigned',
  notes: row.remarks,
  status: row.status_code || row.status_label || 'SCHEDULED'
});

// 1. Schedule a new hearing
exports.createHearing = catchAsync(async (req, res, next) => {
  const { case_id, title, hearing_date, court_name, judge_name, remarks, venue, courtroom, hearing_type, attorney_id, override_conflict } = req.body;

  if (!case_id || !title || !hearing_date) {
    return next(new CustomError('Missing required fields: case_id, title, and hearing_date are mandatory.', 400));
  }

  // Determine assigned attorney(s) for conflict checking
  let attorneyIds = [];
  if (attorney_id) {
    attorneyIds = [attorney_id];
  } else {
    const [assigned] = await db.execute(
      'SELECT attorney_id FROM case_attorney WHERE cf_code = ?',
      [case_id]
    );
    attorneyIds = assigned.map((r) => r.attorney_id);
  }

  // Hearing conflict prevention: block if any assigned attorney has a hearing within 1 hour
  if (attorneyIds.length > 0) {
    const conflicts = [];
    for (const aid of attorneyIds) {
      const [rows] = await db.execute(
        `SELECT h.hearing_id, h.hearing_date, cf.cf_name
         FROM hearing_schedule h
         JOIN case_file cf ON h.cf_code = cf.cf_code
         JOIN case_attorney ca ON cf.cf_code = ca.cf_code
         WHERE ca.attorney_id = ?
           AND h.hearing_date BETWEEN DATE_SUB(?, INTERVAL 1 HOUR) AND DATE_ADD(?, INTERVAL 1 HOUR)`,
        [aid, hearing_date, hearing_date]
      );
      if (rows.length > 0) {
        conflicts.push({ attorney_id: aid, hearings: rows });
      }
    }

    const isAdmin = req.user && req.user.role_id === 1;
    if (conflicts.length > 0 && !(override_conflict && isAdmin)) {
      return next(new CustomError(
        'Scheduling conflict: an assigned attorney already has a hearing within 1 hour of the requested time. Admin override required.',
        409
      ));
    }
  }

  const statusId = await resolveHearingStatusId(req.body.status);

  const [result] = await db.execute(
    `INSERT INTO hearing_schedule
      (cf_code, hearing_date, venue, courtroom, hearing_type, assigned_judge, status_id, remarks, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      case_id,
      hearing_date,
      court_name || venue || null,
      courtroom || null,
      hearing_type || title,
      judge_name || null,
      statusId,
      remarks || null,
      req.user.user_id
    ]
  );

  const meta = getRequestMeta(req);
  await logAction({
    user_id: req.user.user_id,
    event_type: 'CREATE',
    action_taken: 'Scheduled hearing',
    target_cf_code: case_id,
    ...meta
  });

  res.status(201).json({
    status: 'success',
    message: 'Hearing scheduled successfully.',
    data: {
      hearingId: result.insertId,
      case_id,
      title,
      hearing_date
    }
  });
});

// 2. Fetch all hearings for a specific case
exports.getHearingsByCase = catchAsync(async (req, res, next) => {
  const { caseId } = req.params;

  if (!caseId) {
    return next(new CustomError('Case ID is required.', 400));
  }

  const [hearings] = await db.execute(
    `SELECT
      h.hearing_id,
      h.cf_code AS case_id,
      cf.cf_name AS case_name,
      h.title,
      h.hearing_date,
      h.venue,
      h.courtroom,
      h.hearing_type,
      h.assigned_judge AS judge_name,
      h.status_id,
      hs.code AS status_code,
      hs.label AS status_label,
      h.remarks
     FROM hearing_schedule h
     LEFT JOIN case_file cf ON h.cf_code = cf.cf_code
     LEFT JOIN hearing_status hs ON h.status_id = hs.id
     WHERE h.cf_code = ?
     ORDER BY h.hearing_date ASC`,
    [caseId]
  );

  // alias title from hearing_type if missing
  const shaped = hearings.map((h) => shapeHearing({ ...h, title: h.hearing_type || h.title }));

  res.status(200).json({
    status: 'success',
    results: shaped.length,
    data: shaped
  });
});

// 3. Update hearing details or status
exports.updateHearing = catchAsync(async (req, res, next) => {
  const { hearingId } = req.params;
  const { status, remarks, hearing_date, court_name, venue, judge_name, courtroom } = req.body;

  const statusId = status ? await resolveHearingStatusId(status) : null;

  const [result] = await db.execute(
    `UPDATE hearing_schedule
     SET status_id = COALESCE(?, status_id),
         remarks = COALESCE(?, remarks),
         hearing_date = COALESCE(?, hearing_date),
         venue = COALESCE(?, venue),
         assigned_judge = COALESCE(?, assigned_judge),
         courtroom = COALESCE(?, courtroom)
     WHERE hearing_id = ?`,
    [statusId, remarks || null, hearing_date || null, court_name || venue || null, judge_name || null, courtroom || null, hearingId]
  );

  if (result.affectedRows === 0) {
    return next(new CustomError('Hearing schedule not found with that ID.', 404));
  }

  const metaU = getRequestMeta(req);
  await logAction({
    user_id: req.user.user_id,
    event_type: 'UPDATE',
    action_taken: 'Updated hearing',
    target_cf_code: null,
    ...metaU
  });

  res.status(200).json({
    status: 'success',
    message: 'Hearing record updated successfully.'
  });
});

// 4. Fetch hearings for calendar view within a date range
exports.getHearingsByDateRange = catchAsync(async (req, res, next) => {
  const { startDate, endDate, attorneyId } = req.query;

  if (!startDate || !endDate) {
    return next(new CustomError('Both startDate and endDate query parameters are required.', 400));
  }

  let query = `
    SELECT
      h.hearing_id,
      h.cf_code AS case_id,
      cf.cf_code,
      cf.cf_name,
      h.hearing_type AS title,
      h.hearing_date,
      h.venue AS court_name,
      h.assigned_judge AS judge_name,
      h.status_id,
      hs.code AS status_code,
      hs.label AS status_label,
      h.remarks
    FROM hearing_schedule h
    JOIN case_file cf ON h.cf_code = cf.cf_code
  `;

  const params = [];
  const conditions = ['h.hearing_date BETWEEN ? AND ?'];
  params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);

  if (attorneyId) {
    query += ` JOIN case_attorney ca ON cf.cf_code = ca.cf_code`;
    conditions.push('ca.attorney_id = ?');
    params.push(attorneyId);
  }

  query += ` WHERE ` + conditions.join(' AND ') + ` ORDER BY h.hearing_date ASC`;

  const [hearings] = await db.execute(query, params);

  const shaped = hearings.map((h) => shapeHearing(h));

  res.status(200).json({
    status: 'success',
    results: shaped.length,
    data: shaped
  });
});
