const express = require("express");
const router = express.Router();
const { login, logout, me } = require("../controllers/auth.controller");
const { protect } = require("../middlewares/auth.middleware"); // if you have protect middleware

router.post("/login", login);
router.post("/logout", logout);
// Protect /me route so req.user is available from protect middleware
router.get("/me", protect, me);

module.exports = router;
