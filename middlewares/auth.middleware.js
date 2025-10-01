const jwt = require("jsonwebtoken");
const User = require("../models/user.model");

// Middleware to verify JWT token (from cookie or Authorization header)
const protect = async (req, res, next) => {
    try {
        let token;

        // 1. First check cookies
        if (req.cookies && req.cookies.token) {
            token = req.cookies.token;
        }

        // 2. If not in cookies, check Authorization header
        if (!token && req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
            token = req.headers.authorization.split(" ")[1];
        }

        // 3. If no token found
        if (!token) {
            return res.status(401).json({ message: "Not authenticated" });
        }

        // 4. Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // 5. Attach user to request (without passwordHash)
        const user = await User.findById(decoded.id).select("-passwordHash");
        if (!user) {
            return res.status(401).json({ message: "User not found" });
        }

        req.user = user;
        next();
    } catch (err) {
        console.error("protect error:", err);
        res.status(401).json({ message: "Not authorized", error: err.message });
    }
};

module.exports = { protect };
