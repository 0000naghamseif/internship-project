const pool = require("../config/db");

const getAuditLogs = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        actor_id,
        action,
        object_type,
        object_id,
        timestamp,
        metadata
      FROM audit_logs
      ORDER BY timestamp DESC
    `);

    res.json(result.rows);

  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Failed to load audit logs"
    });
  }
};

module.exports = {
  getAuditLogs
};