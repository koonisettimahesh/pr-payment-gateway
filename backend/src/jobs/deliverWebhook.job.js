import fetch from "node-fetch";
import { pool } from "../config/db.js";
import { generateHmac } from "../utils/hmac.js";
import { getRetryDelay } from "../utils/webhookRetry.js";
import { webhookQueue } from "../queues/index.js";

export async function deliverWebhookJob(data, attempts = 0) {
  const { merchantId, event, payload } = data;

  const { rows } = await pool.query(
    "SELECT webhook_url, webhook_secret FROM merchants WHERE id=$1",
    [merchantId],
  );
  // 🔹 Load previous webhook attempts
  const logRes = await pool.query(
    `SELECT id, attempts
   FROM webhook_logs
   WHERE merchant_id = $1 AND event = $2
   ORDER BY id DESC
   LIMIT 1`,
    [merchantId, event],
  );

  const prevAttempts = logRes.rows[0]?.attempts || 0;

  if (!rows.length || !rows[0].webhook_url) return;

  const merchant = rows[0];
  const signature = generateHmac(merchant.webhook_secret, payload);

  let status = "pending";
  let responseCode = null;
  let responseBody = null;
  const nextAttempt = prevAttempts + 1;
  try {
    const res = await fetch(merchant.webhook_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
      },
      body: JSON.stringify(payload),
      timeout: 5000,
    });

    responseCode = res.status;
    responseBody = await res.text();
  } catch (_) {}
  if (responseCode >= 200 && responseCode < 300) {
    status = "success";
  } else if (nextAttempt >= 5) {
    status = "failed";
  }
  const nextRetryAt =
    status === "pending"
      ? new Date(Date.now() + getRetryDelay(nextAttempt))
      : null;
  await pool.query(
    `
    INSERT INTO webhook_logs
  (merchant_id, event, payload, status, attempts,
   last_attempt_at, response_code, response_body, next_retry_at)
VALUES ($1,$2,$3,$4,$5,NOW(),$6,$7,$8)
    `,
    [
      merchantId,
      event,
      payload,
      status,
      nextAttempt,
      responseCode,
      responseBody,
      nextRetryAt,
    ],
  );

  if (status === "pending") {
    await webhookQueue.add("deliver", data, {
      delay: getRetryDelay(nextAttempt),
      attempts: nextAttempt,
    });
  }
}
