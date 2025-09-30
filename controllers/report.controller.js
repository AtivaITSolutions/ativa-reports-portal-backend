const Report = require("../models/report.model");
const User = require("../models/user.model");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const { UPLOAD_DIR } = require("../middlewares/upload.middleware");
const { createAndSendEmailLog } = require("../controllers/reportEmail.controller");

// Helper: ensure path is within upload dir (prevent path traversal)
function resolveStoragePath(relPath) {
  // If relPath is already absolute, normalize it; otherwise assume it's relative to project root.
  const candidate = path.isAbsolute(relPath) ? path.normalize(relPath) : path.resolve(process.cwd(), relPath);
  const uploadDirAbs = path.resolve(process.cwd(), UPLOAD_DIR);
  if (!candidate.startsWith(uploadDirAbs)) {
    // path outside upload dir -> not allowed
    return null;
  }
  return candidate;
}

/**
 * Role-based access check for report
 * Admin -> all
 * Agent -> if report.agentId === agent._id
 * Client -> if report.clientId === client._id
 * Manager -> if manages the agent OR manages the client (denormalized managerId or via agent.managerId)
 */
async function checkReportAccess(requester, report) {
  if (!requester || !report) return false;
  if (requester.role === "ADMIN") return true;

  const rAgentId = String(report.agentId);
  const rClientId = String(report.clientId);
  const reqId = String(requester._id);

  if (requester.role === "AGENT") {
    if (reqId === rAgentId) return true;
    return false;
  }

  if (requester.role === "CLIENT") {
    if (reqId === rClientId) return true;
    return false;
  }

  if (requester.role === "MANAGER") {
    // If client doc has managerId and matches
    const client = await User.findById(rClientId).select("managerId assignedAgentIds").lean();
    if (!client) return false;

    if (client.managerId && String(client.managerId) === reqId) return true;

    // If any assigned agent belongs to this manager
    if (Array.isArray(client.assignedAgentIds) && client.assignedAgentIds.length) {
      const agents = await User.find({
        _id: { $in: client.assignedAgentIds },
        managerId: requester._id
      }).select("_id").lean();
      if (agents && agents.length > 0) return true;
    }

    // also check if report.agentId's manager is requester
    const agent = await User.findById(rAgentId).select("managerId").lean();
    if (agent && agent.managerId && String(agent.managerId) === reqId) return true;

    return false;
  }

  return false;
}

/**
 * Upload PDF and return storage path
 * (used by two-step flow)
 */
const uploadPdf = async (req, res) => {
  try {
    // multer has already processed file into req.file
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    // return path relative to project (we stored under UPLOAD_DIR)
    const storagePath = path.join(UPLOAD_DIR, req.file.filename); // e.g., uploads/reports/name_12345.pdf

    return res.status(201).json({
      message: "File uploaded",
      pdfStoragePath: storagePath
    });
  } catch (error) {
    console.error("uploadPdf error:", error);
    return res.status(500).json({ message: "Error uploading file", error: error.message });
  }
};

/**
 * Create report (expects pdfStoragePath from upload or driveEmbedUrl)
 */
const createReport = async (req, res) => {
  try {
    const { title, labelId, agentId, clientId, pdfStoragePath, driveEmbedUrl, fileName, visibility } = req.body;

    // validate required fields (agentId/clientId/labelId)
    if (!title || !labelId || !agentId || !clientId) return res.status(400).json({ message: "Missing required fields" });
    if (!mongoose.Types.ObjectId.isValid(labelId) || !mongoose.Types.ObjectId.isValid(agentId) || !mongoose.Types.ObjectId.isValid(clientId)) {
      return res.status(400).json({ message: "Invalid ObjectId in fields" });
    }

    // Optional: if pdfStoragePath provided, validate it resolves into UPLOAD_DIR
    let finalPdfPath = null;
    if (pdfStoragePath) {
      const resolved = resolveStoragePath(pdfStoragePath);
      if (!resolved) return res.status(400).json({ message: "Invalid pdfStoragePath" });
      // ensure file exists (recommended)
      if (!fs.existsSync(resolved)) {
        return res.status(400).json({ message: "Uploaded file not found on server; re-upload or provide correct path" });
      }
      // store relative path (for portability) — we already get relative from upload handler
      finalPdfPath = path.join(UPLOAD_DIR, path.basename(resolved));
    }

    const report = await Report.create({
      title,
      labelId,
      agentId,
      clientId,
      pdfStoragePath: finalPdfPath,
      driveEmbedUrl: driveEmbedUrl || null,
      fileName: fileName || (finalPdfPath ? path.basename(finalPdfPath) : null),
      visibility: visibility || "private"
    });

    // ---- CALL EMAIL LOG CREATION & SEND (best-effort, non-blocking) ----
    // pass req.user?._id as triggeredById (if protect middleware sets req.user)
    createAndSendEmailLog({ reportId: report._id, triggeredById: req.user ? req.user._id : null })
      .then(result => {
        // optional: log success/failure for visibility
        if (result && result.ok) console.log("Email attempt ok for report:", report._id);
        else console.warn("Email attempt failed for report:", report._id, result && result.error && result.error.message);
      })
      .catch(err => {
        console.error("createAndSendEmailLog error (unexpected):", err);
      });
    // --------------------------------------------------------------------

    return res.status(201).json({ message: "Report created", report });
  } catch (error) {
    console.error("createReport error:", error);
    return res.status(500).json({ message: "Error creating report", error: error.message });
  }
};

/**
 * Single-step: upload file + create report in one request (multipart/form-data)
 * multer provides req.file and req.body (text fields)
 */
const uploadAndCreateReport = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "PDF file required" });

    const { title, labelId, agentId, clientId, visibility } = req.body;
    if (!title || !labelId || !agentId || !clientId) return res.status(400).json({ message: "Missing required fields" });
    if (!mongoose.Types.ObjectId.isValid(labelId) || !mongoose.Types.ObjectId.isValid(agentId) || !mongoose.Types.ObjectId.isValid(clientId)) {
      return res.status(400).json({ message: "Invalid ObjectId in fields" });
    }

    const pdfStoragePath = path.join(UPLOAD_DIR, req.file.filename);

    const report = await Report.create({
      title,
      labelId,
      agentId,
      clientId,
      pdfStoragePath,
      fileName: req.file.originalname,
      visibility: visibility || "private"
    });

     // ---- CALL EMAIL LOG CREATION & SEND (best-effort, non-blocking) ----
    createAndSendEmailLog({ reportId: report._id, triggeredById: req.user ? req.user._id : null })
      .then(result => {
        if (result && result.ok) console.log("Email attempt ok for report:", report._id);
        else console.warn("Email attempt failed for report:", report._id, result && result.error && result.error.message);
      })
      .catch(err => {
        console.error("createAndSendEmailLog error (unexpected):", err);
      });
    // --------------------------------------------------------------------

    return res.status(201).json({ message: "Report uploaded & created", report });
  } catch (error) {
    console.error("uploadAndCreateReport error:", error);
    return res.status(500).json({ message: "Error uploading and creating report", error: error.message });
  }
};

/**
 * Download / serve file (role-protected)
 */
const getReportDownload = async (req, res) => {
  try {
    const requester = req.user; // protect middleware must set this
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid report id" });

    const report = await Report.findById(id).lean();
    if (!report) return res.status(404).json({ message: "Report not found" });

    // Role-based access
    const allowed = await checkReportAccess(requester, report);
    if (!allowed) return res.status(403).json({ message: "Access denied" });

    if (report.pdfStoragePath) {
      // pdfStoragePath is relative like uploads/reports/name.pdf
      const fullPath = resolveStoragePath(report.pdfStoragePath);
      if (!fullPath) return res.status(400).json({ message: "Invalid stored file path" });
      if (!fs.existsSync(fullPath)) return res.status(404).json({ message: "File not found on server" });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${report.fileName || path.basename(fullPath)}"`);
      const stream = fs.createReadStream(fullPath);
      return stream.pipe(res);
    } else if (report.driveEmbedUrl) {
      // Return the drive url so frontend can embed / redirect
      return res.json({ driveEmbedUrl: report.driveEmbedUrl });
    } else {
      return res.status(400).json({ message: "No file associated with this report" });
    }
  } catch (error) {
    console.error("getReportDownload error:", error);
    return res.status(500).json({ message: "Error fetching report file", error: error.message });
  }
};

/**
 * Get all reports (role-scoped)
 * - ADMIN -> all reports
 * - MANAGER -> reports for clients/agents they manage
 * - AGENT -> reports where agentId === self
 * - CLIENT -> reports where clientId === self
 *
 * Supports optional query filters:
 * - labelId, agentId, clientId, visibility
 */
const getAllReports = async (req, res) => {
  try {
    const requester = req.user;
    if (!requester) return res.status(401).json({ message: "Unauthorized" });

    const { labelId, agentId, clientId, visibility } = req.query;
    let filter = {};

    // basic query filters if provided and valid
    if (labelId && mongoose.Types.ObjectId.isValid(labelId)) filter.labelId = labelId;
    if (agentId && mongoose.Types.ObjectId.isValid(agentId)) filter.agentId = agentId;
    if (clientId && mongoose.Types.ObjectId.isValid(clientId)) filter.clientId = clientId;
    if (visibility) filter.visibility = visibility;

    if (requester.role === "ADMIN") {
      // no extra scoping
    } else if (requester.role === "MANAGER") {
      // managers see reports for clients they manage OR for agents they manage
      const agents = await User.find({ role: "AGENT", managerId: requester._id }).select("_id").lean();
      const agentIds = agents.map(a => a._id);

      const clients = await User.find({
        role: "CLIENT",
        $or: [
          { managerId: requester._id },
          { assignedAgentIds: { $in: agentIds } }
        ]
      }).select("_id").lean();
      const clientIds = clients.map(c => c._id);

      // apply manager scoping to filter: report.agentId in agentIds OR report.clientId in clientIds
      filter.$or = [
        { agentId: { $in: agentIds } },
        { clientId: { $in: clientIds } }
      ];
    } else if (requester.role === "AGENT") {
      filter.agentId = requester._id;
    } else if (requester.role === "CLIENT") {
      filter.clientId = requester._id;
    } else {
      return res.status(403).json({ message: "Access denied" });
    }

    const reports = await Report.find(filter)
      .populate("labelId", "name")
      .populate("agentId", "name email")
      .populate("clientId", "name email")
      .sort({ createdAt: -1 })
      .lean();

    return res.json(reports);
  } catch (error) {
    console.error("getAllReports error:", error);
    return res.status(500).json({ message: "Error fetching reports", error: error.message });
  }
};

/**
 * Get single report by id (role-scoped read)
 * If found and requester allowed (via checkReportAccess) returns report (no file stream)
 */
const getReportById = async (req, res) => {
  try {
    const requester = req.user;
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid report id" });

    const report = await Report.findById(id)
      .populate("labelId", "name")
      .populate("agentId", "name email")
      .populate("clientId", "name email")
      .lean();

    if (!report) return res.status(404).json({ message: "Report not found" });

    const allowed = await checkReportAccess(requester, report);
    if (!allowed) return res.status(403).json({ message: "Access denied" });

    return res.json(report);
  } catch (error) {
    console.error("getReportById error:", error);
    return res.status(500).json({ message: "Error fetching report", error: error.message });
  }
};

/**
 * Update report (ADMIN or agent who created it)
 * Allowed fields to update: title, labelId, clientId, agentId (ADMIN only to change agent/client), visibility, driveEmbedUrl, pdfStoragePath (validate exists)
 * Note: if pdf file replacement required, use upload endpoint + set pdfStoragePath to the returned path (or use upload-create single-step)
 */
const updateReport = async (req, res) => {
  try {
    const requester = req.user;
    const { id } = req.params;
    const body = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid report id" });

    const report = await Report.findById(id);
    if (!report) return res.status(404).json({ message: "Report not found" });

    // Authorization: ADMIN or agent who is report.agentId
    if (requester.role !== "ADMIN" && String(report.agentId) !== String(requester._id)) {
      return res.status(403).json({ message: "Only ADMIN or the agent who created the report can update it" });
    }

    // Apply updates carefully
    const {
      title,
      labelId,
      agentId,
      clientId,
      visibility,
      driveEmbedUrl,
      pdfStoragePath,
      fileName
    } = body;

    if (title !== undefined) report.title = title;
    if (visibility !== undefined) report.visibility = visibility;

    // label/client/agent must be valid ObjectId if provided
    if (labelId !== undefined) {
      if (!mongoose.Types.ObjectId.isValid(labelId)) return res.status(400).json({ message: "Invalid labelId" });
      report.labelId = labelId;
    }

    // Only ADMIN allowed to change agent/client
    if (agentId !== undefined) {
      if (requester.role !== "ADMIN") return res.status(403).json({ message: "Only ADMIN can change agentId" });
      if (!mongoose.Types.ObjectId.isValid(agentId)) return res.status(400).json({ message: "Invalid agentId" });
      report.agentId = agentId;
    }
    if (clientId !== undefined) {
      if (requester.role !== "ADMIN") return res.status(403).json({ message: "Only ADMIN can change clientId" });
      if (!mongoose.Types.ObjectId.isValid(clientId)) return res.status(400).json({ message: "Invalid clientId" });
      report.clientId = clientId;
    }

    if (driveEmbedUrl !== undefined) report.driveEmbedUrl = driveEmbedUrl || null;

    if (pdfStoragePath !== undefined) {
      if (pdfStoragePath) {
        const resolved = resolveStoragePath(pdfStoragePath);
        if (!resolved) return res.status(400).json({ message: "Invalid pdfStoragePath" });
        if (!fs.existsSync(resolved)) return res.status(400).json({ message: "Uploaded file not found on server" });
        report.pdfStoragePath = path.join(UPLOAD_DIR, path.basename(resolved));
        // optional: update fileName if provided or from path
        report.fileName = fileName || path.basename(resolved);
      } else {
        // nulling out the path
        report.pdfStoragePath = null;
        report.fileName = null;
      }
    }

    await report.save();

    const updated = await Report.findById(report._id)
      .populate("labelId", "name")
      .populate("agentId", "name email")
      .populate("clientId", "name email");

    return res.json({ message: "Report updated", report: updated });
  } catch (error) {
    console.error("updateReport error:", error);
    return res.status(500).json({ message: "Error updating report", error: error.message });
  }
};

/**
 * Delete report (ADMIN or agent who created it)
 * Also removes file from disk if present
 */
const deleteReport = async (req, res) => {
  try {
    const requester = req.user;
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid report id" });

    const report = await Report.findById(id);
    if (!report) return res.status(404).json({ message: "Report not found" });

    // Authorization: ADMIN or agent who created report (agentId)
    if (requester.role !== "ADMIN" && String(report.agentId) !== String(requester._id)) {
      return res.status(403).json({ message: "Only admin or the agent who created the report can delete it" });
    }

    // delete file if exists
    if (report.pdfStoragePath) {
      const fullPath = resolveStoragePath(report.pdfStoragePath);
      if (fullPath && fs.existsSync(fullPath)) {
        try {
          fs.unlinkSync(fullPath);
        } catch (e) {
          console.warn("Failed to delete file", e);
          // continue to delete DB doc anyway
        }
      }
    }

    await Report.findByIdAndDelete(id);
    return res.json({ message: "Report deleted successfully" });
  } catch (error) {
    console.error("deleteReport error:", error);
    return res.status(500).json({ message: "Error deleting report", error: error.message });
  }
};

module.exports = {
  uploadPdf,
  createReport,
  uploadAndCreateReport,
  getReportDownload,
  deleteReport,
  checkReportAccess, // export for unit tests or reuse
  getAllReports,
  getReportById,
  updateReport
};
