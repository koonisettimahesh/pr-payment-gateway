import express from "express";
import crypto from "crypto";
import { pool } from "../config/db.js";
import { refundQueue, webhookQueue } from "../queues/index.js";
import { authenticateMerchant } from "../middleware/authMiddleware.js";
import { apiError } from "../utils/errors.js";

const router = express.Router();

/**
 * CREATE REFUND
 * POST /api/v1/payments/:payment_id/refunds
 */
router.post(
  "/:payment_id/refunds",
  authenticateMerchant,
  async (req, res, next) => {
    try {
      const { payment_id } = req.params;
      const { amount, reason } = req.body;
      const merchant = req.merchant;

      if (!amount || amount <= 0) {
        return next(
          apiError(400, "BAD_REQUEST_ERROR", "Invalid refund amount"),
        );
      }

      /* ---------- Fetch payment ---------- */
      const payRes = await pool.query(
        `
        SELECT *
        FROM payments
        WHERE id = $1
        AND merchant_id = $2
        `,
        [payment_id, merchant.id],
      );

      if (payRes.rows.length === 0) {
        return next(apiError(404, "NOT_FOUND_ERROR", "Payment not found"));
      }

      const payment = payRes.rows[0];

      if (payment.status !== "success") {
        return next(
          apiError(400, "BAD_REQUEST_ERROR", "Payment not refundable"),
        );
      }

      /* ---------- Calculate refunded amount ---------- */
      const refundedRes = await pool.query(
        `
        SELECT COALESCE(SUM(amount), 0) AS total
        FROM refunds
        WHERE payment_id = $1
        AND status IN ('processed', 'pending')

        `,
        [payment_id],
      );

      const available = payment.amount - refundedRes.rows[0].total;

      if (amount > available) {
        return next(
          apiError(
            400,
            "BAD_REQUEST_ERROR",
            "Refund amount exceeds available amount",
          ),
        );
      }

      /* ---------- Generate refund ID ---------- */
      let refundId;
      while (true) {
        refundId = `rfnd_${crypto.randomBytes(8).toString("hex")}`;

        const { rows } = await pool.query(
          "SELECT 1 FROM refunds WHERE id = $1",
          [refundId],
        );

        if (rows.length === 0) break;
      }

      /* ---------- Insert refund ---------- */
      await pool.query(
        `
        INSERT INTO refunds
          (id, payment_id, merchant_id, amount, reason, status)
        VALUES
          ($1, $2, $3, $4, $5, 'pending')
        `,
        [refundId, payment_id, merchant.id, amount, reason || null],
      );
      await webhookQueue.add("deliver", {
        merchantId: merchant.id,
        event: "refund.created",
        payload: {
          refund: {
            id: refundId,
            payment_id,
            amount,
            reason,
            status: "pending",
            created_at: new Date().toISOString(),
          },
        },
      });

      /* ---------- Enqueue refund job ---------- */
      await refundQueue.add("process", { refundId });

      res.status(201).json({
        id: refundId,
        payment_id,
        amount,
        reason,
        status: "pending",
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET REFUND
 * GET /api/v1/refunds/:refund_id
 */
router.get("/:refund_id", authenticateMerchant, async (req, res, next) => {
  try {
    const { refund_id } = req.params;

    const { rows } = await pool.query(
      `
      SELECT *
      FROM refunds
      WHERE id = $1 AND merchant_id = $2
      `,
      [refund_id, req.merchant.id],
    );

    if (rows.length === 0) {
      return next(apiError(404, "NOT_FOUND_ERROR", "Refund not found"));
    }

    res.status(200).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
