const mongoose = require("mongoose");

const labelSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true }, // Example: SEO, Social Media, etc.
}, { timestamps: true });

module.exports = mongoose.model("Label", labelSchema);