const express = require("express");
const router = express.Router();
const User = require("../models/user.model");

// Route to create primary admin (use only once)
router.post("/init-admin", async (req, res) => {
    const { name, username, email, password } = req.body;

    try {
        // Check if any Admin already exists
        const existingAdmin = await User.findOne({ role: "ADMIN" });
        if (existingAdmin) {
            return res.status(400).json({ message: "Admin already exists. Route disabled now." });
        }

        // Create new Admin
        const newAdmin = await User.create({
            name,
            username,
            email,
            role: "ADMIN",
            passwordHash: password
        });

        res.status(201).json({
            message: "Primary Admin created successfully ✅",
            user: {
                _id: newAdmin._id,
                name: newAdmin.name,
                email: newAdmin.email,
                username: newAdmin.username,
                role: newAdmin.role
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;
