import axios from "axios";
import { signPayload } from "../utils/hmac.js";
import { pool } from "../config/db.js";

export async function sendWebhook(merchantId, event, payload) {
  const { rows } = await pool.query(
    "SELECT webhook_url, webhook_secret FROM merchants WHERE id = $1",
    [merchantId]
  );

  if (!rows.length || !rows[0].webhook_url) return;

  const { webhook_url, webhook_secret } = rows[0];

  const signature = signPayload(payload, webhook_secret);

  await axios.post(webhook_url, payload, {
    headers: {
      "X-Webhook-Signature": signature,
      "Content-Type": "application/json"
    }
  });
}
