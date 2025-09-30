const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    action: { type: String, required: true }, // e.g., "report_created", "report_downloaded"
    targetId: { type: mongoose.Schema.Types.ObjectId }, // reportId, clientId, etc.
    details: { type: Object }, // optional extra info
}, { timestamps: true });

module.exports = mongoose.model("AuditLog", auditLogSchema);
