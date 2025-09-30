const mongoose = require("mongoose");
const ReportEmail = require("../models/reportEmail.model");
const Report = require("../models/report.model");
const User = require("../models/user.model");
const { sendEmail } = require("../services/email.services"); // provider abstraction
const { generateReportEmail } = require("../services/templates/email.template");

/**
 * Helper: attempt to send email and update the log record.
 * - returns the updated ReportEmail doc
 */
async function attemptSend(reportEmail) {
  // increment attempts & set lastAttemptAt before trying
  reportEmail.attempts += 1;
  reportEmail.lastAttemptAt = new Date();
  await reportEmail.save();

  try {
    const sendResult = await sendEmail({
      to: reportEmail.toEmail,
      subject: reportEmail.subject,
      html: reportEmail.body,
      text: reportEmail.text || undefined,
      provider: reportEmail.provider
    });

    // success
    reportEmail.status = "sent";
    reportEmail.sentAt = new Date();
    await reportEmail.save();

    return { ok: true, reportEmail, info: sendResult };
  } catch (err) {
    // failure
    reportEmail.status = "failed";
    await reportEmail.save();
    return { ok: false, reportEmail, error: err };
  }
}

/**
 * Called by controllers where a report gets created.
 * Creates a ReportEmail record (pending) and attempts to send immediately (best-effort).
 *
 * Usage:
 * await createAndSendEmailLog({ reportId, triggeredById })
 */
async function createAndSendEmailLog({ reportId, triggeredById = null }) {
  if (!mongoose.Types.ObjectId.isValid(reportId)) throw new Error("Invalid reportId");

  const report = await Report.findById(reportId).lean();
  if (!report) throw new Error("Report not found");

  const client = await User.findById(report.clientId).select("name email").lean();
  if (!client || !client.email) {
    throw new Error("Client not found or has no email");
  }

  // build portal url - change to your frontend pattern
  const portalBase = process.env.PORTAL_BASE_URL || "http://localhost:3000";
  const portalUrl = `${portalBase}/client/${client._id}/reports/${report._id}`;

  const subject = `Your report "${report.title}" is available`;
  const html = generateReportEmail({
    clientName: client.name || "Client",
    reportTitle: report.title,
    portalLink: portalUrl,
    logoUrl: process.env.EMAIL_LOGO_URL || null
  });
  const text = `Your report "${report.title}" is available at ${portalUrl}`;

  // Create initial log (pending)
  const provider = (process.env.EMAIL_PROVIDER || "gmail").toLowerCase();
  let log = await ReportEmail.create({
    reportId: report._id,
    clientId: client._id,
    toEmail: client.email,
    subject,
    body: html,
    text,
    portalUrl,
    provider,
    status: "pending",
    attempts: 0,
    triggeredBy: triggeredById || null
  });

  // attempt to send (increment attempts inside attempt)
  try {
    // increment attempts + set lastAttemptAt
    log.attempts += 1;
    log.lastAttemptAt = new Date();
    await log.save();

    const info = await sendEmail({ to: client.email, subject, html, text, provider });
    log.status = "sent";
    log.sentAt = new Date();
    await log.save();
    return { ok: true, reportEmail: log, info };
  } catch (err) {
    // update failed state (attempts already incremented)
    log.status = "failed";
    await log.save();
    return { ok: false, reportEmail: log, error: err };
  }
}

/* ------------------- Express handlers ------------------- */

/**
 * GET /api/email-logs
 * Admin/Manager: see all (apply role-check in route); otherwise role-scoped
 * Query params: clientId, reportId, status
 */
const listEmailLogs = async (req, res) => {
  try {
    const requester = req.user;
    const { clientId, reportId, status } = req.query;
    const q = {};

    if (clientId && mongoose.Types.ObjectId.isValid(clientId)) q.clientId = clientId;
    if (reportId && mongoose.Types.ObjectId.isValid(reportId)) q.reportId = reportId;
    if (status) q.status = status;

    // simple role scoping:
    if (requester.role === "ADMIN") {
      // no extra filter
    } else if (requester.role === "MANAGER") {
      // manager: can see logs for clients/agents they manage
      // For simplicity here we let managers see all (you can tighten if needed)
    } else if (requester.role === "AGENT") {
      // agents: see logs for reports where agentId === self
      // we need to find reports belonging to agent
      const reports = await Report.find({ agentId: requester._id }).select("_id").lean();
      const rids = reports.map(r => r._id);
      q.reportId = { $in: rids };
    } else if (requester.role === "CLIENT") {
      q.clientId = requester._id;
    } else {
      return res.status(403).json({ message: "Access denied" });
    }

    const list = await ReportEmail.find(q)
      .populate("reportId", "title")
      .populate("clientId", "name email")
      .sort({ createdAt: -1 })
      .lean();

    return res.json(list);
  } catch (err) {
    console.error("listEmailLogs error:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

/**
 * GET /api/email-logs/:id
 */
const getEmailLogById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });

    const log = await ReportEmail.findById(id)
      .populate("reportId", "title")
      .populate("clientId", "name email")
      .lean();
    if (!log) return res.status(404).json({ message: "Not found" });

    // role-check: clients can only view their logs
    const requester = req.user;
    if (requester.role === "CLIENT" && String(log.clientId._id) !== String(requester._id)) {
      return res.status(403).json({ message: "Access denied" });
    }

    return res.json(log);
  } catch (err) {
    console.error("getEmailLogById error:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

/**
 * POST /api/email-logs/:id/resend
 * Manual resend (ADMIN or agent who triggered)
 */
const resendEmailLog = async (req, res) => {
  try {
    const { id } = req.params;
    const requester = req.user;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });

    let log = await ReportEmail.findById(id);
    if (!log) return res.status(404).json({ message: "Email log not found" });

    // Authorization: Admin or who triggered or agent of the report
    const report = await Report.findById(log.reportId).select("agentId clientId").lean();

    const allowed = (requester.role === "ADMIN") ||
      (log.triggeredBy && String(log.triggeredBy) === String(requester._id)) ||
      (requester.role === "AGENT" && String(report.agentId) === String(requester._id));
    if (!allowed) return res.status(403).json({ message: "Not authorized to resend" });

    // update status to pending and attempt send
    log.status = "pending";
    await log.save();

    const result = await attemptSend(log);
    if (result.ok) return res.json({ message: "Resent successfully", log: result.reportEmail });
    return res.status(500).json({ message: "Resend failed", error: result.error && result.error.message, log: result.reportEmail });
  } catch (err) {
    console.error("resendEmailLog error:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

module.exports = {
  createAndSendEmailLog,
  listEmailLogs,
  getEmailLogById,
  resendEmailLog,
  // exported for unit tests if needed
  attemptSend
};
