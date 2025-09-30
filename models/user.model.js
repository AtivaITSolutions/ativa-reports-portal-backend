const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },       
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String },
    role: { type: String, enum: ["ADMIN", "MANAGER", "AGENT", "CLIENT"], required: true },
    
    // For AGENT: single label (service)
    label: { type: mongoose.Schema.Types.ObjectId, ref: "Label", default: null },

    // For CLIENT: multiple labels (services)
    labels: [{ type: mongoose.Schema.Types.ObjectId, ref: "Label" }],

    // For AGENT: assigned manager
    managerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    // For CLIENT: multiple assigned agents
    assignedAgentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], 
    primaryAgentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, // optional for convenience

    passwordHash: { type: String, required: true }
}, { timestamps: true });

// Hash password before saving
userSchema.pre("save", async function(next) {
    if (!this.isModified("passwordHash")) return next();
    const salt = await bcrypt.genSalt(10);
    this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
    next();
});

// Compare password
userSchema.methods.matchPassword = async function(password) {
    return await bcrypt.compare(password, this.passwordHash);
};

module.exports = mongoose.model("User", userSchema);
