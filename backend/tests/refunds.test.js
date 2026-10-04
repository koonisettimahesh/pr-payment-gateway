import { jest } from "@jest/globals";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { pool } from "../src/config/db.js";

const auth = {
  "X-Api-Key": "key_test_c42db4e33920992508e6b640534e35922b8a14c744f53ce7",
  "X-Api-Secret":
    "secret_test_2038370b0be711883398ddc4ad88e340f664fd10ae7387ee",
};

const refundJobs = [];
const webhookJobs = [];

const refundQueue = {
  add: jest.fn(async (name, data) => {
    const job = { name, data };
    refundJobs.push(job);
    return job;
  }),
};

const webhookQueue = {
  add: jest.fn(async (name, data) => {
    const job = { name, data };
    webhookJobs.push(job);
    return job;
  }),
};

jest.unstable_mockModule("../src/queues/index.js", () => ({
  paymentQueue: { add: jest.fn() },
  refundQueue,
  webhookQueue,
}));

jest.unstable_mockModule("../src/utils/sleep.js", () => ({
  sleep: jest.fn(async () => {}),
}));

const { app } = await import("../src/app.js");
const { processRefundJob } = await import(
  "../src/jobs/processRefund.job.js"
);

const paymentIds = [];
const refundIds = [];
let orderId;
let merchantId;
let pendingPaymentId;
let partialPaymentId;
let splitPaymentId;
let excessPaymentId;
let fullPaymentId;

async function createPaymentFixture(amount, status) {
  const paymentId = `pay_test_${randomUUID().replaceAll("-", "")}`;
  await pool.query(
    `
    INSERT INTO payments (
      id, order_id, merchant_id, amount, currency, method, status
    )
    VALUES ($1, $2, $3, $4, 'INR', 'upi', $5)
    `,
    [paymentId, orderId, merchantId, amount, status],
  );
  paymentIds.push(paymentId);
  return paymentId;
}

async function createRefund(paymentId, amount, reason = "test refund") {
  const response = await request(app)
    .post(`/api/v1/payments/${paymentId}/refunds`)
    .set(auth)
    .send({ amount, reason });

  if (response.status === 201) {
    refundIds.push(response.body.id);
  }
  return response;
}

async function getPaymentStatus(paymentId) {
  const { rows } = await pool.query(
    "SELECT status FROM payments WHERE id = $1",
    [paymentId],
  );
  return rows[0].status;
}

describe("Refund API and Processing", () => {
  beforeAll(async () => {
    const orderResponse = await request(app)
      .post("/api/v1/orders")
      .set(auth)
      .send({ amount: 5000, currency: "INR" });

    expect(orderResponse.status).toBe(201);
    orderId = orderResponse.body.id;

    const { rows } = await pool.query(
      "SELECT id FROM merchants WHERE api_key = $1",
      [auth["X-Api-Key"]],
    );
    expect(rows).toHaveLength(1);
    merchantId = rows[0].id;

    pendingPaymentId = await createPaymentFixture(1000, "pending");
    partialPaymentId = await createPaymentFixture(1000, "success");
    splitPaymentId = await createPaymentFixture(1000, "success");
    excessPaymentId = await createPaymentFixture(1000, "success");
    fullPaymentId = await createPaymentFixture(1000, "success");
  });

  afterAll(async () => {
    if (refundIds.length > 0) {
      await pool.query("DELETE FROM refunds WHERE id = ANY($1::text[])", [
        refundIds,
      ]);
    }
    if (paymentIds.length > 0) {
      await pool.query("DELETE FROM payments WHERE id = ANY($1::text[])", [
        paymentIds,
      ]);
    }
    if (orderId) {
      await pool.query("DELETE FROM orders WHERE id = $1", [orderId]);
    }
  });

  test("requires merchant authentication", async () => {
    const response = await request(app)
      .post(`/api/v1/payments/${pendingPaymentId}/refunds`)
      .send({ amount: 100 });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_ERROR");
  });

  test("rejects refunds for payments that are not successful", async () => {
    const response = await createRefund(pendingPaymentId, 100);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("BAD_REQUEST_ERROR");
    const { rows } = await pool.query(
      "SELECT COUNT(*) AS count FROM refunds WHERE payment_id = $1",
      [pendingPaymentId],
    );
    expect(Number(rows[0].count)).toBe(0);
  });

  test("creates a pending refund, queues processing, and emits lifecycle webhooks", async () => {
    const response = await createRefund(partialPaymentId, 300, "partial");

    expect(response.status).toBe(201);
    expect(response.body).toEqual(
      expect.objectContaining({
        payment_id: partialPaymentId,
        amount: 300,
        reason: "partial",
        status: "pending",
      }),
    );

    const refundId = response.body.id;
    const { rows } = await pool.query(
      "SELECT status FROM refunds WHERE id = $1",
      [refundId],
    );
    expect(rows[0].status).toBe("pending");
    expect(
      refundJobs.some(
        (job) => job.name === "process" && job.data.refundId === refundId,
      ),
    ).toBe(true);
    expect(
      webhookJobs.some(
        (job) =>
          job.data.event === "refund.created" &&
          job.data.payload.data.refund.id === refundId,
      ),
    ).toBe(true);

    await processRefundJob(refundId);

    const processedResponse = await request(app)
      .get(`/api/v1/refunds/${refundId}`)
      .set(auth);
    expect(processedResponse.status).toBe(200);
    expect(processedResponse.body.status).toBe("processed");
    expect(processedResponse.body.payment_id).toBe(partialPaymentId);
    expect(await getPaymentStatus(partialPaymentId)).toBe("success");
    expect(
      webhookJobs.some(
        (job) =>
          job.data.event === "refund.processed" &&
          job.data.payload.data.refund.id === refundId,
      ),
    ).toBe(true);
  });

  test("supports multiple partial refunds up to the payment amount", async () => {
    const first = await createRefund(splitPaymentId, 400, "first partial");
    expect(first.status).toBe(201);
    await processRefundJob(first.body.id);

    const second = await createRefund(splitPaymentId, 600, "second partial");
    expect(second.status).toBe(201);
    await processRefundJob(second.body.id);

    expect(await getPaymentStatus(splitPaymentId)).toBe("refunded");
    for (const refund of [first.body, second.body]) {
      const response = await request(app)
        .get(`/api/v1/refunds/${refund.id}`)
        .set(auth);
      expect(response.status).toBe(200);
      expect(response.body.status).toBe("processed");
    }
  });

  test("rejects a cumulative refund amount exceeding the payment amount", async () => {
    const first = await createRefund(excessPaymentId, 700);
    expect(first.status).toBe(201);

    const excessive = await createRefund(excessPaymentId, 301);
    expect(excessive.status).toBe(400);
    expect(excessive.body.error.code).toBe("BAD_REQUEST_ERROR");
  });

  test("marks the payment refunded after a full refund is processed", async () => {
    const refund = await createRefund(fullPaymentId, 1000, "full refund");
    expect(refund.status).toBe(201);
    expect(refund.body.status).toBe("pending");

    await processRefundJob(refund.body.id);

    const response = await request(app)
      .get(`/api/v1/refunds/${refund.body.id}`)
      .set(auth);
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("processed");
    expect(await getPaymentStatus(fullPaymentId)).toBe("refunded");
  });
});
