const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();
require("./models");  // Ensure all models are registered
const cookieParser = require("cookie-parser");

const app = express();

// Middleware
app.use(cors({ 
  origin: process.env.PORTAL_BASE_URL || "http://localhost:5173", 
  credentials: true 
}));
app.use(cookieParser());
app.use(express.json());

// Routes
app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/users", require("./routes/user.routes")); // user creation
app.use("/api/labels", require("./routes/label.routes")); // label management
app.use("/api/credentials", require("./routes/credential.routes")); // credential management
app.use("/api/reports", require("./routes/report.routes")); // report management
app.use('/api/email-logs', require('./routes/reportEmail.routes')); // email logs
// Temporary init admin route (use only once)
app.use("/api/init", require("./routes/initAdmin.routes"));

// DB Connection
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB connected ✅"))
.catch((err) => console.log("MongoDB connection error ❌", err));

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT} 🚀`));


/* ---------------- Cron Job for retrying failed emails ---------------- */
const cron = require("node-cron");
const { retryFailedEmails } = require("./jobs/retryEmailJob");

// run every 5 minutes
cron.schedule("*/5 * * * *", () => {
  console.log("⏳ Running email retry job...");
  retryFailedEmails();
});