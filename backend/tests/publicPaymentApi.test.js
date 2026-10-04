import { jest } from "@jest/globals";
import { randomBytes, randomUUID } from "node:crypto";
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

const orderIds = [];
const paymentIds = [];
let crossMerchantId;
let crossMerchantOrderId;
let merchantId;

function restoreTestEnv() {
  for (const [key, value] of Object.entries(previousTestEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function cardPaymentBody(order_id, card = {}) {
  return {
    order_id,
    method: "card",
    card: {
      number: "4242 4242 4242 4242",
      expiry_month: "12",
      expiry_year: "2035",
      cvv: "987",
      holder_name: "Public Checkout Test",
      ...card,
    },
  };
}

async function createOrder(amount) {
  const response = await request(app)
    .post("/api/v1/orders")
    .set(auth)
    .send({ amount, currency: "INR" });
  expect(response.status).toBe(201);
  orderIds.push(response.body.id);
  return response.body;
}

async function createPublicPayment(body) {
  const response = await request(app)
    .post("/api/v1/payments/public")
    .send(body);
  if (response.status === 201) paymentIds.push(response.body.id);
  return response;
}

function expectNoCredentialOrSensitiveFields(value) {
  const serialized = JSON.stringify(value);
  for (const key of [
    "api_secret",
    "webhook_secret",
    "password_hash",
    "JWT_SECRET",
    "DATABASE_URL",
    "cvv",
  ]) {
    expect(serialized).not.toContain(key);
  }
  expect(serialized).not.toContain("4242424242424242");

  function inspect(item) {
    if (Array.isArray(item)) {
      item.forEach(inspect);
    } else if (item && typeof item === "object") {
      expect(item).not.toHaveProperty("cvv");
      Object.values(item).forEach(inspect);
    } else {
      expect(item).not.toBe("987");
    }
  }

  inspect(value);
}

describe("Public Payment API", () => {
  let primaryOrder;
  let secondOrder;

  beforeAll(async () => {
    process.env.TEST_MODE = "true";
    process.env.TEST_PROCESSING_DELAY = "0";
    process.env.TEST_PAYMENT_SUCCESS = "true";

    primaryOrder = await createOrder(1200);
    secondOrder = await createOrder(2400);

    const { rows } = await pool.query(
      "SELECT id, provider_id FROM merchants WHERE api_key = $1",
      [auth["X-Api-Key"]],
    );
    expect(rows).toHaveLength(1);
    merchantId = rows[0].id;

    const crossMerchant = await pool.query(
      `
      INSERT INTO merchants (
        id, provider_id, name, email, api_key, api_secret
      )
      SELECT $1, provider_id, $2, $3, $4, $5
      FROM merchants
      WHERE id = $6
      RETURNING id
      `,
      [
        randomUUID(),
        "Public API Isolation Merchant",
        `public-api-isolation-${randomUUID()}@example.test`,
        `key_test_${randomBytes(24).toString("hex")}`,
        `secret_test_${randomBytes(24).toString("hex")}`,
        merchantId,
      ],
    );
    expect(crossMerchant.rows).toHaveLength(1);
    crossMerchantId = crossMerchant.rows[0].id;

    const crossOrder = await pool.query(
      `
      INSERT INTO orders (id, merchant_id, amount, currency, status)
      VALUES ($1, $2, 3000, 'INR', 'created')
      RETURNING id
      `,
      [`order_${randomUUID().replaceAll("-", "")}`, crossMerchantId],
    );
    crossMerchantOrderId = crossOrder.rows[0].id;
    orderIds.push(crossMerchantOrderId);
  });

  afterAll(async () => {
    try {
      if (paymentIds.length > 0) {
        await pool.query("DELETE FROM payments WHERE id = ANY($1::text[])", [
          paymentIds,
        ]);
      }
      if (orderIds.length > 0) {
        await pool.query("DELETE FROM orders WHERE id = ANY($1::text[])", [
          orderIds,
        ]);
      }
      if (crossMerchantId) {
        await pool.query("DELETE FROM merchants WHERE id = $1", [
          crossMerchantId,
        ]);
      }

      const remaining = await pool.query(
        `
        SELECT
          (SELECT COUNT(*)::int FROM orders WHERE id = ANY($1::text[])) AS orders,
          (SELECT COUNT(*)::int FROM payments WHERE id = ANY($2::text[])) AS payments,
          (SELECT COUNT(*)::int FROM merchants WHERE id = $3) AS merchants
        `,
        [orderIds, paymentIds, crossMerchantId],
      );
      expect(remaining.rows[0]).toEqual({
        orders: 0,
        payments: 0,
        merchants: 0,
      });

    } finally {
      restoreTestEnv();
    }
  });

  test("public order lookup returns only public order fields and rejects unknown orders", async () => {
    const response = await request(app).get(
      `/api/v1/orders/${primaryOrder.id}/public`,
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: primaryOrder.id,
      amount: 1200,
      currency: "INR",
      status: "created",
    });
    expectNoCredentialOrSensitiveFields(response.body);

    const missing = await request(app).get(
      `/api/v1/orders/order_missing_${randomUUID()}/public`,
    );
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("NOT_FOUND_ERROR");
    expect(missing.body.error.description).toBe("Order not found");
  });

  test("creates a public UPI payment without credentials, owned by the order merchant, and queues it pending", async () => {
    const response = await createPublicPayment({
      order_id: primaryOrder.id,
      method: "upi",
      vpa: "public-user@upi",
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^pay_[a-f0-9]{16}$/),
        order_id: primaryOrder.id,
        amount: 1200,
        currency: "INR",
        method: "upi",
        vpa: "public-user@upi",
        status: "pending",
      }),
    );
    expectNoCredentialOrSensitiveFields(response.body);

    const paymentId = response.body.id;
    const { rows } = await pool.query(
      "SELECT * FROM payments WHERE id = $1",
      [paymentId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        merchant_id: merchantId,
        order_id: primaryOrder.id,
        amount: 1200,
        currency: "INR",
        method: "upi",
        vpa: "public-user@upi",
        status: "pending",
        card_network: null,
        card_last4: null,
      }),
    );
    expect(paymentJobs).toContainEqual({
      name: "process",
      data: { paymentId },
    });

    const initialWebhooks = webhookJobs.filter(
      (job) => job.data.payload?.data?.payment?.id === paymentId,
    );
    expect(initialWebhooks.map((job) => job.data.event)).toEqual([
      "payment.created",
      "payment.pending",
    ]);
    for (const job of initialWebhooks) {
      expect(job.data.merchantId).toBe(merchantId);
      expect(job.data.payload.data.payment).toEqual(
        expect.objectContaining({
          id: paymentId,
          order_id: primaryOrder.id,
          amount: 1200,
          method: "upi",
          status: "pending",
        }),
      );
      expectNoCredentialOrSensitiveFields(job.data.payload);
    }
  });

  test("creates and processes a public card payment and exposes no card credentials", async () => {
    const response = await createPublicPayment(
      cardPaymentBody(primaryOrder.id),
    );
    expect(response.status).toBe(201);
    expect(response.body.status).toBe("pending");
    expect(response.body.method).toBe("card");
    expect(response.body.order_id).toBe(primaryOrder.id);
    expectNoCredentialOrSensitiveFields(response.body);

    const paymentId = response.body.id;
    const { rows } = await pool.query(
      "SELECT * FROM payments WHERE id = $1",
      [paymentId],
    );
    expect(rows[0]).toEqual(
      expect.objectContaining({
        merchant_id: merchantId,
        order_id: primaryOrder.id,
        card_network: "visa",
        card_last4: "4242",
        status: "pending",
      }),
    );
    expect(rows[0].vpa).toBeNull();
    expectNoCredentialOrSensitiveFields(rows[0]);

    const queued = paymentJobs.find(
      (job) => job.data.paymentId === paymentId,
    );
    expect(queued).toBeDefined();

    await processPaymentJob(paymentId);
    const status = await request(app).get(
      `/api/v1/payments/public/${paymentId}?order_id=${encodeURIComponent(primaryOrder.id)}`,
    );
    expect(status.status).toBe(200);
    expect(status.body.status).toBe("success");
    expectNoCredentialOrSensitiveFields(status.body);

    const terminalWebhook = webhookJobs.find(
      (job) =>
        job.data.event === "payment.success" &&
        job.data.payload?.data?.payment?.id === paymentId,
    );
    expect(terminalWebhook).toBeDefined();
    expect(terminalWebhook.data.merchantId).toBe(merchantId);
    expectNoCredentialOrSensitiveFields(terminalWebhook.data.payload);
  });

  test("public status lookup requires the matching payment and order", async () => {
    const payment = await createPublicPayment({
      order_id: primaryOrder.id,
      method: "upi",
      vpa: "status-user@upi",
    });
    expect(payment.status).toBe(201);

    const correct = await request(app).get(
      `/api/v1/payments/public/${payment.body.id}?order_id=${encodeURIComponent(primaryOrder.id)}`,
    );
    expect(correct.status).toBe(200);
    expect(correct.body).toEqual(
      expect.objectContaining({
        id: payment.body.id,
        order_id: primaryOrder.id,
        status: "pending",
      }),
    );

    const wrongOrder = await request(app).get(
      `/api/v1/payments/public/${payment.body.id}?order_id=${encodeURIComponent(secondOrder.id)}`,
    );
    expect(wrongOrder.status).toBe(404);
    expect(wrongOrder.body.error.code).toBe("NOT_FOUND_ERROR");
    expect(wrongOrder.body.error.description).toBe("Payment not found");

    const missingOrder = await request(app).get(
      `/api/v1/payments/public/${payment.body.id}`,
    );
    expect(missingOrder.status).toBe(400);
    expect(missingOrder.body.error.code).toBe("BAD_REQUEST_ERROR");

    const missingPayment = await request(app).get(
      `/api/v1/payments/public/pay_missing_${randomUUID()}?order_id=${encodeURIComponent(primaryOrder.id)}`,
    );
    expect(missingPayment.status).toBe(404);
    expect(missingPayment.body.error.code).toBe("NOT_FOUND_ERROR");
  });

  test("public payment creation is bound to a real order and that order's merchant", async () => {
    const nonExistingOrder = await createPublicPayment({
      order_id: `order_missing_${randomUUID()}`,
      method: "upi",
      vpa: "valid-user@upi",
    });
    expect(nonExistingOrder.status).toBe(404);
    expect(nonExistingOrder.body.error.code).toBe("NOT_FOUND_ERROR");

    const crossMerchantPayment = await createPublicPayment({
      order_id: crossMerchantOrderId,
      method: "upi",
      vpa: "cross-merchant@upi",
    });
    expect(crossMerchantPayment.status).toBe(201);
    const { rows } = await pool.query(
      "SELECT merchant_id, order_id FROM payments WHERE id = $1",
      [crossMerchantPayment.body.id],
    );
    expect(rows[0]).toEqual({
      merchant_id: crossMerchantId,
      order_id: crossMerchantOrderId,
    });

    const accessedByOtherOrder = await request(app).get(
      `/api/v1/payments/public/${crossMerchantPayment.body.id}?order_id=${encodeURIComponent(primaryOrder.id)}`,
    );
    expect(accessedByOtherOrder.status).toBe(404);
    expect(accessedByOtherOrder.body.error.code).toBe("NOT_FOUND_ERROR");
  });

  test("rejects missing fields, invalid methods, invalid VPA, and invalid card data with standard error shapes", async () => {
    const cases = [
      {
        body: { method: "upi", vpa: "user@upi" },
        status: 400,
        code: "BAD_REQUEST_ERROR",
      },
      {
        body: { order_id: primaryOrder.id },
        status: 400,
        code: "BAD_REQUEST_ERROR",
      },
      {
        body: { order_id: primaryOrder.id, method: "cash" },
        status: 400,
        code: "BAD_REQUEST_ERROR",
      },
      {
        body: {
          order_id: primaryOrder.id,
          method: "upi",
          vpa: "invalid vpa",
        },
        status: 400,
        code: "INVALID_VPA",
      },
      {
        body: { order_id: primaryOrder.id, method: "card", card: {} },
        status: 400,
        code: "INVALID_CARD",
      },
      {
        body: cardPaymentBody(primaryOrder.id, {
          number: "4242 4242 4242 4241",
        }),
        status: 400,
        code: "INVALID_CARD",
      },
      {
        body: cardPaymentBody(primaryOrder.id, {
          number: "3000000000000004",
        }),
        status: 400,
        code: "INVALID_CARD",
      },
      {
        body: cardPaymentBody(primaryOrder.id, {
          expiry_month: "01",
          expiry_year: "2000",
        }),
        status: 400,
        code: "EXPIRED_CARD",
      },
      {
        body: cardPaymentBody(primaryOrder.id, {
          expiry_month: "13",
          expiry_year: "2035",
        }),
        status: 400,
        code: "EXPIRED_CARD",
      },
    ];

    for (const { body, status, code } of cases) {
      const response = await request(app)
        .post("/api/v1/payments/public")
        .send(body);

      expect(response.status).toBe(status);
      expect(response.body).toEqual({
        error: {
          code,
          description: expect.any(String),
        },
      });
      expectNoCredentialOrSensitiveFields(response.body);
      expect(response.text).not.toContain("4242424242424242");
      expect(response.text).not.toContain("3000000000000004");
      expect(response.text).not.toContain("DATABASE_URL");
      expect(response.text).not.toContain("JWT_SECRET");
    }
  });

  test("TEST_MODE produces the configured failed status and webhook for public UPI payments", async () => {
    process.env.TEST_PAYMENT_SUCCESS = "false";

    const response = await createPublicPayment({
      order_id: primaryOrder.id,
      method: "upi",
      vpa: "forced-failure@upi",
    });
    expect(response.status).toBe(201);
    expect(response.body.status).toBe("pending");

    const paymentId = response.body.id;
    await processPaymentJob(paymentId);

    const status = await request(app).get(
      `/api/v1/payments/public/${paymentId}?order_id=${encodeURIComponent(primaryOrder.id)}`,
    );
    expect(status.status).toBe(200);
    expect(status.body.status).toBe("failed");
    expect(status.body.error_code).toBe("PAYMENT_FAILED");
    expectNoCredentialOrSensitiveFields(status.body);

    const terminalWebhook = webhookJobs.find(
      (job) =>
        job.data.event === "payment.failed" &&
        job.data.payload?.data?.payment?.id === paymentId,
    );
    expect(terminalWebhook).toBeDefined();
    expect(terminalWebhook.data.merchantId).toBe(merchantId);
    expectNoCredentialOrSensitiveFields(terminalWebhook.data.payload);
  });
});
