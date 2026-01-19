import express from "express";
import crypto from "crypto";
import { pool } from "../config/db.js";
import { authenticateMerchant } from "../middleware/authMiddleware.js";
import { apiError } from "../utils/errors.js";
import { paymentQueue, webhookQueue } from "../queues/index.js";
import { findPaymentById } from "../repositories/payment.repo.js";

const router = express.Router();

/**
 * CREATE PAYMENT (Idempotent, Async)
 * POST /api/v1/payments
 */
router.post("/", authenticateMerchant, async (req, res, next) => {
  try {
    const merchant = req.merchant;
    const { order_id, method, vpa, card_network, card_last4 } = req.body;
    const idempotencyKey = req.header("Idempotency-Key");

    if (!order_id || !method) {
      return next(
        apiError(400, "BAD_REQUEST_ERROR", "Invalid payment request"),
      );
    }

    /* ---------- Idempotency ---------- */
    if (idempotencyKey) {
      const { rows } = await pool.query(
        `
        SELECT response
        FROM idempotency_keys
        WHERE key = $1 AND merchant_id = $2 AND expires_at > NOW()
        `,
        [idempotencyKey, merchant.id],
      );

      if (rows.length > 0) {
        return res.status(201).json(rows[0].response);
      }

      await pool.query(
        `DELETE FROM idempotency_keys WHERE key = $1 AND merchant_id = $2`,
        [idempotencyKey, merchant.id],
      );
    }

    /* ---------- Fetch order ---------- */
    const orderRes = await pool.query(
      `SELECT * FROM orders WHERE id = $1 AND merchant_id = $2`,
      [order_id, merchant.id],
    );

    if (orderRes.rows.length === 0) {
      return next(apiError(404, "NOT_FOUND_ERROR", "Order not found"));
    }

    const order = orderRes.rows[0];
    const paymentId = `pay_${crypto.randomBytes(8).toString("hex")}`;

    /* ---------- Insert payment ---------- */
    await pool.query(
      `
      INSERT INTO payments (
        id, order_id, merchant_id, amount, currency,
        method, vpa, card_network, card_last4, status
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending')
      `,
      [
        paymentId,
        order.id,
        merchant.id,
        order.amount,
        order.currency,
        method,
        vpa || null,
        card_network || null,
        card_last4 || null,
      ],
    );

    const response = {
      id: paymentId,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      method,
      vpa,
      status: "pending",
      created_at: new Date().toISOString(),
    };

    /* ---------- Emit webhooks ---------- */
    await webhookQueue.add("deliver", {
      merchantId: merchant.id,
      event: "payment.created",
      payload: { payment: response },
    });

    await webhookQueue.add("deliver", {
      merchantId: merchant.id,
      event: "payment.pending",
      payload: { payment: response },
    });

    /* ---------- Enqueue payment processing ---------- */
    await paymentQueue.add("process", { paymentId });

    /* ---------- Save idempotency ---------- */
    if (idempotencyKey) {
      await pool.query(
        `
        INSERT INTO idempotency_keys
        (key, merchant_id, response, expires_at)
        VALUES ($1,$2,$3,NOW() + INTERVAL '24 hours')
        `,
        [idempotencyKey, merchant.id, response],
      );
    }

    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
});

/**
 * LIST PAYMENTS (Dashboard)
 */
router.get("/", authenticateMerchant, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT *
      FROM payments
      WHERE merchant_id = $1
      ORDER BY created_at DESC
      `,
      [req.merchant.id],
    );

    res.status(200).json(rows);
  } catch (err) {
    next(err);
  }
});

/**
 * GET SINGLE PAYMENT
 */
router.get("/:payment_id", authenticateMerchant, async (req, res, next) => {
  try {
    const payment = await findPaymentById(req.params.payment_id);

    if (!payment || payment.merchant_id !== req.merchant.id) {
      throw apiError(404, "NOT_FOUND_ERROR", "Payment not found");
    }

    res.status(200).json(payment);
  } catch (err) {
    next(err);
  }
});

/**
 * CAPTURE PAYMENT
 */
router.post(
  "/:payment_id/capture",
  authenticateMerchant,
  async (req, res, next) => {
    try {
      const { payment_id } = req.params;
      const { amount } = req.body;

      if (!amount || typeof amount !== "number") {
        return next(
          apiError(400, "BAD_REQUEST_ERROR", "Invalid capture amount"),
        );
      }

      const { rows } = await pool.query(
        `SELECT * FROM payments WHERE id = $1 AND merchant_id = $2`,
        [payment_id, req.merchant.id],
      );

      if (rows.length === 0) {
        return next(apiError(404, "NOT_FOUND_ERROR", "Payment not found"));
      }

      const payment = rows[0];
      if (amount > payment.amount) {
        return next(
          apiError(
            400,
            "BAD_REQUEST_ERROR",
            "Capture amount exceeds payment amount",
          ),
        );
      }

      if (payment.status !== "success") {
        return next(
          apiError(400, "BAD_REQUEST_ERROR", "Payment not in capturable state"),
        );
      }

      await pool.query(
        `UPDATE payments SET captured = true, updated_at = NOW() WHERE id = $1`,
        [payment_id],
      );

      res.json({
        ...payment,
        captured: true,
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
