const providerName = (process.env.EMAIL_PROVIDER || "gmail").toLowerCase();

let emailProvider;
if (providerName === "mailersend") emailProvider = require("./providers/mailersend");
else if (providerName === "sendpulse") emailProvider = require("./providers/sendpulse");
else if (providerName === "gmail") emailProvider = require("./providers/gmail");
else throw new Error("Invalid EMAIL_PROVIDER in .env: " + process.env.EMAIL_PROVIDER);

// sendEmail({ to, subject, html, text, provider })
// provider (optional) can override per-call
async function sendEmail({ to, subject, html, text, provider }) {
  try {
    const impl = provider
      ? require(`./providers/${provider.toLowerCase()}`)
      : emailProvider;

    return await impl.send({ to, subject, html, text });
  } catch (err) {
    console.error("sendEmail error:", err && err.message);
    throw err;
  }
}

module.exports = { sendEmail };
