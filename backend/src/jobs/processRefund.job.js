import { pool } from "../config/db.js";
import { sleep } from "../utils/sleep.js";
import { webhookQueue } from "../queues/index.js";

export async function processRefundJob(refundId) {
  const { rows } = await pool.query(
    `
    SELECT r.*, p.amount AS payment_amount, p.status AS payment_status
    FROM refunds r
    JOIN payments p ON p.id = r.payment_id
    WHERE r.id=$1
    `,
    [refundId],
  );

  if (!rows.length) return;
  const refund = rows[0];

  if (refund.payment_status !== "success") {
    throw new Error("Payment not refundable");
  }
  // 🔹 Check total refunded amount
  const sumRes = await pool.query(
    `
  SELECT COALESCE(SUM(amount), 0) AS total_refunded
  FROM refunds
  WHERE payment_id = $1
    AND status = 'processed'
  `,
    [refund.payment_id],
  );

  const totalRefunded = Number(sumRes.rows[0].total_refunded);

  if (totalRefunded + refund.amount > refund.payment_amount) {
    throw new Error("Refund amount exceeds payment amount");
  }

  await sleep(Math.floor(Math.random() * 2000) + 3000);

  await pool.query(
    `
    UPDATE refunds
    SET status='processed', processed_at=NOW()
    WHERE id=$1
    `,
    [refundId],
  );
  // 🔹 Full refund → update payment
  if (totalRefunded + refund.amount === refund.payment_amount) {
    await pool.query("UPDATE payments SET status='refunded' WHERE id=$1", [
      refund.payment_id,
    ]);
  }

  await webhookQueue.add("deliver", {
    merchantId: refund.merchant_id,
    event: "refund.processed",
    payload: refund,
  });
}
