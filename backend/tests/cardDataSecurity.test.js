import { jest } from "@jest/globals";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { pool } from "../src/config/db.js";

const CARD_NUMBER = "4242 4242 4242 4242";
const CVV = "123";
const auth = {
  "X-Api-Key": "key_test_c42db4e33920992508e6b640534e35922b8a14c744f53ce7",
  "X-Api-Secret":
    "secret_test_2038370b0be711883398ddc4ad88e340f664fd10ae7387ee",
};

const paymentJobs = [];
const webhookJobs = [];
const paymentQueue = {
  add: jest.fn(async (name, data) => {
    paymentJobs.push({ name, data });
    return {};
  }),
};
const webhookQueue = {
  add: jest.fn(async (name, data) => {
    webhookJobs.push({ name, data });
    return {};
  }),
};

jest.unstable_mockModule("../src/queues/index.js", () => ({
  paymentQueue,
  refundQueue: { add: jest.fn() },
  webhookQueue,
}));
jest.unstable_mockModule("../src/utils/sleep.js", () => ({
  sleep: jest.fn(async () => {}),
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

function cardBody(overrides = {}) {
  return {
    order_id: orderId,
    method: "card",
    card: {
      number: CARD_NUMBER,
      expiry_month: "12",
      expiry_year: "2030",
      cvv: CVV,
      holder_name: "Test Cardholder",
      ...overrides,
    },
  };
}

function ensureNoSensitiveCardData(value) {
  function inspect(item) {
    if (Array.isArray(item)) {
      item.forEach(inspect);
      return;
    }
    if (item && typeof item === "object") {
      expect(item).not.toHaveProperty("cvv");
      Object.values(item).forEach(inspect);
      return;
    }
    expect(item).not.toBe(CVV);
    expect(item).not.toBe(CARD_NUMBER);
    expect(item).not.toBe(CARD_NUMBER.replaceAll(" ", ""));
  }

  inspect(value);
}

async function createPublicCardPayment(body = cardBody()) {
  const response = await request(app)
    .post("/api/v1/payments/public")
    .send(body);
  if (response.status === 201) paymentIds.push(response.body.id);
  return response;
}

describe("Card Data Security", () => {
  beforeAll(async () => {
    process.env.TEST_MODE = "true";
    process.env.TEST_PROCESSING_DELAY = "0";
    process.env.TEST_PAYMENT_SUCCESS = "true";

    const order = await request(app)
      .post("/api/v1/orders")
      .set(auth)
      .send({ amount: 1000, currency: "INR" });
    expect(order.status).toBe(201);
    orderId = order.body.id;
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
      const remaining = await pool.query(
        `
        SELECT
          (SELECT COUNT(*)::int FROM orders WHERE id = $1) AS orders,
          (SELECT COUNT(*)::int FROM payments WHERE id = ANY($2::text[])) AS payments
        `,
        [orderId, paymentIds],
      );
      expect(remaining.rows[0]).toEqual({ orders: 0, payments: 0 });
    } finally {
      restoreTestEnv();
    }
  });

  test("accepts the test Visa card, processes it, and retains only network and last four digits", async () => {
    const response = await createPublicCardPayment();

    expect(response.status).toBe(201);
    expect(response.body).toEqual(
      expect.objectContaining({
        order_id: orderId,
        amount: 1000,
        currency: "INR",
        method: "card",
        status: "pending",
      }),
    );
    expect(response.body.id).toMatch(/^pay_[a-f0-9]{16}$/);
    ensureNoSensitiveCardData(response.body);

    const paymentId = response.body.id;
    const queuedPayment = paymentJobs.find(
      (job) => job.data.paymentId === paymentId,
    );
    expect(queuedPayment).toBeDefined();

    const { rows } = await pool.query(
      "SELECT * FROM payments WHERE id = $1",
      [paymentId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        card_network: "visa",
        card_last4: "4242",
        status: "pending",
      }),
    );
    ensureNoSensitiveCardData(rows[0]);

    await processPaymentJob(paymentId);
    const merchantRead = await request(app)
      .get(`/api/v1/payments/${paymentId}`)
      .set(auth);
    expect(merchantRead.status).toBe(200);
    expect(merchantRead.body.status).toBe("success");
    expect(merchantRead.body.card_network).toBe("visa");
    expect(merchantRead.body.card_last4).toBe("4242");
    ensureNoSensitiveCardData(merchantRead.body);

    const publicRead = await request(app)
      .get(`/api/v1/payments/public/${paymentId}?order_id=${encodeURIComponent(orderId)}`);
    expect(publicRead.status).toBe(200);
    expect(publicRead.body.status).toBe("success");
    ensureNoSensitiveCardData(publicRead.body);

    const relevantWebhooks = webhookJobs.filter(
      (job) =>
        job.data.payload?.data?.payment?.id === paymentId,
    );
    expect(relevantWebhooks.length).toBeGreaterThanOrEqual(2);
    for (const webhook of relevantWebhooks) {
      ensureNoSensitiveCardData(webhook.data.payload);
    }
  });

  test("rejects invalid length, Luhn-invalid, unsupported network, and invalid expiry cards without leaking input", async () => {
    const now = new Date();
    const previousMonth = now.getMonth() === 0 ? 12 : now.getMonth();
    const previousYear =
      now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

    const invalidCases = [
      {
        name: "invalid number length",
        body: cardBody({ number: "424242424242" }),
      },
      {
        name: "Luhn-invalid number",
        body: cardBody({ number: "4242 4242 4242 4241" }),
      },
      {
        name: "unsupported network",
        body: cardBody({ number: "3000000000000004" }),
      },
      {
        name: "expired card",
        body: cardBody({
          expiry_month: String(previousMonth),
          expiry_year: String(previousYear),
        }),
      },
      {
        name: "invalid expiry format",
        body: cardBody({ expiry_month: "month", expiry_year: "year" }),
      },
    ];

    for (const { name, body } of invalidCases) {
      const before = await pool.query(
        "SELECT COUNT(*)::int AS count FROM payments WHERE order_id = $1",
        [orderId],
      );
      const response = await createPublicCardPayment(body);
      expect(response.status).toBe(400);
      ensureNoSensitiveCardData(response.body);
      expect(response.text).not.toContain(CARD_NUMBER.replaceAll(" ", ""));

      const { rows } = await pool.query(
        "SELECT COUNT(*)::int AS count FROM payments WHERE order_id = $1",
        [orderId],
      );
      expect(rows[0].count).toBe(before.rows[0].count);
    }
  });

  test("a failed card payment still excludes sensitive data from storage, responses, and webhooks", async () => {
    process.env.TEST_PAYMENT_SUCCESS = "false";

    const response = await createPublicCardPayment();
    expect(response.status).toBe(201);
    const paymentId = response.body.id;
    ensureNoSensitiveCardData(response.body);

    await processPaymentJob(paymentId);

    const { rows } = await pool.query(
      "SELECT * FROM payments WHERE id = $1",
      [paymentId],
    );
    expect(rows[0].status).toBe("failed");
    expect(rows[0].card_network).toBe("visa");
    expect(rows[0].card_last4).toBe("4242");
    ensureNoSensitiveCardData(rows[0]);

    const read = await request(app)
      .get(`/api/v1/payments/${paymentId}`)
      .set(auth);
    expect(read.status).toBe(200);
    expect(read.body.status).toBe("failed");
    ensureNoSensitiveCardData(read.body);

    const failureWebhook = webhookJobs.find(
      (job) =>
        job.data.event === "payment.failed" &&
        job.data.payload?.data?.payment?.id === paymentId,
    );
    expect(failureWebhook).toBeDefined();
    ensureNoSensitiveCardData(failureWebhook.data.payload);
  });

  test("public payment errors for missing orders do not disclose card data", async () => {
    const body = cardBody({
      number: "4242424242424242",
      cvv: CVV,
    });
    body.order_id = `order_missing_${randomUUID()}`;

    const response = await request(app)
      .post("/api/v1/payments/public")
      .send(body);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND_ERROR");
    ensureNoSensitiveCardData(response.body);
    expect(response.text).not.toContain("4242424242424242");
  });
});
