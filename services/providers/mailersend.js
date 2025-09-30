const MailerSend = require("mailersend");

const msClient = new MailerSend({ api_key: process.env.MAILERSEND_API_KEY });

async function send({ to, subject, html, text }) {
  await msClient.email.send({
    from: "your@domain.com",
    to,
    subject,
    html,
    text,
  });
}

module.exports = { send };
