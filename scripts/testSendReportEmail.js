require("dotenv").config();
const mongoose = require("mongoose");
const { createAndSendEmailLog } = require("../controllers/reportEmail.controller");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  try {
    const reportId = "68da5b0802a9865939df1323";
    const res = await createAndSendEmailLog({ reportId, triggeredById: null });
    console.log("Result:", res.ok ? "sent" : "failed", res);
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
