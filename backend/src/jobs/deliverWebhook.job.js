import fetch from "node-fetch";
import { pool } from "../config/db.js";
import { generateHmac } from "../utils/hmac.js";
import { getRetryDelay } from "../utils/webhookRetry.js";
import { webhookQueue } from "../queues/index.js";

export async function deliverWebhookJob(data) {
  const {
    merchantId,
    event,
    payload,
    webhookId,
  } = data;

  const { rows } = await pool.query(
    `
    SELECT webhook_url, webhook_secret
    FROM merchants
    WHERE id = $1
    `,
    [merchantId],
  );

  if (!rows.length || !rows[0].webhook_url) {
    return;
  }

  const merchant = rows[0];

  let currentWebhookId = webhookId;
  let previousAttempts = 0;

  /* ---------- Create webhook log on first attempt ---------- */

  if (!currentWebhookId) {
    const logRes = await pool.query(
      `
      INSERT INTO webhook_logs
        (merchant_id, event, payload, status, attempts)
      VALUES
        ($1, $2, $3, 'pending', 0)
      RETURNING id, attempts
      `,
      [merchantId, event, payload],
    );

    currentWebhookId = logRes.rows[0].id;
    previousAttempts = logRes.rows[0].attempts;
  } else {
    const logRes = await pool.query(
      `
      SELECT attempts
      FROM webhook_logs
      WHERE id = $1
        AND merchant_id = $2
    `,
      [currentWebhookId, merchantId],
    );

    if (!logRes.rows.length) {
      return;
    }

    previousAttempts = logRes.rows[0].attempts;
  }

  const nextAttempt = previousAttempts + 1;

  const signature = generateHmac(
    merchant.webhook_secret,
    payload,
  );

  let status = "pending";
  let responseCode = null;
  let responseBody = null;

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

  /* ---------- Update the SAME webhook log ---------- */

  await pool.query(
    `
    UPDATE webhook_logs
    SET
      status = $1,
      attempts = $2,
      last_attempt_at = NOW(),
      response_code = $3,
      response_body = $4,
      next_retry_at = $5
    WHERE id = $6
    `,
    [
      status,
      nextAttempt,
      responseCode,
      responseBody,
      nextRetryAt,
      currentWebhookId,
    ],
  );

  /* ---------- Retry the SAME webhook ---------- */

  if (status === "pending") {
    await webhookQueue.add(
      "deliver",
      {
        merchantId,
        event,
        payload,
        webhookId: currentWebhookId,
      },
      {
        delay: getRetryDelay(nextAttempt),
      },
    );
  }
}