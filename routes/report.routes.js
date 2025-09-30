const express = require("express");
const router = express.Router();
const { upload } = require("../middlewares/upload.middleware");
const {
  uploadPdf,
  createReport,
  uploadAndCreateReport,
  getReportDownload,
  deleteReport,
  getAllReports,
  getReportById,
  updateReport
} = require("../controllers/report.controller");
const { protect } = require("../middlewares/auth.middleware");
const { authorizeRoles } = require("../middlewares/role.middleware");

// Two-step: upload then create (only ADMIN or AGENT can upload/create)
router.post("/upload", protect, authorizeRoles("ADMIN", "AGENT"), upload.single("file"), uploadPdf);
router.post("/", protect, authorizeRoles("ADMIN", "AGENT"), createReport);

// Single-step: multipart form (fields + file)
router.post("/upload-create", protect, authorizeRoles("ADMIN","AGENT"), upload.single("file"), uploadAndCreateReport);

// Download/serve file (role-scoped)
router.get("/:id/download", protect, getReportDownload);

// List all reports (role-scoped)
router.get("/", protect, getAllReports);

// Get report by id (role-scoped, returns metadata only)
router.get("/:id", protect, getReportById);

// Update report (ADMIN or agent who created)
router.put("/:id", protect, updateReport);

// (existing download route remains but move below to avoid route conflict with /:id if necessary)
router.get("/:id/download", protect, getReportDownload);

// Delete report
router.delete("/:id", protect, deleteReport);

module.exports = router;
