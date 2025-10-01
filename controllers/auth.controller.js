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

        // generate token
        const token = generateToken(user);

        // set httpOnly cookie (keeps session secure from JS/XSS)
        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        };

        res.cookie("token", token, cookieOptions);

        // Return user object (still include token for backward compatibility)
        return res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            username: user.username,
            role: user.role,
            token // still returned so existing clients work
        });

    } catch (error) {
        console.error("login error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

/**
 * Logout - clears the httpOnly cookie
 * Route: POST /api/auth/logout
 * No auth required (but can be protected optionally)
 */
exports.logout = (req, res) => {
    try {
        // Clear the cookie (use same options to ensure proper clearing)
        res.clearCookie("token", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax"
        });
        return res.json({ message: "Logged out" });
    } catch (err) {
        console.error("logout error:", err);
        return res.status(500).json({ message: "Error logging out" });
    }
};

/**
 * Get current user (based on cookie or Authorization header)
 * Route: GET /api/auth/me
 * Protected route: use your existing `protect` middleware to set req.user, or
 * if you want this endpoint to read cookie itself you can decode token here.
 *
 * Best: protect this route with your protect middleware so req.user is available.
 */
exports.me = async (req, res) => {
    try {
        // If protect middleware is applied, req.user will be set
        if (req.user) {
            return res.json({ user: req.user });
        }

        // Fallback: try to read token from cookie or header and decode (optional)
        let token;
        if (req.cookies && req.cookies.token) token = req.cookies.token;
        if (!token && req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
            token = req.headers.authorization.split(" ")[1];
        }
        if (!token) return res.status(401).json({ message: "Not authenticated" });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select("-passwordHash");
        if (!user) return res.status(401).json({ message: "User not found" });

        return res.json({ user });
    } catch (err) {
        console.error("me error:", err);
        return res.status(401).json({ message: "Not authorized", error: err.message });
    }
};
