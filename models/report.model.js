const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema({
    title: { type: String, required: true },
    labelId: { type: mongoose.Schema.Types.ObjectId, ref: "Label", required: true },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // agent
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    pdfStoragePath: { type: String, default: null },
    driveEmbedUrl: { type: String, default: null },
    fileName: { type: String, default: null },
    visibility: { type: String, enum: ["private"], default: "private" }
}, { timestamps: true });

module.exports = mongoose.model("Report", reportSchema);
