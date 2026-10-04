const express = require("express");
const crypto = require("crypto");

const app = express();

const WEBHOOK_SECRET =
  "whsec_test_1f969752537297d5a3604e5c2a4e6620920ec731f11dc640";

app.use(express.json());

app.post("/webhook", (req, res) => {
  const signature = req.headers["x-webhook-signature"];
  const payload = JSON.stringify(req.body);

  // Generate expected HMAC signature
  const expectedSignature = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(payload)
    .digest("hex");

  // Verify webhook signature
  if (signature !== expectedSignature) {
    console.log("❌ Invalid signature");
    return res.status(401).send("Invalid signature");
  }

  console.log("✅ Webhook verified:", req.body.event);

  // -----------------------------
  // Payment webhook
  // -----------------------------
  if (req.body.data?.payment) {
    console.log("Payment ID:", req.body.data.payment.id);
    console.log("Payment Status:", req.body.data.payment.status);
  }

  // -----------------------------
  // Refund webhook
  // -----------------------------
  if (req.body.refund) {
    console.log("Refund ID:", req.body.refund.id);
    console.log("Payment ID:", req.body.refund.payment_id);
    console.log("Refund Status:", req.body.refund.status);
  }

  // Tell gateway that webhook was received successfully
  return res.status(200).send("OK");
});

app.listen(4000, "0.0.0.0", () => {
  console.log("Test merchant webhook running on port 4000");
});