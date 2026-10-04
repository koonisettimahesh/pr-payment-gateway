import { jest } from "@jest/globals";
import request from "supertest";
import { pool } from "../src/config/db.js";

const auth = {
  "X-Api-Key": "key_test_c42db4e33920992508e6b640534e35922b8a14c744f53ce7",
  "X-Api-Secret":
    "secret_test_2038370b0be711883398ddc4ad88e340f664fd10ae7387ee",
};

const paymentJobs = [];
const webhookJobs = [];

const paymentQueue = {
  add: jest.fn(async (name, data) => {
    const job = { name, data };
    paymentJobs.push(job);
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
  paymentQueue,
  webhookQueue,
  refundQueue: { add: jest.fn() },
}));

const { app } = await import("../src/app.js");
const { processPaymentJob } = await import(
  "../src/jobs/processPayment.job.js"
);

const previousTestEnv = {
  TEST_MODE: process.env.TEST_MODE,
  TEST_PROCESSING_DELAY: process.env.TEST_PROCESSING_DELAY,
  TEST_PAYMENT_SUCCESS: process.env.TEST_PAYMENT_SUCCESS,
};

const paymentIds = [];
let orderId;

function restoreTestEnv() {
  for (const [key, value] of Object.entries(previousTestEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function getPayment(paymentId) {
  const response = await request(app)
    .get(`/api/v1/payments/${paymentId}`)
    .set(auth);

  expect(response.status).toBe(200);
  return response.body;
}

async function waitForTerminalStatus(paymentId) {
  const deadline = Date.now() + 8000;

  while (Date.now() < deadline) {
    const payment = await getPayment(paymentId);
    if (payment.status !== "pending") return payment;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`Payment ${paymentId} did not finish processing in time`);
}

async function waitForTerminalWebhook(paymentId, event) {
  const deadline = Date.now() + 8000;

  while (Date.now() < deadline) {
    const webhook = webhookJobs.find(
      (job) =>
        job.data.event === event &&
        job.data.payload?.data?.payment?.id === paymentId,
    );

    if (webhook) return webhook;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`Webhook ${event} for payment ${paymentId} was not queued`);
}

describe("Asynchronous Payment Processing", () => {
  beforeAll(async () => {
    process.env.TEST_MODE = "true";
    process.env.TEST_PROCESSING_DELAY = "20";
    process.env.TEST_PAYMENT_SUCCESS = "true";

    const orderResponse = await request(app)
      .post("/api/v1/orders")
      .set(auth)
      .send({ amount: 1500, currency: "INR" });

    expect(orderResponse.status).toBe(201);
    orderId = orderResponse.body.id;
  });

  afterAll(async () => {
    try {
      if (paymentIds.length > 0) {
        await pool.query("DELETE FROM payments WHERE id = ANY($1::text[])", [
          paymentIds,
        ]);
      }
      if (orderId) {
        await pool.query("DELETE FROM orders WHERE id = $1", [orderId]);
      }
    } finally {
      restoreTestEnv();
    }
  });

  test("queues a pending payment, processes it successfully, and emits a success webhook", async () => {
    const response = await request(app)
      .post("/api/v1/payments")
      .set(auth)
      .send({
        order_id: orderId,
        method: "upi",
        vpa: "async-success@upi",
      });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe("pending");
    const paymentId = response.body.id;
    paymentIds.push(paymentId);

    const { rows } = await pool.query(
      "SELECT status FROM payments WHERE id = $1",
      [paymentId],
    );
    expect(rows[0].status).toBe("pending");

    expect(
      paymentJobs.some(
        (job) =>
          job.name === "process" && job.data.paymentId === paymentId,
      ),
    ).toBe(true);

    await processPaymentJob(paymentId);
    const payment = await waitForTerminalStatus(paymentId);

    expect(payment).toEqual(
      expect.objectContaining({
        id: paymentId,
        order_id: orderId,
        amount: 1500,
        currency: "INR",
        method: "upi",
        status: "success",
      }),
    );

    const webhook = await waitForTerminalWebhook(paymentId, "payment.success");
    expect(webhook.data.payload.data.payment).toEqual(
      expect.objectContaining({
        id: paymentId,
        order_id: orderId,
        amount: 1500,
        method: "upi",
        status: "success",
      }),
    );
  });

  test("persists a failed payment and emits a failure webhook", async () => {
    process.env.TEST_PAYMENT_SUCCESS = "false";

    const response = await request(app)
      .post("/api/v1/payments")
      .set(auth)
      .send({
        order_id: orderId,
        method: "upi",
        vpa: "async-failure@upi",
      });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe("pending");
    const paymentId = response.body.id;
    paymentIds.push(paymentId);

    const { rows } = await pool.query(
      "SELECT status FROM payments WHERE id = $1",
      [paymentId],
    );
    expect(rows[0].status).toBe("pending");

    expect(
      paymentJobs.some(
        (job) =>
          job.name === "process" && job.data.paymentId === paymentId,
      ),
    ).toBe(true);

    await processPaymentJob(paymentId);
    const payment = await waitForTerminalStatus(paymentId);

    expect(payment).toEqual(
      expect.objectContaining({
        id: paymentId,
        order_id: orderId,
        amount: 1500,
        currency: "INR",
        method: "upi",
        status: "failed",
        error_code: "PAYMENT_FAILED",
      }),
    );

    const webhook = await waitForTerminalWebhook(paymentId, "payment.failed");
    expect(webhook.data.payload.data.payment).toEqual(
      expect.objectContaining({
        id: paymentId,
        order_id: orderId,
        amount: 1500,
        method: "upi",
        status: "failed",
      }),
    );
  });
});
