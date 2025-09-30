const express = require("express");
const router = express.Router();
const { listEmailLogs, getEmailLogById, resendEmailLog } = require("../controllers/reportEmail.controller");
const { protect } = require("../middlewares/auth.middleware");
const { authorizeRoles } = require("../middlewares/role.middleware");

// List logs (protected)
router.get("/", protect, listEmailLogs);

// Get single log
router.get("/:id", protect, getEmailLogById);

// Resend (manual) - protect & controller does extra checks
router.post("/:id/resend", protect, resendEmailLog);

module.exports = router;
