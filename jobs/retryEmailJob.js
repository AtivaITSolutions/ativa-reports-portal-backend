const ReportEmail = require("../models/reportEmail.model");
const { attemptSend } = require("../controllers/reportEmail.controller");

/**
 * Retry logic:
 * - Find logs with status 'failed' and attempts < MAX_ATTEMPTS
 * - Optionally check lastAttemptAt to implement backoff delays
 */
const MAX_ATTEMPTS = parseInt(process.env.EMAIL_MAX_ATTEMPTS || "3", 10);

async function retryFailedEmails() {
  try {
    const candidates = await ReportEmail.find({
      status: "failed",
      attempts: { $lt: MAX_ATTEMPTS }
    }).sort({ lastAttemptAt: 1 }).limit(50); // limit per run

    for (const log of candidates) {
      // optional: simple backoff - skip if lastAttemptAt too recent
      if (log.lastAttemptAt) {
        const waitMs = Math.min(60 * 60 * 1000, Math.pow(2, log.attempts) * 60 * 1000); // up to 1 hour
        const canRetryAt = new Date(log.lastAttemptAt.getTime() + waitMs);
        if (new Date() < canRetryAt) continue;
      }
      // attempt send
      await attemptSend(log);
    }
  } catch (err) {
    console.error("retryFailedEmails error:", err);
  }
}

module.exports = { retryFailedEmails };
