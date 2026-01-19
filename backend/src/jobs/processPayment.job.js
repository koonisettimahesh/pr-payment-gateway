import { pool } from "../config/db.js";
import { sleep } from "../utils/sleep.js";
import { webhookQueue } from "../queues/index.js";

export async function processPaymentJob(paymentId) {
  const { rows } = await pool.query(
    "SELECT * FROM payments WHERE id = $1",
    [paymentId]
  );
  if (!rows.length) return;

  const payment = rows[0];
  const testMode = process.env.TEST_MODE === "true";

  const delay = testMode
    ? Number(process.env.TEST_PROCESSING_DELAY || 1000)
    : Math.floor(Math.random() * 5000) + 5000;

  await sleep(delay);

  let success;
  if (testMode) {
    success = process.env.TEST_PAYMENT_SUCCESS !== "false";
  } else {
    success =
      payment.method === "upi"
        ? Math.random() < 0.9
        : Math.random() < 0.95;
  }

  if (success) {
    await pool.query(
      "UPDATE payments SET status='success' WHERE id=$1",
      [paymentId]
    );
  } else {
    await pool.query(
      `
      UPDATE payments
      SET status='failed',
          error_code='PAYMENT_FAILED',
          error_description='Payment processing failed'
      WHERE id=$1
      `,
      [paymentId]
    );
  }

  /* ================= WEBHOOK LOGIC ================= */

  // Fetch merchant webhook config
  const merchantRes = await pool.query(
    `SELECT webhook_url FROM merchants WHERE id = $1`,
    [payment.merchant_id]
  );

  if (!merchantRes.rows.length || !merchantRes.rows[0].webhook_url) {
    return; // no webhook configured → correct behavior
  }

  const webhookPayload = {
    event: success ? "payment.success" : "payment.failed",
    timestamp: Math.floor(Date.now() / 1000),
    data: {
      payment: {
        id: payment.id,
        order_id: payment.order_id,
        amount: payment.amount,
        currency: payment.currency,
        method: payment.method,
        status: success ? "success" : "failed",
        created_at: payment.created_at
      }
    }
  };

  // 1️⃣ create webhook_logs row
  const webhookLogRes = await pool.query(
    `
    INSERT INTO webhook_logs
      (merchant_id, event, payload, status, attempts)
    VALUES
      ($1, $2, $3, 'pending', 0)
    RETURNING id
    `,
    [
      payment.merchant_id,
      webhookPayload.event,
      webhookPayload
    ]
  );

  const webhookId = webhookLogRes.rows[0].id;

  // 2️⃣ enqueue delivery job
  await webhookQueue.add("deliver", { webhookId });
}
