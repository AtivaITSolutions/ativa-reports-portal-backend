const mongoose = require("mongoose");

const credentialSchema = new mongoose.Schema({
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    portalName: { type: String, required: true },
    username: { type: String, required: true },
    passwordEncrypted: { type: String, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

module.exports = mongoose.model("Credential", credentialSchema);
