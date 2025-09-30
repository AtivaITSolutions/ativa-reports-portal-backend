const multer = require("multer");
const path = require("path");
const fs = require("fs");

const UPLOAD_DIR = process.env.UPLOAD_DIR || "uploads/reports";

// ensure directory exists
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = path.basename(file.originalname, ext)
      .replace(/\s+/g, "_")
      .slice(0, 50);
    const timestamp = Date.now();
    cb(null, `${name}_${timestamp}${ext}`);
  }
});

function fileFilter(req, file, cb) {
  // Accept PDF only
  if (file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only PDF is allowed."), false);
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB limit (adjust as needed)
});

module.exports = { upload, UPLOAD_DIR };
