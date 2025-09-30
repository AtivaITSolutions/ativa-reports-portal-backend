const express = require("express");
const router = express.Router();

const {
  createUser,
  getUsers,
  getUserById,
  updateUser,
  deleteUser
} = require("../controllers/user.controller");

const { protect } = require("../middlewares/auth.middleware");
const { authorizeRoles } = require("../middlewares/role.middleware");

// Create user (ADMIN only)
router.post("/create-user", protect, authorizeRoles("ADMIN"), createUser);

// Get all users (role-scoped)
router.get("/", protect, getUsers);

// Get single user by id (role-scoped)
router.get("/:id", protect, getUserById);

// Update user by id (role-scoped)
router.put("/:id", protect, updateUser);

// Delete user by id (ADMIN only)
router.delete("/:id", protect, authorizeRoles("ADMIN"), deleteUser);

module.exports = router;
