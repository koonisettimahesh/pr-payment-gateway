import express from "express";
import { pool } from "../config/db.js";
import { paymentQueue, refundQueue, webhookQueue } from "../queues/index.js";

const router = express.Router();

router.get("/merchant", async (req, res) => {
  const { rows } = await pool.query(
    `
    SELECT id, email, api_key
    FROM merchants
    WHERE email = $1
    `,
    ["test@example.com"]
  );

  if (rows.length === 0) {
    return res.status(404).json({
      error: {
        code: "NOT_FOUND_ERROR",
        description: "Test merchant not found"
      }
    });
  }

  res.status(200).json({
    id: rows[0].id,
    email: rows[0].email,
    api_key: rows[0].api_key,
    seeded: true
  });
});

router.get("/jobs/status", async (req, res) => {
  const [p, r, w] = await Promise.all([
    paymentQueue.getJobCounts(),
    refundQueue.getJobCounts(),
    webhookQueue.getJobCounts()
  ]);

  res.json({
    pending: p.waiting + r.waiting + w.waiting,
    processing: p.active + r.active + w.active,
    completed: p.completed + r.completed + w.completed,
    failed: p.failed + r.failed + w.failed,
    worker_status: "running"
  });
});

export default router;
