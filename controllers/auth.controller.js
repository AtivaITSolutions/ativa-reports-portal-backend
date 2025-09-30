const User = require("../models/user.model");
const jwt = require("jsonwebtoken");

// Generate JWT token
const generateToken = (user) => {
    return jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
    );
};

// Login user (any role)
exports.login = async (req, res) => {
    const { usernameOrEmail, password } = req.body;

    try {
        // Find by email or username
        const user = await User.findOne({ 
            $or: [{ email: usernameOrEmail }, { username: usernameOrEmail }] 
        });

        if (!user) return res.status(401).json({ message: "Invalid credentials" });

        const isMatch = await user.matchPassword(password);
        if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            username: user.username,
            role: user.role,
            token: generateToken(user)
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
};
