import request from "supertest";
import { app } from "../src/app.js";
import { pool } from "../src/config/db.js";
import { paymentQueue, refundQueue, webhookQueue } from "../src/queues/index.js";

describe("Test Support Endpoints", () => {
  test("GET /api/v1/test/merchant returns the configured test merchant without exposing secrets", async () => {
    const { rows } = await pool.query(
      `
      SELECT id, email, api_key, api_secret, webhook_secret
      FROM merchants
      WHERE email = $1
      `,
      ["test@example.com"],
    );
    expect(rows).toHaveLength(1);

    const response = await request(app).get("/api/v1/test/merchant");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: rows[0].id,
      email: "test@example.com",
      api_key: rows[0].api_key,
      seeded: true,
    });
    expect(response.body).not.toHaveProperty("api_secret");
    expect(response.body).not.toHaveProperty("webhook_secret");
    expect(response.body).not.toHaveProperty("password");
    expect(response.body).not.toHaveProperty("password_hash");
  });

  test("GET /api/v1/test/jobs/status returns aggregate queue counts without credentials", async () => {
    const [payments, refunds, webhooks] = await Promise.all([
      paymentQueue.getJobCounts(),
      refundQueue.getJobCounts(),
      webhookQueue.getJobCounts(),
    ]);

    const response = await request(app).get("/api/v1/test/jobs/status");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      pending: payments.waiting + refunds.waiting + webhooks.waiting,
      processing: payments.active + refunds.active + webhooks.active,
      completed: payments.completed + refunds.completed + webhooks.completed,
      failed: payments.failed + refunds.failed + webhooks.failed,
      worker_status: "running",
    });
    for (const count of [
      response.body.pending,
      response.body.processing,
      response.body.completed,
      response.body.failed,
    ]) {
      expect(Number.isInteger(count)).toBe(true);
      expect(count).toBeGreaterThanOrEqual(0);
    }
    expect(response.body).not.toHaveProperty("api_secret");
    expect(response.body).not.toHaveProperty("webhook_secret");
    expect(response.body).not.toHaveProperty("password");
    expect(response.body).not.toHaveProperty("password_hash");
    expect(response.body).not.toHaveProperty("DATABASE_URL");
    expect(response.body).not.toHaveProperty("JWT_SECRET");
  });

  test("test support endpoints do not require merchant API credentials", async () => {
    const merchant = await request(app).get("/api/v1/test/merchant");
    const jobStatus = await request(app).get("/api/v1/test/jobs/status");

    expect(merchant.status).toBe(200);
    expect(jobStatus.status).toBe(200);
  });

  test("test support endpoints do not create database records", async () => {
    const before = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM orders) AS orders,
        (SELECT COUNT(*)::int FROM payments) AS payments,
        (SELECT COUNT(*)::int FROM refunds) AS refunds,
        (SELECT COUNT(*)::int FROM webhook_logs) AS webhook_logs
    `);

    await request(app).get("/api/v1/test/merchant").expect(200);
    await request(app).get("/api/v1/test/jobs/status").expect(200);

    const after = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM orders) AS orders,
        (SELECT COUNT(*)::int FROM payments) AS payments,
        (SELECT COUNT(*)::int FROM refunds) AS refunds,
        (SELECT COUNT(*)::int FROM webhook_logs) AS webhook_logs
    `);
    expect(after.rows[0]).toEqual(before.rows[0]);
  });
});
