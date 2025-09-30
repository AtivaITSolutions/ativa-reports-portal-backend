const Label = require("../models/label.model");
const User = require("../models/user.model");
const Report = require("../models/report.model");
const mongoose = require("mongoose");

/**
 * Create a new label (ADMIN only)
 */
const createLabel = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ message: "Label name is required" });

    // uniqueness check
    const exists = await Label.findOne({ name: name.trim() });
    if (exists) return res.status(400).json({ message: "Label with that name already exists" });

    const label = await Label.create({ name: name.trim() });
    return res.status(201).json({ message: "Label created", label });
  } catch (error) {
    console.error("createLabel error:", error);
    return res.status(500).json({ message: "Error creating label", error: error.message });
  }
};

/**
 * Get all labels (protected)
 */
const getLabels = async (req, res) => {
  try {
    const labels = await Label.find().sort({ name: 1 });
    return res.json(labels);
  } catch (error) {
    console.error("getLabels error:", error);
    return res.status(500).json({ message: "Error fetching labels", error: error.message });
  }
};

/**
 * Get single label by id (protected)
 */
const getLabelById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid label id" });

    const label = await Label.findById(id);
    if (!label) return res.status(404).json({ message: "Label not found" });

    return res.json(label);
  } catch (error) {
    console.error("getLabelById error:", error);
    return res.status(500).json({ message: "Error fetching label", error: error.message });
  }
};

/**
 * Update label by id (ADMIN only)
 */
const updateLabel = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid label id" });
    if (!name || !name.trim()) return res.status(400).json({ message: "Label name is required" });

    const label = await Label.findById(id);
    if (!label) return res.status(404).json({ message: "Label not found" });

    // uniqueness check except for this doc
    const dup = await Label.findOne({ name: name.trim(), _id: { $ne: id } });
    if (dup) return res.status(400).json({ message: "Another label with this name already exists" });

    label.name = name.trim();
    await label.save();

    return res.json({ message: "Label updated", label });
  } catch (error) {
    console.error("updateLabel error:", error);
    return res.status(500).json({ message: "Error updating label", error: error.message });
  }
};

/**
 * Delete label by id (ADMIN only)
 * - Prevent deletion when label is referenced by any User (as label or in labels array) or Report
 */
const deleteLabel = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid label id" });

    const label = await Label.findById(id);
    if (!label) return res.status(404).json({ message: "Label not found" });

    // Check references in users (label or labels array)
    const usedByUser = await User.exists({
      $or: [
        { label: id },
        { labels: id }
      ]
    });

    if (usedByUser) {
      return res.status(400).json({ message: "Cannot delete label — it is referenced by one or more users" });
    }

    // Check references in reports
    const usedByReport = await Report.exists({ labelId: id });
    if (usedByReport) {
      return res.status(400).json({ message: "Cannot delete label — it is referenced by one or more reports" });
    }

    await Label.findByIdAndDelete(id);
    return res.json({ message: "Label deleted successfully" });
  } catch (error) {
    console.error("deleteLabel error:", error);
    return res.status(500).json({ message: "Error deleting label", error: error.message });
  }
};

module.exports = {
  createLabel,
  getLabels,
  getLabelById,
  updateLabel,
  deleteLabel
};
