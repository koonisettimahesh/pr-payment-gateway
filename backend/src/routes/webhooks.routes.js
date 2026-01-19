import express from "express";
import { pool } from "../config/db.js";
import { authenticateMerchant } from "../middleware/authMiddleware.js";
import { apiError } from "../utils/errors.js";
import { webhookQueue } from "../queues/index.js";

const router = express.Router();

/**
 * LIST WEBHOOK LOGS
 * GET /api/v1/webhooks?limit=10&offset=0
 */
router.get("/", authenticateMerchant, async (req, res, next) => {
  try {
    const limit = Number(req.query.limit || 10);
    const offset = Number(req.query.offset || 0);

    const { rows } = await pool.query(
      `
      SELECT
        id,
        event,
        status,
        attempts,
        created_at,
        last_attempt_at,
        response_code
      FROM webhook_logs
      WHERE merchant_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
      `,
      [req.merchant.id, limit, offset]
    );

    const countRes = await pool.query(
      `
      SELECT COUNT(*)
      FROM webhook_logs
      WHERE merchant_id = $1
      `,
      [req.merchant.id]
    );

    res.status(200).json({
      data: rows,
      total: Number(countRes.rows[0].count),
      limit,
      offset
    });
  } catch (err) {
    next(err);
  }
});

/**
 * RETRY WEBHOOK
 * POST /api/v1/webhooks/:webhook_id/retry
 */
router.post("/:webhook_id/retry", authenticateMerchant, async (req, res, next) => {
  try {
    const { webhook_id } = req.params;

    const result = await pool.query(
      `
      UPDATE webhook_logs
      SET status = 'pending',
          attempts = 0,
          next_retry_at = NOW()
      WHERE id = $1 AND merchant_id = $2
      RETURNING id
      `,
      [webhook_id, req.merchant.id]
    );

    if (result.rowCount === 0) {
      return next(apiError(404, "NOT_FOUND_ERROR", "Webhook not found"));
    }

    await webhookQueue.add("deliver", { webhookId: webhook_id });

    res.status(200).json({
      id: webhook_id,
      status: "pending",
      message: "Webhook retry scheduled"
    });
  } catch (err) {
    next(err);
  }
});

export default router;
