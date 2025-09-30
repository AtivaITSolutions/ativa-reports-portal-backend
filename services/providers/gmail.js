const nodemailer = require("nodemailer");

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_PASS = process.env.GMAIL_PASSWORD;
const FROM = process.env.GMAIL_SENDER_EMAIL || GMAIL_USER;

if (!GMAIL_USER || !GMAIL_PASS) {
  console.warn("GMAIL provider configured but GMAIL_USER/GMAIL_PASSWORD not set in env");
}

// create transporter once
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_PASS // app password
  }
});

// optional verify
transporter.verify().then(() => {
  console.log("Gmail transporter ready");
}).catch(err => {
  console.warn("Gmail transporter verify failed:", err && err.message);
});

async function send({ to, subject, html, text }) {
  if (!to) throw new Error("Missing 'to' address");
  const mailOptions = {
    from: FROM,
    to,
    subject,
    text: text || undefined,
    html: html || undefined
  };
  const info = await transporter.sendMail(mailOptions);
  return info;
}

module.exports = { send };
