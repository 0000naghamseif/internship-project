const pool = require("../config/db");

const createAuditLog = async ({
  actorId,
  action,
  objectType,
  objectId,
  metadata = {},
}) => {
  await pool.query(
    `
    INSERT INTO audit_logs
    (actor_id, action, object_type, object_id, metadata)
    VALUES ($1, $2, $3, $4, $5)
    `,
    [
      actorId || null,
      action,
      objectType,
      objectId || null,
      JSON.stringify(metadata),
    ]
  );
};

module.exports = createAuditLog;