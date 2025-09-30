const express = require("express");
const router = express.Router();

const {
  createLabel,
  getLabels,
  getLabelById,
  updateLabel,
  deleteLabel
} = require("../controllers/label.controller");

const { protect } = require("../middlewares/auth.middleware");
const { authorizeRoles } = require("../middlewares/role.middleware");

// Get all labels (any authenticated user)
router.get("/", protect, getLabels);

// Get one label by id
router.get("/:id", protect, getLabelById);

// Create label (ADMIN only)
router.post("/", protect, authorizeRoles("ADMIN"), createLabel);

// Update label (ADMIN only)
router.put("/:id", protect, authorizeRoles("ADMIN"), updateLabel);

// Delete label (ADMIN only)
router.delete("/:id", protect, authorizeRoles("ADMIN"), deleteLabel);

module.exports = router;
