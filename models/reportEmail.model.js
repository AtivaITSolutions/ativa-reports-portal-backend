const mongoose = require("mongoose");

const reportEmail = new mongoose.Schema({
  reportId: { type: mongoose.Schema.Types.ObjectId, ref: "Report", required: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  // email content (snapshot for audit)
  toEmail: { type: String, required: true },
  subject: { type: String, required: true },
  body: { type: String, required: true },        // HTML content snapshot
  text: { type: String, default: null },         // plain-text snapshot (optional)
  portalUrl: { type: String, default: null },

  // delivery / provider / retry metadata
  provider: { type: String, enum: ["mailerSend","sendPulse","gmail"], default: "mailerSend" },
  status: { type: String, enum: ["pending","sent","failed"], default: "pending" },
  attempts: { type: Number, default: 0 },
  lastAttemptAt: { type: Date, default: null },
  sentAt: { type: Date, default: null },

  // optional: who triggered (agent/admin user id)
  triggeredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
}, { timestamps: true });

module.exports = mongoose.model("ReportEmail", reportEmail);
