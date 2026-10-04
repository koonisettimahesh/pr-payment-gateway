import express from "express";
import crypto from "crypto";
import { pool } from "../config/db.js";
import { apiError } from "../utils/errors.js";
import { webhookQueue, paymentQueue } from "../queues/index.js";

const router = express.Router();

/*
 * Public Hosted Checkout:
 * Customer does not send merchant API credentials.
 * Merchant is determined from the order.
 */
router.post("/", async (req, res, next) => {
  try {
    const {
      order_id,
      method,
      vpa,
      card,
    } = req.body;

    if (!order_id || !method) {
      throw apiError(
        400,
        "BAD_REQUEST_ERROR",
        "order_id and method are required"
      );
    }

    /*
     * Find order and its merchant.
     */
    const { rows } = await pool.query(
      `
      SELECT o.*, m.id AS merchant_id
      FROM orders o
      JOIN merchants m ON o.merchant_id = m.id
      WHERE o.id = $1
      `,
      [order_id]
    );

    if (rows.length === 0) {
      throw apiError(404, "NOT_FOUND_ERROR", "Order not found");
    }

    const order = rows[0];

    /*
     * Validate payment method.
     */
    if (method !== "upi" && method !== "card") {
      throw apiError(
        400,
        "BAD_REQUEST_ERROR",
        "Invalid payment method"
      );
    }

    /*
     * UPI validation.
     */
    if (method === "upi") {
      if (!vpa || !/^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+$/.test(vpa)) {
        throw apiError(
          400,
          "INVALID_VPA",
          "VPA format invalid"
        );
      }
    }

    /*
     * Card validation.
     *
     * We only retain network + last4.
     * Full card number/CVV are never stored.
     */
    let cardNetwork = null;
    let cardLast4 = null;

    if (method === "card") {
      const {
        number,
        expiry_month,
        expiry_year,
      } = card || {};

      if (!number || !expiry_month || !expiry_year) {
        throw apiError(
          400,
          "INVALID_CARD",
          "Card validation failed"
        );
      }

      const cleanedNumber = number.replace(/\D/g, "");

      if (cleanedNumber.length < 12 || cleanedNumber.length > 19) {
        throw apiError(
          400,
          "INVALID_CARD",
          "Card validation failed"
        );
      }

      /*
       * Use the same card utilities as the normal payment route
       * if those validations are already available there.
       */
      const { isValidCardNumber } = await import("../utils/luhn.js");
      const { detectCardNetwork } = await import("../utils/cardNetwork.js");
      const { isValidExpiry } = await import("../utils/expiryValidator.js");

      if (!isValidCardNumber(cleanedNumber)) {
        throw apiError(
          400,
          "INVALID_CARD",
          "Card validation failed"
        );
      }

      if (!isValidExpiry(expiry_month, expiry_year)) {
        throw apiError(
          400,
          "EXPIRED_CARD",
          "Card expiry date invalid"
        );
      }

      cardNetwork = detectCardNetwork(cleanedNumber);
      cardLast4 = cleanedNumber.slice(-4);
    }

    /*
     * Create payment in PENDING state.
     */
    const paymentId = `pay_${crypto.randomBytes(8).toString("hex")}`;

    await pool.query(
      `
      INSERT INTO payments (
        id,
        order_id,
        merchant_id,
        amount,
        currency,
        method,
        vpa,
        card_network,
        card_last4,
        status
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending')
      `,
      [
        paymentId,
        order.id,
        order.merchant_id,
        order.amount,
        order.currency,
        method,
        method === "upi" ? vpa : null,
        cardNetwork,
        cardLast4,
      ]
    );

    const response = {
      id: paymentId,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      method,
      vpa: method === "upi" ? vpa : undefined,
      status: "pending",
      created_at: new Date().toISOString(),
    };

    /*
     * Initial webhooks.
     */
    const timestamp = Math.floor(Date.now() / 1000);

    await webhookQueue.add("deliver", {
      merchantId: order.merchant_id,
      event: "payment.created",
      payload: {
        event: "payment.created",
        timestamp,
        data: {
          payment: response,
        },
      },
    });

    await webhookQueue.add("deliver", {
      merchantId: order.merchant_id,
      event: "payment.pending",
      payload: {
        event: "payment.pending",
        timestamp,
        data: {
          payment: response,
        },
      },
    });

    /*
     * Asynchronous payment processing.
     */
    await paymentQueue.add("process", {
      paymentId,
    });

    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
});

/*
 * Public payment-status endpoint for Hosted Checkout.
 *
 * The customer/browser does NOT need merchant credentials.
 * order_id is required so we can verify that this payment belongs
 * to the checkout order.
 */
router.get("/:payment_id", async (req, res, next) => {
  try {
    const { payment_id } = req.params;
    const { order_id } = req.query;

    if (!order_id) {
      throw apiError(
        400,
        "BAD_REQUEST_ERROR",
        "order_id is required"
      );
    }

    const { rows } = await pool.query(
      `
      SELECT
        id,
        order_id,
        amount,
        currency,
        method,
        status,
        error_code,
        error_description,
        created_at,
        updated_at
      FROM payments
      WHERE id = $1
        AND order_id = $2
      `,
      [payment_id, order_id]
    );

    if (rows.length === 0) {
      throw apiError(
        404,
        "NOT_FOUND_ERROR",
        "Payment not found"
      );
    }

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
