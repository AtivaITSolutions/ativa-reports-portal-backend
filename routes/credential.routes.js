const express = require("express");
const router = express.Router();

const {
  createCredential,
  getCredentials,
  getCredentialById,
  updateCredential,
  deleteCredential
} = require("../controllers/credential.controller");

const { protect } = require("../middlewares/auth.middleware");
const { authorizeRoles } = require("../middlewares/role.middleware");

// Create credential (ADMIN or AGENT)
router.post("/", protect, createCredential);

// Get all credentials (role-scoped)
router.get("/", protect, getCredentials);

// Get single credential by id
// To request password in response use ?showPassword=true
router.get("/:id", protect, getCredentialById);

// Update credential (ADMIN or creator)
router.put("/:id", protect, updateCredential);

// Delete credential (ADMIN or creator)
router.delete("/:id", protect, deleteCredential);

module.exports = router;