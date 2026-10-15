const db = require('../config/db');

/**
 * Append an entry to the immutable user_log audit trail.
 * Failures are logged but never break the main request flow.
 */
const logAction = async ({ user_id, event_type, action_taken, target_cf_code = null, ip_address = null, device_info = null }) => {
  try {
    await db.execute(
      `INSERT INTO user_log (user_id, event_type, action_taken, target_cf_code, ip_address, device_info, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [user_id, event_type, action_taken, target_cf_code, ip_address, device_info]
    );
  } catch (err) {
    console.error('[AUDIT LOG FAILURE]', err.message);
  }
};

const getRequestMeta = (req) => ({
  ip_address: req.ip || req.headers['x-forwarded-for'] || null,
  device_info: req.headers['user-agent'] || null
});

module.exports = { logAction, getRequestMeta };
