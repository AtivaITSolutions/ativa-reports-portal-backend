const express = require("express");
const router = express.Router();
const { login } = require("../controllers/auth.controller");

router.post("/login", login); // login endpoint for all roles

module.exports = router;
