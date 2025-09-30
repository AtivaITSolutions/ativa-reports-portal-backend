const SendPulse = require("sendpulse-api");
const SP = new SendPulse(
  process.env.SENDPULSE_API_USER_ID,
  process.env.SENDPULSE_API_SECRET,
  "/tmp/"
);

async function send({ to, subject, html, text }) {
  return new Promise((resolve, reject) => {
    SP.smtpSendMail(
      {
        html,
        text,
        subject,
        from: { name: "Your Name", email: "your@domain.com" },
        to: [{ email: to }],
      },
      (response) => {
        if (response && response.result === false) reject(response);
        else resolve(response);
      }
    );
  });
}

module.exports = { send };
