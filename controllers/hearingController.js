const catchAsync = require('../utils/catchAsync');
const CustomError = require('../utils/customError');
const db = require('../config/db');

// 1. Schedule a new hearing
exports.createHearing = catchAsync(async (req, res, next) => {
  const { case_id, title, hearing_date, court_name, judge_name, remarks } = req.body;

  if (!case_id || !title || !hearing_date || !court_name) {
    return next(new CustomError('Missing required fields: case_id, title, hearing_date, and court_name are mandatory.', 400));
  }

  const [result] = await db.execute(
    `INSERT INTO hearing (case_id, title, hearing_date, court_name, judge_name, remarks)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [case_id, title, hearing_date, court_name, judge_name || null, remarks || null]
  );

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
    `SELECT hearing_id, case_id, title, hearing_date, court_name, judge_name, status, remarks 
     FROM hearing 
     WHERE case_id = ? 
     ORDER BY hearing_date ASC`,
    [caseId]
  );

  res.status(200).json({
    status: 'success',
    results: hearings.length,
    data: hearings
  });
});

// 3. Update hearing details or status
exports.updateHearing = catchAsync(async (req, res, next) => {
  const { hearingId } = req.params;
  const { status, remarks, hearing_date, court_name, judge_name } = req.body;

  if (status) {
    const allowedStatuses = ['SCHEDULED', 'COMPLETED', 'POSTPONED', 'CANCELLED'];
    if (!allowedStatuses.includes(status)) {
      return next(new CustomError('Invalid hearing status value.', 400));
    }
  }

  const [result] = await db.execute(
    `UPDATE hearing 
     SET status = COALESCE(?, status),
         remarks = COALESCE(?, remarks),
         hearing_date = COALESCE(?, hearing_date),
         court_name = COALESCE(?, court_name),
         judge_name = COALESCE(?, judge_name)
     WHERE hearing_id = ?`,
    [status || null, remarks || null, hearing_date || null, court_name || null, judge_name || null, hearingId]
  );

  if (result.affectedRows === 0) {
    return next(new CustomError('Hearing schedule not found with that ID.', 404));
  }

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
      h.case_id,
      cf.cf_code,
      cf.cf_name,
      h.title,
      h.hearing_date,
      h.court_name,
      h.judge_name,
      h.status,
      h.remarks
    FROM hearing h
    JOIN case_file cf ON h.case_id = cf.case_id
  `;

  const params = [];
  const conditions = ['h.hearing_date BETWEEN ? AND ?'];
  params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);

  if (attorneyId) {
    query += ` JOIN case_attorney ca ON cf.case_id = ca.case_id`;
    conditions.push('ca.attorney_id = ?');
    params.push(attorneyId);
  }

  query += ` WHERE ` + conditions.join(' AND ') + ` ORDER BY h.hearing_date ASC`;

  const [hearings] = await db.execute(query, params);

  res.status(200).json({
    status: 'success',
    results: hearings.length,
    data: hearings
  });
});