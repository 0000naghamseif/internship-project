const express = require("express");

const router = express.Router();

const {
  getAuditLogs
} = require("../controllers/audit.controller");

const verifyToken = require("../middleware/auth.middleware");
const allowRoles = require("../middleware/role.middleware");

router.get(
  "/",
  verifyToken,
  allowRoles(["Admin"]),
  getAuditLogs
);

module.exports = router;